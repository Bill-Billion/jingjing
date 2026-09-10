#!/bin/bash
# V12.4.1 支付骨架自审热修上线前备份：改动文件快照 + SQLite 在线热备
set -e
TS=$(date +%Y%m%d_%H%M%S)
BK=/opt/jjsr/backups/backup_payfix_$TS
mkdir -p "$BK/services" "$BK/routes" "$BK/scripts"
cd /opt/jjsr
cp services/alipay.js "$BK/services/" 2>/dev/null || true
cp routes/pay.js "$BK/routes/" 2>/dev/null || true
[ -f scripts/pay_sandbox_joint_test.js ] && cp scripts/pay_sandbox_joint_test.js "$BK/scripts/" || echo 'joint test not on server yet'
node -e 'const Database=require("better-sqlite3");const db=new Database("/opt/jjsr/jingjingshangri.db");db.backup("'$BK'/jingjingshangri.db.bak").then(()=>{console.log("sqlite backup ok");db.close();}).catch(e=>{console.error(e);process.exit(1)});'
echo "BACKUP_DIR=$BK"
ls -la "$BK" "$BK/services" "$BK/routes"
echo '== old md5 (before hotfix) =='
md5sum services/alipay.js routes/pay.js
echo '== DONE BACKUP PAYFIX =='
