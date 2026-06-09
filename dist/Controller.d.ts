import { EntityManager, EntityTarget, FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import type { SessionData } from './session';
export declare abstract class BaseController {
    protected rq: Record<string, unknown>;
    protected manager: EntityManager;
    constructor(rq?: Record<string, unknown>, manager?: EntityManager);
    protected get session(): SessionData | undefined;
    protected getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T>;
    protected selectFrom<T extends ObjectLiteral>(repo: Repository<T>, allowedFields?: string[]): Promise<T[]>;
    protected parseWhere<T>(raw: Record<string, unknown>): FindOptionsWhere<T>;
}
//# sourceMappingURL=Controller.d.ts.map