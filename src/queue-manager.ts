import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { withTransaction } from './transaction';
import { queueLog } from './logger';
import { requestContext } from './request-context';
import { ControllerCtor, loadControllers } from './controller-loader';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface QueueConfig {
  /**
   * Handler method suffix. Resolves to: do_{action}_{type}
   * Default: 'check'
   */
  action?: string;

  /**
   * Controller name (filename in Controllers/ without extension, lowercased).
   * Default: entity class name lowercased (e.g. Product → 'product')
   */
  type?: string;

  /**
   * Queue name in the global registry. Default: same as type.
   * Used as the pg_notify payload to wake up this queue.
   */
  name?: string;

  /**
   * Minimum ms between runs. Array enables progressive delays on errors.
   * A null element in the array signals "pause here" — equivalent to tolerance.
   * Example: [1000, 10000, 60000, null]
   *   - normal: 1s between runs
   *   - after 1st error: 10s
   *   - after 2nd error: 60s
   *   - after 3rd error: pause
   */
  period?: number | (number | null)[];

  /**
   * Pause after N consecutive errors.
   * Alternative to putting null at the end of the period array.
   */
  tolerance?: number;

  /**
   * Cron expression — requires the 'cron-parser' npm package.
   * Example: '0 2 * * *'  (02:00 every night)
   */
  cron?: string;

  /**
   * Controls automatic start:
   * - undefined / null (default): check DB on startup; after each call handler
   *   controls next run via queue.in() / queue.on() / queue.at()
   * - false: never empty — always reschedule after handler (acts like setInterval)
   * - true: treat as always empty — no auto-start, manual start only
   * - async function: called each tick; truthy return = empty (skip), falsy = run
   */
  is_empty?: boolean | null | (() => Promise<boolean>);

  /** Called when the ORDER-based check finds no records */
  on_empty?: () => void;

  /**
   * ORDER BY clause for automatic record fetching.
   * When set, the queue SELECTs records before calling the handler.
   * Handler receives them via rq.data (LIMIT 1) or rq.list (LIMIT > 1).
   * If the first ORDER field holds a future TIMESTAMP, the run is deferred.
   */
  ORDER?: string;

  /** Records to fetch per run. Default: 1 when ORDER is set */
  LIMIT?: number;
}

export interface QueueState {
  is_busy: boolean;
  is_paused: boolean;
  ts_scheduled: Date | null;
  ts_closest: Date | null;
  ts_paused: Date | null;
  error: string | null;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

type Executor = {
  fetch(order: string, limit: number): Promise<Record<string, unknown>[]>;
  hasRecords(): Promise<boolean>;
  dispatch(rq: Record<string, unknown>): Promise<void>;
};

export class Queue {
  readonly name: string;

  private readonly cfg: QueueConfig;
  private readonly exec: Executor;
  private readonly notifyChange?: (state: QueueState) => void;

  private _paused = false;
  private _busy = false;
  private _errorCount = 0;
  private _lastError: string | null = null;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _scheduledAt: Date | null = null;
  private _pausedAt: Date | null = null;
  private _pendingMs: number | null = null;

  private _period: number | (number | null)[];

  constructor(name: string, cfg: QueueConfig, exec: Executor, onChange?: (state: QueueState) => void) {
    this.name = name;
    this.cfg = cfg;
    this.exec = exec;
    this.notifyChange = onChange;
    this._period = cfg.period ?? 0;
  }

  // ── Timer API ──────────────────────────────────────────────────────────────

  /** Schedule the next run immediately */
  on(): void { this.in(0); }

  /** Schedule the next run after `ms` milliseconds */
  in(ms: number): void {
    if (this._paused) {
      this._pendingMs = ms;
      return;
    }
    this._schedule(ms);
  }

  /** Schedule the next run at a specific Date */
  at(date: Date): void {
    this.in(Math.max(0, date.getTime() - Date.now()));
  }

  // ── Lifecycle API ──────────────────────────────────────────────────────────

  pause(): void {
    if (this._paused) return;
    this._paused = true;
    this._pausedAt = new Date();
    this._clearTimeout();
    this._emit();
    queueLog('warn', 'queue', `${this.name} paused${this._lastError ? `: ${this._lastError}` : ''}`);
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this._pausedAt = null;
    this._emit();
    if (this._pendingMs !== null) {
      const ms = this._pendingMs;
      this._pendingMs = null;
      this._schedule(ms);
    }
  }

