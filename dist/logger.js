"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueLog = exports.dbLog = exports.appLog = void 0;
exports.initLogger = initLogger;
exports.log = log;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
let winstonLogger = null;
let lastLogTime = Date.now();
const logFormat = winston_1.default.format.printf((info) => {
    const { timestamp, level, message, source, queryId, delta } = info;
    return `${timestamp} ${source} ${level.toUpperCase().padEnd(5)} ${queryId} ${message} +${delta}ms`;
});
const consoleFormat = winston_1.default.format.printf((info) => {
    const { timestamp, level, message, source, queryId, delta } = info;
    return `${timestamp} ${source} ${level.toUpperCase().padEnd(5)} ${queryId} ${message} +${delta}ms`;
});
function initLogger() {
    const transports = [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), consoleFormat),
        }),
    ];
    const logDir = process.env.LOG_DIR;
    if (logDir) {
        const resolvedDir = path_1.default.resolve(logDir);
        const symlinkPath = path_1.default.join(resolvedDir, 'app.log');
        const fileTransport = new winston_daily_rotate_file_1.default({
            dirname: resolvedDir,
            filename: 'app.%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '100m',
            maxFiles: '30d',
            zippedArchive: true,
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), logFormat),
        });
        // fired on startup and on every rotation — keep app.log pointing at the current file
        fileTransport.on('new', (newFile) => {
            try {
                fs_1.default.unlinkSync(symlinkPath);
            }
            catch { /* doesn't exist yet */ }
            fs_1.default.symlinkSync(path_1.default.basename(newFile), symlinkPath);
        });
        transports.push(fileTransport);
    }
    winstonLogger = winston_1.default.createLogger({ level: 'debug', transports });
}
function log(source, level, queryId, text) {
    if (!winstonLogger)
        return;
    const now = Date.now();
    const delta = now - lastLogTime;
    lastLogTime = now;
    winstonLogger.log({ level, message: text, source, queryId, delta });
}
const appLog = (level, queryId, text) => log('app', level, queryId, text);
exports.appLog = appLog;
const dbLog = (level, queryId, text) => log('db', level, queryId, text);
exports.dbLog = dbLog;
const queueLog = (level, queryId, text) => log('queue', level, queryId, text);
exports.queueLog = queueLog;
//# sourceMappingURL=logger.js.map