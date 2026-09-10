// 第76轮：6 个页面的 CachedNetworkImage -> AppNetworkImage（自适应限解码），并补 import
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/';
const files = [
  'pages/ai_studio/ai_task_page.dart',
  'pages/ai_studio/my_works_page.dart',
  'pages/humans/humans_page.dart',
  'pages/human_detail/human_detail_page.dart',
  'pages/profile/profile_page.dart',
  'pages/sample_library/sample_library_page.dart',
];
const cniImport = "import 'package:cached_network_image/cached_network_image.dart';";
const addImport = "import '../../widgets/app_network_image.dart';";
for (const rel of files) {
  const f = root + rel;
  let s = fs.readFileSync(f, 'utf8');
  const impN = s.split(cniImport).length - 1;
  if (impN !== 1) { console.error('[ABORT] import 锚点', rel, impN); process.exit(2); }
  if (s.includes(addImport)) { console.error('[ABORT] 已存在 app_network_image import', rel); process.exit(2); }
  const useN = s.split('CachedNetworkImage(').length - 1;
  if (useN < 1) { console.error('[ABORT] 无 CachedNetworkImage( 使用', rel); process.exit(2); }
  s = s.replace(cniImport, cniImport + '\r\n' + addImport);
  s = s.split('CachedNetworkImage(').join('AppNetworkImage(');
  fs.writeFileSync(f, s, 'utf8');
  console.log('[OK]', rel, '替换 x' + useN);
}
console.log('=== done');
