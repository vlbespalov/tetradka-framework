"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueManager = exports.Queue = void 0;
const crypto_1 = require("crypto");
const transaction_1 = require("./transaction");
const logger_1 = require("./logger");
const request_context_1 = require("./request-context");
const controller_loader_1 = require("./controller-loader");
class Queue {
    name;
    cfg;
    exec;
    notifyChange;
    _paused = false;
    _busy = false;
    _errorCount = 0;
    _lastError = null;
    _timeout = null;
    _scheduledAt = null;
    _pausedAt = null;
    _pendingMs = null;
    _period;
    constructor(name, cfg, exec, onChange) {
        this.name = name;
        this.cfg = cfg;
        this.exec = exec;
        this.notifyChange = onChange;
        this._period = cfg.period ?? 0;
    }
    // ── Timer API ──────────────────────────────────────────────────────────────
    /** Schedule the next run immediately */
    on() { this.in(0); }
    /** Schedule the next run after `ms` milliseconds */
    in(ms) {
        if (this._paused) {
            this._pendingMs = ms;
            return;
        }
        this._schedule(ms);
    }
    /** Schedule the next run at a specific Date */
    at(date) {
        this.in(Math.max(0, date.getTime() - Date.now()));
    }
    // ── Lifecycle API ──────────────────────────────────────────────────────────
    pause() {
        if (this._paused)
            return;
        this._paused = true;
        this._pausedAt = new Date();
        this._clearTimeout();
        this._emit();
        (0, logger_1.queueLog)('warn', 'queue', `${this.name} paused${this._lastError ? `: ${this._lastError}` : ''}`);
    }
    resume() {
        if (!this._paused)
            return;
        this._paused = false;
        this._pausedAt = null;
        this._emit();
        if (this._pendingMs !== null) {
            const ms = this._pendingMs;
            this._pendingMs = null;
            this._schedule(ms);
        }
    }
    is_paused() { return this._paused; }
    set_period(period) {
        this._period = period;
    }
    get state() {
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
    async start() {
        const { cron, is_empty, ORDER } = this.cfg;
        if (cron) {
            const next = this._nextCron();
            if (next)
                this.at(next);
            return;
        }
        if (is_empty === true)
            return;
        if (is_empty === false) {
            this._schedule(0);
            return;
        }
        if (typeof is_empty === 'function') {
            const empty = await is_empty();
            if (!empty)
                this._schedule(0);
            return;
        }
        // is_empty === undefined/null
        if (ORDER) {
            const has = await this.exec.hasRecords();
            if (has)
                this._schedule(0);
        }
        else {
            // No ORDER — run once and let the handler control next scheduling
            this._schedule(0);
        }
    }
    // ── Internal: scheduling ───────────────────────────────────────────────────
    _schedule(ms) {
        this._clearTimeout();
        this._scheduledAt = new Date(Date.now() + ms);
        this._timeout = setTimeout(() => {
            this._timeout = null;
            this._scheduledAt = null;
            void this._fire();
        }, ms);
        this._emit();
    }
    _clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
            this._scheduledAt = null;
        }
    }
    // ── Internal: execution ────────────────────────────────────────────────────
    async _fire() {
        if (this._paused || this._busy)
            return;
        this._busy = true;
        this._emit();
        const qid = (0, crypto_1.randomUUID)();
        await request_context_1.requestContext.run({ queryId: qid }, async () => {
            (0, logger_1.queueLog)('info', qid, `${this.name} start`);
            try {
                await this._run(qid);
                this._errorCount = 0;
                this._lastError = null;
                (0, logger_1.queueLog)('info', qid, `${this.name} done`);
            }
            catch (err) {
                this._errorCount++;
                this._lastError = err instanceof Error ? err.message : String(err);
                (0, logger_1.queueLog)('error', qid, `${this.name} error #${this._errorCount}: ${this._lastError}`);
                this._onError();
            }
            finally {
                this._busy = false;
                this._emit();
            }
        });
    }
    async _run(qid) {
        const { ORDER, LIMIT, is_empty, cron } = this.cfg;
        const rq = { type: this.name, queue: this };
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
                (0, logger_1.queueLog)('info', qid, `${this.name} deferred until ${firstValue.toISOString()}`);
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
            if (next)
                this.at(next);
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
            }
            else {
                this._onEmpty();
                this._scheduleAfterEmpty();
            }
        }
        // Otherwise (no ORDER, is_empty != false): handler controls next scheduling
    }
    _onError() {
        const period = this._currentPeriod(this._errorCount);
        if (period === null) {
            this.pause();
        }
        else {
            this._schedule(period);
        }
    }
    _onEmpty() {
        this.cfg.on_empty?.();
    }
    _scheduleAfterEmpty() {
        if (this.cfg.cron) {
            const next = this._nextCron();
            if (next)
                this.at(next);
        }
        // Otherwise: stop until woken by pg_notify or manual queue.on()
    }
    _currentPeriod(errorCount) {
        const p = this._period;
        if (typeof p === 'number') {
            const { tolerance } = this.cfg;
            if (tolerance !== undefined && errorCount > tolerance)
                return null;
            return p;
        }
        if (Array.isArray(p)) {
            const idx = Math.min(errorCount, p.length - 1);
            return p[idx];
        }
        return 0;
    }
    _nextCron() {
        if (!this.cfg.cron)
            return null;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { CronExpressionParser } = require('cron-parser');
            return CronExpressionParser.parse(this.cfg.cron).next().toDate();
        }
        catch {
            (0, logger_1.queueLog)('warn', 'queue', `${this.name}: cron-parser not found or invalid cron "${this.cfg.cron}"`);
            return null;
        }
    }
    _emit() {
        this.notifyChange?.(this.state);
    }
}
exports.Queue = Queue;
class QueueManager {
    _queues = new Map();
    get queues() { return this._queues; }
    async init(dataSource, options) {
        const controllers = (0, controller_loader_1.loadControllers)();
        for (const meta of dataSource.entityMetadatas) {
            if (!['regular', 'view'].includes(meta.tableType))
                continue;
            const EntityClass = meta.target;
            const rawCfg = EntityClass['queue'];
            const rawCfgs = EntityClass['queues'];
            const cfgList = [];
            if (rawCfg)
                cfgList.push(typeof rawCfg === 'function' ? rawCfg() : rawCfg);
            if (rawCfgs)
                cfgList.push(...rawCfgs.map((c) => (typeof c === 'function' ? c() : c)));
            if (!cfgList.length)
                continue;
            for (const cfg of cfgList) {
                const tableName = meta.tableName;
                const defaultType = meta.targetName.toLowerCase();
                const type = cfg.type ?? defaultType;
                const action = cfg.action ?? 'check';
                const queueName = cfg.name ?? type;
                const method = `do_${action}_${type}`;
                const Cls = controllers.get(type);
                if (!Cls) {
                    (0, logger_1.queueLog)('warn', 'queue', `init: controller "${type}" not found for entity "${meta.targetName}" — skipped`);
                    continue;
                }
                if (typeof Cls.prototype[method] !== 'function') {
                    (0, logger_1.queueLog)('warn', 'queue', `init: method "${type}.${method}" not found — skipped`);
                    continue;
                }
                const ds = dataSource;
                const executor = {
                    fetch: (order, limit) => {
                        // Whitelist: allow identifiers, quotes, commas, spaces, and ASC/DESC only
                        if (!/^[\w", ]+$/i.test(order))
                            throw new Error(`queue "${queueName}": unsafe ORDER value: ${order}`);
                        return ds.query(`SELECT * FROM "${tableName}" ORDER BY ${order} LIMIT $1`, [limit]);
                    },
                    hasRecords: async () => {
                        const rows = await ds.query(`SELECT 1 FROM "${tableName}" LIMIT 1`);
                        return rows.length > 0;
                    },
                    dispatch: async (rq) => {
                        await (0, transaction_1.withTransaction)(false, (manager) => {
                            const instance = new Cls(rq, manager);
                            return instance[method]();
                        });
                    },
                };
                const queue = new Queue(queueName, cfg, executor, options?.on_change ? (state) => options.on_change(state, queueName) : undefined);
                this._queues.set(queueName, queue);
            }
        }
        for (const queue of this._queues.values()) {
            await queue.start();
        }
        const names = [...this._queues.keys()].join(', ');
        (0, logger_1.queueLog)('info', 'boot', `${this._queues.size} queue(s) initialized: ${names || '(none)'}`);
    }
    /** Wake up a queue by name — called when pg_notify arrives with {"queue":"name"} */
    wakeup(name) {
        const q = this._queues.get(name);
        if (!q) {
            (0, logger_1.queueLog)('warn', 'queue', `wakeup: unknown queue "${name}"`);
            return;
        }
        if (!q.is_paused())
            q.on();
    }
}
exports.queueManager = new QueueManager();
//# sourceMappingURL=queue-manager.js.map