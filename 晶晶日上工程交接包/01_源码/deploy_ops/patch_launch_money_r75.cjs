// 第75轮：launch_page 金额统一走 Money.format（千分位、唯一展示入口），替掉 .toInt() 手写“元”
const fs = require('fs');
const f = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages/launch/launch_page.dart';
let s = fs.readFileSync(f, 'utf8');
const reps = [
  ['Pricing.intentDeposit.toInt()', 'Money.format(Pricing.intentDeposit)', 2],
  ['Pricing.extraRevisionFee.toInt()', 'Money.format(Pricing.extraRevisionFee)', 1],
  ['Pricing.productionFee.toInt()', 'Money.format(Pricing.productionFee)', 1],
];
for (const [from, to, expect] of reps) {
  const n = s.split(from).length - 1;
  if (n !== expect) { console.error('[ABORT]', from, '命中', n, '期望', expect); process.exit(2); }
  s = s.split(from).join(to);
  console.log('[OK]', from, '->', to, 'x' + n);
}
fs.writeFileSync(f, s, 'utf8');
console.log('=== done');
