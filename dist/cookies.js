"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCookies = parseCookies;
function parseCookies(cookieHeader) {
    const cookies = {};
    for (const part of cookieHeader.split(';')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1)
            continue;
        const key = part.slice(0, eqIdx).trim();
        const val = part.slice(eqIdx + 1).trim();
        if (key)
            cookies[key] = decodeURIComponent(val);
    }
    return cookies;
}
//# sourceMappingURL=cookies.js.map