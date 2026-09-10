#!/bin/bash
set -e
cd /opt/jjsr
echo '== node --check =='
for f in app.js db.js routes/pay.js services/alipay.js; do node --check "$f" && echo "OK $f"; done
echo '== assembly + idempotent payments table =='
node -e '
const db=require("./db");
require("./db"); // 二次加载验证幂等
const t=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=? AND name=?").get("table","payments");
const total=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=?").get("table");
console.log("payments_table",t.c,"table_total",total.c);
const cols=db.prepare("PRAGMA table_info(payments)").all().map(c=>c.name).join(",");
console.log("payments_cols",cols);
const alipay=require("./services/alipay");
console.log("alipay_status",JSON.stringify(alipay.status()));
const router=require("./routes/pay");
console.log("pay_router",typeof router==="function","testing",!!router._testing);
'
echo '== mount present =='
grep -n "api/pay" app.js
echo '== DONE PREFLIGHT =='
