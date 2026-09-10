// 动作④：把 28 ACTIVE 接入 27 号 SOP 第1步 + 00 主索引（补 25~29 行、更新先读列表）。幂等，UTF-8。
const fs = require('fs');
const dir = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\项目档案`;

function patch(file, replacements) {
  const p = `${dir}\\${file}`;
  let s = fs.readFileSync(p, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  let hits = 0;
  for (const [oldStr, newStr, label] of replacements) {
    if (s.includes(label)) { console.log(`SKIP(${label}) already in ${file}`); continue; }
    if (!s.includes(oldStr)) { console.error(`MISS anchor [${label}] in ${file}`); process.exit(2); }
    s = s.replace(oldStr, newStr);
    hits++;
    console.log(`OK(${label}) ${file}`);
  }
  if (hits) fs.writeFileSync(p, s, 'utf8');
  console.log(`${file} done, hits=${hits}, bytes=${fs.statSync(p).size}`);
}

// 1) 27 号 SOP 第 1 步：最先读 28 ACTIVE
patch('27_百分冲刺验收标准_体检评分_追分路线图.md', [
  [
    '1. 先读本档 + 00 主索引 + 21 UI 规范 + 22 功能冻结基线 + 15 施工记录，恢复上下文；',
    '1. 先读 **28_活跃上下文_ACTIVE（一屏快照，最先读）**，再读本档 + 00 主索引 + 21 UI 规范 + 22 功能冻结基线 + 15 施工记录，恢复上下文；',
    '28_活跃上下文_ACTIVE（一屏快照，最先读）',
  ],
]);

// 2) 00 主索引：先读列表 + 档案清单补 25~29
const eol = '\r\n';
const row24 = '| **24_HTTPS域名部署上线记录.md** | **正式域名 www.jingjingrishang.com 证书/Nginx443/回调CORS切HTTPS/前端切域名出包/Node绑回环/收口3000/回滚锚点** | **域名/HTTPS/部署运维时必读** |';
const newRows = [
  row24,
  '| 25_V15.3全APP自审与待办总清单.md | V15.3 全 APP 逐页自审问题与待办总台账 | 回溯自审问题时 |',
  '| 26_V15.4正式签名_合规协议_P3配图_新签名出包记录.md | 正式签名、合规协议、P3 配图、新签名出包指纹 | 出正式包/对签名时 |',
  '| **27_百分冲刺验收标准_体检评分_追分路线图.md** | **8 维百分标准、A1–A8 追分清单、每轮 SOP、4.1 反合理化清单、迭代日志（追分总纲）** | **每轮百分冲刺自检时必读** |',
  '| **28_活跃上下文_ACTIVE.md** | **一屏活跃快照：版本/分数/质量门/待办 Top3/硬约束/B 类状态，超长接力最先读** | **每轮开工第一个读** |',
  '| **29_关键门工程对抗评审清单.md** | **EM/偏执Reviewer/安全官/设计师/QA/Release 六门 + 支付安全专项，合入/出包前必过** | **合入、出包、支付改动时必读** |',
].join(eol);

let idx = fs.readFileSync(`${dir}\\00_主索引_先读我.md`, 'utf8');
const eol0 = idx.includes('\r\n') ? '\r\n' : '\n';
const add = [
  [
    '**必须先读本文件 + 01 + 02 + 06**',
    '**必须先读 28_活跃上下文_ACTIVE + 本文件 + 01 + 02 + 06**',
    '必须先读 28_活跃上下文_ACTIVE',
  ],
  [
    row24.replace(/\r?\n/g, eol0),
    newRows.replace(/\r?\n/g, eol0),
    '29_关键门工程对抗评审清单.md',
  ],
];
let h = 0;
for (const [o, n, label] of add) {
  if (idx.includes(label)) { console.log(`SKIP(${label}) already in 00`); continue; }
  if (!idx.includes(o)) { console.error(`MISS anchor [${label}] in 00`); process.exit(2); }
  idx = idx.replace(o, n); h++; console.log(`OK(${label}) 00`);
}
if (h) fs.writeFileSync(`${dir}\\00_主索引_先读我.md`, idx, 'utf8');
console.log(`00 done hits=${h} bytes=${fs.statSync(`${dir}\\00_主索引_先读我.md`).size}`);
