// scripts/db_export_sqlite.js - SQLite 全量数据导出（为切 MySQL 准备；只读，不改任何数据）
// 用法: node scripts/db_export_sqlite.js [输出文件.json]
// BLOB 列以 base64 编码，导入端还原；金额本就是整数分，无需换算。
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

const outFile = process.argv[2] || path.join(__dirname, '..', 'jjsr_export.json');
const db = new Database(config.db.sqlitePath, { readonly: true });

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all().map((r) => r.name);

const dump = { exportedAt: new Date().toISOString(), source: 'sqlite', tables: {} };
for (const t of tables) {
  const rows = db.prepare(`SELECT * FROM "${t}"`).all();
  // BLOB(Buffer) → base64 字符串，附类型标记无法逐列携带，统一约定：Buffer 转 {__b64}
  const cols = db.prepare(`PRAGMA table_info("${t}")`).all();
  const blobCols = new Set(cols.filter((c) => /BLOB/i.test(c.type || '')).map((c) => c.name));
  for (const row of rows) {
    for (const c of blobCols) {
      if (row[c] && Buffer.isBuffer(row[c])) row[c] = { __b64: row[c].toString('base64') };
    }
  }
  dump.tables[t] = rows;
}
fs.writeFileSync(outFile, JSON.stringify(dump), 'utf8');
const total = Object.values(dump.tables).reduce((a, r) => a + r.length, 0);
console.log(`导出 ${tables.length} 张表 / ${total} 行 -> ${outFile}`);
db.close();
