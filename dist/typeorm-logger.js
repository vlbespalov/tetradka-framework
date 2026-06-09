"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeormLogger = void 0;
const logger_1 = require("./logger");
const request_context_1 = require("./request-context");
function params(parameters) {
    return parameters?.length ? ` -- [${parameters.join(', ')}]` : '';
}
class TypeormLogger {
    logQuery(query, parameters) {
        (0, logger_1.log)('db', 'debug', (0, request_context_1.getQueryId)(), `${query}${params(parameters)}`);
    }
    logQueryError(error, query, parameters) {
        const msg = error instanceof Error ? error.message : error;
        (0, logger_1.log)('db', 'error', (0, request_context_1.getQueryId)(), `${msg} | ${query}${params(parameters)}`);
    }
    logQuerySlow(time, query, parameters) {
        (0, logger_1.log)('db', 'warn', (0, request_context_1.getQueryId)(), `SLOW(${time}ms) ${query}${params(parameters)}`);
    }
    logSchemaBuild(message) {
        (0, logger_1.log)('db', 'info', 'boot', message);
    }
    logMigration(message) {
        (0, logger_1.log)('app', 'info', 'boot', message);
    }
    log(level, message) {
        const lvl = level === 'log' ? 'debug' : level;
        (0, logger_1.log)('db', lvl, (0, request_context_1.getQueryId)(), String(message));
    }
}
exports.TypeormLogger = TypeormLogger;
//# sourceMappingURL=typeorm-logger.js.map