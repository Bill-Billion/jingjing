const fs = require('fs');
const dir = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/项目档案/';
const f = fs.readdirSync(dir).find(x => /^27_/.test(x));
const p = dir + f;
let s = fs.readFileSync(p, 'utf8');
const oldStart = '④全站再扫一遍是否还有绕过 Money 的内联金额格式化（grep toStringAsFixed 金额上下文）；';
const newLine = '④【下轮主题·金额展示 SSOT 二轮批量收口，第45轮已 grep 定位精确清单，纯展示统一、数值/逻辑零改，统一改 Money.rmbInt/rmb】orders_page.dart:285（与本轮 role_market 同款内联 toStringAsFixed 取整、订单金额缺千分位，最优先）、sample_order_detail_page.dart:116/119（定制剧总价¥5000/意向金¥99/制作款¥4901 缺千分位）、human_detail_page.dart:421/539（¥$price、立即录制¥..起）、humans_page.dart:471（艺人卡¥..起）、mcn_page.dart:126/127/130/244（MCN 收益/待提现，金额可能上万、缺千分位，MCN 仅 H5）、wallet_page.dart:60/123/266（_money 自定义两位小数、待结算/冻结/流水，评估统一 Money.rmb 保留两位）、usage_report_page.dart:114/217（“元”后缀收入）；非金额勿动：project_detail:106 百分比、review:164 评分、motion_fx:167 通用 CountUpText；glow_panel:94 固定文案 ¥99/¥4901 属说明性硬编码（理想引 Pricing 常量，谨慎单独评估，不在批量范围）；改完配一个金额千分位统一 widget 测试组锁不回退；';
if (!s.includes(oldStart)) { console.error('[FAIL] old backlog④ not found'); process.exit(1); }
const before = s;
s = s.replace(oldStart, newLine);
if (s === before) { console.error('[FAIL] no replace'); process.exit(1); }
fs.writeFileSync(p, s, 'utf8');
console.log('[OK] backlog④ 已固化金额二轮收口清单，行数', s.split(/\r?\n/).length, 'CRLF', s.includes('\r\n'));
