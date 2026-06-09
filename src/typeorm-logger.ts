import { Logger } from 'typeorm';
import { log } from './logger';
import { getQueryId } from './request-context';

function params(parameters?: unknown[]): string {
  return parameters?.length ? ` -- [${parameters.join(', ')}]` : '';
}

export class TypeormLogger implements Logger {
  logQuery(query: string, parameters?: unknown[]): void {
    log('db', 'debug', getQueryId(), `${query}${params(parameters)}`);
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[]): void {
    const msg = error instanceof Error ? error.message : error;
    log('db', 'error', getQueryId(), `${msg} | ${query}${params(parameters)}`);
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[]): void {
    log('db', 'warn', getQueryId(), `SLOW(${time}ms) ${query}${params(parameters)}`);
  }

  logSchemaBuild(message: string): void {
    log('db', 'info', 'boot', message);
  }

  logMigration(message: string): void {
    log('app', 'info', 'boot', message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    const lvl = level === 'log' ? 'debug' : level;
    log('db', lvl, getQueryId(), String(message));
  }
}
