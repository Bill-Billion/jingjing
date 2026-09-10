// 一次性：从系统剪贴板读取火山子用户(jjsr-compliance)凭证，写入本机 secrets，绝不打印明文。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function clip() {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard', '-Raw'], { encoding: 'utf8' });
  } catch (e) {
    try { return execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], { encoding: 'utf8' }); }
    catch (e2) { return ''; }
  }
}

const raw = clip() || '';
const akM = raw.match(/Access\s*Key\s*ID\s*[：:]\s*([A-Za-z0-9]+)/i);
const skM = raw.match(/Secret\s*Access\s*Key\s*[：:]\s*\**\s*([A-Za-z0-9+\/=_-]{16,})/i);
if (!akM || !skM) {
  console.error('PARSE_FAIL ak=', !!akM, 'sk=', !!skM, 'clipLen=', raw.length);
  process.exit(2);
}
const ak = akM[1].trim();
const sk = skM[1].trim();
if (!ak.startsWith('AKLT')) { console.error('AK_FORMAT_BAD', ak.slice(0,4)); process.exit(3); }
if (sk.length < 24) { console.error('SK_TOO_SHORT', sk.length); process.exit(4); }

const mask = s => s.slice(0,4) + '****' + s.slice(-4);
const dir = path.join(__dirname, '..', '..', 'server', 'server', 'secrets', 'volc');
fs.mkdirSync(dir, { recursive: true });
// 保证 secrets 不进仓库
fs.writeFileSync(path.join(__dirname, '..', '..', 'server', 'server', 'secrets', '.gitignore'), '*\n', { flag: 'w' });

const envBody =
  '# 火山引擎合规专用子用户 jjsr-compliance（CVFullAccess + BusinessSecurityFullAccess）\n' +
  '# 仅本机/服务器 .env 使用，禁止入库、禁止聊天回显。生成于 IAM 创建页。\n' +
  'VOLC_COMPLIANCE_ACCESS_KEY_ID=' + ak + '\n' +
  'VOLC_COMPLIANCE_SECRET_ACCESS_KEY=' + sk + '\n';
const f = path.join(dir, 'compliance.env');
fs.writeFileSync(f, envBody, { mode: 0o600 });

console.log('SAVED', f);
console.log('AK', mask(ak), 'len', ak.length);
console.log('SK', mask(sk), 'len', sk.length);
console.log('bytes', fs.statSync(f).size);
