import path from 'path';
import fs from 'fs';
import { EntityManager } from 'typeorm';

export type ControllerCtor = new (rq?: Record<string, unknown>, manager?: EntityManager) => Record<string, unknown>;

let _controllersDir: string | null = null;
let cache: Map<string, ControllerCtor> | null = null;

export function setControllersDir(dir: string): void {
  _controllersDir = dir;
  cache = null;
}

export function loadControllers(): Map<string, ControllerCtor> {
  if (cache) return cache;
  const registry = new Map<string, ControllerCtor>();
  const dir = _controllersDir ?? path.resolve(process.cwd(), 'src/Controllers');
  if (!fs.existsSync(dir)) return registry;
  for (const file of fs.readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
    const name = path.basename(file, path.extname(file)).toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(dir, file)) as Record<string, unknown>;
    const Cls = (mod.default ?? Object.values(mod)[0]) as ControllerCtor | undefined;
    if (typeof Cls === 'function') registry.set(name, Cls);
  }
  cache = registry;
  return cache;
}
