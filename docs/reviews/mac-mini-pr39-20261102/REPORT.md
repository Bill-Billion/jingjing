# Mac mini 最新 PR 核查与复现报告

日期：2026-11-02。范围：调查、合成数据复现和解决建议；本轮没有修改业务代码、提交、推送、合并或部署。

## 核查结论

截图提到的“切身份及失败恢复”确实存在未覆盖的边界问题。本次在最新 PR 的真实网页代码上确认四项：其中三项经过本机 Chrome 实际页面操作，一项经过真实 Vue/Pinia 状态代码复现。由于截图没有提供原失败页面、操作步骤及版本，不能把这四项直接等同于同事遇到的那一次失败。

|事项|本轮结论|证据范围|
|---|---|---|
|R4：刷新后保留所选身份|有问题：第二页身份刷新后被默默换成首页首个身份|实际网页 + 合成接口；首屏 20 个身份、第二屏 1 个|
|R1：权限变化后清理旧内容|有问题：相同身份停用或详情明确返回 403 后，旧合同缓存仍保留|实际 Vue/Pinia 状态层；尚未做真实数据库撤权整链|
|R3：断网/响应丢失后恢复开票|同页重试正常；刷新后原请求恢复信息丢失，再提交生成新请求键|实际网页 + 合成接口；未证明数据库已重复开票|
|R2：登录失效后返回原业务|有问题：普通 401 跳登录时丢失原页面地址|实际网页；换号确认的特殊恢复另有保护|
|开票操作权限、录入者不得自审|最新代码已补权限字段及服务端职责分离；本次专项未复现失效|网页 34 项专项、后端权限单测通过；真实运营 UI/MySQL 完整链未在本机重跑|
|客户视频生成改人工工单|旧自助生成已封堵；人工需求模板/受理链已存在，完整交付仍待验收|旧接口本机 HTTP 返回 410 且供应商调用为零；人工受理测试源码核对|
|网页检查脚本旧失败|已有精确菜单定位及打包检查修正；最新 HEAD 的远端检查成功|读取当前源码和 GitHub 同 SHA 检查，不能替代本机全业务验收|
|12 条完整业务、151 条标准|不能宣称完成；登记中的 151 条全部为 NOT_RUN|本机运行登记完整性检查；它不执行产品验收|
|新合同付款口径|额外确认一项未实施差距：30/40/30 尚未进入当前付款校验|实际策略函数接受 30/60/10，拒绝 30/40/30|

建议先处理 R4、R1、R3 的身份及恢复边界，再修复 R2 的登录返回；同批补回归，再进入统一资料的完整业务验收。既有个人中心、开票、换号页面不需要重做。

## 版本、环境与证据边界

