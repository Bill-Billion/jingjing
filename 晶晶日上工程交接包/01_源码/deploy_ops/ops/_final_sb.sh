#!/bin/bash
cd /opt/jjsr
echo '== health =='
curl -s http://127.0.0.1:3000/api/health; echo
echo '== alipay =='
node -e 'console.log(JSON.stringify(require("./services/alipay").status()))'
echo '== pm2 =='
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const p=a.find(x=>x.name==="jjsr");console.log("status=",p.pm2_env.status,"restarts=",p.pm2_env.restart_time,"unstable=",p.pm2_env.unstable_restarts)})'
echo '== errlog tail size =='
wc -c /root/.pm2/logs/jjsr-error.log
