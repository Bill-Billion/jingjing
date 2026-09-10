#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
BD=/opt/jjsr/backups/backup_aliyun_$TS
mkdir -p $BD/services/providers $BD/utils $BD/routes
cd /opt/jjsr
for f in config.js app.js package.json package-lock.json .env.example; do [ -f $f ] && cp -a $f $BD/ && echo "bak $f"; done
[ -f services/providers/moderation.js ] && cp -a services/providers/moderation.js $BD/services/providers/ && echo "bak providers/moderation.js"
[ -f utils/contentModeration.js ] && cp -a utils/contentModeration.js $BD/utils/ && echo "bak utils/contentModeration.js"
for f in identity.js compliance.js review.js videos.js endorsement.js; do [ -f routes/$f ] && cp -a routes/$f $BD/routes/ && echo "bak routes/$f"; done
# 额外安全备份当前 .env（不进代码目录，仅本机服务器留存）
cp -a .env $BD/.env.snapshot && echo "bak .env.snapshot"
node ops/backup_sqlite.js 7
echo BACKUP_AT=$BD
find $BD -type f | wc -l
