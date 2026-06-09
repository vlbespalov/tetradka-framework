import path from 'path';
import { runner } from 'node-pg-migrate';

export function createMigrationRunner(migrationsDir: string, databaseUrl: string) {
  async function runMigrations(subdir: 'before_start' | 'after_start') {
    await runner({
      databaseUrl,
      dir: path.join(migrationsDir, subdir),
      migrationsTable: `migrations_${subdir}`,
      direction: 'up',
      log: (msg: string) => console.log(`[migrations/${subdir}] ${msg}`),
    });
  }

  return {
    runBeforeStart: () => runMigrations('before_start'),
    runAfterStart: () => runMigrations('after_start'),
  };
}
