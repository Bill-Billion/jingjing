// scripts/gen_mysql_schema.js - 从最新 SQLite 结构程序化翻译出 MySQL8.0 建库脚本
// 用法: node scripts/gen_mysql_schema.js  → 生成 migrations/mysql/01_schema_mysql8.sql
// 金额 INTEGER 分统一映射 BIGINT；utf8mb4；InnoDB。改迁移后重跑本脚本保持两边结构同步。
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../migrations/runner');

const ROOT = path.join(__dirname, '..');
const tmp = path.join(os.tmpdir(), 'jjsr_mysql_gen_' + Date.now() + '.db');
const db = new Database(tmp);
runMigrations(db, { dir: path.join(ROOT, 'migrations'), logger: { info() {} } });

const LONG_TEXT = /(json|content|raw|script|message|intro|description|requirements|material|benefits|rights|outline|characters|feedback|detail|consent_text|scope_range|metadata|comment|reply|reject_reason|review_remark|reason)/i;
const MEDIUM_TEXT = /(url|cover|avatar|preview|video|sample|proposal|plan|path|letter|showreel|license|device|feature_vector)/i;
function mapColumn(line) {
  const m = line.match(/^\s*("?[\w]+"?)\s+([A-Z]+)/i);
  if (!m) return line;
  const col = m[1].replace(/"/g, '');
  const type = m[2].toUpperCase();
  const rest = line.slice(m[0].length);
  const isKey = /UNIQUE|PRIMARY\s+KEY/i.test(line);
  let nt;
  if (type === 'INTEGER') nt = /PRIMARY\s+KEY/i.test(line) ? 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'BIGINT';
  else if (type === 'REAL') nt = 'DOUBLE';
  else if (type === 'BLOB') nt = 'LONGBLOB';
  else if (type === 'DATE') nt = 'DATE';
  else if (type === 'DATETIME') nt = 'DATETIME';
  else if (type === 'TEXT') {
    if (isKey) nt = 'VARCHAR(191)';
    else if (LONG_TEXT.test(col)) nt = 'TEXT';
    else if (MEDIUM_TEXT.test(col)) nt = 'VARCHAR(512)';
    else nt = 'VARCHAR(255)';
  } else nt = type;
  let tail = rest;
  if (nt.includes('AUTO_INCREMENT')) tail = tail.replace(/AUTOINCREMENT|PRIMARY\s+KEY/gi, '');
  return line.slice(0, m.index) + '  ' + col + ' ' + nt + tail;
}
function translateTable(sql) {
  const lines = sql.split('\n');
  const body = lines.map((ln) => {
    if (/CREATE TABLE/i.test(ln)) return ln;
    if (/^\s*\)\s*$/.test(ln)) return ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;';
    return mapColumn(ln);
  });
  return body.join('\n').replace(/,(\s*\) ENGINE)/, '$1');
}

const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
const indexes = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY rowid").all();
const out = [];
out.push('-- 晶晶日上 MySQL 8.0 建库脚本（由 scripts/gen_mysql_schema.js 自动翻译 + 人工校对）');
out.push('-- 金额一律 BIGINT 整数分；字符集 utf8mb4；引擎 InnoDB。结构脚本；数据用 db_export/import。');
out.push('SET NAMES utf8mb4;');
out.push('SET FOREIGN_KEY_CHECKS=0;', '');
for (const t of tables) { out.push(translateTable(t.sql)); out.push(''); }
for (const ix of indexes) {
  let s = ix.sql.replace(/CREATE INDEX IF NOT EXISTS/i, 'CREATE INDEX').replace(/CREATE UNIQUE INDEX IF NOT EXISTS/i, 'CREATE UNIQUE INDEX');
  if (/WHERE/i.test(s)) {
    out.push('-- [需人工方案] SQLite 部分唯一索引，MySQL 用生成列实现，见 README_mysql_switch.md');
    out.push('-- 原始: ' + s.replace(/\s+/g, ' '));
    continue;
  }
  out.push(s + ';');
}
out.push('', 'SET FOREIGN_KEY_CHECKS=1;');
const dir = path.join(ROOT, 'migrations', 'mysql');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, '01_schema_mysql8.sql'), out.join('\n') + '\n', 'utf8');
console.log('tables', tables.length, 'indexes', indexes.length, '-> migrations/mysql/01_schema_mysql8.sql');
db.close();
for (const e of ['', '-wal', '-shm']) try { fs.unlinkSync(tmp + e); } catch (_) {}
