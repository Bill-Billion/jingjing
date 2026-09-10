const db = require('./db');
function run(label, sql) {
  try {
    const r = db.prepare(sql).all();
    console.log('OK[' + label + '] ' + JSON.stringify(r).slice(0, 400));
  } catch (e) {
    console.log('ERR[' + label + '] ' + e.message);
  }
}
run('schema_roles', "SELECT sql FROM sqlite_master WHERE name='project_roles'");
run('schema_projects', "SELECT sql FROM sqlite_master WHERE name='projects'");
run('roles1', 'SELECT * FROM project_roles LIMIT 1');
run('sub', `SELECT p.id,(SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id=p.id) st FROM projects p LIMIT 1`);
run('full', `SELECT p.*, h.name as talent_name, h.avatar as talent_avatar,
  (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id=p.id) seats_total,
  (SELECT COALESCE(SUM(stock_sold),0) FROM project_roles WHERE project_id=p.id) seats_claimed
  FROM projects p LEFT JOIN humans h ON p.talent_id=h.id LIMIT 1`);
