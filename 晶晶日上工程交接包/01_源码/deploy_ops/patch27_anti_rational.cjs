const fs = require('fs');
const p = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/项目档案/27_百分冲刺验收标准_体检评分_追分路线图.md';
let s = fs.readFileSync(p, 'utf8');

const insert = `### 4.1 反合理化清单（借鉴 addyosmani/agent-skills：AI 想跳步时逐条对质，2026-09-06 立）

> 每条"想偷懒的借口"都配一条固定反驳；借口冒头时先按反驳执行，不得自行放水。与第 4 节 SOP 同效。

| 想冒头的借口 | 固定反驳（纪律，不可绕过） |
|---|---|
| "这改动很小，不用跑全量测试" | 升版本号 / 改共享件（theme、widgets、utils、services）后必须 analyze 0 + 全量绿（第 75 轮 bump 漏跑即红） |
| "缩略图看着像重叠 / 像多一个字，直接改" | 先 tester.getRect 实测或裁剪放大取证；证伪前不动业务代码（第 85 轮"叠字"错觉教训） |
| "测试以后再补" | 改到易回退点（防重复、协议不勾、金额 SSOT、定制剧/圆梦分版、空错骨架三态）当轮补契约测试 |
| "弱网失败先显示空态" | 错误态 ≠ 空态：失败必须可重试、不泄漏 DioException 原始信息、不与"真的没数据"混淆 |
| "先写死一个价格 / 颜色 / 文案快一点" | 金额只走 pricing.dart、展示只走 money.dart、色值只走 app_theme.dart；0 硬编码是硬指标 |
| "这个等外部好了再说，先标完成" | B 类未就绪一律标等待项，不计入完成度、不宣称 100 分 |
| "看着没坏就不用三档截图" | 改布局必过 360/390/840；窄屏 overflow、二级页顶部白边都是这样漏出来的 |
| "先复制一份相似逻辑改改" | 优先复用 SSOT 与既有 widget；重复实现会制造两处不一致（金额、版本号都吃过亏） |

`;

const anchor = '## 5. 迭代日志';
if (s.includes('### 4.1 反合理化清单')) {
  console.log('ALREADY_INSERTED');
} else if (!s.includes(anchor)) {
  console.log('ANCHOR_NOT_FOUND'); process.exit(1);
} else {
  s = s.replace(anchor, insert + anchor);
  fs.writeFileSync(p, s, 'utf8');
  console.log('INSERTED_OK bytes=' + Buffer.byteLength(s, 'utf8'));
}
