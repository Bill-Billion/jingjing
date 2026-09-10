// 第86轮回写：27 号第5节迭代日志（插到"## 6. B 类"前）+ 15 号施工记录末尾追加。幂等，UTF-8。
const fs = require('fs');
const dir = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\项目档案`;

const entry27 = [
  '- 2026-09-06 第86轮：**五大 vibe-coding 工程技能反向审查落地①–④：反合理化清单入 SOP、三条黄金主链路 E2E、六工程对抗评审门、28 活跃上下文快照（纯工程纪律/测试/文档增强，不改业务逻辑、导航、路由、接口、类名与价格）**。',
  '  - **背景**：用户发来抖音"阿飞"图文《vibe coding 装这几个 skill 就够了》，经内置浏览器取全文核实为 5 个 Claude/Codex 生态 skill（addyosmani 工程纪律/反合理化表、anthropics webapp-testing、gstack 虚拟对抗团队、get-shit-done 上下文工程、grill-me 需求拷问）；本工程为豆包+Flutter/Node，不能 npx 安装，只移植方法论。实测短板=缺真机级 E2E、缺支付前安全对抗评审、超长接力文档分层不足。用户指示按①→④补齐。',
  '  - **动作①（已完成）**：本档第 4 节新增「4.1 反合理化清单」（8 条"想偷懒的借口→固定反驳"表，幂等脚本 work/deploy/patch27_anti_rational.cjs）。',
  '  - **动作②（已完成）**：pubspec dev_dependencies 加 integration_test（在线 `flutter pub get`，引入 flutter_driver/webdriver 3.1.0，.plugin_symlinks 仍 37 个 junction 未破坏）；新增 `integration_test/golden_journeys_test.dart` 三条黄金主链路：J1 买家（协议门登录→底部五槽→切 Tab→艺人广场→数字人详情→祝福视频下单页）、J2 圆梦（项目详情→意向金锁档对话框含联系人姓名/手机号且可取消→项目书圆梦/定制剧严格分版预览）、J3 艺人（创建数字人 6 步护栏顺序不可绕→落盘后"我的数字人"可见）。host 无头命令固定为 `flutter test -d flutter-tester integration_test/golden_journeys_test.dart --no-pub`（直接给 integration_test 目录会去找设备报错），三条合计 18s 全绿。',
  '  - **动作③（已完成）**：只读审查后端支付（routes/pay.js、routes/payment.js、services/alipay.js、paymentService.js、reconciliation.js，不改后端/不连外部控制台/不回显密钥）。确认已具备：金额服务端权威（前端夹带金额只用于比对拒绝篡改）、订单 SQL 归属校验、回调 RSA2 验签+app_id+金额数值比对 fail-closed、applyPaid 事务幂等+唯一索引防并发双击、圆梦席位 changes===1 才累加防双加、trade.query validateSign 主动对账、密钥只从 env 读且日志不回显、四本账守恒对账。新增 **29_关键门工程对抗评审清单.md**（EM/偏执Reviewer/安全官/设计师/QA/Release 六门 + 支付专项），并记录待加固 W1 旧 payment.js 的 GET /status/:txNo 缺归属过滤（低危）、W2 回调 notify_id 去重窗口（纵深）、W3 trade.refund 开放前补幂等/审批、W4 真机沙箱端到端仍属 B3。',
  '  - **动作④（已完成）**：新增 **28_活跃上下文_ACTIVE.md**（一屏快照：坐标命令/版本分数质量门/最近一轮/待办 Top3/硬约束/B 类一行一项），并用 work/deploy/patch_active_context.cjs 把"最先读 28"接进本档 SOP 第 1 步与 00 主索引；00 档案清单顺带补齐 25/26/27/28/29（原仅列到 24）。',
  '  - **E2E 踩坑沉淀（已写入 29 QA 门，避免重复踩）**：IntegrationTestWidgetsFlutterBinding 下禁 pumpAndSettle（LiquidScaffold 无限流光）；交互后用多帧轮询 `_waitFor` 而非单帧；**测试代码绝不能 `await Navigator.push`（其 Future 在路由 pop 才 complete 会永久挂起，J1/J2 卡点均为此），去掉 await 改逐帧 pump 即通**；SnackBar 浮层会挡下一次底部点击，需先推进假时钟退场；长内容控件 tap 前先 ensureVisible；跨页"状态可见"用同一 Provider 重新挂载目标页比 Navigator 转场稳。',
  '  - **质量门**：`dart analyze lib integration_test` = No issues found；离屏全量 **test/ 311 全绿**（build/final_test_dir.log，exit0）+ **integration_test 3 条全绿**（build/e2e_all.log，+3，exit0），合计 **314 测试全绿、0 失败**；三档 360/390/840 = 38/38/38。',
  '  - **分数/版本**：本轮为工程纪律、自动化测试与文档增强，不直接改产品八维表现，总分维持约 **86.1**；版本仍 **12.3.1+21**（仅新增 dev 依赖 integration_test 与测试/档案，未 bump；下一包 +22 未构建，出包须同步三处版本并再全量+aapt/apksigner 核验）。',
  '  - **遗留/backlog**：①A 类继续 A1 旧 Material 控件曜石化清零（settings/audition/humans/custom_request/role_market）、A5/A6 三态与无文字占位、A7 三档回归、A8 随改随补；②内部加固支付 W1（补 /status/:txNo 归属过滤 + 一条后端自验证断言，不动价格/接口契约）；③真机"卡顿"渲染性能修复在 +21 已做，仍待真机复验（结论=待验证，非彻底解决）；④B 类全部仍等外部且定时任务按用户要求保持暂停（enable=false，不自动恢复/不新建），B 类未就绪不宣称 100。',
  '',
].join('\r\n');

const anchor27 = '## 6. B 类：必须等外部/用户/回电脑（只跟踪，不阻塞 A 类）';
const p27 = `${dir}\\27_百分冲刺验收标准_体检评分_追分路线图.md`;
let s27 = fs.readFileSync(p27, 'utf8');
if (s27.includes('第86轮')) {
  console.log('SKIP 27 第86轮 already present');
} else if (!s27.includes(anchor27)) {
  console.error('MISS 27 anchor'); process.exit(2);
} else {
  s27 = s27.replace(anchor27, entry27 + '\r\n' + anchor27);
  fs.writeFileSync(p27, s27, 'utf8');
  console.log('OK 27 appended, bytes=' + fs.statSync(p27).size);
}

const entry15 = [
  '',
  '---',
  '',
  '## 2026-09-06 第86轮 · 五大 vibe-coding 工程技能审查落地（动作①–④）',
  '',
  '- **动作①** 27 号档案第 4 节新增「4.1 反合理化清单」（借口→反驳表，patch27_anti_rational.cjs，幂等）。',
  '- **动作②** 新增 integration_test/golden_journeys_test.dart 三条黄金主链路 E2E（J1 买家登录→五槽→切 Tab→艺人→详情→下单；J2 意向金锁档+项目书两版严格分版；J3 创建数字人 6 步护栏→落盘可见）；pubspec 加 dev 依赖 integration_test（在线 pub get，plugin_symlinks 仍 37）；host 无头 `-d flutter-tester` 三条 18s 全绿。',
  '- **动作③** 只读审查后端支付链路（pay/payment/alipay/paymentService/reconciliation），金额服务端权威、归属校验、RSA2 验签、事务幂等、防双加、四本账守恒均在；新增 29_关键门工程对抗评审清单.md（六角色门+支付专项，W1–W4 待加固记录在案）。',
  '- **动作④** 新增 28_活跃上下文_ACTIVE.md 一屏快照，接入 27 号 SOP 第 1 步与 00 主索引（00 清单补齐 25–29）。',
  '- **质量门**：analyze lib+integration_test=0；test/ 311 全绿 + integration_test 3 条全绿 = 合计 314；三档 38/38/38。',
  '- **版本/分数**：维持 12.3.1+21（未 bump，下一包 +22），总分约 86.1（工程纪律增强不直接加产品分）。',
  '- **关键经验**：集成测试内禁止 `await Navigator.push`（等 pop 才 complete→永久挂起），改逐帧 pump；禁 pumpAndSettle（无限流光）；SnackBar 挡按钮需先退场；长控件 ensureVisible。',
  '- **调度**：百分冲刺定时任务仍按用户 2026-09-05 指示暂停（enable=false），本轮为用户在线指令驱动，不恢复/不新建定时任务；B 类只跟踪不硬推。',
  '',
].join('\r\n');

const p15 = `${dir}\\15_V12.3功能闭环施工记录与阶段交付.md`;
let s15 = fs.readFileSync(p15, 'utf8');
if (s15.includes('第86轮 · 五大 vibe-coding')) {
  console.log('SKIP 15 already present');
} else {
  s15 = s15.replace(/\s*$/, '') + '\r\n' + entry15;
  fs.writeFileSync(p15, s15, 'utf8');
  console.log('OK 15 appended, bytes=' + fs.statSync(p15).size);
}
