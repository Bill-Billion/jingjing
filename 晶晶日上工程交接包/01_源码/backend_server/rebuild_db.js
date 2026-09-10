// 一次性：删除旧库 -> 建表(db.js) -> 灌种子(seed.js) -> wal_checkpoint(TRUNCATE)
const fs = require('fs');
for (const f of ['jingjingshangri.db', 'jingjingshangri.db-shm', 'jingjingshangri.db-wal']) {
  try { fs.unlinkSync(f); console.log('removed', f); } catch (e) {}
}
const db = require('./db');       // 建表
require('./seed');                // 灌种子（内部复用同一 db 实例）
const ck = db.pragma('wal_checkpoint(TRUNCATE)');
console.log('checkpoint', JSON.stringify(ck));
const roles = db.prepare('SELECT name, price, stock_total, stock_sold FROM project_roles').all();
console.log('project_roles', JSON.stringify(roles));
const projs = db.prepare('SELECT id, title, type FROM projects').all();
console.log('projects', JSON.stringify(projs));
const humans = db.prepare('SELECT id, name, avatar FROM humans').all();
console.log('humans', JSON.stringify(humans));
db.close();
console.log('REBUILD DONE');
