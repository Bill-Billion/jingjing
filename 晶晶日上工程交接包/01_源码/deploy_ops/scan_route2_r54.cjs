const fs = require('fs'), path = require('path');
const root = 'lib';
const targets = [
  'pages/ai_studio/ai_create_page.dart','pages/ai_studio/my_works_page.dart',
  'pages/human_detail/human_detail_page.dart','pages/orders/orders_page.dart',
  'pages/profile/profile_page.dart','pages/project_detail/project_detail_page.dart',
  'pages/sample_order_detail/sample_order_detail_page.dart','pages/theater/theater_page.dart',
  'pages/video_lib/video_lib_page.dart'
];
for (const rel of targets) {
  const lines = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/Navigator\.push\(/.test(l) && !/Motion\./.test(l)) {
      console.log('=== ' + rel + ':' + (i + 1));
      for (let k = i; k < Math.min(i + 3, lines.length); k++) console.log('   ' + (k+1) + ' ' + lines[k].trim());
    }
  });
}
