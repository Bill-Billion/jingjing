#!/bin/bash
echo '===== PM2 LIST ====='
pm2 list
echo '===== PM2 DESCRIBE jjsr ====='
pm2 describe jjsr | sed -n '1,40p'
echo '===== /opt/jjsr ====='
ls -la /opt/jjsr | head -60
echo '===== package.json version ====='
grep '"version"' /opt/jjsr/package.json
echo '===== MD5 key files ====='
cd /opt/jjsr && md5sum db.js app.js config.js routes/humans.js routes/projects.js routes/samples.js routes/packages.js 2>&1
echo '===== backups ====='
ls -la /opt/jjsr | grep -i backup
ls -la /opt/backup 2>/dev/null
echo '===== pm2-root systemd ====='
systemctl is-enabled pm2-root 2>&1
systemctl is-active pm2-root 2>&1
echo '===== disk/mem ====='
df -h / | tail -1
free -h | sed -n '1,3p'
echo '===== uptime/load ====='
uptime
