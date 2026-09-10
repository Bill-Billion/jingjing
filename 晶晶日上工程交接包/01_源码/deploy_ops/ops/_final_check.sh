#!/bin/bash
/usr/lib/node_modules/pm2/bin/pm2 jlist > /tmp/jl_final
node -e 'const a=require("/tmp/jl_final");for(const p of a)console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000))'
echo -n 'health: '; curl -s -m8 http://127.0.0.1/api/health; echo
echo 'health.log tail2:'; tail -n 2 /opt/jjsr/ops/health.log
echo -n 'error.log: '; ls -la /root/.pm2/logs/jjsr-error.log | awk '{print $5" bytes",$6,$7,$8}'
echo -n 'payments rows: '; cd /opt/jjsr && node -e 'const db=require("./db");console.log(db.prepare("SELECT COUNT(*) c FROM payments").get().c)'
echo FINAL_CHECK_DONE
