// db.js - 数据库连接 + 版本化迁移入口（工程化整改后）
// 所有金额字段单位：分（INTEGER 整数）。
// 结构定义已全部收敛到 migrations/ 版本化迁移：
//   - 启动只执行 schema_migrations 中尚未记录的迁移，顺序、事务、幂等；
//   - 不再在本文件散落 CREATE TABLE / ALTER TABLE；
//   - 新增结构请新增 migrations/NNN_xxx.js，不要改历史迁移文件。
// 当前生产仍为 SQLite（WAL）。切 MySQL 见 migrations/mysql/ 与《18_工程化整改记录》。
const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { runMigrations } = require('./migrations/runner');

// 现状：DB_CLIENT 非 sqlite 时仍回落到本地 SQLite（保持历史行为，不在本次擅自切库）；
// MySQL 运行时切换需走 migrations/mysql 切换文档与负责人决策。
const dbPath = config.db.client === 'sqlite'
  ? config.db.sqlitePath
  : path.join(__dirname, 'jingjingshangri.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 顺序执行未应用迁移（老库无 schema_migrations 时，靠 IF NOT EXISTS / addColumnIfMissing 补齐）
const migResult = runMigrations(db, { logger });
const applied = migResult.filter((r) => r.migrated).length;
if (applied > 0) logger.info('db_migrations_applied', { count: applied });

module.exports = db;
