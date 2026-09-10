#!/bin/bash
set -e
cd /opt/jjsr
echo '== md5 (expect 029adef4f6755c7fb9f48785959578ef) =='
md5sum routes/pay.js
echo '== node --check =='
node --check routes/pay.js && echo SYNTAX_OK
pm2 restart jjsr --update-env >/dev/null
sleep 2
pm2 save >/dev/null
echo '== health =='
curl -s http://127.0.0.1:3000/api/health; echo
echo '== alipay status =='
node -e 'const s=require("./services/alipay");console.log(JSON.stringify(s.status()))'
