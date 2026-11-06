# Mac mini 前端恢复与人工视频交付记录

2026-11-02；执行负责人：Bill-Billion。用户已授权修改、测试并更新原 PR39。本机适用检查均通过，准备集中提交原PR39；远端提交及自动检查回执另记，尚未合入或部署。

## 本次用户可以验证什么

网页第二页身份刷新后仍可继续原业务；身份权限变化时清除旧私有内容；开票遇到断网或回复丢失，刷新后先查询原操作，避免新建重复请求；普通登录失效保留原业务返回地址。人工视频入口进入人工定制表单，并按每笔规格/订单的版本显示付款及制作限制。本机已用同一合成订单走通客户提交、运营受理、报价、脚本改版重确认、逐版验收和尾款后私有下载。

本次采用后端负责人 chengcongcong222 已交付的恢复接口和付款规则，未修改后端业务实现或数据库迁移。前端任务已实际认领：[原 PR39 回执](https://github.com/Bill-Billion/jingjing/pull/39#issuecomment-6569376802)。不把认领、代码、自测、另一方审阅、合入和上线合成一个完成状态。

## 版本、范围与运行环境

- 原调查基准为 `8df249b59d3c83cdd8ca9aee0db08068b546d296`；[原报告](../mac-mini-pr39-20261102/REPORT.md)及两张原始图片、失败证据完整保留，属于此前时点。
- 本批整合 `c9dc13c` 的恢复接口、`d9a8e45253c5dee3eae7ac4f75baedef14e87cfa` 的版本化付款，以及推送前发现的 `ce7a9b061be9464dcbe1528786c7c9981ebad995` 工作日/切换保护。当前接口 `0.31.16-rc.1`、迁移 `0192`。本次前端首个本地提交为 `dbb4a050973a13bc854220f64eaf3069668c5f62`；通过普通合并保留双方提交，未强制推送。PR39 仍 OPEN 草稿，目标 integration。
- 实施分支 `core/full-business-closure-20261028`，隔离目录 `/Users/yanghaoran/Documents/Codex/2026-11-02/task/jingjing-investigation/repo`。原 `/Users/yanghaoran/Code/jingjing` 的已有代码及交接不覆盖。
- 本机补齐固定 Flutter 3.47.5/Dart 3.13.4、隔离 MySQL 8.4.11（127.0.0.1:33316）和完整 ffmpeg。Node 24.15；远端 CI 按仓库固定 Node 22.19。工具目录不入库，未修改登录 shell 的 PATH。
- 仅合成账号/资料和临时数据库；短信、支付回执、制作上传及独立审核按各测试说明模拟。未调用真实支付、短信、付费生成或生产数据库。浏览器脚本已验证清理临时库和会话。

## 四项恢复修复及回归

|事项|复现前提与操作|修复后的预期/实际|实现与证据|
|---|---|---|---|
|第二页身份丢失|同账号超过20个主体，选择第二页主体后刷新|仍为原主体；通过 `/me/parties/{id}` 读取当前成员关系；断网不悄悄改选首项，明确403/404清除无权身份|Web `src/stores/session.ts`；App `lib/account/account_session.dart`；[实际浏览器](evidence/recovery-browser.json)第3项及状态测试|
|同身份权限失效缓存|读取合同/成员等私有内容，变更成员角色、能力或主体状态，再让旧响应返回|权限指纹变化推进上下文版本；旧缓存立即失效，迟到响应不能恢复旧内容；未挂载的开票原请求也失效|Web session/useServiceContext/WorkspaceView；App AccountSession；`tools/test-session-recovery.mjs`、`test/account/session_recovery_test.dart`|
|开票未知结果刷新|场景A：真实POST已落库，故意断开回复；场景B：POST未抵达服务端。刷新页面|A只GET原幂等键查询并进入唯一申请，数据库仍1条；B保留原正文/幂等键，查询NOT_RECORDED后仅由明确重试发送。双击不多发；PROCESSING不重放；403清私有内容；存储失败不发送新写入|`src/api/pendingWrites.ts`、`useServiceContext.ts`、`InvoicesView.vue`；[数据库/浏览器证据](evidence/recovery-browser.json)前2项；App `lib/support/invoices.dart` 查询回执后再决定是否重试|
|401原业务返回|在具体申请页面使当前测试会话失效并刷新|清除登录及可见私有内容，登录地址保存合法原业务路由；已有换号专用返回继续保留|Web `src/App.vue` 和 session；浏览器第5项；状态测试验证同账号重新认证后原请求/原身份恢复|

开票恢复保存在当前浏览器标签页的 sessionStorage，不包含 bearer token、验证码或文件字节。显式退出清除，其他账号不能恢复，权限快照不一致拒绝恢复。服务器仍对每次操作重新授权。额外回归覆盖损坏的恢复缓存经过账号重读：修复前错误清理会允许新POST，修复后保留无法判定的状态并阻止新提交，须先核对原记录或显式退出；[失败日志](evidence/storage-recovery-before.log)和最终网页测试均保留。App 本轮覆盖进程内待确认操作、身份/权限失效、迟到响应及回执查询；没有新增跨 App 进程重启的敏感草稿持久化，不能将网页刷新恢复说成原生 App 重启恢复已验收。

额外发现并修复：工作台只监听所选主体ID，权限版本更新会取消旧成员响应却留下加载标志，导致“刷新成员”卡住。本次原有浏览器第11组真实复现，已改为同时监听权限版本，清理请求和加载状态；同身份权限重核保留412/403错误说明。失败日志：[原成员加载失败](evidence/workspace-members-before.log)。最终第11组含成员移除、迟到响应、412/403/429、手机窄屏和401检查。

## 旧列表、新详情不一致的专项结论

这个情况不能排除：客户端在权限变更前后拿到不同时点响应，或分页/缓存仍保留旧能力时会出现。保留了专门的不一致夹具：列表持续返回 OWNER 旧权限，按ID详情持续返回 MEMBER/READ_PARTY 新权限。

修复前 App 在等待中请求计数从61继续到91，实际触发反复刷新，见[失败日志](evidence/app-inconsistent-before.log)。修复后身份页面仅在登录/主体范围变化时自动全量刷新；同ID权限变化清私有内容但不循环重启加载；完整刷新始终用按ID最新关系替换列表对应项。测试断言刷新次数有界、新降权保持、旧读不回写，22项专项通过，且纳入770项CI范围回归。[修复后日志](evidence/app-inconsistent-after.log)。没有只统一 fixture 就宣称关闭问题。

## 人工视频和新付款接法

App `/ai-create` 现在进入 `CustomizationPage(createNew: true, initialCategory: blessing_manual)`，读已发布人工祝福模板；草稿仅本人可见，正式提交后运营受理。后端关闭旧客户直接生成写入口的实现来自此前同事提交；本轮不启用真实昆山API。

网页报价按所选已发布规格区分新旧版本；新规格使用首款30%、当前脚本确认后40%、成片验收后30%，精确到分并处理余数；旧规格继续原30/60/10和原触发节点，不混合两种付款版本。客户付款和履约页面读取服务器已冻结的金额/合同，不自行把旧单改成新比例。用券后展示服务端实付分期；全额券付的REWARD_FUNDED零现金订单可按原验收条件下载，App新增回归覆盖这一边界。

实际浏览器同单验证（[结果及同单ID](evidence/manual-video-browser.json)）：

1. 客户填写人工祝福需求；未提交草稿运营读取404；正式提交后运营受理同一故事。
2. 运营可见旧规格说明，切换新规格创建30.00/40.00/30.01元报价；客户确认同一故事的100.01元订单。
3. 记录首款后开工；中款前实际付款门槛拒绝；客户确认脚本，脚本改版再次使原确认失效；重确认后仍须中款收齐，样片选项才开放。
4. 客户逐版确认样片、粗剪；最终成片明确收讫后显示服务器计算的5工作日截止。客户提文件问题即暂停并清旧收讫，独立处理后制作人在实际页面重发，客户重新查看/读取通知/收讫，生成新交付编号及完整新期限。随后验收成片；尾款前下载禁用，尾款后实际取得私有文件，履约为DELIVERED。
5. 原旧订单合同、账目和30/60/10分期不变；上述客户浏览器没有直接视频生成请求。

页面操作和API/MySQL为真实本机实现；支付回执、生产者上传和独立审阅使用仓库夹具。这不是所有角色均手工操作的验收，也不是原生 App/MySQL 同单验收。取消独立审核及券后分期由后端聚合和已有页面专项覆盖；未把本轮无券现金同单测试说成已完成券/取消整链。

## 追加整合：5工作日、明确收讫与暂停重发

读取并核对后端 `ce7a9b0` 的合并交接后，本批双端允许新订单 `acceptance_hours: null`、5工作日和冻结的北京时间日历；旧5字段/小时约定继续保持。网页新规格表单要求明确日历版本、依据、覆盖期、节假日和调休日，缺失或无效不能提交；不自动把候选日历当已发布规格。新增合同版本、覆盖期和计时不匹配错误提示。

非最终阶段用 `notified_at` 判断已收讫，显示“须明确确认成果，不自动倒计时”；不再因 `started_at` 为空反复显示收讫按钮。最终阶段仅显示服务器截止，不在客户端自行计算5工作日。争议解决后后端清空旧receipt，原网页重发入口跟着消失：已修为受派制作人在制作中可按当前未验收版本重新交付。专项单测和上述真实浏览器链均覆盖receipt为空的重发情况，见[重发后页面](evidence/05-reissued-working-days.png)。

工作日计算、争议暂停、新报价/审批保护的后端实现属于chengcongcong222。本批只接页面与接口、补前端入口和同版联调。正式发布候选规格、停用旧规格及实际网站启用保护尚未执行；默认兼容模式仍允许旧规格，页面按订单/规格版本显示，不能声称全站新单已切换。

## 本机验证回执

|范围|结果|证据/边界|
|---|---|---|
|App固定CI范围|静态分析无问题；770项通过；Flutter网页构建通过|[测试日志](evidence/app-final-tests.log)、[分析](evidence/app-final-analyze.log)、[构建](evidence/app-final-build.log)。并非原生设备安装验收|
|Web全部模块|最终497项通过，类型检查和构建通过|[最终日志](evidence/web-calendar-all-final.log)，包含16项新增恢复测试；大chunk构建警告不影响成功|
|新浏览器同版专项|恢复/开票5项、人工视频5项通过|上述两个JSON、页面截图。独立核准使用不同合成账号，录入者无核准动作|
|后端聚合|整体1095项：1094通过、0失败、1跳过；38个聚合命令通过|[摘要](evidence/backend-summary.json)。唯一跳过为缺脱敏旧SQLite样本；媒体水印已用完整ffmpeg实际测试|
|接口约定|静态172份样例及151份负例通过；37组实际HTTP回复文件全部通过格式核验|[37组摘要](evidence/runtime-contract-summary.json)、[运行记录](evidence/runtime-calendar.log)。合计3453份实际回复（含新增切换保护14份）；格式核验不能替代权限/事务验收|
|协作/整体验收登记工具|协作检查、全业务登记检查、19项工具单测、6项App动作回执测试通过|[组合版本记录](evidence/root-calendar.log)和[原工具回归](evidence/root-final.log)。登记工具通过不代表151条业务通过|
|原有网页浏览器分组|11、短信、14、15、17、16、18、19、20依项目命令复验|全部通过，其中14–20共106项；19/20为重新打包产物。组合版本结果见[分组日志](evidence/browser-calendar.log)及browser-groups-calendar目录；先前失败与补跑日志仍保留|

早期额外执行未筛选的 `flutter test` 时，历史截图测试 `v15_obsidian_shots_test.dart` 的“15 选剧样片库”因 sqflite databaseFactory 未初始化失败。该截图测试不在仓库CI规定命令内，未修改其业务代码；本轮没有用旧基线对照证明该问题早已存在，也没有声称未筛选全目录测试通过。

后端三个测试入口只补显式 `--test-reporter=tap`，使Node24也输出聚合工具期望的TAP，未改变断言、数量或业务逻辑。

## 未完成事项、分工和提交边界

- chengcongcong222已交付5工作日计算/争议暂停及新报价/审批切换保护，本批前端已接入并同版联调。正式规格发布、旧规格停用、实际启用保护，以及现货实名和人工认证仍由后端负责人推进；不能说所有新订单已切换。
- Bill-Billion已交付此范围前端自测候选；共享权限/付款边界的另一方实际审阅仍PENDING，PR保持草稿。本轮不合并、不部署，不更新甲方网站。
- 151条标准和12条完整业务未全量验收；原生App同单、完整券/取消人工视频链及甲方试用仍待对应阶段执行。
- 真正外部短信/支付/视频、昆山API、OSS购买及正式启用沿原约定处理；本轮不以模拟成功代替上线条件。
- 当前可重复运行的隔离脚本：`scripts/pr39-recovery-browser-check.mjs`、`scripts/pr39-manual-video-browser-check.mjs`。都要求本机测试数据库配置文件，输出到`.local`并清理临时数据；不要改成生产连接。

最终提交、准确远端SHA和CI终态将作为交付补记附于本报告及PR39，不引用此前旧提交绿色状态。合并前的浏览器JSON中 `head` 是运行时本地HEAD（dbb4a05），其工作目录还包含ce7a9b0及前端兼容改动；受测树须同时核对源码SHA256，不能把该字段误读为dbb4a05单独通过新版测试。

代码清单：[受测源码SHA256](SOURCE_SHA256SUMS.txt)。它包含本批前端、测试、工作流、测试入口以及整合的新后端/契约变更，不把基础HEAD当作未提交修改的精确版本。原失败与修复后日志分别保留；媒体第16组首次默认ffmpeg启动失败已配置正确工具后补跑通过。

入库日志仅替换本机绝对路径并去除行尾空白；完整原始输出保存在本机调查工作目录，断言和结果未删改。

## 主要代码定位

- 身份恢复与权限指纹：`frontend_ops_workspace/src/stores/session.ts`（authority、loadParties、refreshSelected）。
- 开票刷新与原请求恢复：`src/api/pendingWrites.ts`、`src/composables/useServiceContext.ts`（restoreWrite/inspect）、`src/views/InvoicesView.vue`（enableRecovery）。
- 401原路返回：`frontend_ops_workspace/src/App.vue`；工作台成员失效恢复：`src/views/WorkspaceView.vue`。
- App有界身份刷新：`frontend_jingjingshangri_app/lib/account/account_session.dart`和`account_page.dart`；失败/成功回归：`test/account/account_widgets_test.dart`及`session_recovery_test.dart`。
- 双端新付款和验收：网页`src/api/modules/customizationDelivery.ts`、`TradeSpecForm.vue`、`TradeRecordPanel.vue`、`DeliveryView.vue`；App `lib/trade/trade_models.dart`及`lib/production/fulfillment_models.dart`、`fulfillment_pages.dart`、`production_pages.dart`。

上述两个前端目录均位于仓库`晶晶日上工程交接包/01_源码/`下。浏览器分组全量截图仍保存在本机隔离工作树`.local/calendar-browser-*`，报告内保存逐项结果与检查日志；本轮关键恢复/人工视频截图已随报告归档。
