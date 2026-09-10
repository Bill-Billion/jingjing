cd /opt/jjsr || exit 1
echo '---LS---'
ls -la | head -40
echo '---HEALTH---'
curl -s -o /dev/null -w 'health_http=%{http_code}\n' http://127.0.0.1:3000/api/health
echo '---VERSION---'
grep -o '"version":[^,]*' package.json | head -1
echo '---PM2---'
pm2 list
echo '---SCHEMA_DIAG---'
cat > /tmp/_diag_schema.js <<'EOF'
const Database = require('better-sqlite3');
const db = new Database('/opt/jjsr/jingjingshangri.db');
const cols = (t) => db.prepare("SELECT name FROM pragma_table_info(?)").all(t).map(r => r.name);
console.log('roles_cols=', JSON.stringify(cols('project_roles')));
console.log('projects_cols=', JSON.stringify(cols('projects')));
console.log('humans_cols=', JSON.stringify(cols('humans')));
console.log('sample_orders_cols=', JSON.stringify(cols('sample_orders')));
try {
  const rows = db.prepare(`SELECT p.*, h.name as talent_name,
    (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id = p.id) as seats_total,
    (SELECT COALESCE(SUM(stock_sold),0) FROM project_roles WHERE project_id = p.id) as seats_claimed
    FROM projects p LEFT JOIN humans h ON p.talent_id = h.id
    WHERE p.status IN ('recruiting','success','preparing','producing','post','released','closed')
    ORDER BY p.raised_amount DESC LIMIT ? OFFSET ?`).all(10, 0);
  console.log('projects_list_OK rows=', rows.length);
} catch (e) { console.log('projects_list_ERR=', e.message); }
const pc = db.prepare('SELECT COUNT(*) c FROM projects').get();
console.log('projects_count=', pc.c);
db.close();
EOF
node /tmp/_diag_schema.js
echo '---PM2_ERR_LOGS_TAIL---'
pm2 logs jjsr --lines 50 --nostream 2>&1 | tail -60
