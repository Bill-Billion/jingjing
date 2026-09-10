#!/bin/bash
echo '===== jjsr-out: sms related (last 40) ====='
grep -iE 'sms|SendSms|RE:|VE:|199133' /root/.pm2/logs/jjsr-out.log 2>/dev/null | tail -40
echo '===== jjsr-error last 20 ====='
tail -20 /root/.pm2/logs/jjsr-error.log 2>/dev/null
echo '===== sms_verification_codes recent ====='
cd /opt/jjsr
node -e 'const db=require("better-sqlite3")(require("./config").dbPath||"./data/jjsr.db");const rows=db.prepare("SELECT id,phone,purpose,provider_msg_id,consumed,datetime(created_at/1000,\"unixepoch\",\"+8 hours\") t FROM sms_verification_codes ORDER BY id DESC LIMIT 8").all();console.log(JSON.stringify(rows,null,2));' 2>&1 | tail -40
