"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
let client = null;
function getRedisClient() {
    if (!client)
        throw new Error('Redis client not initialized. Call connectRedis() first.');
    return client;
}
async function connectRedis() {
    const url = process.env.REDIS_URL;
    if (!url)
        throw new Error('REDIS_URL is not set');
    client = new ioredis_1.default(url, { lazyConnect: true });
    client.on('error', (err) => {
        (0, logger_1.appLog)('error', 'redis', `connection error: ${err.message}`);
    });
    await client.connect();
    (0, logger_1.appLog)('info', 'redis', 'connected');
}
async function disconnectRedis() {
    if (client) {
        await client.quit();
        client = null;
        (0, logger_1.appLog)('info', 'redis', 'disconnected');
    }
}
//# sourceMappingURL=redis.js.map