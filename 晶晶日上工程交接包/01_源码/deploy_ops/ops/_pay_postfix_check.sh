#!/bin/bash
cd /opt/jjsr
node -e 'const db=require("./db");console.log("payments_rows=",db.prepare("SELECT COUNT(*) c FROM payments").get().c,"tables=",db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=?").get("table").c);'
echo '== error log =='
ls -la /root/.pm2/logs/jjsr-error.log
echo '== health.log tail =='
tail -n 3 /opt/jjsr/ops/health.log
echo '== md5 current =='
md5sum services/alipay.js routes/pay.js scripts/pay_sandbox_joint_test.js
echo DONE_POSTFIX
