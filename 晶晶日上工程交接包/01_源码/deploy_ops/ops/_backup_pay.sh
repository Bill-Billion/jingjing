#!/bin/bash
# V12.4 支付骨架上线前备份：代码快照 + SQLite 在线热备（不影响运行中的 PM2）
set -e
TS=$(date +%Y%m%d_%H%M%S)
BK=/opt/jjsr/backups/backup_pay_$TS
mkdir -p "$BK"
cd /opt/jjsr
cp app.js db.js package.json package-lock.json "$BK"/ 2>/dev/null || true
mkdir -p "$BK/routes" "$BK/services"
cp routes/*.js "$BK/routes"/ 2>/dev/null || true
cp services/*.js "$BK/services"/ 2>/dev/null || true
# SQLite 在线热备（better-sqlite3 .backup，WAL 安全）
node -e 'const Database=require("better-sqlite3");const db=new Database("/opt/jjsr/jingjingshangri.db");db.backup("'$BK'/jingjingshangri.db.bak").then(()=>{console.log("sqlite backup ok");db.close();}).catch(e=>{console.error(e);process.exit(1)});'
echo "BACKUP_DIR=$BK"
ls -la "$BK"
echo "tables_in_backup:"; node -e 'const Database=require("better-sqlite3");const d=new Database("'$BK'/jingjingshangri.db.bak",{readonly:true});console.log(d.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=?").get("table").c);d.close();'
echo '== DONE BACKUP =='
