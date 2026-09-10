// 一次性：APP 后端地址默认指向阿里云公网 + 放宽超时 + 设置页快捷地址/版本号（幂等）
const fs = require('fs');

function patch(file, reps) {
  let t = fs.readFileSync(file, 'utf8');
  for (const [a, b] of reps) {
    if (t.includes(b)) { console.log('already:', b.slice(0, 48)); continue; }
    if (!t.includes(a)) { console.log('NOT FOUND[' + file.split(/[\\/]/).pop() + ']:', a.slice(0, 48)); continue; }
    t = t.replace(a, b); console.log('replaced ->', b.slice(0, 48));
  }
  fs.writeFileSync(file, t, 'utf8');
}

const base = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/';
patch(base + 'services/api_service.dart', [
  ["static const String publicUrl = 'http://8.222.213.43:3000';",
   "static const String publicUrl = 'http://8.222.213.43'; // 阿里云公网，经Nginx(80)"],
  ["static const String defaultUrl = lanUrl;",
   "static const String defaultUrl = publicUrl; // 默认连云端，任意网络可用"],
  ["connectTimeout: const Duration(seconds: 6),",
   "connectTimeout: const Duration(seconds: 8),"],
  ["receiveTimeout: const Duration(seconds: 12),",
   "receiveTimeout: const Duration(seconds: 60), // AI(LLM+TTS)生成耗时较长"],
]);

patch(base + 'pages/profile/settings_page.dart', [
  ["_quickUrlChip(ctx, '公网', 'https://jjsr8x2k9m2026.loca.lt', controller)",
   "_quickUrlChip(ctx, '公网', 'http://8.222.213.43', controller)"],
  ["hintText: 'https://jjsr8x2k9m2026.loca.lt',",
   "hintText: 'http://8.222.213.43',"],
  ["trailing: const Text('V10.1.0',",
   "trailing: const Text('V11.0.0 云端版',"],
]);

console.log('--- api_service verify ---');
console.log(fs.readFileSync(base + 'services/api_service.dart', 'utf8').split('\n')
  .filter(l => /publicUrl =|defaultUrl =|connectTimeout:|receiveTimeout:/.test(l)).map(s => s.trim()).join('\n'));
