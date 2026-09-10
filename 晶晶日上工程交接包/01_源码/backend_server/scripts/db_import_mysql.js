// scripts/db_import_mysql.js - 将 db_export_sqlite.js 的 JSON 导入 MySQL8.0（切换时才用）
// 用法: node scripts/db_import_mysql.js jjsr_export.json
// 依赖 mysql2（切换时再安装：npm i mysql2，不提前写入生产依赖）；连接参数走 env：
//   MYSQL_HOST/PORT/USER/PASSWORD/DATABASE
// 安全：默认 dry-run（只打印将插入的行数），加 --apply 才真正写入；写入用事务，失败回滚。
const fs = require('fs');
const path = require('path');

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file) { console.error('用法: node scripts/db_import_mysql.js <export.json> [--apply]'); process.exit(2); }

  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch (e) {
    console.error('[缺少依赖] 切换 MySQL 时先在服务器执行: npm i mysql2');
    console.error('连接用环境变量 MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE');
    process.exit(3);
  }
  const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'jingjingshangri',
    multipleStatements: false,
    charset: 'utf8mb4',
  });

  // 外键依赖顺序：先小表后业务表；这里按导出顺序并临时关闭外键检查
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  await conn.beginTransaction();
  try {
    for (const [table, rows] of Object.entries(dump.tables)) {
      if (!rows.length) { console.log(`- ${table}: 0 行`); continue; }
      const cols = Object.keys(rows[0]);
      // BLOB 还原
      for (const r of rows) for (const c of cols) if (r[c] && typeof r[c] === 'object' && r[c].__b64) r[c] = Buffer.from(r[c].__b64, 'base64');
      if (apply) {
        const placeholders = cols.map(() => '?').join(',');
        const sql = `INSERT INTO \`${table}\` (${cols.map((c) => '`' + c + '`').join(',')}) VALUES (${placeholders})`;
        const stmt = await conn.prepare(sql);
        for (const r of rows) await stmt.execute(cols.map((c) => r[c]));
        stmt.close();
      }
      console.log(`- ${table}: ${rows.length} 行${apply ? ' 已写入' : ' (dry-run)'}`);
    }
    if (apply) { await conn.commit(); console.log('导入完成并提交'); }
    else { await conn.rollback(); console.log('dry-run 结束，未写入；确认无误加 --apply 执行'); }
  } catch (e) {
    await conn.rollback();
    console.error('导入失败已回滚:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    await conn.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
