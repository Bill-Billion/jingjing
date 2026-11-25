# PM04 同记录联测环境交接（2026-11-24）

当前是 **G0 收敛与 JT-03 后端交付**。后端已提供可在前端独立电脑复现的环境、角色、保留订单和隐私测试夹具；前端继续原 PR41，先收尾免费认证检查。双方交齐再固定最终联测版本，跑实际 App、管理网页和独立审核，最后维护者审阅。没有合并、部署或阶段验收。

## 1. 固定版本，两个工作目录

|对象|本批准确版本|
|---|---|
|后端环境源码，运行时须检出此提交|`7e35958a6e53de1f33f526de16a0f2be0e5cb60c`|
|后端交付分支|`handoff/pm04-environment-20261119`，既有草稿 PR43；后续文档提交不替代上述受测源码|
|已核前端候选|PR41 / `pm/pm04-acceptance-20261118`，`f77a10fb8ef7ef76942931201c5465db9c212829`；下一次修复后另记新 SHA|
|实际后端产品目录树|双方均为 `1b3b6b86cec55c8fa1cf0979b8d3b874122f2b2e`，本轮没有产品运行时改动|
|平台 API|`contracts/openapi.yaml`：`0.31.79-rc.1`|
|MySQL 迁移|`0225_production_delivery_views.sql`；实际新库应用 225 项，无新增迁移|
|本次实际工具版本|Node `22.19.0`、MySQL `8.4.11`、FFmpeg `9.0.2-essentials_build`|
|本次后端启动器来源摘要|`9e3d89a8b5adf410fd40ed9a4da3e43248af795965ab978e629d67a1c8253688`|

前端自己的 PR41 工作树继续保留全部增量。只需 fetch 后端分支，在旁边建立一个**本地 detached 工作树**运行后端，无须合入整个 PR43，无须新建远端分支：

```powershell
git fetch origin handoff/pm04-environment-20261119
git worktree add --detach ../pm04-backend-20261124 7e35958a6e53de1f33f526de16a0f2be0e5cb60c
Set-Location ../pm04-backend-20261124
git rev-parse HEAD
```

目录已存在时核对其 HEAD，勿覆盖未知工作目录。运行期间保持后端 HEAD 和源码不变；文档从交付分支读取。`access.versions.frontend_reference` 仍是历史 PM03 种子依据 `1d9c0fc4`，**不是当前 PR41 版本**；当前前端以本表及其本人交付回执为准。此时尚无最终联合候选 SHA，不虚填。

## 2. 前端电脑一次启动，保留同一批记录

前提：Node 22、MySQL 8、可执行 FFmpeg。后端目录按锁文件安装依赖：

```powershell
npm ci --prefix '晶晶日上工程交接包/01_源码/backend_server' --no-audit --no-fund
```

已有本机隔离 MySQL 时直接使用自己的私有配置；不要复制别人的凭据。Windows 尚未有实例时，设置 `LOCAL_MYSQL_HOME` 指向已解压的 MySQL 8 目录，再执行 `node scripts/local-mysql.cjs start`。该入口使用回环端口 33316，写入 `.local/mysql/runtime/test-env.json`；已有实例不要重复启动。见 [原本机说明](../collaboration/PM03_LOCAL_ENVIRONMENT_20261115.md)。

终端 A，在固定后端工作树根目录：

```powershell
$env:JX_MYSQL_TEST_ENV_FILE = (Resolve-Path '<本机私有配置目录>/test-env.json').Path
$env:JX_TEST_FFMPEG = (Resolve-Path '<本机FFmpeg目录>/bin/ffmpeg.exe').Path
node scripts/stock-sandbox.cjs --pm03-batch
```

等待 `READY`，保留终端运行。以该次输出的 `access_file`、`base_url`、`expires_at` 为准。只监听 `127.0.0.1`，每次新建独立测试库，8 小时到期；真实短信、实名、支付和公网均不开。此批 47 个角色名对应 45 个合成账号、32 个原业务场景；角色名并不都代表不同账号。

