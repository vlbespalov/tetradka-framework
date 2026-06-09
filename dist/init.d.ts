import { DataSource } from 'typeorm';
export interface FrameworkConfig {
    dataSource: DataSource;
    controllersDir: string;
}
export declare function initFramework(config: FrameworkConfig): void;
//# sourceMappingURL=init.d.ts.map