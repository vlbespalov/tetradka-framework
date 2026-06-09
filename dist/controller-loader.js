"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setControllersDir = setControllersDir;
exports.loadControllers = loadControllers;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let _controllersDir = null;
let cache = null;
function setControllersDir(dir) {
    _controllersDir = dir;
    cache = null;
}
function loadControllers() {
    if (cache)
        return cache;
    const registry = new Map();
    const dir = _controllersDir ?? path_1.default.resolve(process.cwd(), 'src/Controllers');
    if (!fs_1.default.existsSync(dir))
        return registry;
    for (const file of fs_1.default.readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
        const name = path_1.default.basename(file, path_1.default.extname(file)).toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(path_1.default.join(dir, file));
        const Cls = (mod.default ?? Object.values(mod)[0]);
        if (typeof Cls === 'function')
            registry.set(name, Cls);
    }
    cache = registry;
    return cache;
}
//# sourceMappingURL=controller-loader.js.map