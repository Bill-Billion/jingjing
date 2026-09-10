#!/bin/bash
# 只读侦察：服务/配置/PM2 + 找到短信相关日志与DB的真实位置和格式
echo '=== HEALTH ==='
curl -s --max-time 8 http://127.0.0.1:3000/api/health; echo
echo '=== SMS_ENV ==='
grep -E '^SMS_' /opt/jjsr/.env 2>/dev/null
echo '=== PM2 ==='
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(p=>console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"up_min="+Math.round((Date.now()-p.pm2_env.pm_uptime)/60000)))}catch(e){console.log("pf")}})'
echo '=== APP TREE(logs/db) ==='
ls -la /opt/jjsr 2>/dev/null | grep -iE 'log|data|\.db|sqlite' 
echo '--- logs dir ---'
ls -lat /opt/jjsr/logs 2>/dev/null | head -15
echo '--- db files ---'
find /opt/jjsr -maxdepth 3 -iname '*.db' -o -iname '*.sqlite*' 2>/dev/null | head
echo '=== PM2 OUT tail(看日志真实格式) ==='
OUT=$(ls -t ~/.pm2/logs/jjsr-out*.log 2>/dev/null | head -1); echo "out=$OUT"
[ -n "$OUT" ] && tail -30 "$OUT"
echo '=== 宽匹配短信痕迹(全部pm2 out) ==='
for f in $(ls -t ~/.pm2/logs/jjsr-out*.log 2>/dev/null | head -3); do
  echo "## $f"
  grep -inE 'sms|验证码|发送|volc|send|messageid|errorcode|"code"|RE:[0-9]|SY:[0-9]|auth' "$f" 2>/dev/null | tail -15
done
echo '=== ERR ==='
ERR=$(ls -t ~/.pm2/logs/jjsr-error*.log 2>/dev/null | head -1); echo "err=$ERR size=$( [ -n "$ERR" ] && stat -c%s "$ERR" 2>/dev/null)"
[ -n "$ERR" ] && tail -6 "$ERR"
echo '=== DONE ==='
