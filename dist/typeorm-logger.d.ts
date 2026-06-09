import { Logger } from 'typeorm';
export declare class TypeormLogger implements Logger {
    logQuery(query: string, parameters?: unknown[]): void;
    logQueryError(error: string | Error, query: string, parameters?: unknown[]): void;
    logQuerySlow(time: number, query: string, parameters?: unknown[]): void;
    logSchemaBuild(message: string): void;
    logMigration(message: string): void;
    log(level: 'log' | 'info' | 'warn', message: unknown): void;
}
//# sourceMappingURL=typeorm-logger.d.ts.map