const fs = require('fs');
const p = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\项目档案\27_百分冲刺验收标准_体检评分_追分路线图.md`;
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
console.log('lines=' + lines.length);
lines.forEach((l, i) => { if (/^#{2,4}\s/.test(l)) console.log((i + 1) + ': ' + l.slice(0, 70)); });
console.log('=== TAIL 12 ===');
console.log(lines.slice(-12).join('\n'));
