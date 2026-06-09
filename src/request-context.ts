import { AsyncLocalStorage } from 'async_hooks';
import type { Response, CookieOptions } from 'express';

interface ContextStore {
  queryId: string;
  res?: Response;
}

export const requestContext = new AsyncLocalStorage<ContextStore>();

export const getQueryId = (): string => requestContext.getStore()?.queryId ?? '-';

export const setCookie = (name: string, value: string, options: CookieOptions = {}): void => {
  requestContext.getStore()?.res?.cookie(name, value, options);
};

export const clearCookie = (name: string): void => {
  requestContext.getStore()?.res?.clearCookie(name);
};
