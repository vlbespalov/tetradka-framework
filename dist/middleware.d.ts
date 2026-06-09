import { RequestHandler } from 'express';
import { SessionData } from './session';
declare global {
    namespace Express {
        interface Request {
            session?: SessionData;
        }
    }
}
export type MiddlewareType = 'auth' | 'guest' | 'public';
export type MiddlewareMap = Partial<Record<string, MiddlewareType>>;
export declare function resolveMiddleware(type: Exclude<MiddlewareType, 'public'>): RequestHandler;
//# sourceMappingURL=middleware.d.ts.map