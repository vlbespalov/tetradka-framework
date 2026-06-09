import { AsyncLocalStorage } from 'async_hooks';
import type { Response, CookieOptions } from 'express';
interface ContextStore {
    queryId: string;
    res?: Response;
}
export declare const requestContext: AsyncLocalStorage<ContextStore>;
export declare const getQueryId: () => string;
export declare const setCookie: (name: string, value: string, options?: CookieOptions) => void;
export declare const clearCookie: (name: string) => void;
export {};
//# sourceMappingURL=request-context.d.ts.map