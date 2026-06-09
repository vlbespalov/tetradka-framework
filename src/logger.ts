import fs from 'fs';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export type LogSource = 'app' | 'db' | 'queue';
type Level = 'info' | 'warn' | 'error' | 'debug';

let winstonLogger: winston.Logger | null = null;
let lastLogTime = Date.now();

const logFormat = winston.format.printf((info) => {
  const { timestamp, level, message, source, queryId, delta } = info as {
    timestamp: string;
    level: string;
    message: string;
    source: string;
    queryId: string;
    delta: number;
  };
  return `${timestamp} ${source} ${level.toUpperCase().padEnd(5)} ${queryId} ${message} +${delta}ms`;
});

const consoleFormat = winston.format.printf((info) => {
  const { timestamp, level, message, source, queryId, delta } = info as {
    timestamp: string;
    level: string;
    message: string;
    source: string;
    queryId: string;
    delta: number;
  };
  return `${timestamp} ${source} ${level.toUpperCase().padEnd(5)} ${queryId} ${message} +${delta}ms`;
});

export function initLogger(): void {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp(), consoleFormat),
    }),
  ];

  const logDir = process.env.LOG_DIR;
  if (logDir) {
    const resolvedDir = path.resolve(logDir);
    const symlinkPath = path.join(resolvedDir, 'app.log');

    const fileTransport = new DailyRotateFile({
      dirname: resolvedDir,
      filename: 'app.%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      zippedArchive: true,
      format: winston.format.combine(winston.format.timestamp(), logFormat),
    });

    // fired on startup and on every rotation — keep app.log pointing at the current file
    fileTransport.on('new', (newFile: string) => {
      try { fs.unlinkSync(symlinkPath); } catch { /* doesn't exist yet */ }
      fs.symlinkSync(path.basename(newFile), symlinkPath);
    });

    transports.push(fileTransport);
  }

  winstonLogger = winston.createLogger({ level: 'debug', transports });
}

export function log(source: LogSource, level: Level, queryId: string, text: string): void {
  if (!winstonLogger) return;
  const now = Date.now();
  const delta = now - lastLogTime;
  lastLogTime = now;
  winstonLogger.log({ level, message: text, source, queryId, delta });
}

export const appLog = (level: Level, queryId: string, text: string) =>
  log('app', level, queryId, text);

export const dbLog = (level: Level, queryId: string, text: string) =>
  log('db', level, queryId, text);

export const queueLog = (level: Level, queryId: string, text: string) =>
  log('queue', level, queryId, text);
