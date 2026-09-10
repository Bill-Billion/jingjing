#!/bin/bash
# 修复 CORS：原 .env 为 CRLF，sed 追加把 CR 挤到行中导致正式域丢失。删除旧行后以干净 LF 行重建。
set -euo pipefail
cd /opt/jjsr
cp -a .env ".env.bak.cors.$(date +%Y%m%d%H%M%S)"
sed -i '/^CORS_ORIGIN=/d' .env
printf 'CORS_ORIGIN=http://localhost:8080,http://localhost:3000,https://www.jingjingrishang.com\n' >> .env
echo '== raw now (no ^M inside) =='
grep '^CORS_ORIGIN' .env | cat -A
echo '== parsed =='
node -e 'const c=require("./config");console.log("len=",c.cors.origin.length);console.log(JSON.stringify(c.cors.origin));console.log("www_match=",c.cors.origin.includes("https://www.jingjingrishang.com"));'
PM2="$(command -v pm2 || echo /usr/lib/node_modules/pm2/bin/pm2)"
"$PM2" restart jjsr >/dev/null && "$PM2" save >/dev/null
sleep 2
echo '== curl with formal Origin over https =='
curl -sk -m8 -i -H 'Origin: https://www.jingjingrishang.com' \
  "https://127.0.0.1/api/humans?pageSize=1" \
  -H 'Host: www.jingjingrishang.com' \
  --resolve www.jingjingrishang.com:443:127.0.0.1 | grep -Ei 'HTTP/|Access-Control-Allow'
echo '== health =='
curl -sk -m8 "https://127.0.0.1/api/health" -H 'Host: www.jingjingrishang.com' --resolve www.jingjingrishang.com:443:127.0.0.1; echo
echo CORS_FIX_DONE
