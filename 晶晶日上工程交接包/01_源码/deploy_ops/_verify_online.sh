cd /opt/jjsr
echo "===== new tables ====="
cat > _chk_tables.js <<'EOF'
const db=require('better-sqlite3')('./jingjingshangri.db');
const t=db.prepare("select name from sqlite_master where type='table' and name in ('sms_verification_codes','ai_generation_tasks','ai_cost_log')").all().map(r=>r.name);
console.log('NEW_TABLES='+t.join(','));
EOF
node _chk_tables.js; rm -f _chk_tables.js
echo "===== health :3000 ====="; curl -s http://127.0.0.1:3000/api/health; echo
echo "===== health via nginx :80 ====="; curl -s http://127.0.0.1/api/health; echo
echo "===== ai tts no-token (expect 401) ====="; curl -s -w " [HTTP %{http_code}]\n" -X POST http://127.0.0.1:3000/api/ai/tts -H "Content-Type: application/json" -d '{"text":"hi"}'
echo "===== sms send online (dev/no-real-send) ====="; curl -s -w " [HTTP %{http_code}]\n" -X POST http://127.0.0.1:3000/api/auth/sms -H "Content-Type: application/json" -d '{"phone":"13900000001"}'
echo "===== phone login random code (expect fail, no devcode online) ====="; curl -s -w " [HTTP %{http_code}]\n" -X POST http://127.0.0.1:3000/api/auth/phone -H "Content-Type: application/json" -d '{"phone":"13900000001","code":"000000"}'
