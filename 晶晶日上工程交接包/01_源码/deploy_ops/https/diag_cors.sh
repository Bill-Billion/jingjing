#!/bin/bash
cd /opt/jjsr
echo '== CORS_ORIGIN raw bytes (^M = CR) =='
grep '^CORS_ORIGIN' .env | cat -A
echo '== parsed by config =='
node -e 'const c=require("./config");console.log("len=",c.cors.origin.length);c.cors.origin.forEach(x=>console.log(JSON.stringify(x),"match=",x==="https://www.jingjingrishang.com"));'
echo '== file CRLF check (count CR in .env) =='
if grep -U -q $'\r' .env; then echo "HAS_CR"; else echo "LF_ONLY"; fi
echo DIAG_DONE
