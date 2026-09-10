const fs = require('fs');
const p = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app\.gitignore`;
let s = fs.readFileSync(p, 'utf8');
const block = [
  '',
  '# === Gate0 baseline additions (2026-09-06) ===',
  '# Dart/Flutter analysis server cache (regenerable, never commit)',
  '.dartserver/',
  '# Private signing material / secrets (never commit; access-restricted)',
  '.flpriv',
  '*.jks',
  '*.keystore',
  '*.key',
  '.env',
  '.env.*',
  '# Root-level historical scratch scripts/logs from past sessions (canonical copies live in work/deploy)',
  '/_*.cjs',
  '/_*.txt',
  '/_*.bat',
].join('\n');
if (!s.includes('Gate0 baseline additions')) {
  s = s.replace(/\s*$/, '') + '\n' + block + '\n';
  fs.writeFileSync(p, s, 'utf8');
  console.log('.gitignore updated, bytes=' + fs.statSync(p).size);
} else console.log('.gitignore already updated');
