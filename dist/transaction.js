"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDataSource = setDataSource;
exports.getDataSource = getDataSource;
exports.withTransaction = withTransaction;
let _ds;
function setDataSource(ds) {
    _ds = ds;
}
function getDataSource() {
    if (!_ds)
        throw new Error('Framework not initialized: call initFramework() first');
    return _ds;
}
async function withTransaction(isReadOnly, fn) {
    const qr = getDataSource().createQueryRunner();
    await qr.connect();
    if (isReadOnly) {
        await qr.query('BEGIN READ ONLY');
    }
    else {
        await qr.startTransaction('READ COMMITTED');
    }
    try {
        const result = await fn(qr.manager);
        if (isReadOnly) {
            await qr.query('ROLLBACK');
        }
        else {
            await qr.commitTransaction();
        }
        return result;
    }
    catch (err) {
        if (isReadOnly) {
            await qr.query('ROLLBACK');
        }
        else {
            await qr.rollbackTransaction();
        }
        throw err;
    }
    finally {
        await qr.release();
    }
}
//# sourceMappingURL=transaction.js.map