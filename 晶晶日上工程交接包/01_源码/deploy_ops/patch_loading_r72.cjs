// 第72轮 A5：把 10 个页面手写的“整页居中金圈”统一替换为 LoadingView；补缺失 import。UTF-8 精确补丁。
const fs = require('fs');
const base = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages/';

// 标准单行：const Center(child: CircularProgressIndicator(color: AppTheme.goldMain, strokeWidth: 2.4))
const STD = 'const Center(child: CircularProgressIndicator(color: AppTheme.goldMain, strokeWidth: 2.4))';
const single = [
  'after_sales/after_sales_page.dart',
  'endorsement/endorsement_page.dart',
  'mcn/mcn_page.dart',
  'sample_library/sample_library_page.dart',
  'sample_order_detail/sample_order_detail_page.dart',
  'script_reader/script_reader_page.dart',
  'usage_report/usage_report_page.dart',
  'wallet/wallet_page.dart',
];
function count(s, sub){ return s.split(sub).length - 1; }
for(const rel of single){
  const f = base + rel;
  let s = fs.readFileSync(f, 'utf8');
  const n = count(s, STD);
  if(n !== 1){ console.error('[ABORT] '+rel+' STD 命中 '+n); process.exit(2); }
  s = s.replace(STD, 'const LoadingView()');
  fs.writeFileSync(f, s, 'utf8');
  console.log('[OK] 单行替换', rel);
}

// orders 多行 Center(...)
{
  const f = base + 'orders/orders_page.dart';
  let s = fs.readFileSync(f, 'utf8');
  const re = /const Center\(\s*child: CircularProgressIndicator\(color: AppTheme\.goldMain, strokeWidth: 2\.4\)\)/;
  if(!re.test(s)){ console.error('[ABORT] orders 多行未命中'); process.exit(2); }
  s = s.replace(re, 'const LoadingView()');
  fs.writeFileSync(f, s, 'utf8');
  console.log('[OK] orders 多行替换');
}

// chat:116 无 strokeWidth 的整页 Center；168 行 SizedBox 小圈不动
{
  const f = base + 'chat/chat_page.dart';
  let s = fs.readFileSync(f, 'utf8');
  const target = 'const Center(child: CircularProgressIndicator(color: AppTheme.goldMain))';
  const n = count(s, target);
  if(n !== 1){ console.error('[ABORT] chat 命中 '+n); process.exit(2); }
  s = s.replace(target, 'const LoadingView()');
  fs.writeFileSync(f, s, 'utf8');
  console.log('[OK] chat 整页替换（保留168按钮内小圈）');
}

// endorsement / mcn 补 state_views import（锚定 app_theme import 行，保持相对深度）
for(const rel of ['endorsement/endorsement_page.dart','mcn/mcn_page.dart']){
  const f = base + rel;
  let s = fs.readFileSync(f, 'utf8');
  if(/widgets\/state_views\.dart/.test(s)){ console.log('[skip import]', rel); continue; }
  const anchor = "import '../../theme/app_theme.dart';";
  if(count(s, anchor) !== 1){ console.error('[ABORT import 锚点] '+rel+' '+count(s,anchor)); process.exit(2); }
  s = s.replace(anchor, anchor + "\r\nimport '../../widgets/state_views.dart';");
  fs.writeFileSync(f, s, 'utf8');
  console.log('[OK] 补 import', rel);
}
console.log('=== done');
