# PM04 制作环境修复与本轮接续（2026-11-23）

当前仍在 **G0 质量收敛及 JT-03 后端环境准备**，尚未进入本轮统一跨端验收。前端按用户最新安排继续在现有 **PR41 / `pm/pm04-acceptance-20261118`** 开发，不另开远端分支；“从 PR43 新开 FE-02 分支”的旧建议不再执行。本侧增量交付在既有 PR43，不改 PR 的目标分支，不操作 main/integration。

## 本轮已解决什么

PR41 `0a668ef38f8b9f5facdd189974387c38701ad369` 的网页作业在 **制作环境准备** 时失败：合成卖家没有成年认证，`POST /supply/avatars` 返回 `409 / VERIFIED_ADULT_REQUIRED`，尚未进入制作页面。后续 8 个网页业务步骤因此跳过，不应记为 8 个已确认功能缺陷。

补丁 `62fa0a3128f4928f76712b61b65eaa45324eff8f` 仅改 `scripts/pr16-ui-test-server.cjs`，新增后端自检入口 `scripts/pm04-production-preflight.cjs`。卖家及后续接单付款的买家通过正常的个人档案、认证 HTTP 接口准备身份；认证渠道使用显式账号白名单的合成 provider，不写 SQL 冒充认证，不放宽运行时规则。

同一卖家在认证前以真实机构 OWNER 身份提交有效素材：409 且零新增；本人认证后用原 key 创建机构形象：200；再次原 key 重放返回同一 ID，机构内总共只新增一条形象。另一未认证 OWNER 使用自己机构和自己有效素材仍返回相同 409，零新增。其他权限、独审、失权、文件、退款、原请求恢复检查保留。

固定上述源码的新隔离运行 **11 组检查通过，进程退出 0，临时数据库/私有状态清理成功**；合成身份 provider 的既有 5 项测试通过。详见 [后端记录与样例](../reviews/pm04-production-20261123/REPORT.md)、[同次机器回执](../reviews/pm04-production-20261123/RESULT.json)。这证明制作测试的后端准备已可完成；制作浏览器流程、8 个后续步骤及 App 三项关键行为仍由前端复验。

## 版本与接收

|项目|本次固定依据|
|---|---|
|后端准备补丁受测源码|`62fa0a3128f4928f76712b61b65eaa45324eff8f`，后续文档提交不冒充运行时受测提交|
|当前已核前端交付|PR41 `0a668ef38f8b9f5facdd189974387c38701ad369`；其后的前端提交另行登记|
|运行时后端目录树|双方均为 `1b3b6b86cec55c8fa1cf0979b8d3b874122f2b2e`，本补丁不修改后端产品代码|
|当前平台契约|`contracts/openapi.yaml`：`0.31.79-rc.1`；不是工程包内旧 `13.0.0-eng` 主链路说明|
|MySQL 迁移|仍到 `0225_production_delivery_views.sql`，225 项；启动器在自己的新隔离库应用迁移，无新增迁移|

在前端自己的 PR41 工作树保留现有改动后，fetch 既有后端分支并接入这一小提交即可；不需要合并整条 PR43 历史，也不新建远端分支：

```text
git fetch origin handoff/pm04-environment-20261119
git show --stat 62fa0a3128f4928f76712b61b65eaa45324eff8f
git cherry-pick 62fa0a3128f4928f76712b61b65eaa45324eff8f
```

接入后记录 PR41 新 SHA。文档可从 PR43 阅读；本侧未替前端执行 cherry-pick、确认已读、修改前端 CURRENT 或提交前端代码。

## 独立电脑启动

前提：Node 22、后端已按锁文件安装依赖、FFmpeg 可执行、自己的仅回环 MySQL 8 测试实例。使用该电脑已有隔离配置；不要复制本侧凭据、过期会话或数据库。Windows 尚未有本地实例时可按 `scripts/local-mysql.cjs` 的说明设置 `LOCAL_MYSQL_HOME`，执行 `node scripts/local-mysql.cjs start`，在本仓库 `.local/mysql/runtime/test-env.json` 生成私有配置；已有实例不要重复启动。CI 专用 `ci-mysql.cjs` 不是本机启动入口。

在仓库根目录 PowerShell 执行（把 FFmpeg 路径换成本机真实位置）：

```powershell
$env:JX_MYSQL_TEST_ENV_FILE = (Resolve-Path '.local/mysql/runtime/test-env.json').Path
$env:JX_TEST_FFMPEG = (Resolve-Path '<本机FFmpeg目录>/bin/ffmpeg.exe').Path
node scripts/pm04-production-preflight.cjs
```

只启动后端，使用 API `127.0.0.1:3282`、受控端口 `3283`。两端口须空闲；已有 `.local/pr16-ui-runtime.json` 时会拒绝覆盖，先按其原启动器正常停止，不直接删除未知环境。成功输出 `PASS / check_groups:11 / cleanup_exit_code:0`；无凭据回执在输出指定的 `.local/pm04-production-preflight-*/result.json`。本机复验会清理临时库，**回执 ID 是证据编号，不能当成仍在线的记录**。

