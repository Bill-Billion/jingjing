const fs = require('fs');
const app = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app`;
const arc = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\项目档案`;

function insAt(file, anchor, add) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('WorkBuddy 即')) { console.log('SKIP ' + file); return; }
  if (!s.includes(anchor)) { console.error('MISS anchor @' + file); process.exit(2); }
  s = s.replace(anchor, anchor + (s.includes('\r\n') ? '\r\n' : '\n') + add);
  fs.writeFileSync(file, s, 'utf8');
  console.log('OK ' + file + ' bytes=' + fs.statSync(file).size);
}

// 1) 协议只读说明头（不动用户原文正文）
insAt(
  app + '\\docs\\WORKBUDDY_EXECUTION_PROTOCOL.md',
  '原档另存于 new-chat-3/总纲_用户上传.md。',
  '>\n> **命名澄清（用户 2026-09-06 指定）**：本文件正文中的 “WorkBuddy” 即当前实际执行开发的 AI 代理（豆包开发助手）本身，不是需要另行安装或对接的第三方工具；凡“WorkBuddy 应……”一律读作“我（执行 AI）应……”，本协议即我自身的开发治理章程。除本说明头外，用户原文逐字保留、不改写。'
);

// 2) 执行态顶部
insAt(
  app + '\\docs\\CURRENT_EXECUTION_STATE.md',
  '> 长历史归档到项目档案',
  '> 命名：总纲正文里的 WorkBuddy 即当前执行 AI（我），非外部工具（用户 2026-09-06 澄清），本协议就是我自己的开发治理章程。'
);

// 3) 28 档案头部
insAt(
  arc + '\\28_活跃上下文_ACTIVE.md',
  '> 用途：超长接力防 context rot。',
  '> 命名约定：总纲中的 WorkBuddy = 当前执行 AI（我），不是第三方工具（用户 2026-09-06 指定）。'
);
