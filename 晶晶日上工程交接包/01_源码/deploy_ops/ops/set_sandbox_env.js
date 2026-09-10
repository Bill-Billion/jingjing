// 幂等把 /opt/jjsr/.env 切到支付宝【沙箱】：先备份，再更新/追加键，内联密钥置空强制走 PEM 文件
const fs = require('fs');
const envPath = '/opt/jjsr/.env';
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bak = `/opt/jjsr/backups/.env.before_sandbox_${ts}`;
fs.mkdirSync('/opt/jjsr/backups', { recursive: true });
fs.copyFileSync(envPath, bak);

const sets = {
  ALIPAY_ENABLED: 'true',
  ALIPAY_GATEWAY: 'sandbox',
  ALIPAY_APP_ID: '9021000167659394',
  ALIPAY_PID: '2088721110933212',
  ALIPAY_PRIVATE_KEY_PATH: '/opt/jjsr/secrets/alipay/sandbox/sandbox_app_private_key.pem',
  ALIPAY_PUBLIC_KEY_PATH: '/opt/jjsr/secrets/alipay/sandbox/sandbox_alipay_public_key.pem',
  ALIPAY_NOTIFY_URL: 'http://8.222.213.43/api/pay/alipay/notify',
  ALIPAY_PRIVATE_KEY: '', // 内联置空，避免覆盖文件路径优先级
  ALIPAY_PUBLIC_KEY: '',
};
let txt = fs.readFileSync(envPath, 'utf8');
const nl = txt.includes('\r\n') ? '\r\n' : '\n';
const lines = txt.split(/\r?\n/);
const seen = new Set();
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^([A-Z0-9_]+)=/);
  if (m && Object.prototype.hasOwnProperty.call(sets, m[1])) {
    lines[i] = m[1] + '=' + sets[m[1]];
    seen.add(m[1]);
  }
}
for (const [k, v] of Object.entries(sets)) if (!seen.has(k)) lines.push(k + '=' + v);
fs.writeFileSync(envPath, lines.join(nl));
console.log('backup=' + bak);
console.log('updated=' + Object.keys(sets).join(','));
