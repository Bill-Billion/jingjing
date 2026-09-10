#!/bin/bash
PM2=/usr/lib/node_modules/pm2/bin/pm2
cd /opt/jjsr
echo '== restart =='
$PM2 restart jjsr --update-env 2>&1 | grep -Ei 'jjsr|online|errored' | head -5
$PM2 save >/dev/null 2>&1 && echo 'pm2 saved'
sleep 4
echo '== pm2 status =='
$PM2 describe jjsr 2>/dev/null | grep -Ei 'status|restarts|uptime|script path' | head -8
echo '== recent error logs (if any) =='
tail -n 15 /root/.pm2/logs/jjsr-error.log 2>/dev/null | tail -8 || echo 'no error log'
echo '== health local =='; curl -s -m8 http://127.0.0.1:3000/api/health; echo
echo '== health nginx =='; curl -s -m8 http://127.0.0.1/api/health; echo
echo '== new pay route no-auth (expect 401) =='
curl -s -m8 -o /dev/null -w 'create_noauth_http=%{http_code}\n' -X POST http://127.0.0.1:3000/api/pay/alipay/create -H 'Content-Type: application/json' -d '{}'
echo '== notify unconfigured (expect fail text) =='
curl -s -m8 -X POST http://127.0.0.1:3000/api/pay/alipay/notify -d 'a=1'; echo
echo '== DONE RESTART =='
