import { DataSource } from 'typeorm';
import { setDataSource } from './transaction';
import { setControllersDir } from './controller-loader';

export interface FrameworkConfig {
  dataSource: DataSource;
  controllersDir: string;
}

export function initFramework(config: FrameworkConfig): void {
  setDataSource(config.dataSource);
  setControllersDir(config.controllersDir);
}
