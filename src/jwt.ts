import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export interface JwtPayload {
  sub: string;   // user UUID
  login: string;
  jti: string;   // unique session ID used as Redis key
}

export function signToken(userId: string, login: string): { token: string; jti: string } {
  const jti = randomUUID();
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const expiresIn = Number(process.env.SESSION_TTL_DAYS ?? 7) * 24 * 60 * 60;
  const token = jwt.sign({ sub: userId, login, jti }, secret, { expiresIn });
  return { token, jti };
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.verify(token, secret) as JwtPayload;
}