  is_paused(): boolean { return this._paused; }

  set_period(period: number | (number | null)[]): void {
    this._period = period;
  }

  get state(): QueueState {
    return {
      is_busy: this._busy,
      is_paused: this._paused,
      ts_scheduled: this._scheduledAt,
      ts_closest: this._scheduledAt,
      ts_paused: this._pausedAt,
      error: this._lastError,
    };
  }

  // ── Internal: startup ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { cron, is_empty, ORDER } = this.cfg;

    if (cron) {
      const next = this._nextCron();
      if (next) this.at(next);
      return;
    }

    if (is_empty === true) return;

    if (is_empty === false) {
      this._schedule(0);
      return;
    }

    if (typeof is_empty === 'function') {
      const empty = await is_empty();
      if (!empty) this._schedule(0);
      return;
    }

    // is_empty === undefined/null
    if (ORDER) {
      const has = await this.exec.hasRecords();
      if (has) this._schedule(0);
    } else {
      // No ORDER — run once and let the handler control next scheduling
      this._schedule(0);
    }
  }

  // ── Internal: scheduling ───────────────────────────────────────────────────

  private _schedule(ms: number): void {
    this._clearTimeout();
    this._scheduledAt = new Date(Date.now() + ms);
    this._timeout = setTimeout(() => {
      this._timeout = null;
      this._scheduledAt = null;
      void this._fire();
    }, ms);
    this._emit();
  }

  private _clearTimeout(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
      this._scheduledAt = null;
    }
  }

  // ── Internal: execution ────────────────────────────────────────────────────

  private async _fire(): Promise<void> {
    if (this._paused || this._busy) return;
    this._busy = true;
    this._emit();

    const qid = randomUUID();
    await requestContext.run({ queryId: qid }, async () => {
      queueLog('info', qid, `${this.name} start`);
      try {
        await this._run(qid);
        this._errorCount = 0;
        this._lastError = null;
        queueLog('info', qid, `${this.name} done`);
      } catch (err) {
        this._errorCount++;
        this._lastError = err instanceof Error ? err.message : String(err);
        queueLog('error', qid, `${this.name} error #${this._errorCount}: ${this._lastError}`);
        this._onError();
      } finally {
        this._busy = false;
        this._emit();
      }
    });
  }

  private async _run(qid: string): Promise<void> {
    const { ORDER, LIMIT, is_empty, cron } = this.cfg;
    const rq: Record<string, unknown> = { type: this.name, queue: this };

    if (ORDER) {
      const limit = LIMIT ?? 1;
      const records = await this.exec.fetch(ORDER, limit);

      if (records.length === 0) {
        this._onEmpty();
        this._scheduleAfterEmpty();
        return;
      }

      // Defer if the first ORDER field holds a future timestamp
      const orderField = ORDER.trimStart().split(/[\s,]+/)[0].replace(/"/g, '');
      const firstValue = records[0][orderField];
      if (firstValue instanceof Date && firstValue > new Date()) {
        queueLog('info', qid, `${this.name} deferred until ${firstValue.toISOString()}`);
        this.at(firstValue);
        return;
      }

      rq.data = limit === 1 ? records[0] : undefined;
      rq.list = limit > 1 ? records : undefined;
    }

    await this.exec.dispatch(rq);

    // Reschedule after a successful handler call
    if (cron) {
      const next = this._nextCron();
      if (next) this.at(next);
      return;
    }

    if (is_empty === false) {
      this._schedule(this._currentPeriod(0) ?? 0);
      return;
    }

    if (ORDER) {
      const hasMore = await this.exec.hasRecords();
      if (hasMore) {
        this._schedule(this._currentPeriod(0) ?? 0);
      } else {
        this._onEmpty();
        this._scheduleAfterEmpty();
      }
    }
    // Otherwise (no ORDER, is_empty != false): handler controls next scheduling
  }

  private _onError(): void {
    const period = this._currentPeriod(this._errorCount);
    if (period === null) {
      this.pause();
    } else {
      this._schedule(period);
    }
  }

  private _onEmpty(): void {
    this.cfg.on_empty?.();
  }

  private _scheduleAfterEmpty(): void {
    if (this.cfg.cron) {
      const next = this._nextCron();
      if (next) this.at(next);
    }
    // Otherwise: stop until woken by pg_notify or manual queue.on()
  }

  private _currentPeriod(errorCount: number): number | null {
    const p = this._period;
    if (typeof p === 'number') {
      const { tolerance } = this.cfg;
      if (tolerance !== undefined && errorCount > tolerance) return null;
      return p;
    }
    if (Array.isArray(p)) {
      const idx = Math.min(errorCount, p.length - 1);
      return p[idx];
    }
    return 0;
  }

  private _nextCron(): Date | null {
    if (!this.cfg.cron) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CronExpressionParser } = require('cron-parser') as { CronExpressionParser: { parse(e: string): { next(): { toDate(): Date } } } };
      return CronExpressionParser.parse(this.cfg.cron).next().toDate();
    } catch {
      queueLog('warn', 'queue', `${this.name}: cron-parser not found or invalid cron "${this.cfg.cron}"`);
      return null;
    }
  }

  private _emit(): void {
    this.notifyChange?.(this.state);
  }
}

