// migrations/runner.js - 版本化数据库迁移运行器（SQLite 现状；方言隔离，便于后续切 MySQL）
//
// 设计原则：
// 1) 每个迁移文件形如 NNN_name.js，导出 { version, name, up(db, helpers) }，按文件名升序顺序执行；
// 2) schema_migrations 记录已执行版本，启动只跑未执行项，已执行项永不重跑（幂等由"只跑一次 + 语句自身可重复"双保险）；
// 3) 单个迁移包在一个事务里，失败整体回滚，不会留下半套结构；
// 4) 对"线上老库（无 schema_migrations、表已存在但可能缺列）"兼容：CREATE 用 IF NOT EXISTS、
//    ADD COLUMN 走 addColumnIfMissing 探测，因此老库一次性补齐到最新且可重复执行不报错。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIG_RE = /^(\d+)_[^/\\]+\.js$/;

function ensureMigrationsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT,
    applied_at INTEGER NOT NULL
  );`);
}

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table);
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

// 安全地补列：已存在则跳过，返回是否真正新增。colDdl 例如 "showreel_urls TEXT"
function addColumnIfMissing(db, table, colDdl) {
  const colName = colDdl.trim().split(/\s+/)[0];
  if (columnExists(db, table, colName)) return false;
  let ddl = colDdl;
  // SQLite 不允许对"已有数据行"的表 ADD 带非恒定默认值（如 CURRENT_TIMESTAMP）的列；
  // 旧代码用 try/catch 静默吞错会导致老库永远缺列。这里安全降级：去掉非常量 DEFAULT，
  // 建成可空列（历史行该列为 NULL，新行由业务写入时间戳），保证老库可升级。
  if (/default\s+current_(timestamp|date|time)/i.test(ddl)) {
    ddl = ddl.replace(/\s+default\s+current_(timestamp|date|time)/i, '');
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  return true;
}

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

function listMigrationFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => MIG_RE.test(f))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * 执行全部未应用迁移。
 * @param {import('better-sqlite3').Database} db
 * @param {{dir?:string, logger?:{info:Function,warn:Function,error:Function}}} [opts]
 * @returns {Array<{file:string,version:string,migrated?:boolean,skipped?:boolean}>}
 */
function runMigrations(db, opts = {}) {
  const dir = opts.dir || __dirname;
  const logger = opts.logger || { info() {}, warn() {}, error() {} };
  ensureMigrationsTable(db);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => String(r.version))
  );
  const out = [];
  for (const file of listMigrationFiles(dir)) {
    const version = file.match(MIG_RE)[1].replace(/^0+(?=\d)/, '');
    if (applied.has(String(Number(version))) || applied.has(version.padStart(3, '0'))) {
      out.push({ file, version, skipped: true });
      continue;
    }
    const mod = require(path.join(dir, file));
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const helpers = {
      exec: (sql) => db.exec(sql),
      tableExists: (t) => tableExists(db, t),
      columnExists: (t, c) => columnExists(db, t, c),
      addColumnIfMissing: (t, ddl) => addColumnIfMissing(db, t, ddl),
      logger,
    };
    const apply = db.transaction(() => {
      mod.up(db, helpers);
      db.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?,?,?,?)')
        .run(version, mod.name || file, sha1(src), Date.now());
    });
    apply();
    out.push({ file, version, migrated: true });
    logger.info && logger.info('migration_applied', { version, name: mod.name || file });
  }
  return out;
}

/** 当前已应用版本列表（升序） */
function appliedVersions(db) {
  ensureMigrationsTable(db);
  return db.prepare('SELECT version FROM schema_migrations').all()
    .map((r) => String(r.version)).sort((a, b) => Number(a) - Number(b));
}

module.exports = {
  runMigrations,
  appliedVersions,
  ensureMigrationsTable,
  tableExists,
  columnExists,
  addColumnIfMissing,
  listMigrationFiles,
};
