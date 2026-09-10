// 线上库只读巡检：关键表结构 + 行数 + 样例（不输出任何敏感配置）
const path = require('path');
const Database = require('/opt/jjsr/node_modules/better-sqlite3');
const db = new Database('/opt/jjsr/jingjingshangri.db', { readonly: true });
function cols(t) {
  try { return db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).join(','); }
  catch (e) { return 'NO_TABLE:' + e.message; }
}
function count(t) {
  try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; }
  catch (e) { return 'ERR'; }
}
for (const t of ['users', 'humans', 'authorization_agreements', 'talent_deposits', 'deposits', 'sample_references', 'projects']) {
  console.log('== ' + t + ' rows=' + count(t));
  console.log('   cols: ' + cols(t));
}
console.log('-- users sample ids --');
try { console.log(JSON.stringify(db.prepare('SELECT id, phone, nickname, role FROM users ORDER BY id LIMIT 5').all())); } catch (e) { console.log(e.message); }
console.log('-- humans status counts --');
try { console.log(JSON.stringify(db.prepare("SELECT status, COUNT(*) c FROM humans GROUP BY status").all())); } catch (e) { console.log(e.message); }
console.log('-- sample_references dirty text check --');
try {
  const rows = db.prepare('SELECT id, substr(characters,1,40) ch, substr(tags,1,40) tg FROM sample_references LIMIT 8').all();
  rows.forEach(r => console.log(JSON.stringify(r)));
} catch (e) { console.log(e.message); }
console.log('-- tables total --');
console.log(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table'").get().c);
db.close();
