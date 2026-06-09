import { Between, EntityManager, EntityTarget, FindOptionsOrder, FindOptionsWhere, ILike, In, IsNull, LessThan, LessThanOrEqual, MoreThan, MoreThanOrEqual, Not, ObjectLiteral, Repository } from 'typeorm';
import { getDataSource } from './transaction';
import type { SessionData } from './session';

export abstract class BaseController {
  protected rq: Record<string, unknown>;
  protected manager: EntityManager;

  constructor(rq: Record<string, unknown> = {}, manager?: EntityManager) {
    this.rq = rq;
    this.manager = manager ?? getDataSource().manager;
  }

  protected get session(): SessionData | undefined {
    return this.rq['session'] as SessionData | undefined;
  }

  protected getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return this.manager.getRepository(entity);
  }

  // Transforms prefixed keys and typed values into TypeORM FindOptionsWhere operators.
  // Key prefixes: ><(Between) >=(MoreThanOrEqual) <=(LessThanOrEqual) >(MoreThan) <(LessThan) !(Not) %(ILike)
  // Value rules: array → In, null → IsNull
  // allowedFields restricts which entity properties can be filtered; defaults to all mapped columns.
  protected selectFrom<T extends ObjectLiteral>(repo: Repository<T>, allowedFields?: string[]): Promise<T[]> {
    const { limit = 50, offset = 0, order, ...raw } = this.rq as {
      limit?: number;
      offset?: number;
      order?: Record<string, 'ASC' | 'DESC'>;
      [key: string]: unknown;
    };

    const allowed = allowedFields ?? repo.metadata.columns.map((c) => c.propertyName);
    const filtered = Object.fromEntries(
      Object.entries(raw).filter(([k]) => {
        const base = k.replace(/^(><|>=|<=|[><!%])/, '');
        return allowed.includes(base);
      }),
    );

    return repo.find({ where: this.parseWhere<T>(filtered), take: limit as number, skip: offset as number, order: order as FindOptionsOrder<T> });
  }

  protected parseWhere<T>(raw: Record<string, unknown>): FindOptionsWhere<T> {
    const result: Record<string, unknown> = {};
    for (const [rawKey, val] of Object.entries(raw)) {
      let key = rawKey;
      let parsed: unknown;

      if (key.startsWith('><')) {
        key = key.slice(2);
        const [from, to] = val as [unknown, unknown];
        parsed = Between(from, to);
      } else if (key.startsWith('>=')) {
        key = key.slice(2);
        parsed = MoreThanOrEqual(val);
      } else if (key.startsWith('<=')) {
        key = key.slice(2);
        parsed = LessThanOrEqual(val);
      } else if (key.startsWith('>')) {
        key = key.slice(1);
        parsed = MoreThan(val);
      } else if (key.startsWith('<')) {
        key = key.slice(1);
        parsed = LessThan(val);
      } else if (key.startsWith('!')) {
        key = key.slice(1);
        parsed = Not(val);
      } else if (key.startsWith('%')) {
        key = key.slice(1);
        parsed = ILike(val as string);
      } else if (val === null) {
        parsed = IsNull();
      } else if (Array.isArray(val)) {
        parsed = In(val);
      } else {
        parsed = val;
      }

      result[key] = parsed;
    }
    return result as FindOptionsWhere<T>;
  }
}