终端 B，同一后端工作树，把下面目录改为本次输出的真实目录，依次执行并核对退出码：

```powershell
$pm04Env = '.local/stock-sandbox/jx_test_stock_pm03_<本次24位标识>'
node scripts/pm03-batch-smoke.cjs $pm04Env
if ($LASTEXITCODE -ne 0) { throw '环境自检失败，保留原日志后反馈' }
node scripts/pm04-joint-handoff.cjs prepare $pm04Env
if ($LASTEXITCODE -ne 0) { throw '同记录准备失败，保留原日志后反馈' }
```

第一项是既有 15 组后端 HTTP 检查；第二项创建**全新、正常独审上架的商品及未付款订单**，留给 App/Web 后续办理，并生成隐私夹具。原 key 在发送前保存；准备中断后可用同一 `prepare` 命令恢复原请求，不换 key 猜重试。准备完成并开始页面办理后使用 `verify`，不要重新准备或重建环境来掩盖中途状态。

**开测时间**：环境 8 小时不等于订单 8 小时。当前现货订单报价的付款窗口仍为 30 分钟，见 `pm04-joint-handoff.json` 的 `order.contract.commitments.quote.expires_at`。请在端已准备好时执行 `prepare` 并及时办理。超时按业务规则处理，不能延长规则或删除原失败记录；下一批重新生成独立环境和新样例，重新登记 ID。

## 3. 角色、凭据和同一笔订单

本机受控资料：`access.json` 有角色的合成登录手机号、账号和主体；真实登录通过 `/auth/sms-challenges`、`/auth/sessions`，模拟验证码只写入本目录 `sms/<challenge_id>.json`。`pm04-joint-private.json` 保存本机六个可用会话及原请求。**这两类凭据、短信、私有夹具不得上传或发到聊天。** 可同步的无凭据摘要是 `pm04-joint-handoff.json`。

|角色名|办理用途|身份选择|
|---|---|---|
|`stock_buyer`|App 买方、付款/售后、本人隐私申请与下载|使用其 `party_id`；本人隐私接口仅账号授权|
|`stock_seller`|管理网页卖方，读取同订单、供给资料|选择其 `party_id`，不能用另一机构代替|
|`stock_reviewer`|上架独审、同订单只读核验、售后许可决定及退款独审|独立账号，审核接口不发送 acting party|
|`stock_outsider`|另一账号读取订单/私有副本的拒绝对照|不是无权限万能账号；仅用于明确的跨账号反例|
|`producer`|隐私案件办理，收集资料、上传并提出回复|使用本人运营权限；不得自审自己的回复|
|`reviewer`|隐私独审，先读实际文件再核准|与 `producer`、申请人不同账号|

业务接口统一 `/api/v1` 前缀，使用本机正常登录的 Bearer。普通业务加 `X-Acting-Party`；本人隐私和运营审核不加。修改取**当前** `object_version` 放入 `If-Match`，发送前保存 `Idempotency-Key`。未知结果沿原记录和原 key 查询/恢复；409 本身不能证明此前未成功。

主单 ID 只认本次 `pm04-joint-handoff.json.order.id`。本侧本轮样例为 `e1c04ed6-0b7a-47c8-b240-bf4db0b011bd`，前端电脑会生成自己的 ID，必须在三端共用同一个。后端已完成下单准备和原 key 重放；**没有声称 App 已完成下单**。本批从该未付款订单继续；不要对同一买方/同一商品再建另一订单。

