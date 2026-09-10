// 一次性：把 samples.js 剩余 8 处裸 JSON.parse 精确替换为 safeParse，保留 CRLF 与中文
const fs = require('fs');
const path = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/routes/samples.js';
let src = fs.readFileSync(path, 'utf8');
const isCRLF = src.includes('\r\n');
const reps = [
  ['item.characters ? JSON.parse(item.characters) : []', 'safeParse(item.characters, [])', 1],
  ['item.tags ? JSON.parse(item.tags) : []', 'safeParse(item.tags, [])', 1],
  ['item.market_data ? JSON.parse(item.market_data) : {}', 'safeParse(item.market_data, {})', 1],
  ['ref.characters ? JSON.parse(ref.characters) : []', 'safeParse(ref.characters, [])', 2],
  ['order.script_characters ? JSON.parse(order.script_characters) : []', 'safeParse(order.script_characters, [])', 1],
  ['order.script_feedback ? JSON.parse(order.script_feedback) : []', 'safeParse(order.script_feedback, [])', 2],
];
let ok = true;
for (const [from, to, expect] of reps) {
  const parts = src.split(from);
  const cnt = parts.length - 1;
  if (cnt !== expect) { console.error(`[FAIL] 期望 ${expect} 处，实际 ${cnt} 处: ${from}`); ok = false; continue; }
  src = parts.join(to);
  console.log(`[OK] 替换 ${cnt} 处 -> ${to}`);
}
if (!ok) { console.error('存在未匹配项，未写回。'); process.exit(1); }
fs.writeFileSync(path, src, 'utf8');
// 写回后统计剩余 JSON.parse（应只剩 safeParse 内部 1 处）
const left = (src.match(/JSON\.parse/g) || []).length;
const safeCnt = (src.match(/safeParse\(/g) || []).length;
console.log('CRLF =', isCRLF, '| 剩余 JSON.parse =', left, '| safeParse( 调用数 =', safeCnt);
if (left !== 1) { console.error('剩余 JSON.parse 不是 1 处，异常！'); process.exit(2); }
console.log('DONE');
