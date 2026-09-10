#!/bin/bash
set -e
chmod 600 /opt/jjsr/secrets/alipay/sandbox/*.pem
cd /opt/jjsr
node ops/set_sandbox_env.js
pm2 restart jjsr --update-env >/dev/null
sleep 2
pm2 save >/dev/null
echo '== health =='
curl -s http://127.0.0.1:3000/api/health; echo
echo '== alipay status (fresh process) =='
node -e 'const s=require("./services/alipay");console.log(JSON.stringify(s.status()))'
echo '== ALIPAY env keys (paths/ids only, no secret) =='
grep -E '^ALIPAY_' .env
