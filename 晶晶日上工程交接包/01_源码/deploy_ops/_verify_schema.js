// 线上只读校验：补建表/补列是否随重启生效
const db = require('./db');
const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_requests'").get();
console.log('contact_requests:', t ? 'EXISTS' : 'MISSING');
for (const [tbl, col] of [
  ['endorsement_orders', 'tax_rate'],
  ['user_identities', 'updated_at'],
  ['sample_orders', 'pay_time'],
  ['authorization_agreements', 'signed_at'],
]) {
  const c = db.prepare(`PRAGMA table_info(${tbl})`).all().map(x => x.name);
  console.log(tbl + '.' + col + ':', c.includes(col) ? 'OK' : 'MISSING');
}
process.exit(0);
