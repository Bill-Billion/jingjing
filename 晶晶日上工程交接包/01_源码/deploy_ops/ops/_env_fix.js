// 安全补全 .env：先备份，仅当键不存在时追加；不回显任何已有值
const fs = require('fs');
const ENV = '/opt/jjsr/.env';
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bak = `/opt/jjsr/backup_v123_${ts}_env`;
fs.mkdirSync(bak, { recursive: true });
fs.copyFileSync(ENV, bak + '/.env');
let txt = fs.readFileSync(ENV, 'utf8');
const adds = [
  '# V12.3 运维补全：本地上传相对前缀（OSS/CDN 化时改为 https://cdn.xxx.com/uploads）',
  'UPLOAD_URL_PREFIX=/uploads',
];
let changed = false;
if (!/^UPLOAD_URL_PREFIX=/m.test(txt)) {
  if (!txt.endsWith('\n')) txt += '\n';
  txt += adds.join('\n') + '\n';
  changed = true;
}
fs.writeFileSync(ENV, txt);
console.log('backup at ' + bak + '/.env');
console.log('appended UPLOAD_URL_PREFIX: ' + changed);
// 只回显键名与非空状态
const keys = txt.split('\n').filter(l => /^[A-Za-z_]/.test(l)).map(l => l.split('=')[0]);
console.log('total keys=' + keys.length + ', has UPLOAD_URL_PREFIX=' + keys.includes('UPLOAD_URL_PREFIX'));
