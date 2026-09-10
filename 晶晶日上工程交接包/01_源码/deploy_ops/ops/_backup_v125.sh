#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
BD=/opt/jjsr/backups/backup_v125_$TS
mkdir -p $BD/routes
cp -a /opt/jjsr/routes/humans.js /opt/jjsr/routes/videos.js $BD/routes/
node /opt/jjsr/ops/backup_sqlite.js 7
echo BACKUP_AT=$BD
ls -la $BD/routes
