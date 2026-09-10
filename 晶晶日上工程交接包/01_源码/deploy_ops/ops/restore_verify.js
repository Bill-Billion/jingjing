// 备份可恢复性验证：把指定（或最新）备份“恢复”到临时副本，做 integrity_check + 关键表计数比对，
// 全程只读线上库、绝不覆盖线上库。用法: node restore_verify.js [备份文件路径]
const fs = require('fs');
const path = require('path');
const Database = require('/opt/jjsr/node_modules/better-sqlite3');
const SRC = process.env.SQLITE_PATH || '/opt/jjsr/jingjingshangri.db';
const DIR = '/opt/jjsr/backups/db';
const TABLES = ['users', 'humans', 'authorization_agreements', 'talent_deposits', 'sample_library', 'projects', 'orders', 'video_orders'];

let backup = process.argv[2];
if (!backup) {
  const list = fs.readdirSync(DIR).filter(f => /^jjsr-.*\.db$/.test(f)).sort();
  if (!list.length) { console.error('no backup found in ' + DIR); process.exit(2); }
  backup = path.join(DIR, list[list.length - 1]);
}
const tmp = '/tmp/_restore_verify_' + Date.now() + '.db';
fs.copyFileSync(backup, tmp);
const live = new Database(SRC, { readonly: true });
const restored = new Database(tmp, { readonly: true });
const integ = restored.pragma('integrity_check');
let allOk = integ[0] && integ[0].integrity_check === 'ok';
console.log('verify backup: ' + backup);
console.log('integrity_check: ' + JSON.stringify(integ[0]));
for (const t of TABLES) {
  let lc = '-', rc = '-';
  try { lc = live.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch (e) { lc = 'N/A'; }
  try { rc = restored.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch (e) { rc = 'N/A'; }
  const same = lc === rc || lc === 'N/A';
  if (!same) allOk = false;
  console.log(`  ${t.padEnd(26)} live=${String(lc).padStart(5)}  restored=${String(rc).padStart(5)}  ${same ? 'MATCH' : 'DIFF'}`);
}
// 验证可写性（恢复后的库应能正常读写；在临时副本上写一条再删）
try {
  const w = new Database(tmp);
  w.exec('CREATE TABLE IF NOT EXISTS _restore_probe (id INTEGER)');
  w.prepare('INSERT INTO _restore_probe VALUES (1)').run();
  const v = w.prepare('SELECT COUNT(*) c FROM _restore_probe').get().c;
  w.exec('DROP TABLE _restore_probe');
  w.close();
  console.log('restored db writable probe: ' + (v === 1 ? 'OK' : 'BAD'));
  if (v !== 1) allOk = false;
} catch (e) { console.log('restored db writable probe: BAD ' + e.message); allOk = false; }
live.close(); restored.close(); fs.unlinkSync(tmp);
console.log(allOk ? 'RESTORE_VERIFY PASS' : 'RESTORE_VERIFY FAIL');
process.exit(allOk ? 0 : 1);
