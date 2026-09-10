#!/bin/bash
# V12.3 ai.js 顺序修复上线：备份 -> 等待上传 -> 语法检查 -> MD5 -> 重启 -> 验证
set -e
TS=$(date +%Y%m%d_%H%M%S)
BD=/opt/jjsr/backup_v123_${TS}
mkdir -p ${BD}/routes
cp -a /opt/jjsr/routes/ai.js ${BD}/routes/ai.js
echo "BACKUP_DIR=${BD}"
md5sum ${BD}/routes/ai.js
