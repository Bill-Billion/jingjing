#!/bin/bash
echo '== .env mtime =='
stat -c '%y  %n' /opt/jjsr/.env
echo '== now =='
date -Is
echo '== pm2 jjsr process timing =='
pm2 jlist > /tmp/_pm.json
node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync("/tmp/_pm.json","utf8"));const p=a.find(x=>x.name==="jjsr");const e=p.pm2_env;console.log(JSON.stringify({status:e.status,restarts:e.restart_time,created_at_ms:e.created_at,pm_uptime_ms:e.pm_uptime,created_iso:new Date(e.created_at).toISOString(),uptime_iso:new Date(e.pm_uptime).toISOString(),unstable:e.instabilities},null,2));'
echo '== env SMS lines (values masked except ids) =='
grep -E '^SMS_' /opt/jjsr/.env | sed -E 's/(KEY|SECRET|TOKEN)=.*/\1=***/'
