"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.getSession = getSession;
exports.deleteSession = deleteSession;
const redis_1 = require("./redis");
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_DAYS ?? 7) * 24 * 60 * 60;
async function createSession(jti, userId, login) {
    const redis = (0, redis_1.getRedisClient)();
    await redis.setex(`session:${jti}`, SESSION_TTL_SECONDS, JSON.stringify({ userId, login }));
}
async function getSession(jti) {
    const redis = (0, redis_1.getRedisClient)();
    const raw = await redis.get(`session:${jti}`);
    return raw ? JSON.parse(raw) : null;
}
async function deleteSession(jti) {
    const redis = (0, redis_1.getRedisClient)();
    await redis.del(`session:${jti}`);
}
//# sourceMappingURL=session.js.map