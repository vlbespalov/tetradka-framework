import { EntityManager } from 'typeorm';
export type ControllerCtor = new (rq?: Record<string, unknown>, manager?: EntityManager) => Record<string, unknown>;
export declare function setControllersDir(dir: string): void;
export declare function loadControllers(): Map<string, ControllerCtor>;
//# sourceMappingURL=controller-loader.d.ts.map