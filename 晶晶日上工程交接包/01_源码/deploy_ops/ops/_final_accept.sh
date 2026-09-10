#!/bin/bash
echo '== 1 PM2/systemd =='
pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);a.forEach(p=>console.log(p.name,p.pm2_env.status,'restarts='+p.pm2_env.restart_time))})"
systemctl is-active pm2-root; systemctl is-enabled pm2-root
echo '== 2 health local & via nginx =='
curl -s http://127.0.0.1:3000/api/health; echo
curl -s http://127.0.0.1/api/health; echo
echo '== 3 key fingerprints =='
cd /opt/jjsr && md5sum routes/ai.js db.js app.js config.js routes/humans.js routes/projects.js routes/samples.js routes/packages.js
echo '== 4 baseline counts (expect humans6/agree16/dep6/users7/lib3) =='
node -e "const D=require('/opt/jjsr/node_modules/better-sqlite3');const d=new D('/opt/jjsr/jingjingshangri.db',{readonly:true});for(const t of ['humans','authorization_agreements','talent_deposits','users','sample_library'])console.log(t,d.prepare('SELECT COUNT(*) c FROM '+t).get().c);console.log('SMOKE residue:',d.prepare(\"SELECT COUNT(*) c FROM humans WHERE name LIKE '__SMOKE%'\").get().c,d.prepare(\"SELECT COUNT(*) c FROM users WHERE phone='19900000999'\").get().c);d.close();"
echo '== 5 backups/cron/ops =='
ls /opt/jjsr/backups/db | wc -l; cat /etc/cron.d/jjsr-ops | grep -v '^#' | grep -v '^$'
echo '== 6 error log since final restart (size + last lines) =='
ls -la /root/.pm2/logs/jjsr-error.log
tail -3 /root/.pm2/logs/jjsr-error.log || true
echo '== 7 health.log tail =='
tail -4 /opt/jjsr/ops/health.log
echo '== 8 disk =='
df -h / | tail -1
echo ACCEPT_DONE
