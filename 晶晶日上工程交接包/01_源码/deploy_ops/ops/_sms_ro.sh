#!/bin/bash
# 只读核查：健康 / SMS 配置(非密) / PM2 状态 / 短信相关最近日志
echo '=== HEALTH(local) ==='
curl -s --max-time 8 http://127.0.0.1:3000/api/health; echo
echo '=== SMS_ENV_KEYS ==='
grep -E '^SMS_' /opt/jjsr/.env 2>/dev/null || echo 'no SMS_ lines'
echo '=== PM2 ==='
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let a=JSON.parse(s);a.forEach(p=>console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"up_min="+Math.round((Date.now()-p.pm2_env.pm_uptime)/60000)))}catch(e){console.log("parse-fail")}})'
echo '=== LOG_FILES ==='
ls -t /opt/jjsr/logs 2>/dev/null | head -8
ls -t ~/.pm2/logs/ 2>/dev/null | grep -i jjsr | head -8
echo '=== SMS_RECENT(out log) ==='
OUT=$(ls -t ~/.pm2/logs/jjsr-out*.log 2>/dev/null | head -1)
echo "out=$OUT"
[ -n "$OUT" ] && grep -iE 'sms|验证码|messageid|send.?sms|RE:[0-9]|SY:[0-9]|0009|template|sign' "$OUT" 2>/dev/null | tail -25
echo '=== ERR_RECENT ==='
ERR=$(ls -t ~/.pm2/logs/jjsr-error*.log 2>/dev/null | head -1)
echo "err=$ERR size=$( [ -n "$ERR" ] && stat -c%s "$ERR" 2>/dev/null )"
[ -n "$ERR" ] && tail -8 "$ERR" 2>/dev/null
echo '=== DONE ==='
