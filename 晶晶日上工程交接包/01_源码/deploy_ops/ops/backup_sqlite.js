// SQLite 每日在线备份（better-sqlite3 online backup，WAL 安全，无需停服务）
// 用法: node backup_sqlite.js [保留天数，默认7]
// 产物: /opt/jjsr/backups/db/jjsr-YYYYMMDD_HHmmss.db，并清理超过保留天数的旧备份。
const fs = require('fs');
const path = require('path');
const Database = require('/opt/jjsr/node_modules/better-sqlite3');

const SRC = process.env.SQLITE_PATH || '/opt/jjsr/jingjingshangri.db';
const BACKUP_DIR = '/opt/jjsr/backups/db';
const KEEP_DAYS = parseInt(process.argv[2] || process.env.BACKUP_KEEP_DAYS || '7', 10);
const LOG = '/opt/jjsr/backups/backup.log';

function log(line) {
  const msg = new Date().toISOString() + '  ' + line;
  console.log(msg);
  try { fs.appendFileSync(LOG, msg + '\n'); } catch (e) { /* ignore */ }
}

function ts(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

(async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, 'jjsr-' + ts(new Date()) + '.db');
  // 读写连接才能执行 wal_checkpoint；WAL 模式允许与 PM2 进程并发多连接
  const live = new Database(SRC);
  // 先做 WAL 检查点，保证备份完整
  try { live.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { log('checkpoint warn: ' + e.message); }
  await live.backup(dest);
  const before = live.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length;
  live.close();
  // 校验备份可正常打开且 integrity_check 通过
  const chk = new Database(dest, { readonly: true });
  const integ = chk.pragma('integrity_check');
  const after = chk.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length;
  chk.close();
  // 清理打开校验时产生的边车文件，备份目录只保留单一 .db
  for (const suf of ['-shm', '-wal']) { try { fs.unlinkSync(dest + suf); } catch (e) {} }
  const ok = integ && integ[0] && integ[0].integrity_check === 'ok' && before === after;
  const stat = fs.statSync(dest);
  log('backup -> ' + dest + ' size=' + stat.size + ' tables=' + after + ' integrity=' + JSON.stringify(integ[0]) + (ok ? ' OK' : ' BAD'));
  if (!ok) { process.exit(2); }
  // 清理超过保留天数的备份
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let removed = 0;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!/^jjsr-.*\.db$/.test(f)) continue;
    const fp = path.join(BACKUP_DIR, f);
    if (fs.statSync(fp).mtimeMs < cutoff) { fs.unlinkSync(fp); removed++; }
  }
  const remain = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).length;
  log('prune keep=' + KEEP_DAYS + 'd removed=' + removed + ' remain=' + remain);
  process.exit(0);
})().catch(e => { log('BACKUP_ERROR ' + e.message); process.exit(1); });