- 仓库：[Bill-Billion/jingjing PR #39](https://github.com/Bill-Billion/jingjing/pull/39)，仍为 open / draft。
- 受测 HEAD：`8df249b59d3c83cdd8ca9aee0db08068b546d296`，分支 `core/full-business-closure-20261028`。
- PR 基线：`integration/468df28a4159dfb09895827d86bfc817de259cc4`。
- 2026-11-02 03:44:23 UTC 核对 PR/检查；约 03:50 UTC 再查按创建时间倒序的 PR 集合，最新仍为 #39，HEAD 未变。具体原始摘要见 [版本与检查](evidence/version-and-checks.json) 和 [交付前复核](evidence/delivery-version-check.json)。
- 同 HEAD 的 10 个远端检查记录全部 success，包含 push / PR 两轮的 5 类检查，不能当作 10 套不同业务验收。逐个链接已保存在上述 JSON。
- 原目录 `/Users/yanghaoran/Code/jingjing` 保留 main/`eba5daedf71016b5c05661498a89fba57a4b21ed` 和原 `docs/handoffs/`，未将 main 切到 PR。
- 测试源码另拉在 `/Users/yanghaoran/Documents/Codex/2026-11-02/task/jingjing-investigation/repo`。本报告的代码位置均指这份 **8df249b** 源码，不指原目录旧 main。
- 本机使用真实 Vue 页面、独立 Chrome 上下文，所有 `/api/` 请求拦截为合成响应，非本机网络请求阻止；状态层测试直接加载真实 composable/store。没有使用真实账号、短信、付费生成、支付或外部业务写入。
- 本机没有可用 Flutter/Dart 和 MySQL/Docker 测试环境。因此 App 原生流程、数据库持久化效果、真实运营受理→录入→另一人核准整链为本轮未执行。当前远端 CI 成功和仓库历史证据单列，不能写成本机复现。
- 两张附件已通过 Library 在本机落盘并查看实际像素，不只依赖转录。见 `input/`；摘要在 [输入清单](evidence/input-manifest.json)。

路径缩写：`WEB` 为 `晶晶日上工程交接包/01_源码/frontend_ops_workspace`；`BE` 为同层 `backend_server`；`APP` 为同层 `frontend_jingjingshangri_app`。关键源码固定链接见文末。

## R4：第二页所选身份在刷新后被替换

**分类：实际浏览器复现。建议优先级：高。** 用户可能以为仍在机构身份，实际页面已回到个人身份；未观察到自动提交或服务端越权。

前提与步骤：

1. 用合成账号返回 21 个有效身份：第一页 20 个，第二页 1 个，遵循当前接口默认分页大小和 ID 升序游标。
2. 打开开票申请页，点击“读取更多身份”，选择“第二页合成机构”。确认选择控件及持久化选中 ID 已变成该机构。
3. 浏览器刷新，等待账号与第一页身份加载完成。

预期：重新核验之前所选机构并继续使用；若身份失效，明确要求重新选择。实际：选择控件无提示回到第一页第一个个人身份，未请求原机构详情。

证据：[浏览器结果 R4](evidence/browser-reproductions.json)、[刷新前](evidence/identity-second-page-selected.png)、[刷新后](evidence/identity-reset-after-reload.png)。状态层测试也复现了同一根因，其早期夹具缩小了分页条数，最终浏览器夹具使用完整 20+1 分页。

根因：`WEB/src/stores/session.ts:16` 保存了 `selectedId`，但 `loadParties():67–86` 在补查缺失身份前依赖 `selected.value` 对象。刷新后内存 `parties=[]`，该对象为空；即使持久化 ID 存在，也不会进入 `getParty` 分支，随后自动选第一页首项。现有注释只保护已经加载身份后的“刷新列表”，没覆盖完整页面重新启动。

最小修复建议：恢复依据使用持久化 ID；先通过当前会话读取该身份和最新成员关系/权限，再使业务页面 ready。可使用现有按 partyId 查询成员身份的能力，不能拿旧 membership 拼接新权限。网络失败时保留“恢复中/重试”状态，避免自动换办事身份；403/404 后清理并明确重新选择。在恢复期间用户手动选了其他身份，应取消旧恢复。

回归：至少 21 个身份、第二/更后页选择后刷新及直达链接；机构已撤权；详情 403/404/5xx；恢复期间手动切换；浏览器后退；全过程不得隐式 POST。

## R1：同一个身份失权时，旧私有内容没有同步清理

**分类：真实状态代码复现。建议优先级：高。** 本次证明的是当前客户端缓存失效缺口，不是后台接口被越权访问，也未证明跨账号泄漏。

前提与步骤：

1. 加载真实 `useSessionStore` 和 `useContractReader`，使用合成账号与机构，读取一个结构合法的 SEALED 合同快照。
2. 身份列表刷新返回相同 ID，但 `current_status=SUSPENDED`、`allowed_actions=[]`。
3. 独立场景：已有合同快照时，`refreshSelected()` 的身份详情请求返回明确 403。

预期：安全上下文变化应使已读私有内容及在途请求失效。实际：场景 2 中所选状态已停用，但 `revision` 不变，旧合同快照仍保留；场景 3 抛出 403 后仍保留选中身份、旧上下文与快照。

证据：[状态层结果 R1/R1b](evidence/reproductions.json) 和 [诊断脚本](tests/reproduce-web.mjs)。合成停用响应有源码依据：`BE/src/modules/party/repository.js:106–118` 仅过滤成员关系 ACTIVE，返回的 party 状态可以是停用，同时动作按当前状态计算。

根因：`WEB/src/stores/session.ts:49` 只在身份 ID 改变时增加修订号；`:85`、`:91–96` 更新相同 ID 的安全属性时没有通知下游失效，详情 403 也没有统一清理。`useContractReader.ts:16` 监听 token、accountId、partyId、revision，未收到这些变化；其 `canRead` 也不核验当前身份状态。

最小修复建议：由 session 统一比较所选身份的状态、成员状态、角色和有效动作等授权依据，变化时增加上下文修订号，终止旧请求并清理依赖缓存。明确 403/404 时撤销当前身份上下文；网络错误与服务端暂时失败区分处理，不能把暂时断网误判为永久撤权。检查所有业务 composable 共享的上下文签名，不只修改合同页面。

回归：相同 ID 从 ACTIVE→SUSPENDED/CLOSED；OWNER→MEMBER/REVOKED；详情 403/404；列表中身份消失；有私有内容和在途成功/失败响应；网络恢复后重新授权。App 要做等价场景，但本轮未推断 App 必然有同一缺陷。

对照项：普通 A→B→A 切换的旧合同响应已被正确丢弃，本次 C1 通过；现有网页专项也覆盖大量切身份、退出和旧请求晚到情形。因此结论是具体边界有洞，不能泛化成“所有身份切换都坏了”。

## R3：开票结果未知后刷新，会丢失恢复原请求的能力

**分类：实际浏览器复现；重复数据库记录属于尚未证实的后果风险。建议优先级：高。**

前提与步骤：

1. 合成订单可开票余额为 100 元，申请 10 元，填写合成抬头及说明。
2. 拦截 `POST /api/v1/invoices/requests` 并中断响应，模拟客户端无法判定结果；页面出现“恢复原开票请求”。这里没有真实服务端落库。
3. 点击恢复：确认沿用原 Idempotency-Key，作为正常对照。
4. 刷新浏览器（接受离页确认），重新进入申请页；再填相同内容并提交。

预期：恢复后仍能核对原操作，避免把未知结果误当新操作。实际：刷新后恢复按钮和原输入全部丢失；再次提交使用新的 Idempotency-Key。同页恢复沿用旧键，说明当前保护只存在于页面内存生命周期。

证据：[浏览器结果 R3，含三次实际请求键](evidence/browser-reproductions.json)、[刷新前待恢复](evidence/invoice-unknown-before-reload.png)、[刷新后](evidence/invoice-after-reload.png)。

根因：`WEB/src/composables/useServiceContext.ts:9` 把 pending 存为内存函数闭包；`:19–21` 每次新写入产生新键；`:27` 只有 beforeunload 提示，`:29` 卸载后清除。提示不能覆盖确认刷新、浏览器崩溃或系统回收页面。`BE/src/modules/invoices/repository.js:33` 按操作键幂等，`:45` 新键可产生新的申请。若原请求已成功且余额足够，服务器会把新键视为另一笔合法部分申请；此后果本轮未在数据库证明。

最小修复建议：发送前保存可序列化的待确认命令，包括原操作键、方法/路径、请求正文、版本、账号及身份作用域。页面恢复后先核验当前账号/身份并查询原结果，必要时只重试原命令。不能保存函数闭包，也不能持久化验证码等不应留存的材料。对含开票抬头的本地内容采用受控、短期、按会话隔离策略；退出和切账号时不可暴露旧内容。需要跨会话恢复时优先由服务端提供按原操作查询结果的能力。不要简单禁止同订单多次开票，合法部分申请仍需支持。

回归：请求未到服务器和已提交但响应丢失两种故障；同页重试、刷新、崩溃恢复；相同作用域恢复/不同账号隔离；双击；401/412；原结果先读后核对；部分额度合法开票；证明不能产生第二张意外申请。

## R2：普通登录失效后，登录返回落到工作台

**分类：实际浏览器复现 + 状态代码复现。建议优先级：中。**

前提与步骤：进入合成订单的 `/invoices/orders/<UUID>/new`；将额度查询改为 401，点击“重新核对额度”。

预期：清理旧登录后记住可安全恢复的业务路由，新登录并重新核验权限后回到该页，不自动补发业务操作。实际：跳转为 `/login`，query 为空；`loginRedirect(undefined)` 只能回 `/workspace`。本轮浏览器证明跳登录时丢失地址，登录后的落点由实际返回函数验证，没有发送真实验证码或做真实登录。

证据：[浏览器结果 R2](evidence/browser-reproductions.json)、[登录页面截图](evidence/ordinary-401-login.png)、[状态层 R2](evidence/reproductions.json)。

根因：`WEB/src/App.vue:13–19` 的全局失效 watcher 只给 PHONE_CHANGE_CONFIRMATION 保存特殊返回地址，普通场景直接 `/login`。`router/index.ts:92–96` 对“未登录直接访问私有页”会保存原地址，但已登录页遭遇 401 走的是另一条分支。现有 `router/loginRedirect.ts` 白名单可复用。

最小修复建议：对普通会话失效保留经 `loginRedirect` 白名单过滤的当前路由；保留换号确认的特殊恢复。主动退出与会话过期应明确区分。新登录后再次核验身份/记录权限，不自动恢复写请求，不将手机号、令牌或私有正文放入 URL。

回归：开票、合同、交易、故事深链接的普通 401；未知写入结果后登录恢复；外部地址/恶意 query 拒绝；换账号、主动退出、换号确认旧令牌 401；不同身份无权访问时正确拒绝。

## 开票权限与职责分离：接口缺口已补，仍需完整运营页面复验

实际检查：本机运行现有 `tools/test-invoices-phone.mjs`，34 项通过；运行 BE 的 `invoices-policy.test.cjs` 和 `legacy-video-manual.test.cjs`，合计 4 项通过。开票相关策略验证动作缺失时只读、受理角色不自动取得核准权、同一录入人即使有双权限也不能审核自己、独立核准人可操作。

源码依据：`BE/src/modules/invoices/policy.js:23–39` 根据真实动作权限、状态及录入者计算 `allowed_actions`；repository `:10–15`、`:27–32`、`:48`、`:67` 在服务端校验受理/核准及自审。WEB 的 `src/api/modules/invoices.ts` 从服务器 `allowed_actions` 决定按钮，不由菜单或状态猜测授权。缺权限字段的情况按只读处理。

因此截图中“补开票操作权限信息”在此 HEAD 已有实现，不应继续当作未写接口；“用真实运营页面复验受理、录入、独立核准”仍是有效待办。本轮未在本机 MySQL 上用三个角色完整走链，不能把策略单测等同于完整成功。

下一轮最小验证：合成申请人、仅受理员工、独立核准员工；申请→受理→模拟票据录入→本人核准拒绝→独立核准成功；再覆盖只有核准权不能录入、双方都拥有权限但录入人仍不能自审、权限撤回后 POST 被拒、两端界面只显示当前可用动作、412 后重读确认、同键重试不重复核准。

## AI 短视频：已切向人工办理，但完整产品流程尚不能认定完成

截图后两句属于工作流变更诉求，不能作为本轮自动修改授权。最新仓库要求也明确“客户短视频走人工定制工单”。

当前事实：

- 当前 MySQL 服务入口 `BE/src/http/main.js:13` 使用 `createAccountApi`，未挂载历史 `/api/ai`。当前 App `lib/app.dart:393` 的 `/ai-create` 是未开放说明页。搜索到旧 `AiCreatePage` 或生成组件，不足以证明当前用户入口仍调用旧 API。
- 对历史路由 `BE/routes/ai.js:128–131`，客户 `POST /video` 已固定返回 HTTP 410 / `MANUAL_PRODUCTION_REQUIRED`，指向 `/api/v1/customization-requests`。本机实际启动测试用 Express，仅本地 HTTP，以合成登录分别发送 t2v/i2v，请求均返回 410；生成供应商替身调用为零。
- 新增 `BE/src/modules/customization/blessing-template.json` 是人可读需求采集，没有 prompt 字段；`scripts/client-testing/explore-enrich.cjs:22` 可在隔离模拟资料中发布 `blessing_manual`。
- `BE/test/customization.integration.test.cjs:424` 已描述私有草稿→正式提交→后台受理，且受理不自动创建交易、账务或制作记录。这里是测试源码核查及同 SHA CI 支持；本轮未在本机 MySQL 重跑这一段。

与目标的差距：已有封堵和人工收件基础；尚未在本机证明同版 App/网页可以从明显入口提交此模板、补件、报价/签约、模拟付款、人工制作/审核及受控交付。现有 `/ai-create` 提示导向“我的—制作与交付”，没有直接引导“提交短视频需求”，属于待核验的入口体验差距。不能说“后台整条工单已验收”，也不宜将它简化成普通客服反馈工单。

最小后续方案：复用现有私人定制需求/人工制作流程，补清楚的新建入口和需求状态；核验模板发布条件与独立运营权限；人工受理后才建立报价、合同、制作关联；复用原订单及受控交付，客户端不拿供应商密钥、不直接发付费生成。回归提交/补件幂等、切身份、未提交草稿不对运营可见、原 API 仍关闭、无人审核不能交付。无需恢复历史 AI 工作室。

## 截图五步计划的当前证据

|计划项|本轮判断|还需怎样验证|
|---|---|---|
|1. 开票权限、网页脚本、独立核准|权限与脚本修正已进入最新 HEAD；职责分离专项未失效|同版真实运营 UI + 隔离 MySQL 的角色矩阵整链|
|2. 统一资料、12 条主链、切身份/返回/失败恢复、151 条|局部基础已存在，四项边界问题已确认；151 条全部仍登记 NOT_RUN|固定合成资料和受测 SHA，逐条记录步骤、结果及证据；完成 12 主链不能直接把 151 条批量 PASS|
|3. 固定版本、环境/模拟器、备份恢复/回滚、同版安装包、窄屏弱网|本轮未做这些交付验收|绑定 App/网页构建与后端/数据库版本，分别演练恢复、回滚、弱网和跨端流程|
|4. 甲方试用收敛|没有本轮用户试用反馈及签收证据|记录反馈页面、角色、步骤、版本及解决后重测，不代甲方确认|
|5. 真实服务上线|本轮未验证，不能判断已具备上线条件|在业务验收后核实真实供应商配置与实际运行，另行授权上线操作|

12 条主链仍包括现成视频、私人定制、试镜、通告商单、共创、晶钻兑换、抽奖、储值会员、成长冠军、机构经纪、隐私删除、参演发行；开票、换号、消息、反馈、搜索收藏应挂到对应链。个人中心/开票/换号已有页面及专项，不需要推倒重做。本轮没有逐条完成这 12 链，也没有跑全部 151 标准。“7–13 工作日”保留为同事原估计，本报告不将其转成排期承诺。

网页脚本：`scripts/pr14-ui-browser-check.mjs:252` 已用 `.workspace-nav` 和精确链接名限定重复菜单；19/20 组在现有工作流中改为先打包检查。历史失败与打包后通过的说明见最新仓库 `docs/testing/evidence/contract-intake-20261102/README.md`。这些是当前源码及远端同 SHA 检查的证据，不是本次重跑了 14–20 的 MySQL 浏览器整组。

额外需求差距：最新 `docs/requirements/CONTRACT_CHANGES_20261102.md` 明确新定制报价拟改为 30/40/30、脚本确认中款；`BE/src/modules/customization/quote-policy.js:8–10` 仍按累计 90% 计算，因此实际函数接受 30/60/10，拒绝 30/40/30（`CUSTOMIZATION_PAYMENT_PLAN_INVALID`）。见 [策略探针](evidence/payment-rule-probe.json)。需版本化地一起改报价、抵扣、制作/付款门槛、退款及前端说明，历史订单按原快照。新 5 个工作日验收、L1 加人工审核等也在需求记录中待两端核对；本轮未把它们当作已实现或已复现错误。

## 本机实际验证清单

|检查|结果|日志|
|---|---:|---|
|网页开票/换号|34 通过|[日志](evidence/web-invoices-phone.log)|
|网页合同|17 通过|[日志](evidence/web-contracts.log)|
|本人定制|22 通过|[日志](evidence/web-customization-own.log)|
|故事附件|22 通过|[日志](evidence/web-story-attachments.log)|
|消息/反馈等服务|16 通过|[日志](evidence/web-client-services.log)|
|个人中心|16 通过|[日志](evidence/web-personal-center.log)|
|现货媒体|14 通过|[日志](evidence/web-stock-media.log)|
|后端开票策略 + 旧生成入口|4 通过|[日志](evidence/backend-policy-legacy-local.log)|
|新增状态层诊断|R1/R1b/R2/R3/R4 重现；C1 正常|[JSON](evidence/reproductions.json)|
|新增真实网页诊断|R2/R3/R4 重现；同页重试键不变；浏览器 errors 为空|[JSON](evidence/browser-reproductions.json)|
|151 条登记完整性|登记 PASS，151 NOT_RUN，产品测试未执行|[日志](evidence/acceptance-registry-check.log)|

网页既有专项合计 141 个检查点，不能与 151 条业务标准混用，也不能和远端计数相加。这里的“诊断重现”是脚本成功断言缺陷存在，不是产品通过验收。

环境记录：后端第一次本地 HTTP 测试在受限沙箱不能监听端口，随后获准运行仅本机测试，4 项通过；两次日志均保留。状态层运行包含 Vite/非页面挂载诊断警告，R2/R3/R4 随后由完整浏览器页面再次证实。整理期间 Mac 执行连接曾短暂断开，恢复后继续成功读取，没有留下审批拒绝或不确定的业务写入。

## 建议分工与完成标准

以下是建议，未向同事发送，也未代任何人认领：

- 前端负责人 **Bill-Billion**：优先修复 WEB 的身份恢复/权限修订、未知操作恢复及普通 401 返回；同时在 App 做等价场景核查，确认是否共享缺陷。完成标准为本报告四个负例被回归覆盖、现有专项不回退，且完成页面层重测。
- 后端负责人 **chengcongcong222**：补隔离 MySQL 的撤权、原请求已提交但响应丢失、独立开票核准、人工短视频收件到交付验证；按需要提供安全的原操作结果查询。新付款规则另按版本完成前后端一致实施，不能只改文案。
- 两端一起：固定同版构建和统一合成资料，按 12 主链及 151 条登记逐项验收；之后再做甲方试用及真实服务准备。

若要对齐同事原来“测失败”的那一次，最少需要补充：具体页面/业务、从什么身份切到什么身份、触发失败的操作，以及浏览器或 App 和版本。这个信息用于匹配原报告，不影响上述已完成的复现与修复建议。

## 交接与复验入口

- 阅读报告：本文件。
- 已验证源码：`/Users/yanghaoran/Documents/Codex/2026-11-02/task/jingjing-investigation/repo`。
- 原始执行目录：`/Users/yanghaoran/Documents/Codex/2026-11-02/task/jingjing-investigation`，保留隔离依赖、诊断脚本和全部证据。
- 复验命令及约束：[REPRODUCE.md](REPRODUCE.md)。`tests/` 是诊断脚本快照，依赖位于上述原始执行目录；在交接目录直接执行不会自动找到隔离仓库。
- 既有交接仍在 `/Users/yanghaoran/Code/jingjing/docs/handoffs/mac-mini-pr39-20261030/README.md`，未改写。
- 文件校验清单：`SHA256SUMS.txt`。本报告及交接材料已在本机保存，未修改远端任务/PR状态。

关键源码固定在受测 SHA：

- [会话、身份与分页恢复](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/stores/session.ts#L67)
- [合同缓存失效监听](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/composables/useContractReader.ts#L16)
- [普通会话失效导航](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/App.vue#L13)
- [未知写入结果恢复](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/composables/useServiceContext.ts#L9)
- [开票服务端幂等与职责分离](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/晶晶日上工程交接包/01_源码/backend_server/src/modules/invoices/repository.js#L33)
- [旧客户生成入口封堵](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/晶晶日上工程交接包/01_源码/backend_server/routes/ai.js#L128)
- [最新合同变更记录](https://github.com/Bill-Billion/jingjing/blob/8df249b59d3c83cdd8ca9aee0db08068b546d296/docs/requirements/CONTRACT_CHANGES_20261102.md)
