echo "===== node ====="; node -v; npm -v
echo "===== pm2 ====="; pm2 list
echo "===== /opt/jjsr ====="; ls -la /opt/jjsr | head -60
echo "===== volc sdk present? ====="; ls /opt/jjsr/node_modules/@volcengine 2>/dev/null || echo NO_VOLC_SDK
echo "===== server .env keys (names only) ====="; grep -oE '^[A-Z_]+' /opt/jjsr/.env 2>/dev/null | sort
echo "===== services files on server ====="; ls -la /opt/jjsr/services 2>/dev/null
echo "===== nginx ====="; nginx -v 2>&1; systemctl is-active nginx
echo "===== db tables ====="; cd /opt/jjsr && node -e "const db=require('better-sqlite3')('./jingjingshangri.db');console.log(db.prepare(\"select name from sqlite_master where type='table' and name in ('sms_verification_codes','ai_generation_tasks','ai_cost_log')\").all().map(r=>r.name).join(','))" 2>&1
