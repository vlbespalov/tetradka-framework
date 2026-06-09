import { DataSource, EntityManager } from 'typeorm';
export declare function setDataSource(ds: DataSource): void;
export declare function getDataSource(): DataSource;
export declare function withTransaction<T>(isReadOnly: boolean, fn: (manager: EntityManager) => Promise<T>): Promise<T>;
//# sourceMappingURL=transaction.d.ts.map