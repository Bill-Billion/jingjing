const fs = require('fs');
const root = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\项目档案`;
const mark = '第87轮（2026-09-06）';

const r27 = [
  '',
  '### ' + mark + '·开发模式切换：百分冲刺 → Gate 驱动（依据用户《开发纠偏总纲》）',
  '- 停止分数/自评分驱动（历史 86.1 仅存档）；总纲原样落地为工程内只读协议 docs/WORKBUDDY_EXECUTION_PROTOCOL.md，并维护精简执行态 docs/CURRENT_EXECUTION_STATE.md。',
  '- Gate0（真机性能事实）静态审计确认 C 类结构根因：R1 main_scaffold 用 AnimatedSwitcher 非 IndexedStack，切 Tab 即 dispose，四主 Tab 均无 KeepAlive；R2 业务数据只在页面局部 State（messages/projects/profile 同构），无会话缓存/请求去重；R3 单一 _loading 每次清空回 Skeleton，未做六态与 SWR；R4 无统一 Repository 层。',
  '- 新增 lib/utils/perf_trace.dart（release no-op）+ Dio 拦截器统一 request_start/end/error 与 main_scaffold/messages 时间线埋点；新增 lib/services/resource_cache.dart（会话 TTL + stale-while-revalidate + 同 key 在途去重 + 后台失败保旧值，尚未接页面）及 test/services/resource_cache_test.dart 8 条单测。',
  '- 工程首次 git init（分支 main），.gitignore 增补排除 .dartserver/.flpriv/密钥/根目录临时件；两笔提交 c8f9b18 基线、efeae8b 零件，tag gate0-baseline，tracked 304，0 私钥/缓存。',
  '- 质量门：analyze lib/integration_test/test = No issues；test/ 319 全绿（311+8）；三条黄金链路 E2E 全绿；版本仍 12.3.1+21，未 bump、未出新包。',
  '- Gate0 状态 PARTIAL：UI/Raster 帧耗时、二次切回耗时、视频 TTFF 与根因贡献排序必须真机 Profile/Release 测量（WAITING_EXTERNAL）；未拿到时间线前不提前改主框架、不宣称卡顿已修。',
  '',
].join('\r\n');

const r15 = [
  '',
  '## ' + mark + ' 模式切换与 Gate0 准备',
  '- 按用户总纲停止百分冲刺，转 Gate0 真机性能优先；协议与执行态见工程 docs/ 下两份文件。',
  '- 静态锁定"切 Tab 反复 Loading/像没缓存"的代码级根因（AnimatedSwitcher 卸载 + 页面局部态无缓存 + 每次回骨架）；真机渲染/媒体占比待 Profile。',
  '- 落地测量仪器 PerfTrace（release 零开销，时间线已在网络层与消息样板路径生效）与修复零件 ResourceCache（8 单测全绿，未接页面）；建立 Git 基线 gate0-baseline。',
  '- analyze 0、test/ 319 全绿、E2E 3 条全绿；12.3.1+21 未出包；下一步唯一卡点=真机一次 profile/录屏。',
  '',
].join('\r\n');

function append(file, text) {
  const p = root + '\\' + file;
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes(mark)) { console.log('SKIP ' + file); return; }
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.replace(/\s*$/, '') + eol + text;
  fs.writeFileSync(p, s, 'utf8');
  console.log('APPENDED ' + file + ' bytes=' + fs.statSync(p).size);
}
append('27_百分冲刺验收标准_体检评分_追分路线图.md', r27);
append('15_V12.3功能闭环施工记录与阶段交付.md', r15);
