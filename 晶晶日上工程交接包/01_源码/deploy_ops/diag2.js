const db = require('./db');
let sql = `SELECT p.*, h.name as talent_name, h.avatar as talent_avatar,
             (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id = p.id) as seats_total,
             (SELECT COALESCE(SUM(stock_sold),0) FROM project_roles WHERE project_id = p.id) as seats_claimed
             FROM projects p LEFT JOIN humans h ON p.talent_id = h.id WHERE 1=1`;
sql += " AND p.status IN ('recruiting','success','preparing','producing','post','released','closed')";
sql += ' ORDER BY p.raised_amount DESC LIMIT ? OFFSET ?';
console.log('=== FINAL SQL ===');
console.log(sql);
console.log('=== CHAR CODES around first paren ===');
const i = sql.indexOf('(SELECT');
console.log(JSON.stringify(sql.slice(i - 3, i + 12)));
try {
  const r = db.prepare(sql).all(10, 0);
  console.log('OK rows=', r.length, JSON.stringify(r[0] || {}).slice(0, 200));
} catch (e) {
  console.log('ERR', e.message);
}
// 对照：去掉 IN 列表
let s2 = `SELECT p.*, (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id=p.id) st FROM projects p WHERE 1=1 ORDER BY p.raised_amount DESC LIMIT ? OFFSET ?`;
try { console.log('OK2', db.prepare(s2).all(10,0).length); } catch (e) { console.log('ERR2', e.message); }
