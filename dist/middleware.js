"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMiddleware = resolveMiddleware;
const jwt_1 = require("./jwt");
const session_1 = require("./session");
const cookies_1 = require("./cookies");
async function resolveSession(req) {
    const cookies = (0, cookies_1.parseCookies)(req.headers.cookie ?? '');
    const token = cookies['sid'];
    if (!token)
        return null;
    try {
        const payload = (0, jwt_1.verifyToken)(token);
        const session = await (0, session_1.getSession)(payload.jti);
        return session ? { ...session, jti: payload.jti } : null;
    }
    catch {
        return null;
    }
}
const authMiddleware = async (req, res, next) => {
    const session = await resolveSession(req);
    if (!session) {
        res.status(401).json({ content: null, error: true, error_text: 'Unauthorized' });
        return;
    }
    req.session = session;
    next();
};
const guestMiddleware = async (req, res, next) => {
    const session = await resolveSession(req);
    if (session) {
        res.status(403).json({ content: null, error: true, error_text: 'Already authenticated' });
        return;
    }
    next();
};
function resolveMiddleware(type) {
    switch (type) {
        case 'auth': return authMiddleware;
        case 'guest': return guestMiddleware;
    }
}
//# sourceMappingURL=middleware.js.map