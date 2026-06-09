import { DataSource } from 'typeorm';
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
type Executor = {
    fetch(order: string, limit: number): Promise<Record<string, unknown>[]>;
    hasRecords(): Promise<boolean>;
    dispatch(rq: Record<string, unknown>): Promise<void>;
};
export declare class Queue {
    readonly name: string;
    private readonly cfg;
    private readonly exec;
    private readonly notifyChange?;
    private _paused;
    private _busy;
    private _errorCount;
    private _lastError;
    private _timeout;
    private _scheduledAt;
    private _pausedAt;
    private _pendingMs;
    private _period;
    constructor(name: string, cfg: QueueConfig, exec: Executor, onChange?: (state: QueueState) => void);
    /** Schedule the next run immediately */
    on(): void;
    /** Schedule the next run after `ms` milliseconds */
    in(ms: number): void;
    /** Schedule the next run at a specific Date */
    at(date: Date): void;
    pause(): void;
    resume(): void;
    is_paused(): boolean;
    set_period(period: number | (number | null)[]): void;
    get state(): QueueState;
    start(): Promise<void>;
    private _schedule;
    private _clearTimeout;
    private _fire;
    private _run;
    private _onError;
    private _onEmpty;
    private _scheduleAfterEmpty;
    private _currentPeriod;
    private _nextCron;
    private _emit;
}
export interface QueueManagerOptions {
    on_change?: (state: QueueState, name: string) => void;
}
declare class QueueManager {
    private readonly _queues;
    get queues(): ReadonlyMap<string, Queue>;
    init(dataSource: DataSource, options?: QueueManagerOptions): Promise<void>;
    /** Wake up a queue by name — called when pg_notify arrives with {"queue":"name"} */
    wakeup(name: string): void;
}
export declare const queueManager: QueueManager;
export {};
//# sourceMappingURL=queue-manager.d.ts.map