|顺序|同记录办理与核验|
|---|---|
|1 读取|买方、卖方、独审均以主单 ID 读取 `/trade/records/{order}`；买方 `/stock/purchases/{order}`；异账号拒绝|
|2 付款|买方 `/trade/payments`，`order_id` 为主单、`installment_key=stock`；保存付款 ID 和原 key|
|3 合成渠道结果|仅在该隔离环境通过 `/testing/payments/outcome` 设置本单付款 `record_id`、`state`；先 UNKNOWN，再按需 SUCCEEDED；由买方授权，不由无关账号控制|
|4 核对与交付|`/trade/payments/{payment}/reconciliation`；未确定到账不得下载；到账后 `/stock/purchases/{order}/content` 返回实际合成 MP4，记录字节摘要|
|5 售后独审|买方 `/stock/purchases/{order}/cases`；独审 `/case-resolution` 在该案件明确 `refund_minor` 与 `license_action=KEEP/REVOKE`，自己办理不能自己核准|
|6 退款|`/trade/refunds` 按原 payment/line 建立退款；独审 `/trade/records/{refund}/reviews` 后 `/trade/refunds/{refund}/execution`；设置隔离渠道结果，再按原退款 `/reconciliation`|
|7 终态一致|三端重读同订单、付款、售后、退款与原合同；对照到账/退款/净额、许可和文件权限；原 key 重复核对不产生第二笔钱账|

确切请求结构、权限和版本以 `contracts/openapi.yaml` 与真实响应为准；可对照 [本轮后端请求记录](../reviews/pm04-joint-environment-20261124/MONEY_CHECK.json) 和 [执行源码](../reviews/pm04-joint-environment-20261124/VERIFY_MONEY.cjs)。后端在**另一个检查订单**已验证 100 分到账、40 分退款、KEEP 及原 key 重复核对，共 26 HTTP；这组金额/许可只是合成案件的独审决定，不是全产品默认规则。检查单不能顶替保留主单的 App/Web 验收。

现货交付是已独审成片下载；定制制作/版本/审片等仍按原台账选各自业务记录，不能用现货一单宣布全部履约类型已验。原制作前置补丁已由 PR41 接入，见 [制作交接](PRODUCTION_HANDOFF_20261123.md)。

## 4. 实际 App、管理网页接入

下面由前端在自己的 **PR41** 工作树运行；后端交付者本轮未运行 App/Web。取 `access.base_url` 去掉末尾 `/api/v1` 得到后端 origin，恢复后端后端口可能变化。

- App 目录：`晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app`。真实入口 `lib/main.dart`；`JX_ACCOUNT_API_URL` 使用 origin。Flutter Web 本地地址用 `127.0.0.1:5000`，示例：`flutter run -d web-server --web-hostname 127.0.0.1 --web-port 5000 --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:<本次后端端口>`。按前端锁定 Flutter 版本准备依赖。
- 管理网页目录：`晶晶日上工程交接包/01_源码/frontend_ops_workspace`。设置 `$env:VITE_BACKEND_ORIGIN='http://127.0.0.1:<本次后端端口>'`，按锁文件安装依赖后 `npm run dev -- --host 127.0.0.1 --port 5173`，由 `vite.config.ts` 开发代理转发实际 API。这可供同记录办理；最终仍记录实际构建命令、产物 SHA 和测试 SHA，不能只交开发服务截图。
- Android 仍须真实 Flutter 构建和真机。USB 调试可将该后端端口通过 `adb reverse tcp:<端口> tcp:<端口>` 映射到前端自己的电脑，再构建明确绑定此 origin 的独立测试包；保留现有应用和离线 APK。前端此前构建的 `.acceptance` APK 使用无效隔离 HTTPS 地址，不能直接当作已连接本环境。设备安装、网络配置和视觉检查由前端如实留证。

三个入口操作**同一个后端实例**；不要让每端的独立自动脚本各建新库后声称同单。独立 npm 页面预览不替代 App 验收。

## 5. 补跑 App 本人隐私资料用例

已生成两个受控夹具及结果文件；它们含本机令牌，禁止入 Git。初始下载夹具对应后端已办理、独审并读回的副本；申请仍为 `FOLLOW_UP`，仅涵盖本人档案和本次主订单摘要，其余资料尚待处理，不能当成全隐私请求办结。

要获得实际 **App 申请 → 管理网页办理 → 独审 → App 下载** 证据：

