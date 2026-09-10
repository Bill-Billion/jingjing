const fs = require('fs');
const path = require('path');
const base = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app\lib\pages`;
const files = {
  home: 'home/home_page.dart',
  projects: 'projects/projects_page.dart',
  messages: 'messages/messages_page.dart',
  profile: 'profile/profile_page.dart',
};
const pats = [
  ['initState', /void\s+initState/g],
  ['postFrame->_load', /addPostFrameCallback/g],
  ['_loading=true', /_loading\s*=\s*true/g],
  ['ApiService()', /ApiService\(\)/g],
  ['api call', /\._?api\.\w+\(|await\s+\w+Api\.|api\.(get|post|list|fetch)\w*/g],
  ['KeepAlive', /AutomaticKeepAlive/g],
  ['IndexedStack', /IndexedStack/g],
  ['Provider状态提升', /Provider\.of|context\.watch|context\.read|ChangeNotifierProvider/g],
];
for (const [k, rel] of Object.entries(files)) {
  const p = path.join(base, rel);
  const s = fs.readFileSync(p, 'utf8');
  const lines = s.split(/\r?\n/);
  console.log('\n===== ' + k + ' (' + lines.length + ' lines) =====');
  for (const [name, re] of pats) {
    const hits = [];
    lines.forEach((l, i) => { if (re.test(l)) hits.push(i + 1); re.lastIndex = 0; });
    console.log(`  ${name.padEnd(16)} ${hits.length ? 'lines ' + hits.join(',') : '—'}`);
  }
}
