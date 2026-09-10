#!/bin/bash
# 幂等地为线上 .env 追加 V12.4 支付宝 APP 支付骨架占位（开关保持 false，不写真实密钥）
set -e
cat > /tmp/_env_apply_pay.js <<'NODE'
const fs = require('fs');
const file = process.argv[2] || '/opt/jjsr/.env';
let t = fs.readFileSync(file, 'utf8');
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
fs.writeFileSync(file + '.bak_pay_' + ts, t); // 备份
// 1) 旧直付通占位的 NOTIFY 改指向新骨架回调（旧链路 ALIPAY_DIRECT_ENABLED=false，不使用该值）
t = t.replace(/^ALIPAY_NOTIFY_URL=.*$/m, 'ALIPAY_NOTIFY_URL=http://8.222.213.43/api/pay/alipay/notify');
// 2) 追加 V12.4 占位块（幂等）
if (!/V12\.4/.test(t)) {
  if (!t.endsWith('\n')) t += '\n';
  t += `
# ===== 支付宝 APP 支付骨架 V12.4（services/alipay.js + routes/pay.js；密钥一到填这里，ENABLED=true 后 pm2 restart jjsr）=====
ALIPAY_ENABLED=false
ALIPAY_APP_ID=
ALIPAY_PID=
ALIPAY_PRIVATE_KEY=
# ALIPAY_PRIVATE_KEY_PATH=./certs/app_private_pkcs8.pem
ALIPAY_PUBLIC_KEY=
# ALIPAY_PUBLIC_KEY_PATH=./certs/alipay_public.pem
ALIPAY_APP_CERT_PATH=
ALIPAY_ALIPAY_CERT_PATH=
ALIPAY_ROOT_CERT_PATH=
ALIPAY_GATEWAY=sandbox
`;
}
fs.writeFileSync(file, t, 'utf8');
console.log('--- ALIPAY lines after patch ---');
console.log(t.split('\n').filter((l) => /ALIPAY/.test(l)).join('\n'));
NODE
node /tmp/_env_apply_pay.js /opt/jjsr/.env
rm -f /tmp/_env_apply_pay.js
echo '== DONE ENV =='
