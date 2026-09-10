const fs = require('fs');
const p = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/routes/samples.js';
let s = fs.readFileSync(p, 'utf8');
const from = 'heat_score, cover_url FROM sample_library WHERE status=\'active\'';
const to = 'heat_score, cover_url, video_url FROM sample_library WHERE status=\'active\'';
const c = s.split(from).length - 1;
if (c !== 1) { console.error('[FAIL] match=', c); process.exit(1); }
s = s.replace(from, to);
fs.writeFileSync(p, s, 'utf8');
console.log('[OK] samples.js /library SELECT += video_url; CRLF=', s.includes('\r\n'));
