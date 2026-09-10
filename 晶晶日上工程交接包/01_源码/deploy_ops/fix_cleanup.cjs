// 清理：login 的 BuildContext 异步守卫 + onboarding 未使用 import（幂等）
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/';

// 1) login_page：await 后补 mounted 守卫
const lp = root + 'pages/login/login_page.dart';
let l = fs.readFileSync(lp, 'utf8');
const a = "      final d = await _api.loginWithPhone(phone, code);\n      final u = d['user'];";
const b = "      final d = await _api.loginWithPhone(phone, code);\n      if (!mounted) return;\n      final u = d['user'];";
if (l.includes(b)) console.log('login guard already');
else if (l.includes(a)) { l = l.replace(a, b); console.log('login guard added'); }
else console.log('login pattern NOT FOUND');
fs.writeFileSync(lp, l, 'utf8');

// 2) onboarding 删除 3 个未使用 import
const op = root + 'pages/onboarding/onboarding_page.dart';
let o = fs.readFileSync(op, 'utf8');
for (const rel of ['services/api_service.dart', 'services/app_mode.dart', 'widgets/main_scaffold.dart']) {
  const re = new RegExp("import '\\.\\./\\.\\./" + rel.replace(/\//g, '\\/') + "';\\r?\\n");
  if (re.test(o)) { o = o.replace(re, ''); console.log('removed import', rel); }
  else console.log('import not found/already removed', rel);
}
fs.writeFileSync(op, o, 'utf8');
console.log('--- onboarding imports now ---');
console.log(o.split('\n').filter(x => x.trim().startsWith('import')).join('\n'));
