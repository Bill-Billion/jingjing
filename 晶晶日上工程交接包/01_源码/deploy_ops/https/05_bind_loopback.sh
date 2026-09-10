#!/bin/bash
# Node 只监听回环，公网不再能直连 3000；Nginx 经 127.0.0.1:3000 反代不受影响。先备份可回滚。
set -euo pipefail
A=/opt/jjsr/app.js
cp -a "$A" "$A.bak.$(date +%Y%m%d%H%M%S)"
sed -i "s/app.listen(config.port, '0.0.0.0'/app.listen(config.port, '127.0.0.1'/" "$A"
echo '== listen line now =='
grep -n 'app.listen' "$A"
cd /opt/jjsr
node --check app.js && echo NODE_CHECK_OK
PM2="$(command -v pm2 || echo /usr/lib/node_modules/pm2/bin/pm2)"
"$PM2" restart jjsr >/dev/null && "$PM2" save >/dev/null
sleep 2
echo '== :3000 sockets (expect 127.0.0.1 only) =='
ss -tlnp | grep ':3000'
echo '== via nginx https (expect ok json) =='
curl -sk -m8 https://127.0.0.1/api/health -H 'Host: www.jingjingrishang.com' --resolve www.jingjingrishang.com:443:127.0.0.1; echo
echo '== loopback direct (expect ok) =='
curl -s -m5 http://127.0.0.1:3000/api/health; echo
echo '== direct public IP:3000 (expect FAIL/closed) =='
if curl -s -m5 http://8.222.213.43:3000/api/health; then echo 'WARN_STILL_OPEN'; else echo 'PUBLIC_3000_CLOSED'; fi
echo BIND_DONE
