// scripts/migrate.js - 迁移命令行：node scripts/migrate.js         执行未应用迁移
//                        node scripts/migrate.js status  查看已应用/待执行版本
// 启动时 app→db.js 也会自动迁移；该脚本用于发布前手动执行或排障。
const path = require('path');
const { runMigrations, appliedVersions, listMigrationFiles } = require('../migrations/runner');
const logger = require('../utils/logger');

const mode = process.argv[2] || 'up';
const db = require('../db'); // 触发连接（db.js 内已自动迁移一次）
const dir = path.join(__dirname, '..', 'migrations');

if (mode === 'status') {
  const applied = new Set(appliedVersions(db).map(Number));
  const files = listMigrationFiles(dir);
  for (const f of files) {
    const v = Number(f.match(/^(\d+)_/)[1]);
    console.log(`${applied.has(v) ? '[已应用]' : '[待执行]'} v${v}  ${f}`);
  }
  process.exit(0);
}
const res = runMigrations(db, { dir, logger });
const migrated = res.filter((r) => r.migrated);
console.log(migrated.length ? `本次应用 ${migrated.length} 个迁移: ${migrated.map((m) => 'v' + m.version).join(', ')}` : '数据库已是最新，无待执行迁移');
process.exit(0);
