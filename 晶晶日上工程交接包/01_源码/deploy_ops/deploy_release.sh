#!/bin/bash
# 晶晶日上后端发布脚本（覆盖更新 /opt/jjsr，PM2 守护）
set -u
PM2=/usr/lib/node_modules/pm2/bin/pm2
TS=$(date +%Y%m%d_%H%M%S)
echo "==== 1. 备份旧版本（不含 node_modules）===="
if [ -d /opt/jjsr ]; then
  mkdir -p /opt/backup
  tar czf /opt/backup/jjsr_$TS.tar.gz --exclude=node_modules -C /opt jjsr && echo "backup ok: /opt/backup/jjsr_$TS.tar.gz"
fi

echo "==== 2. PM2 停旧服务 ===="
$PM2 delete jjsr 2>/dev/null || true

echo "==== 3. 保留已编译 node_modules，重建目录 ===="
[ -d /opt/jjsr/node_modules ] && mv /opt/jjsr/node_modules /root/deploy/node_modules_keep || true
rm -rf /opt/jjsr && mkdir -p /opt/jjsr

echo "==== 4. 释放新代码/素材/env/数据库 ===="
tar xzf /root/deploy/jjsr_release.tar.gz -C /opt/jjsr
[ -d /root/deploy/node_modules_keep ] && mv /root/deploy/node_modules_keep /opt/jjsr/node_modules
tar xzf /root/deploy/jjsr_uploads.tar.gz -C /opt/jjsr
cp /root/deploy/jjsr.env /opt/jjsr/.env
cp /root/deploy/jingjingshangri.db /opt/jjsr/jingjingshangri.db
rm -f /opt/jjsr/jingjingshangri.db-shm /opt/jjsr/jingjingshangri.db-wal
# 演示期先 development（登录/支付接通后切 production）
sed -i 's/^NODE_ENV=.*/NODE_ENV=development/' /opt/jjsr/.env
grep -E '^(NODE_ENV|PORT|ARK_LLM_MODEL|SPEECH_APP_ID)=' /opt/jjsr/.env | sed -E 's#(KEY|SECRET|TOKEN)=.*#\1=***#'

echo "==== 5. 安装/对齐依赖（Linux 原生编译）===="
cd /opt/jjsr
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -12

echo "==== 6. 语法自检 ===="
for f in app.js config.js services/volc.js routes/ai.js; do node -c "$f" && echo "syntax ok: $f"; done

echo "==== 7. PM2 启动 + 开机自启 ===="
$PM2 start app.js --name jjsr --update-env
sleep 3
$PM2 save
$PM2 startup systemd -y 2>&1 | tail -4 || true
$PM2 save

echo "==== 8. 本机验证 ===="
sleep 2
echo "-- health --"; curl -s -m8 http://127.0.0.1:3000/api/health; echo
echo "-- humans(走库) --"; curl -s -m8 "http://127.0.0.1:3000/api/humans?pageSize=1" | head -c 180; echo
echo "-- 火山LLM在服务器是否可用(直连服务层,绕HTTP鉴权) --"
node -e "require('dotenv').config();const v=require('./services/volc');v.generateBlessingCopy({scene:'开业',toName:'李总',style:'大气'}).then(t=>console.log('LLM_OK:',t.slice(0,80))).catch(e=>console.log('LLM_FAIL:',e.message));"
echo "-- pm2 list --"; $PM2 list
echo "==== DONE ===="
