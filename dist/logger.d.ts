export type LogSource = 'app' | 'db' | 'queue';
type Level = 'info' | 'warn' | 'error' | 'debug';
export declare function initLogger(): void;
export declare function log(source: LogSource, level: Level, queryId: string, text: string): void;
export declare const appLog: (level: Level, queryId: string, text: string) => void;
export declare const dbLog: (level: Level, queryId: string, text: string) => void;
export declare const queueLog: (level: Level, queryId: string, text: string) => void;
export {};
//# sourceMappingURL=logger.d.ts.map