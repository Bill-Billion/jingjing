#!/bin/bash
# 只读探测：上线前确认线上现状（不做任何修改）
echo '== whoami =='; whoami
echo '== node =='; node -v
echo '== pm2 =='; /usr/lib/node_modules/pm2/bin/pm2 list 2>/dev/null | grep -Ei 'jjsr|name|online|errored|stopped'
echo '== health(local) =='; curl -s -m8 http://127.0.0.1:3000/api/health; echo
echo '== health(public via nginx) =='; curl -s -m8 http://127.0.0.1/api/health; echo
echo '== /opt/jjsr top =='; ls /opt/jjsr | tr '\n' ' '; echo
echo '== alipay-sdk online? =='; if [ -f /opt/jjsr/node_modules/alipay-sdk/package.json ]; then echo HAS_ALIPAY_SDK $(node -e "console.log(require('/opt/jjsr/node_modules/alipay-sdk/package.json').version)"); else echo NO_ALIPAY_SDK; fi
echo '== payments table online? =='; cd /opt/jjsr && node -e 'const db=require("./db");const r=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=? AND name=?").get("table","payments");console.log("payments_table",r.c);const t=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=?").get("table");console.log("table_total",t.c);' 2>&1 | tail -4
echo '== mem =='; free -m | head -2
echo '== disk =='; df -h / | tail -1
echo '== listen =='; ss -tlnp 2>/dev/null | grep -E ':80 |:3000 |:443 ' | tr '\n' ';'; echo
echo '== existing pay route mounted? =='; grep -n "api/pay" /opt/jjsr/app.js || echo NO_PAY_ROUTE
echo '== DONE =='
