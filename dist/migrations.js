"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMigrationRunner = createMigrationRunner;
const path_1 = __importDefault(require("path"));
const node_pg_migrate_1 = require("node-pg-migrate");
function createMigrationRunner(migrationsDir, databaseUrl) {
    async function runMigrations(subdir) {
        await (0, node_pg_migrate_1.runner)({
            databaseUrl,
            dir: path_1.default.join(migrationsDir, subdir),
            migrationsTable: `migrations_${subdir}`,
            direction: 'up',
            log: (msg) => console.log(`[migrations/${subdir}] ${msg}`),
        });
    }
    return {
        runBeforeStart: () => runMigrations('before_start'),
        runAfterStart: () => runMigrations('after_start'),
    };
}
//# sourceMappingURL=migrations.js.map