前端接着运行实际管理网页制作检查。按网页锁文件安装依赖及 Playwright Chromium；由现有生命周期脚本同时管理 API、网页和清理：

```powershell
$env:PR16_WEB_URL = 'http://127.0.0.1:5206'
$env:VITE_BACKEND_ORIGIN = 'http://127.0.0.1:3282'
node scripts/run-ui-browser-check.cjs 16
```

本步骤重新创建自己的一批记录；运行中的身份、记录和受控登录资料见本机私有 `.local/pr16-ui-runtime.json`，不要上传该文件。日志在 `.local/browser-check-16/`。**不要同时运行自检和网页启动器**。如果正常认证且选对机构仍被拦，保留请求路由、错误码、account/acting party/记录 ID/原 key 和准确 SHA，交后端定位；不去掉认证校验。

## 角色与记录选择

|角色|认证与办理主体|用途|
|---|---|---|
|seller|本人 `personalPartyId` 下认证；制作/形象操作用机构 `actingPartyId`|机构 OWNER，创建形象、制作、上传及分派；不能自审|
|buyer|本人认证，自己的个人主体|接受报价、付款、确认版本、读取允许的文件|
|producerMember|正常邀请并接受的机构 MEMBER|仅获分派的制作记录；不自动补身份或提升权限|
|reviewer|独立账号，按既有审核授权|独审、拒绝、恢复；不冒充卖方|
|outsider|保持未认证|跨主体拒绝；其自有机构及素材也不能绕过成年认证|

以当前私有状态的 `creation.orderId` 创建制作项目，`creation.producerPartyId` / `merchantPartyId` 应等于卖家机构；`records.avatar.id` 为该机构形象。`scenarios.webReview/webScriptPending/webScript/webSample/webHistory/webFinal/webUnpaid` 为不同网页状态，`appScript/appSample/appDownload/appRefund/appWithdrawn` 为对应 App 样例，`recovery/race` 为恢复和并发准备。**这些独立样例不等于已完成 App/Web 同单验收**；双方交齐后选同一个订单/项目，串接 App、管理网页与独审并记录原 key、版本和回执。

## 前端接下来做什么

先让测试走到关键业务动作，再判定旧测试还是功能缺陷：报价变化后不以旧价下单；切换账号后不残留前账号私有内容；失败/未知后按原 key 查回或重试，不产生第二笔操作。找不到按钮/页面只能说明尚未触达业务断言。本轮不要求先逐条修完所有历史失败，也不能通过删断言、改数字或跳过测试来宣告成功。

制作流程通过后，复跑此前跳过的 **8 个工作流步骤（共 9 个命令）**。命令均来自 `.github/workflows/pr11-frontend-checks.yml`；不要并行运行这些会使用固定端口的生命周期检查，按各步骤切换环境变量：

|步骤|入口及额外配置|
|---|---|
|项目/会签/发行|`node scripts/run-ui-browser-check.cjs 18`；`PR18_WEB_URL=http://127.0.0.1:5207`，`VITE_BACKEND_ORIGIN=http://127.0.0.1:3322`|
|财务/结算/争议|`node scripts/run-ui-browser-check.cjs 19 --built`；`PR19_WEB_URL=http://127.0.0.1:5209`，`VITE_BACKEND_ORIGIN=http://127.0.0.1:3342`；脚本自行先构建新网页产物再检查|
|通知/审计/报表|`node scripts/run-ui-browser-check.cjs 20 --built`；`PR20_WEB_URL=http://127.0.0.1:5211`，`VITE_BACKEND_ORIGIN=http://127.0.0.1:3362`；脚本自行构建|
|开票原请求恢复|`node scripts/pr39-recovery-browser-check.mjs`|
|人工视频客户/运营|`node scripts/pr39-manual-video-browser-check.mjs`|
|现货准入/免费认证|依次 `node scripts/pr39-stock-eligibility-browser-check.mjs`、`node scripts/pr39-artist-contract-browser-check.mjs`|
|人工视频券后分期/退款|设置 `JX_PR39_COUPON_TEST=1` 后 `node scripts/pr39-manual-video-browser-check.mjs`；完毕清除该变量|
|商单分成/原规则|`node scripts/pr39-commercial-contract-browser-check.mjs`|

所有步骤沿用自己本机的 `JX_MYSQL_TEST_ENV_FILE` 与 FFmpeg 配置。新增失败分清“环境未准备好 / 页面未触达 / 真实业务断言失败”，原始日志保留。后端继续修有证据的本侧缺项；前端交齐结果后，双方固定前端 SHA、后端 SHA 和最终组合 SHA，统一构建 App/管理网页、同记录跨角色联测，再交维护者阶段末审阅。App 验收仍须实际 Flutter 构建与设备证据，不能用独立 npm 预览替代。

原 18 组 0/18、12 整链部分、151 条 19/124/8 不变。未合并、未部署，真实收费/生产/公网不开，未成年人后置专项仍必交。用户本轮只需提醒前端接收上述补丁和说明，无需提供口令或真实身份材料。
