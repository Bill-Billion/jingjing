'use strict';
const mysql = require('mysql2/promise');
const { mysqlConfig } = require('./config');

async function openDatabase(env = process.env) {
  const config = mysqlConfig(env);
  const pool = mysql.createPool(config);
  async function acquire() {
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION time_zone = '+00:00'");
      await connection.query("SET SESSION default_storage_engine = 'InnoDB'");
      await connection.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
      return connection;
    } catch (error) { connection.destroy(); throw error; }
  }
  async function withConnection(work) {
    const connection = await acquire();
    try { return await work(connection); } finally { connection.release(); }
  }
  try {
    await withConnection(async (connection) => {
      const [[row]] = await connection.query('SELECT VERSION() AS version, @@version_comment AS comment');
      if (!/^8\./.test(row.version) || /mariadb/i.test(row.version + row.comment)) {
        throw Object.assign(new Error('MySQL 8 is required'), { code: 'DB_VERSION_UNSUPPORTED' });
      }
    });
  } catch (error) { await pool.end(); throw error; }
  return Object.freeze({
    database: config.database,
    execute: (sql, values = []) => withConnection((c) => c.execute(sql, values)),
    // Infrastructure-only: migrations need one dedicated session for GET_LOCK.
    withConnection,
    async withTransaction(work) {
      const connection = await acquire();
      let committing = false;
      let discarded = false;
      let active = true;
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        const transaction = Object.freeze({
          execute(sql, values = []) {
            if (!active) throw new Error('Transaction scope has ended');
            // Trusted repository SQL only. DDL/transaction commands must never imply rollback safety.
            if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH)\b/i.test(sql)) {
              throw Object.assign(new Error('Only DML/read statements are allowed inside this transaction'), { code: 'TRANSACTION_SQL_NOT_ALLOWED' });
            }
            return connection.execute(sql, values);
          },
        });
        const result = await work(transaction);
        active = false;
        committing = true;
        await connection.commit();
        return result;
      } catch (error) {
        active = false;
        try { await connection.rollback(); }
        catch { connection.destroy(); discarded = true; }
        if (committing) {
          if (!discarded) { connection.destroy(); discarded = true; }
          throw Object.assign(new Error('Commit outcome is uncertain; reconcile by business key before retrying'), { code: 'COMMIT_OUTCOME_UNKNOWN', cause: error });
        }
        throw error;
      } finally { if (!discarded) connection.release(); }
    },
    close: () => pool.end(),
  });
}
module.exports = { openDatabase };
