#!/bin/bash
# V12.4 支付骨架上线状态【只读】核查（不写、不重启、不改任何文件）
cd /opt/jjsr
PM2=/usr/lib/node_modules/pm2/bin/pm2
echo '===== [1] PM2 jjsr 状态 ====='
$PM2 describe jjsr 2>/dev/null | grep -Ei '^\s*(status|restarts|uptime|created|script path|exec cwd|version)' | head -10
echo
echo '===== [2] /api/health（本机3000 + Nginx80）====='
echo -n 'local3000: '; curl -s -m8 http://127.0.0.1:3000/api/health; echo
echo -n 'nginx80 : '; curl -s -m8 http://127.0.0.1/api/health; echo
echo
echo '===== [3] payments 表是否已建 / 列 / 表总数 ====='
node -e '
const db=require("./db");
const t=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=? AND name=?").get("table","payments");
const total=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=?").get("table");
console.log("payments_table_exists=",t.c," total_tables=",total.c);
if(t.c){const cols=db.prepare("PRAGMA table_info(payments)").all();console.log("payments_col_count=",cols.length);console.log("payments_cols=",cols.map(c=>c.name).join(","));
const idx=db.prepare("SELECT name FROM sqlite_master WHERE type=? AND tbl_name=?").all("index","payments").map(i=>i.name);console.log("payments_indexes=",idx.join(","));
const n=db.prepare("SELECT COUNT(*) c FROM payments").get().c;console.log("payments_rows=",n);}
const old=db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type=? AND name=?").get("table","payment_transactions");
console.log("legacy_payment_transactions_exists=",old.c,"(旧占位链路表必须仍在)");
'
echo
echo '===== [4] 新支付路由鉴权：无 token 必须 401 ====='
echo -n 'POST /api/pay/alipay/create(no token) http='
curl -s -m8 -o /tmp/_ro_b1 -w '%{http_code}' -X POST http://127.0.0.1:3000/api/pay/alipay/create -H 'Content-Type: application/json' -d '{}'; echo " body=$(cat /tmp/_ro_b1)"
echo -n 'GET  /api/pay/status/NOPE(no token) http='
curl -s -m8 -o /tmp/_ro_b2 -w '%{http_code}' http://127.0.0.1:3000/api/pay/status/NOPE; echo " body=$(cat /tmp/_ro_b2)"
echo
echo '===== [5] 无真实密钥：notify 必须降级为 fail（不是 500/崩溃）====='
echo -n 'POST /api/pay/alipay/notify http='
curl -s -m8 -o /tmp/_ro_b3 -w '%{http_code}' -X POST http://127.0.0.1:3000/api/pay/alipay/notify -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=1'; echo " body=[$(cat /tmp/_ro_b3)]"
node -e 'const a=require("./services/alipay");console.log("alipay.status=",JSON.stringify(a.status()));console.log("isConfigured=",a.isConfigured());'
echo
echo '===== [6] alipay-sdk 安装情况 + better-sqlite3 完好 ====='
node -e 'try{console.log("alipay-sdk=",require("alipay-sdk/package.json").version)}catch(e){console.log("alipay-sdk MISSING:",e.message)}'
node -e 'const D=require("better-sqlite3");const d=new D(":memory:");console.log("better-sqlite3 ok",d.prepare("select 1 x").get().x);d.close()'
echo
echo '===== [7] 8 个上线文件指纹（md5/字节）====='
for f in services/alipay.js routes/pay.js app.js db.js package.json package-lock.json scripts/verify_pay_skeleton.js scripts/gen_alipay_rsa_keypair.js; do
  if [ -f "$f" ]; then echo "$(md5sum "$f" | awk '{print $1}')  $f  $(stat -c%s "$f")B"; else echo "MISSING $f"; fi
done
echo
echo '===== [8] .env 支付键状态（只显示键与值长度，不回显值）====='
node -e '
const fs=require("fs");const t=fs.readFileSync("/opt/jjsr/.env","utf8");
const keys=["ALIPAY_ENABLED","ALIPAY_APP_ID","ALIPAY_PID","ALIPAY_PRIVATE_KEY","ALIPAY_PUBLIC_KEY","ALIPAY_GATEWAY","ALIPAY_NOTIFY_URL","ALIPAY_APP_CERT_PATH","ALIPAY_DIRECT_ENABLED"];
for(const k of keys){const m=t.match(new RegExp("^"+k+"=(.*)$","m"));console.log(k, m?("len="+m[1].length):"(缺)");}
const c=(t.match(/^[A-Za-z_][A-Za-z0-9_]*=/gm)||[]).length;console.log("env_total_keys=",c);
'
echo
echo '===== [9] 旧 payment 占位链路仍挂载（与新 /api/pay 并存）====='
echo -n 'POST /api/payment/pay(no token) http='
curl -s -m8 -o /tmp/_ro_b4 -w '%{http_code}' -X POST http://127.0.0.1:3000/api/payment/pay -H 'Content-Type: application/json' -d '{}'; echo " body=$(cat /tmp/_ro_b4)"
grep -n "api/pa" app.js
echo
echo '===== [10] PM2 错误日志（重启后有无新增）====='
ls -la /root/.pm2/logs/jjsr-error.log 2>/dev/null
echo '--- error.log 末 12 行 ---'
tail -n 12 /root/.pm2/logs/jjsr-error.log 2>/dev/null || echo '(无错误日志)'
echo '--- out.log 启动行末 6 行 ---'
tail -n 6 /root/.pm2/logs/jjsr-out.log 2>/dev/null
echo
echo '===== [11] V12.4 备份目录 ====='
ls -dt /opt/jjsr/backups/backup_pay_* 2>/dev/null | head -5
echo '===== READONLY CHECK DONE ====='
rm -f /tmp/_ro_b1 /tmp/_ro_b2 /tmp/_ro_b3 /tmp/_ro_b4
