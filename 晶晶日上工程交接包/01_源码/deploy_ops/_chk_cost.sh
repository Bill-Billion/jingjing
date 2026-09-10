cd /opt/jjsr
cat > _chk_cost.js <<'EOF'
const db=require('better-sqlite3')('./jingjingshangri.db');
console.log('COST_ROWS='+JSON.stringify(db.prepare("select svc,action,ok,est_cost_fen,datetime(created_at/1000,'unixepoch') t from ai_cost_log order by id desc limit 5").all()));
console.log('TASKS='+JSON.stringify(db.prepare("select id,task_type,status,result_url from ai_generation_tasks order by id desc limit 3").all()));
EOF
node _chk_cost.js; rm -f _chk_cost.js
echo "===== pm2 save (persist on boot) ====="; pm2 save 2>&1 | tail -3
echo "===== pm2 startup status ====="; systemctl is-enabled pm2-root 2>/dev/null || echo "pm2-root service not found (check separately)"
echo "===== listen sockets ====="; ss -ltnp | grep -E ':80|:3000'
