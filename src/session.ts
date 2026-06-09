import { getRedisClient } from './redis';

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_DAYS ?? 7) * 24 * 60 * 60;

export interface SessionData {
  jti: string;
  userId: string;
  login: string;
}

export async function createSession(jti: string, userId: string, login: string): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(`session:${jti}`, SESSION_TTL_SECONDS, JSON.stringify({ userId, login }));
}

export async function getSession(jti: string): Promise<SessionData | null> {
  const redis = getRedisClient();
  const raw = await redis.get(`session:${jti}`);
  return raw ? (JSON.parse(raw) as SessionData) : null;
}

export async function deleteSession(jti: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`session:${jti}`);
}
