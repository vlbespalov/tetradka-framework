"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearCookie = exports.setCookie = exports.getQueryId = exports.requestContext = void 0;
const async_hooks_1 = require("async_hooks");
exports.requestContext = new async_hooks_1.AsyncLocalStorage();
const getQueryId = () => exports.requestContext.getStore()?.queryId ?? '-';
exports.getQueryId = getQueryId;
const setCookie = (name, value, options = {}) => {
    exports.requestContext.getStore()?.res?.cookie(name, value, options);
};
exports.setCookie = setCookie;
const clearCookie = (name) => {
    exports.requestContext.getStore()?.res?.clearCookie(name);
};
exports.clearCookie = clearCookie;
//# sourceMappingURL=request-context.js.map