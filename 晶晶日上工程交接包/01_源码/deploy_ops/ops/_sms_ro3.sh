#!/bin/bash
# READ-ONLY SMS status probe (no secret values printed)
echo '=== HEALTH(local) ==='
curl -s --max-time 8 http://127.0.0.1:3000/api/health; echo
echo '=== SMS non-secret config ==='
grep -E '^SMS_(ENABLED|REGION|HOST|ACCOUNT|SIGN_NAME|LOGIN_TEMPLATE_ID)=' /opt/jjsr/.env 2>/dev/null
echo '=== secret/key names only (value hidden) ==='
grep -oE '^[A-Z_]*(SECRET|ACCESSKEY|ACCESS_KEY|_SK|_AK|TOKEN)[A-Z_]*=' /opt/jjsr/.env 2>/dev/null | sed 's/=$/ = <set>/' | sort -u
echo '=== PM2 ==='
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(p=>console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"up_min="+Math.round((Date.now()-p.pm2_env.pm_uptime)/60000)))}catch(e){console.log("pf")}})'
echo '=== recent SMS traces in pm2 out (last file) ==='
OUT=$(ls -t ~/.pm2/logs/jjsr-out*.log 2>/dev/null | head -1); echo "out=$OUT"
[ -n "$OUT" ] && grep -inE 'sms|验证码|volc|messageid|requestid|sent_ok|sendfail|RE:[0-9]|SY:[0-9]|0009|errorcode' "$OUT" 2>/dev/null | tail -25
echo '=== any error code lines across last 3 out logs ==='
for f in $(ls -t ~/.pm2/logs/jjsr-out*.log 2>/dev/null | head -3); do
  grep -inE 'RE:[0-9]{4}|SY:[0-9]{4}|ErrorCode|sendfail|sms.*(fail|error)' "$f" 2>/dev/null | tail -8
done
echo '=== pm2 error tail ==='
ERR=$(ls -t ~/.pm2/logs/jjsr-error*.log 2>/dev/null | head -1); echo "err=$ERR size=$( [ -n "$ERR" ] && stat -c%s "$ERR" 2>/dev/null)"
[ -n "$ERR" ] && tail -5 "$ERR"
echo '=== DONE ==='
