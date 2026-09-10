// 一次性：引导页结束后进入登录页（幂等）
const fs = require('fs');
const p = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages/onboarding/onboarding_page.dart';
let t = fs.readFileSync(p, 'utf8');

// 1) 引入登录页
const imp = "import '../login/login_page.dart';";
if (!t.includes(imp)) {
  t = t.replace("import '../../widgets/main_scaffold.dart';",
    "import '../../widgets/main_scaffold.dart';\n" + imp);
  console.log('login import added');
} else console.log('login import already');

// 2) _finish 改为进入登录页（正则匹配整个方法）
const re = /void _finish\(\) async \{[\s\S]*?\n  \}/;
const neu =
`void _finish() {
    // 统一进入登录页：已登录会自动进主页，也可游客体验
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }`;
if (t.includes('const LoginPage()')) {
  console.log('_finish already -> LoginPage');
} else if (re.test(t)) {
  t = t.replace(re, neu);
  console.log('_finish replaced');
} else {
  console.log('!! _finish pattern NOT FOUND');
}
fs.writeFileSync(p, t, 'utf8');
const m = t.match(/void _finish[\s\S]*?\n  \}/);
console.log('--- verify ---\n' + (m ? m[0] : 'missing'));
