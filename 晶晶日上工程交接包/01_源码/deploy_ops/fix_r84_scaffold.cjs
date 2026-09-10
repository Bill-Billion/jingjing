const fs = require('fs');
const p = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/widgets/liquid_scaffold.dart';
let s = fs.readFileSync(p, 'utf8');
const before = s;
// 1) 注释更新（说明 Scaffold 垫统一曜石底色）
s = s.replace(
  '恒被忽略——背景始终透明以露出内部流动光层，避免各页底色不一/死黑。',
  '恒被忽略——body 由不透明 LiquidBackdrop 铺满；Scaffold 自身垫统一曜石蓝黑，只在\n  /// AppBar 后方等 body 未覆盖区可见，避免透明时顶部透出白边/底色不一。'
);
// 2) 内部 Scaffold 底色：透明 -> 曜石蓝黑（body 被不透明流光覆盖，视觉不变）
const target = '    return Scaffold(\n      backgroundColor: Colors.transparent,';
const repl = '    return Scaffold(\n      backgroundColor: AppTheme.background,';
if (!s.includes(target)) { console.error('[FAIL] Scaffold target not found'); process.exit(1); }
s = s.replace(target, repl);
if (s === before) { console.error('[FAIL] no change'); process.exit(1); }
fs.writeFileSync(p, s, 'utf8');
console.log('[OK] liquid_scaffold patched, transparent left:',
  (s.match(/Colors\.transparent/g) || []).length);
