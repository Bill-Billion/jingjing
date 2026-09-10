echo '=== PM2 ==='
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(p=>console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time))}catch(e){console.log("parsefail")}})'
echo '=== ENV SMS/VOLC keys (secrets masked) ==='
grep -E 'SMS_|VOLC_' /opt/jjsr/.env | sed -E 's/(SECRET|ACCESS_?KEY|SK|AK|TOKEN|PASSWORD|PWD)=.*/\1=***masked***/I'
echo '=== channelStatus ==='
cd /opt/jjsr && node -e 'try{const s=require("./services/smsService");console.log("CHANNEL="+JSON.stringify(s.channelStatus()))}catch(e){console.log("CHERR="+e.message)}'
echo '=== recent sms-related out logs ==='
tail -n 1200 /root/.pm2/logs/jjsr-out.log 2>/dev/null | grep -iE 'sms|send|messageid|template|deliver|verif|code' | tail -n 30
echo '=== recent error log tail ==='
tail -n 25 /root/.pm2/logs/jjsr-error.log 2>/dev/null
echo '=== END ==='
