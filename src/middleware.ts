import { Request, RequestHandler } from 'express';
import { verifyToken } from './jwt';
import { getSession, SessionData } from './session';
import { parseCookies } from './cookies';

declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
    }
  }
}

export type MiddlewareType = 'auth' | 'guest' | 'public';
export type MiddlewareMap = Partial<Record<string, MiddlewareType>>;

async function resolveSession(req: Request): Promise<SessionData | null> {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const token = cookies['sid'];
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    const session = await getSession(payload.jti);
    return session ? { ...session, jti: payload.jti } : null;
  } catch {
    return null;
  }
}

const authMiddleware: RequestHandler = async (req, res, next) => {
  const session = await resolveSession(req);
  if (!session) {
    res.status(401).json({ content: null, error: true, error_text: 'Unauthorized' });
    return;
  }
  req.session = session;
  next();
};

const guestMiddleware: RequestHandler = async (req, res, next) => {
  const session = await resolveSession(req);
  if (session) {
    res.status(403).json({ content: null, error: true, error_text: 'Already authenticated' });
    return;
  }
  next();
};

export function resolveMiddleware(type: Exclude<MiddlewareType, 'public'>): RequestHandler {
  switch (type) {
    case 'auth': return authMiddleware;
    case 'guest': return guestMiddleware;
  }
}
