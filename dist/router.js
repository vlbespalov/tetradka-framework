"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerControllers = registerControllers;
const crypto_1 = require("crypto");
const transaction_1 = require("./transaction");
const logger_1 = require("./logger");
const request_context_1 = require("./request-context");
const middleware_1 = require("./middleware");
const controller_loader_1 = require("./controller-loader");
// Maps method name prefix → HTTP verb
const METHOD_PREFIXES = [
    ['get_', 'get'],
    ['do_', 'post'],
    ['put_', 'put'],
    ['delete_', 'delete'],
    ['patch_', 'patch'],
    ['select_', 'post'], // select_{resource} → POST /{resource} (корень ресурса, принимает фильтры в body)
];
/**
 * Parses a snake_case method name into HTTP verb + route path.
 *
 * Rules:
 *   get_status_of_test  (controller: test) → GET  /test/status
 *   do_print_test       (controller: test) → POST /test/print
 *   get_user_info_of_test               → GET  /test/user/info  (underscores → path segments)
 *   get_item_of_test(uuid)              → GET  /test/:uuid      (special: "item" collapses to root)
 *
 * The controller name is stripped as either `_of_{name}` (preferred) or `_{name}`.
 */
function parseMethodName(methodName, controllerName) {
    let httpMethod = null;
    let remainder = methodName;
    for (const [prefix, verb] of METHOD_PREFIXES) {
        if (methodName.startsWith(prefix)) {
            httpMethod = verb;
            remainder = methodName.slice(prefix.length);
            break;
        }
    }
    if (!httpMethod)
        return null;
    const ofSuffix = `_of_${controllerName}`;
    const simpleSuffix = `_${controllerName}`;
    let pathPart = null;
    if (remainder.endsWith(ofSuffix)) {
        pathPart = remainder.slice(0, -ofSuffix.length);
    }
    else if (remainder.endsWith(simpleSuffix)) {
        pathPart = remainder.slice(0, -simpleSuffix.length);
    }
    else if (remainder === controllerName) {
        // select_test → POST /test (пустой путь = корень ресурса)
        pathPart = '';
    }
    if (pathPart === null)
        return null;
    // get_item_of_{controller}(uuid) → GET /{controller}/:uuid (skip the /item/ segment)
    if (httpMethod === 'get' && pathPart === 'item') {
        pathPart = '';
    }
    // Underscores in the path part become URL path segments
    const routePath = pathPart.split('_').join('/');
    return { httpMethod, routePath };
}
/**
 * Extracts positional parameter names from a function's source.
 * Works for class methods, async methods, and regular functions.
 */
function extractParamNames(fn) {
    const src = fn.toString();
    const match = src.match(/^(?:async\s+)?(?:\w+\s*)?\(([^)]*)\)/);
    if (!match || !match[1].trim())
        return [];
    return match[1]
        .split(',')
        .map((p) => p.trim().split(/[=:]/)[0].trim())
        .filter(Boolean);
}
/**
 * Coerces a query-string value to a number when it looks like one.
 * Booleans remain as strings per convention (e.g. param=true stays 'true').
 */
function coerceQueryValue(val) {
    if (typeof val !== 'string')
        return val;
    const num = Number(val);
    return val !== '' && !isNaN(num) ? num : val;
}
/**
 * Scans Controllers/ and registers an Express route for every
 * properly-named method found on the default-exported class.
 */
function registerControllers(app) {
    for (const [controllerName, ControllerClass] of (0, controller_loader_1.loadControllers)()) {
        const prototype = ControllerClass.prototype;
        const methodNames = Object.getOwnPropertyNames(prototype).filter((m) => {
            if (m === 'constructor')
                return false;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, m);
            return descriptor !== undefined && typeof descriptor.value === 'function';
        });
        for (const methodName of methodNames) {
            const parsed = parseMethodName(methodName, controllerName);
            if (!parsed)
                continue;
            const { httpMethod, routePath } = parsed;
            const paramNames = extractParamNames(prototype[methodName]);
            const isReadOnly = methodName.startsWith('get_') || methodName.startsWith('select_');
            // Named path segments derived from the method's declared parameter names
            const paramSegments = paramNames.map((p) => `:${p}`).join('/');
            const expressPath = routePath
                ? `/${controllerName}/${routePath}${paramSegments ? `/${paramSegments}` : ''}`
                : `/${controllerName}${paramSegments ? `/${paramSegments}` : ''}`;
            const middlewareMap = ControllerClass.middleware ?? {};
            const middlewareType = middlewareMap[methodName] ?? 'auth';
            const routeMiddlewares = middlewareType !== 'public' ? [(0, middleware_1.resolveMiddleware)(middlewareType)] : [];
            app[httpMethod](expressPath, ...routeMiddlewares, (req, res) => {
                const query_id = (0, crypto_1.randomUUID)();
                void request_context_1.requestContext.run({ queryId: query_id, res }, async () => {
                    const rq = {};
                    for (const [k, v] of Object.entries(req.query)) {
                        rq[k] = coerceQueryValue(v);
                    }
                    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
                        Object.assign(rq, req.body);
                    }
                    rq['headers'] = req.headers;
                    if (req.session)
                        rq['session'] = req.session;
                    const args = paramNames.map((p) => req.params[p]);
                    (0, logger_1.appLog)('info', query_id, `${ControllerClass.name}.${methodName}`);
                    try {
                        const result = await (0, transaction_1.withTransaction)(isReadOnly, async (manager) => {
                            const instance = new ControllerClass(rq, manager);
                            return instance[methodName](...args);
                        });
                        res.json({ query_id, content: result ?? null });
                    }
                    catch (err) {
                        const error_text = err instanceof Error ? err.message : String(err);
                        (0, logger_1.appLog)('error', query_id, `${ControllerClass.name}.${methodName}: ${error_text}`);
                        res.json({ query_id, content: null, error: true, error_text });
                    }
                });
            });
        }
    }
}
//# sourceMappingURL=router.js.map