// ─── Queue Manager ────────────────────────────────────────────────────────────

export interface QueueManagerOptions {
  on_change?: (state: QueueState, name: string) => void;
}

class QueueManager {
  private readonly _queues = new Map<string, Queue>();

  get queues(): ReadonlyMap<string, Queue> { return this._queues; }

  async init(dataSource: DataSource, options?: QueueManagerOptions): Promise<void> {
    const controllers = loadControllers();

    for (const meta of dataSource.entityMetadatas) {
      if (!['regular', 'view'].includes(meta.tableType)) continue;

      const EntityClass = meta.target as unknown as Record<string, unknown>;
      const rawCfg = EntityClass['queue'] as QueueConfig | (() => QueueConfig) | undefined;
      const rawCfgs = EntityClass['queues'] as (QueueConfig | (() => QueueConfig))[] | undefined;

      const cfgList: QueueConfig[] = [];
      if (rawCfg) cfgList.push(typeof rawCfg === 'function' ? rawCfg() : rawCfg);
      if (rawCfgs) cfgList.push(...rawCfgs.map((c) => (typeof c === 'function' ? c() : c)));
      if (!cfgList.length) continue;

      for (const cfg of cfgList) {
        const tableName = meta.tableName;
        const defaultType = meta.targetName.toLowerCase();
        const type = cfg.type ?? defaultType;
        const action = cfg.action ?? 'check';
        const queueName = cfg.name ?? type;
        const method = `do_${action}_${type}`;

        const Cls = controllers.get(type);
        if (!Cls) {
          queueLog('warn', 'queue', `init: controller "${type}" not found for entity "${meta.targetName}" — skipped`);
          continue;
        }
        if (typeof Cls.prototype[method] !== 'function') {
          queueLog('warn', 'queue', `init: method "${type}.${method}" not found — skipped`);
          continue;
        }

        const ds = dataSource;
        const executor: Executor = {
          fetch: (order, limit) => {
            // Whitelist: allow identifiers, quotes, commas, spaces, and ASC/DESC only
            if (!/^[\w", ]+$/i.test(order))
              throw new Error(`queue "${queueName}": unsafe ORDER value: ${order}`);
            return ds.query(`SELECT * FROM "${tableName}" ORDER BY ${order} LIMIT $1`, [limit]) as Promise<Record<string, unknown>[]>;
          },

          hasRecords: async () => {
            const rows = await ds.query(`SELECT 1 FROM "${tableName}" LIMIT 1`) as unknown[];
            return rows.length > 0;
          },

          dispatch: async (rq) => {
            await withTransaction(false, (manager) => {
              const instance = new Cls(rq, manager);
              return (instance[method] as () => Promise<void>)();
            });
          },
        };

        const queue = new Queue(
          queueName,
          cfg,
          executor,
          options?.on_change ? (state) => options.on_change!(state, queueName) : undefined,
        );

        this._queues.set(queueName, queue);
      }
    }

    for (const queue of this._queues.values()) {
      await queue.start();
    }

    const names = [...this._queues.keys()].join(', ');
    queueLog('info', 'boot', `${this._queues.size} queue(s) initialized: ${names || '(none)'}`);
  }

  /** Wake up a queue by name — called when pg_notify arrives with {"queue":"name"} */
  wakeup(name: string): void {
    const q = this._queues.get(name);
    if (!q) {
      queueLog('warn', 'queue', `wakeup: unknown queue "${name}"`);
      return;
    }
    if (!q.is_paused()) q.on();
  }
}

export const queueManager = new QueueManager();
