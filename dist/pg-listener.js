"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPgListener = startPgListener;
const pg_1 = require("pg");
const crypto_1 = require("crypto");
const transaction_1 = require("./transaction");
const logger_1 = require("./logger");
const request_context_1 = require("./request-context");
const queue_manager_1 = require("./queue-manager");
const controller_loader_1 = require("./controller-loader");
const CHANNEL = process.env.PG_LISTENER_CHANNEL ?? 'app_events';
const MAX_RECONNECT_DELAY_MS = 30_000;
async function dispatch(payload, controllers) {
    if ('queue' in payload) {
        queue_manager_1.queueManager.wakeup(payload.queue);
        return;
    }
    const { controller, method, data, args } = payload;
    const Cls = controllers.get(controller.toLowerCase());
    if (!Cls)
        throw new Error(`pg-listener: unknown controller "${controller}"`);
    if (typeof Cls.prototype[method] !== 'function') {
        throw new Error(`pg-listener: unknown method "${controller}.${method}"`);
    }
    const isReadOnly = method.startsWith('get_') || method.startsWith('select_');
    const rq = data ?? {};
    await (0, transaction_1.withTransaction)(isReadOnly, async (manager) => {
        const instance = new Cls(rq, manager);
        return instance[method](...(args ?? []));
    });
}
async function connectAndListen(controllers) {
    const client = new pg_1.Client({ connectionString: process.env.DATABASE_URL });
    client.on('error', (err) => {
        (0, logger_1.appLog)('error', 'pg-listener', `client error: ${err.message}`);
    });
    await client.connect();
    await client.query(`LISTEN "${CHANNEL}"`);
    (0, logger_1.appLog)('info', 'pg-listener', `listening on channel "${CHANNEL}"`);
    client.on('notification', (msg) => {
        if (!msg.payload)
            return;
        const query_id = (0, crypto_1.randomUUID)();
        void request_context_1.requestContext.run({ queryId: query_id }, async () => {
            let payload;
            try {
                payload = JSON.parse(msg.payload);
            }
            catch {
                (0, logger_1.appLog)('error', query_id, `pg-listener: malformed JSON payload: ${msg.payload}`);
                return;
            }
            const label = 'queue' in payload
                ? `queue:${payload.queue}`
                : `${payload.controller}.${payload.method}`;
            (0, logger_1.appLog)('info', query_id, `pg-listener: ${label}`);
            try {
                await dispatch(payload, controllers);
            }
            catch (err) {
                const text = err instanceof Error ? err.message : String(err);
                (0, logger_1.appLog)('error', query_id, `pg-listener: ${label}: ${text}`);
            }
        });
    });
    // Promise resolves only if client is intentionally ended; rejects on unexpected disconnect
    return new Promise((_resolve, reject) => {
        client.on('end', () => reject(new Error('connection ended unexpectedly')));
    });
}
function startPgListener() {
    const controllers = (0, controller_loader_1.loadControllers)();
    let delay = 1_000;
    const run = async () => {
        while (true) {
            try {
                await connectAndListen(controllers);
            }
            catch (err) {
                const text = err instanceof Error ? err.message : String(err);
                (0, logger_1.appLog)('error', 'pg-listener', `${text} — reconnecting in ${delay}ms`);
                await new Promise((r) => setTimeout(r, delay));
                delay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
            }
        }
    };
    run().catch((err) => {
        (0, logger_1.appLog)('error', 'pg-listener', `fatal: ${err instanceof Error ? err.message : String(err)}`);
    });
}
//# sourceMappingURL=pg-listener.js.map