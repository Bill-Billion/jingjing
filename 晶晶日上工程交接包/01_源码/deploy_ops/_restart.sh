cd /opt/jjsr
pm2 restart jjsr --update-env
sleep 3
echo "===== pm2 ====="; pm2 list | grep -E "jjsr|name"
echo "===== recent logs ====="; pm2 logs jjsr --lines 20 --nostream 2>&1 | tail -25
echo "===== new tables ====="
node -e 'const db=require("better-sqlite3")("./jingjingshangri.db");const t=db.prepare("select name from sqlite_master where type=\"table\" and name in (\"sms_verification_codes\",\"ai_generation_tasks\",\"ai_cost_log\")").all().map(r=>r.name);console.log(t.join(","))'
echo "===== local health ====="; curl -s http://127.0.0.1:3000/api/health; echo
echo "===== services present ====="; ls services/
