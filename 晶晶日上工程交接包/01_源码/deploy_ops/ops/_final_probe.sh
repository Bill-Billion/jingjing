#!/bin/bash
echo '== versions =='
node -v; npm -v; pm2 -v; nginx -v 2>&1; sqlite3 --version 2>/dev/null || echo 'no sqlite3 cli (use node better-sqlite3)'
echo '== final fingerprints =='
cd /opt/jjsr && md5sum app.js config.js db.js package.json routes/*.js services/*.js 2>/dev/null | sort
echo '== backups =='
ls -la /opt/jjsr/backups/db
echo '== backup dirs =='
ls -d /opt/jjsr/backup_* /opt/backup/*.tar.gz 2>/dev/null
echo '== ops dir =='
ls -la /opt/jjsr/ops
echo '== cron =='
cat /etc/cron.d/jjsr-ops
echo '== pm2 module =='
pm2 list
echo '== logrotate conf =='
pm2 conf pm2-logrotate | head -10
echo '== disk =='
df -h /
