// 第76轮：删除6个页面里已不再直接使用的 cached_network_image import（改由 AppNetworkImage 内部引用）
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
for (const rel of files) {
  const f = root + rel;
  let s = fs.readFileSync(f, 'utf8');
  const n = s.split(cniImport).length - 1;
  if (n !== 1) { console.error('[ABORT]', rel, n); process.exit(2); }
  // 删除该行及其行尾换行
  s = s.replace(cniImport + '\r\n', '').replace(cniImport + '\n', '');
  fs.writeFileSync(f, s, 'utf8');
  console.log('[OK] 移除冗余 import', rel);
}
