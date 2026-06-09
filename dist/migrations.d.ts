export declare function createMigrationRunner(migrationsDir: string, databaseUrl: string): {
    runBeforeStart: () => Promise<void>;
    runAfterStart: () => Promise<void>;
};
//# sourceMappingURL=migrations.d.ts.map