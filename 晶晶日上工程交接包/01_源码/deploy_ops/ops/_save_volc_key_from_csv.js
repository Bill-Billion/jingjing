// 一次性：从火山 IAM 导出的 用户信息.csv 提取子用户凭证 -> 写入本机 secrets（不打印明文），并把源 CSV 移入 secrets 留存。
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('CSV_NOT_FOUND', src); process.exit(2); }
let raw = fs.readFileSync(src, 'utf8').replace(/^﻿/, '');

const akM = raw.match(/AKLT[A-Za-z0-9]+/);
// SK：在 “Secret Access Key” 标注附近的 token；否则取非 AKLT 的长 base64 串
let sk = null;
const skM = raw.match(/Secret\s*Access\s*Key[^\r\nA-Za-z0-9+\/=_-]*([A-Za-z0-9+\/=_-]{24,})/i);
if (skM) sk = skM[1];
if (!sk) {
  const cands = raw.split(/[,\r\n\t，:：\s"]+/).filter(t => /^[A-Za-z0-9+\/=_-]{30,}$/.test(t) && !t.startsWith('AKLT'));
  if (cands.length === 1) sk = cands[0];
  else { console.error('SK_AMBIGUOUS count=', cands.length, cands.map(c=>c.length)); process.exit(3); }
}
if (!akM) { console.error('AK_NOT_FOUND'); process.exit(4); }
const ak = akM[0];
const mask = s => s.slice(0,4)+'****'+s.slice(-4);

const dir = path.join(__dirname, '..', '..', 'server', 'server', 'secrets', 'volc');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', '..', 'server', 'server', 'secrets', '.gitignore'), '*\n');
const envBody =
  '# 火山引擎合规专用子用户 jjsr-compliance（CVFullAccess + BusinessSecurityFullAccess）\n' +
  '# 仅本机/服务器 .env 使用，禁止入库、禁止聊天回显。\n' +
  'VOLC_COMPLIANCE_ACCESS_KEY_ID=' + ak + '\n' +
  'VOLC_COMPLIANCE_SECRET_ACCESS_KEY=' + sk + '\n';
const outEnv = path.join(dir, 'compliance.env');
fs.writeFileSync(outEnv, envBody, { mode: 0o600 });
// 源 CSV 移入 secrets 留存（同盘移动）
const destCsv = path.join(dir, 'source_user_info.csv');
try { fs.copyFileSync(src, destCsv); fs.unlinkSync(src); } catch (e) { console.error('MOVE_CSV_WARN', e.message); }

console.log('SAVED', outEnv);
console.log('AK', mask(ak), 'len', ak.length);
console.log('SK', mask(sk), 'len', sk.length);
console.log('sourceCsvMoved', fs.existsSync(destCsv));
