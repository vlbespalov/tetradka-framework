import { DataSource, EntityManager } from 'typeorm';

let _ds: DataSource;

export function setDataSource(ds: DataSource): void {
  _ds = ds;
}

export function getDataSource(): DataSource {
  if (!_ds) throw new Error('Framework not initialized: call initFramework() first');
  return _ds;
}

export async function withTransaction<T>(
  isReadOnly: boolean,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const qr = getDataSource().createQueryRunner();
  await qr.connect();

  if (isReadOnly) {
    await qr.query('BEGIN READ ONLY');
  } else {
    await qr.startTransaction('READ COMMITTED');
  }

  try {
    const result = await fn(qr.manager);
    if (isReadOnly) {
      await qr.query('ROLLBACK');
    } else {
      await qr.commitTransaction();
    }
    return result;
  } catch (err) {
    if (isReadOnly) {
      await qr.query('ROLLBACK');
    } else {
      await qr.rollbackTransaction();
    }
    throw err;
  } finally {
    await qr.release();
  }
}
