import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { withTransaction } from './transaction';
import { appLog } from './logger';
import { requestContext } from './request-context';
import { queueManager } from './queue-manager';
import { ControllerCtor, loadControllers } from './controller-loader';

const CHANNEL = process.env.PG_LISTENER_CHANNEL ?? 'app_events';
const MAX_RECONNECT_DELAY_MS = 30_000;

type NotificationPayload =
  | { queue: string }
  | { controller: string; method: string; data?: Record<string, unknown>; args?: unknown[] };

async function dispatch(payload: NotificationPayload, controllers: Map<string, ControllerCtor>): Promise<void> {
  if ('queue' in payload) {
    queueManager.wakeup(payload.queue);
    return;
  }

  const { controller, method, data, args } = payload;
  const Cls = controllers.get(controller.toLowerCase());
  if (!Cls) throw new Error(`pg-listener: unknown controller "${controller}"`);

  if (typeof Cls.prototype[method] !== 'function') {
    throw new Error(`pg-listener: unknown method "${controller}.${method}"`);
  }

  const isReadOnly = method.startsWith('get_') || method.startsWith('select_');
  const rq = data ?? {};

  await withTransaction(isReadOnly, async (manager) => {
    const instance = new Cls(rq, manager);
    return (instance[method] as (...a: unknown[]) => unknown)(...(args ?? []));
  });
}

async function connectAndListen(controllers: Map<string, ControllerCtor>): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  client.on('error', (err) => {
    appLog('error', 'pg-listener', `client error: ${err.message}`);
  });

  await client.connect();
  await client.query(`LISTEN "${CHANNEL}"`);
  appLog('info', 'pg-listener', `listening on channel "${CHANNEL}"`);

  client.on('notification', (msg) => {
    if (!msg.payload) return;

    const query_id = randomUUID();

    void requestContext.run({ queryId: query_id }, async () => {
      let payload: NotificationPayload;
      try {
        payload = JSON.parse(msg.payload!) as NotificationPayload;
      } catch {
        appLog('error', query_id, `pg-listener: malformed JSON payload: ${msg.payload}`);
        return;
      }

      const label = 'queue' in payload
        ? `queue:${payload.queue}`
        : `${payload.controller}.${payload.method}`;
      appLog('info', query_id, `pg-listener: ${label}`);

      try {
        await dispatch(payload, controllers);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        appLog('error', query_id, `pg-listener: ${label}: ${text}`);
      }
    });
  });

  // Promise resolves only if client is intentionally ended; rejects on unexpected disconnect
  return new Promise((_resolve, reject) => {
    client.on('end', () => reject(new Error('connection ended unexpectedly')));
  });
}

export function startPgListener(): void {
  const controllers = loadControllers();
  let delay = 1_000;

  const run = async (): Promise<void> => {
    while (true) {
      try {
        await connectAndListen(controllers);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        appLog('error', 'pg-listener', `${text} — reconnecting in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      }
    }
  };

  run().catch((err) => {
    appLog('error', 'pg-listener', `fatal: ${err instanceof Error ? err.message : String(err)}`);
  });
}