1. 前端进入 App 目录，设置 `$env:JX_PM01_APP_FIXTURE='<后端环境绝对路径>/pm04-app-privacy-create.json'`，运行 `flutter test --no-pub --reporter expanded test/privacy/pm01_live_copy_test.dart`。本机 `pm04-app-privacy-create-result.json` 记录新请求 ID。
2. 网页 `producer` 打开**该请求 ID**，开始办理、读取本人档案和主订单摘要，上传受控副本并提出回复；`reviewer` 独立读取实际文件、核准。同一申请人不能看到未核准副本，办理者不能自审。
3. 回后端固定工作树，执行 `node scripts/pm04-joint-handoff.cjs privacy-download $pm04Env <同一请求ID> <核准文件ID>`。只有申请人能真实读取的同请求文件才会生成下载夹具。
4. App 目录改用 `pm04-app-privacy-download.json`，运行同一 Flutter 用例。保存 create/download 两次原始结果及请求/文件摘要；后端准备成功不能把这条 App 跳过项直接改成通过。

只运行初始下载夹具可验证后端预制副本的 App 下载，但不是 App 创建到网页处理的整链证据。实际网页与 Android 隐私页面交互另留证，Flutter 集成 HTTP 用例不替代真机。

## 6. 同记录停止、恢复与交接

创建当前环境目录中的 `stop` 文件，等待启动器实际退出、`status.json` 成为 STOPPED；数据库和文件保留：

```powershell
New-Item -ItemType File -Path (Join-Path $pm04Env 'stop') -Force | Out-Null
```

在原有效期内、**同一后端 HEAD** 重启：

```powershell
node scripts/stock-sandbox.cjs --pm03-resume $pm04Env
```

另一个终端执行：

```powershell
node scripts/pm03-batch-smoke.cjs $pm04Env --verify-retained
node scripts/pm04-joint-handoff.cjs verify $pm04Env
```

恢复校验保持原 HOLD/版本、监护退款案、六个会话、主订单、已核准私有文件；刷新 App 两个夹具的 origin，保留已选择的隐私请求。App/Web 连接地址也要跟随当前 origin。过期不能续时冒充原运行，按新批次创建并保留旧证据。

本侧已实测停止退出 0 和同记录恢复，当前地址曾为 `127.0.0.1:59849`，环境到期 **北京时间 2026-11-24 10:06:15**，主订单初始付款截止 **02:37:27**。这是本机快照，前端不能从另一电脑访问此回环地址；前端应在自己电脑新建，使用自己的到期时间和 ID。

## 7. 当前剩余与交付回执

PR41 `f77a10fb` 的 [App/Web 检查](https://github.com/Bill-Billion/jingjing/actions/runs/45140473521)：App 分析、指定测试集、Flutter Web 构建成功；管理网页制作、项目、财务、运营、开票恢复、人工视频等已成功，步骤33免费认证仍 `VERIFIED_ADULT_REQUIRED`，步骤34券后分期退款、35商单分成/原订单跳过。[服务器检查](https://github.com/Bill-Billion/jingjing/actions/runs/45140473533) 成功。不能继续报告“制作未开始、后8项全跳过”。

前端先定位被拦的账号、路由和准备顺序，按正常流程补测试数据；若已正确认证仍拒绝，提供 SHA、请求路由、错误码、account/party/记录 ID、原 key 与版本，后端修确证接口问题。前端另补隐私用例和 Android 真机证据，不删除认证门禁或业务断言。

双方齐备后登记：前端 SHA、后端 SHA、最终联测源码/两个目录组合清单、API/迁移、实际构建产物、同一业务记录矩阵、正常/拒绝/恢复与钱账/文件结果。此前各自检查不拼接成联合验收。随后 G2 原未成年人专项与其余原验收项，最后维护者阶段末实际审阅。

本轮证据见 [REPORT](../reviews/pm04-joint-environment-20261124/REPORT.md)。原18组0/18、12整链部分、151条19/124/8保留。用户只需转交本说明让前端接收，不需提供真实个人信息、儿童材料或口令。
