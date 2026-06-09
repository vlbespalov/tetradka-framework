import Redis from 'ioredis';
import { appLog } from './logger';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) throw new Error('Redis client not initialized. Call connectRedis() first.');
  return client;
}

export async function connectRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');

  client = new Redis(url, { lazyConnect: true });

  client.on('error', (err) => {
    appLog('error', 'redis', `connection error: ${err.message}`);
  });

  await client.connect();
  appLog('info', 'redis', 'connected');
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    appLog('info', 'redis', 'disconnected');
  }
}
