#!/bin/bash
cd /opt/jjsr
echo '===== server API smoke (58) ====='
node ops/smoke_api.js 2>&1 | tail -6
echo '===== pay skeleton (33) ====='
node scripts/verify_pay_skeleton.js 2>&1 | tail -4
echo '===== pay joint offline (33) ====='
node scripts/pay_sandbox_joint_test.js 2>&1 | tail -4
echo '===== payments residue ====='
node -e 'const db=require("better-sqlite3")("/opt/jjsr/data/jjsr.db");console.log("payments rows=",db.prepare("select count(*) c from payments").get().c)' 2>&1 | tail -2
