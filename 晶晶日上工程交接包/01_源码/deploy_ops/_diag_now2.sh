cd /opt/jjsr || exit 1
echo '---MD5---'
md5sum routes/projects.js routes/humans.js routes/samples.js db.js config.js app.js
echo '---WC---'
wc -l routes/projects.js routes/humans.js routes/samples.js
echo '---PROJECTS_13_30 with visible chars---'
sed -n '13,30p' routes/projects.js | cat -A
echo '---PROJECTS_BYTES_AROUND_SQL (hexdump head)---'
sed -n '15,18p' routes/projects.js | head -c 600 | od -An -tx1 | head -20
echo '---SCHEMA_DIAG2 (NODE_PATH fixed)---'
cat > /opt/jjsr/_diag_schema2.js <<'EOF'
const Database = require('better-sqlite3');
const db = new Database('/opt/jjsr/jingjingshangri.db');
const cols = (t) => db.prepare("SELECT name FROM pragma_table_info(?)").all(t).map(r => r.name);
console.log('roles_cols=', JSON.stringify(cols('project_roles')));
console.log('projects_cols=', JSON.stringify(cols('projects')));
console.log('humans_cols=', JSON.stringify(cols('humans')));
console.log('sample_orders_cols=', JSON.stringify(cols('sample_orders')));
console.log('lib_cols=', JSON.stringify(cols('sample_library')));
try {
  const rows = db.prepare("SELECT p.*, h.name as talent_name, (SELECT COALESCE(SUM(stock_total),0) FROM project_roles WHERE project_id = p.id) as seats_total FROM projects p LEFT JOIN humans h ON p.talent_id = h.id LIMIT 3").all();
  console.log('subq_OK rows=', rows.length);
} catch (e) { console.log('subq_ERR=', e.message); }
console.log('sqlite_version=', db.prepare('SELECT sqlite_version() v').get().v);
const dirty = db.prepare("SELECT id, substr(characters,1,40) c, substr(tags,1,40) t, substr(market_data,1,40) m FROM sample_library").all();
console.log('library_rows=', JSON.stringify(dirty, null, 0));
db.close();
EOF
NODE_PATH=/opt/jjsr/node_modules node /opt/jjsr/_diag_schema2.js
