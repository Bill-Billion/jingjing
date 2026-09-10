// 第73轮 SSOT 收口：兜底字面量/说明文案改为引用 Pricing 常量（语义等价、消除写死金额）
const fs = require('fs');
const P = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages/';
function cnt(s,sub){return s.split(sub).length-1;}

// 1) sample_order_detail：三处 ?? 字面量兜底 → Pricing 常量（已 import pricing/money）
{
  const f=P+'sample_order_detail/sample_order_detail_page.dart';
  let s=fs.readFileSync(f,'utf8');
  const reps=[
    ["order['totalPrice'] ?? 5000","order['totalPrice'] ?? Pricing.standardTotal"],
    ["order['intentDeposit'] ?? 99","order['intentDeposit'] ?? Pricing.intentDeposit"],
    ["order['productionFee'] ?? 4901","order['productionFee'] ?? Pricing.productionFee"],
  ];
  for(const [from,to] of reps){
    if(cnt(s,from)!==1){console.error('[ABORT] sod 命中异常: '+from+' x'+cnt(s,from));process.exit(2);}
    s=s.replace(from,to);
  }
  fs.writeFileSync(f,s,'utf8');console.log('[OK] sample_order_detail 3 处兜底改 Pricing');
}

// 2) academy：补 import + 保证金文案插值
{
  const f=P+'talent/academy_page.dart';
  let s=fs.readFileSync(f,'utf8');
  if(!/utils\/pricing\.dart/.test(s)){
    const anchor="import '../../theme/app_theme.dart';";
    if(cnt(s,anchor)!==1){console.error('[ABORT] academy import 锚点');process.exit(2);}
    s=s.replace(anchor,anchor+"\r\nimport '../../utils/pricing.dart';\r\nimport '../../utils/money.dart';");
  }
  const from="'保证金如何计算？首笔收入冻结500元，动态调增'";
  const to="'保证金如何计算？首笔收入冻结${Money.rmbInt(Pricing.artistDeposit)}，动态调增'";
  if(cnt(s,from)!==1){console.error('[ABORT] academy 文案 x'+cnt(s,from));process.exit(2);}
  s=s.replace(from,to);
  fs.writeFileSync(f,s,'utf8');console.log('[OK] academy 保证金改 Pricing.artistDeposit');
}
console.log('=== done');
