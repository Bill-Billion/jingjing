#!/bin/bash
cd /opt/jjsr
pm2 restart jjsr --update-env >/dev/null && pm2 save >/dev/null
sleep 3
echo "=health="; curl -s http://127.0.0.1:3000/api/health; echo
echo "=pm2="; pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);const p=a.find(x=>x.name==='jjsr');console.log('status='+p.pm2_env.status,'restarts='+p.pm2_env.restart_time,'unstable='+p.pm2_env.unstable_restarts)})"
echo "=faceverify_notoken(expect401)="; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3000/api/face-verify/init
echo "=identity_notoken(expect401)="; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/identity/status
echo "=compliance_notoken(expect401)="; curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3000/api/compliance/sign
echo "=public_packages(expect200)="; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/packages
echo "=public_humans(expect200)="; curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/api/humans?pageSize=1'
echo "=errlog_tail="; pm2 logs jjsr --lines 6 --nostream --err | tail -8
