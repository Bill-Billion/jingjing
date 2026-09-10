// 第75轮出包：版本三处一致升到 12.3.1+21
const fs = require('fs');
const base = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/';
const pv = base + 'pubspec.yaml';
let p = fs.readFileSync(pv, 'utf8');
if (p.split('version: 12.3.0+20').length - 1 !== 1) { console.error('pubspec anchor fail'); process.exit(2); }
p = p.replace('version: 12.3.0+20', 'version: 12.3.1+21');
fs.writeFileSync(pv, p);

const av = base + 'lib/utils/app_version.dart';
let a = fs.readFileSync(av, 'utf8');
if (a.split("kAppVersionName = '12.3.0'").length - 1 !== 1) { console.error('av anchor fail'); process.exit(2); }
a = a.replace("kAppVersionName = '12.3.0'", "kAppVersionName = '12.3.1'")
     .replace('version: 12.3.0+N', 'version: 12.3.1+N');
fs.writeFileSync(av, a);
console.log('[OK] 版本三处 -> 12.3.1+21');
