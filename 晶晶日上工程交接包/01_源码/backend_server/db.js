// db.js - 遗留SQLite同步入口；R0.6仅允许本地/隔离测试。
// 所有金额字段单位：分（INTEGER 整数）。
// 结构定义已全部收敛到 migrations/ 版本化迁移：
//   - 启动只执行 schema_migrations 中尚未记录的迁移，顺序、事务、幂等；
//   - 不再在本文件散落 CREATE TABLE / ALTER TABLE；
//   - 新增结构请新增 migrations/NNN_xxx.js，不要改历史迁移文件。
// 正式MySQL异步基础见 src/infrastructure/database 和 docs/MYSQL_FOUNDATION.md。
// 旧路由尚未完成异步迁移，production进入此同步入口会拒绝启动，不会假切库。
// R0.6: this synchronous entry is retained only for isolated legacy/local tests.
// Fail before importing SQLite/config or creating any database file.
require('./src/infrastructure/database/config').assertLegacySQLiteAllowed();
const Database = require('better-sqlite3');
const config = require('./config');
const logger = require('./utils/logger');
const { runMigrations } = require('./migrations/runner');

// config.js loads .env; recheck after loading so .env cannot bypass the guard.
require('./src/infrastructure/database/config').assertLegacySQLiteAllowed();
const dbPath = config.db.sqlitePath;

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 顺序执行未应用迁移（老库无 schema_migrations 时，靠 IF NOT EXISTS / addColumnIfMissing 补齐）
const migResult = runMigrations(db, { logger });
const applied = migResult.filter((r) => r.migrated).length;
if (applied > 0) logger.info('db_migrations_applied', { count: applied });

module.exports = db;
