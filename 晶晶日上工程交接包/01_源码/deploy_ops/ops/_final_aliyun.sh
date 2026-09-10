#!/bin/bash
cd /opt/jjsr
echo "=pm2="; pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{JSON.parse(d).forEach(p=>console.log(p.name,p.pm2_env.status,'restarts='+p.pm2_env.restart_time,'unstable='+p.pm2_env.unstable_restarts,'uptime_s='+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})"
echo "=errlog_size_and_tail="; ls -la /root/.pm2/logs/jjsr-error.log; tail -5 /root/.pm2/logs/jjsr-error.log 2>/dev/null || echo "(empty)"
echo "=health_now="; curl -s http://127.0.0.1:3000/api/health; echo
echo "=cron="; ls /etc/cron.d/ | grep -i jjsr; crontab -l 2>/dev/null | grep -i jjsr || true
echo "=last_healthcheck="; ls -t ops/health*.log logs/health*.log 2>/dev/null | head -2; tail -3 $(ls -t ops/health*.log 2>/dev/null | head -1) 2>/dev/null || echo "(no health log file, check cron)"
echo "=aliyun_ready_runtime(expect all false, AK empty)="; node -e "process.chdir('/opt/jjsr');const i=require('./services/providers/idVerify'),f=require('./services/providers/faceVerify'),m=require('./services/providers/moderation');console.log('id',i.ready(),'face',f.ready(),'green',m.cloudConfigured())"
echo "=new_tables_count="; node -e "const db=require('./db');console.log(db.prepare(\"SELECT COUNT(*) c FROM sqlite_master WHERE type='table'\").get().c)"
