"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseController = void 0;
const typeorm_1 = require("typeorm");
const transaction_1 = require("./transaction");
class BaseController {
    rq;
    manager;
    constructor(rq = {}, manager) {
        this.rq = rq;
        this.manager = manager ?? (0, transaction_1.getDataSource)().manager;
    }
    get session() {
        return this.rq['session'];
    }
    getRepository(entity) {
        return this.manager.getRepository(entity);
    }
    // Transforms prefixed keys and typed values into TypeORM FindOptionsWhere operators.
    // Key prefixes: ><(Between) >=(MoreThanOrEqual) <=(LessThanOrEqual) >(MoreThan) <(LessThan) !(Not) %(ILike)
    // Value rules: array → In, null → IsNull
    // allowedFields restricts which entity properties can be filtered; defaults to all mapped columns.
    selectFrom(repo, allowedFields) {
        const { limit = 50, offset = 0, order, ...raw } = this.rq;
        const allowed = allowedFields ?? repo.metadata.columns.map((c) => c.propertyName);
        const filtered = Object.fromEntries(Object.entries(raw).filter(([k]) => {
            const base = k.replace(/^(><|>=|<=|[><!%])/, '');
            return allowed.includes(base);
        }));
        return repo.find({ where: this.parseWhere(filtered), take: limit, skip: offset, order: order });
    }
    parseWhere(raw) {
        const result = {};
        for (const [rawKey, val] of Object.entries(raw)) {
            let key = rawKey;
            let parsed;
            if (key.startsWith('><')) {
                key = key.slice(2);
                const [from, to] = val;
                parsed = (0, typeorm_1.Between)(from, to);
            }
            else if (key.startsWith('>=')) {
                key = key.slice(2);
                parsed = (0, typeorm_1.MoreThanOrEqual)(val);
            }
            else if (key.startsWith('<=')) {
                key = key.slice(2);
                parsed = (0, typeorm_1.LessThanOrEqual)(val);
            }
            else if (key.startsWith('>')) {
                key = key.slice(1);
                parsed = (0, typeorm_1.MoreThan)(val);
            }
            else if (key.startsWith('<')) {
                key = key.slice(1);
                parsed = (0, typeorm_1.LessThan)(val);
            }
            else if (key.startsWith('!')) {
                key = key.slice(1);
                parsed = (0, typeorm_1.Not)(val);
            }
            else if (key.startsWith('%')) {
                key = key.slice(1);
                parsed = (0, typeorm_1.ILike)(val);
            }
            else if (val === null) {
                parsed = (0, typeorm_1.IsNull)();
            }
            else if (Array.isArray(val)) {
                parsed = (0, typeorm_1.In)(val);
            }
            else {
                parsed = val;
            }
            result[key] = parsed;
        }
        return result;
    }
}
exports.BaseController = BaseController;
//# sourceMappingURL=Controller.js.map