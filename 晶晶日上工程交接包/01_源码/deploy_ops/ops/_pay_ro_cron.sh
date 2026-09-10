#!/bin/bash
echo '== pm2 jlist =='
/usr/lib/node_modules/pm2/bin/pm2 jlist > /tmp/_jlist
node -e 'const a=require("/tmp/_jlist");for(const p of a){console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_utc="+new Date(p.pm2_env.pm_uptime).toISOString())}'
echo '== cron.d/jjsr-ops =='
cat /etc/cron.d/jjsr-ops
echo '== health.log tail 4 =='
tail -n 4 /opt/jjsr/ops/health.log 2>/dev/null || echo '(no health.log)'
echo '== backup.log tail 4 =='
tail -n 4 /opt/jjsr/backups/backup.log 2>/dev/null || echo '(no backup.log)'
echo '== systemd pm2-root =='
systemctl is-enabled pm2-root; systemctl is-active pm2-root
echo '== logrotate conf =='
/usr/lib/node_modules/pm2/bin/pm2 conf pm2-logrotate 2>/dev/null | grep -Ei 'max_size|retain|compress' | head -5
rm -f /tmp/_jlist
echo DONE_CRON_CHECK
