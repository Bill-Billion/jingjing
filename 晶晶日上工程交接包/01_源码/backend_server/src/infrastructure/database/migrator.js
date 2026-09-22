'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_DIRECTORY = path.join(__dirname, '../../../migrations/mysql-runtime');
const TABLE = 'platform_schema_migrations';
function problem(code, message) { return Object.assign(new Error(message), { code }); }
function lockName(database) { return 'jx-schema:' + crypto.createHash('sha256').update(database).digest('hex').slice(0, 48); }
async function files(directory) {
  const names = (await fs.readdir(directory)).filter((n) => n.endsWith('.sql')).sort();
  const seen = new Set();
  const result = [];
  for (const name of names) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match || seen.has(match[1])) throw problem('MIGRATION_FILENAME_INVALID', 'Migration filenames must have unique four-digit versions');
    seen.add(match[1]);
    const sql = (await fs.readFile(path.join(directory, name), 'utf8')).replace(/\r\n/g, '\n');
    if (!sql.trim()) throw problem('MIGRATION_EMPTY', 'Migration statement is empty');
    result.push({ version: match[1], name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') });
  }
  return result;
}
async function history(connection) {
  const [[row]] = await connection.execute('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?', [TABLE]);
  if (!Number(row.n)) return [];
  const [rows] = await connection.query(`SELECT version, attempt, name, checksum, status, started_at, finished_at, error_code, reason FROM ${TABLE} ORDER BY version, attempt`);
  return rows;
}
function reconcile(migrations, rows) {
  const current = new Map();
  for (const row of rows) {
    const source = migrations.find((m) => m.version === row.version);
    if (!source || source.checksum !== row.checksum || source.name !== row.name) {
      throw problem('MIGRATION_DRIFT', 'Applied/attempted migration source is missing or changed; restore the original file');
    }
    current.set(row.version, row);
  }
  let pending = false;
  for (const migration of migrations) {
    const record = current.get(migration.version);
    if (!record || record.status !== 'APPLIED') pending = true;
    else if (pending) throw problem('MIGRATION_ORDER_INVALID', 'Historical migrations cannot be inserted or bypassed');
  }
  return current;
}
async function status(db, { directory = DEFAULT_DIRECTORY } = {}) {
  const migrations = await files(directory);
  return db.withConnection(async (connection) => {
    const rows = await history(connection); // Read-only: no CREATE TABLE, no migration invocation.
    const current = reconcile(migrations, rows);
    return { history: rows, migrations: migrations.map(({ version, name, checksum }) => ({ version, name, checksum, status: current.get(version)?.status || 'PENDING' })) };
  });
}
async function migrate(db, { directory = DEFAULT_DIRECTORY, retryVersion, expectedChecksum, reason, lockTimeout = 0 } = {}) {
  const migrations = await files(directory);
  if (retryVersion && (!/^[0-9a-f]{64}$/.test(expectedChecksum || '') || !reason || reason.length > 250)) {
    throw problem('MIGRATION_RETRY_INVALID', 'Retry requires the original checksum and a non-empty reason of at most 250 characters');
  }
  return db.withConnection(async (connection) => {
    const key = lockName(db.database);
    const [[locked]] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [key, lockTimeout]);
    if (Number(locked.acquired) !== 1) throw problem('MIGRATION_LOCK_BUSY', 'Another migration session owns this database');
    let discard = false;
    try {
      await connection.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
        version CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        attempt INT UNSIGNED NOT NULL,
        name VARCHAR(255) NOT NULL,
        checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        status ENUM('APPLYING','APPLIED','FAILED') NOT NULL,
        started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        finished_at DATETIME(6) NULL,
        error_code VARCHAR(64) NULL,
        reason VARCHAR(250) NULL,
        PRIMARY KEY (version, attempt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
      const current = reconcile(migrations, await history(connection));
      if (retryVersion && (current.get(retryVersion)?.status !== 'FAILED' || current.get(retryVersion).checksum !== expectedChecksum)) {
        throw problem('MIGRATION_RETRY_INVALID', 'Only a known FAILED attempt with the exact recorded checksum may be retried');
      }
      const applied = [];
      for (const migration of migrations) {
        const prior = current.get(migration.version);
        if (prior?.status === 'APPLIED') continue;
        if (prior?.status === 'APPLYING') throw problem('MIGRATION_OUTCOME_UNKNOWN', 'Interrupted migration requires schema inspection; automatic replay is forbidden');
        if (prior?.status === 'FAILED' && retryVersion !== migration.version) throw problem('MIGRATION_FAILED', 'Previous failure requires an explicit checksum-bound retry after inspection');
        const attempt = prior ? Number(prior.attempt) + 1 : 1;
        await connection.execute(`INSERT INTO ${TABLE} (version,attempt,name,checksum,status,reason) VALUES (?,?,?,?,'APPLYING',?)`,
          [migration.version, attempt, migration.name, migration.checksum, prior ? reason : null]);
        try {
          // Exactly one SQL statement per file; mysql2 multipleStatements=false. DDL is not wrapped in a fake transaction.
          await connection.query(migration.sql);
        } catch (error) {
          if (!error.errno || error.fatal) {
            discard = true;
            connection.destroy(); // keep APPLYING: server might have committed before connection loss
            throw problem('MIGRATION_OUTCOME_UNKNOWN', 'Connection lost during migration; inspect database state before recovery');
          }
          await connection.execute(`UPDATE ${TABLE} SET status='FAILED',finished_at=UTC_TIMESTAMP(6),error_code=? WHERE version=? AND attempt=?`,
            [/^[A-Z0-9_]{1,64}$/.test(error.code || '') ? error.code : 'SQL_ERROR', migration.version, attempt]);
          throw problem('MIGRATION_SQL_FAILED', `Migration ${migration.version} failed; earlier DDL is retained, not rolled back`);
        }
        await connection.execute(`UPDATE ${TABLE} SET status='APPLIED',finished_at=UTC_TIMESTAMP(6) WHERE version=? AND attempt=?`, [migration.version, attempt]);
        applied.push(migration.version);
      }
      return { applied };
    } finally {
      if (!discard) {
        try { await connection.execute('SELECT RELEASE_LOCK(?)', [key]); }
        catch { connection.destroy(); }
      }
    }
  });
}
module.exports = { migrate, status, lockName };
