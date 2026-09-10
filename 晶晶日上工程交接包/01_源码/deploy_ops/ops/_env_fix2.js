// 安全补全 .env（第二次）：显式 ALLOW_ANON_AI=false / SMS_DEV_CODE 留空；先备份，仅缺失时追加，不回显值
const fs = require('fs');
const ENV = '/opt/jjsr/.env';
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bak = `/opt/jjsr/backup_v123_${ts}_env2`;
fs.mkdirSync(bak, { recursive: true });
fs.copyFileSync(ENV, bak + '/.env');
let txt = fs.readFileSync(ENV, 'utf8');
const add = [
  '# V12.3 运维补全：AI 生成接口强制登录（线上严禁 true，仅本地联调可临时放行）',
  'ALLOW_ANON_AI=false',
  '# 演示兜底固定验证码：生产强制失效，线上保持留空',
  'SMS_DEV_CODE=',
];
let changed = false;
if (!/^ALLOW_ANON_AI=/m.test(txt)) { if (!txt.endsWith('\n')) txt += '\n'; txt += add.join('\n') + '\n'; changed = true; }
fs.writeFileSync(ENV, txt);
console.log('backup at ' + bak + '/.env ; changed=' + changed);
console.log('has ALLOW_ANON_AI=' + /^ALLOW_ANON_AI=/m.test(txt) + ' has SMS_DEV_CODE=' + /^SMS_DEV_CODE=/m.test(txt));
