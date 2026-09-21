# 晶晶日上项目审查记录（2026-09-10）

## 范围与结论

本次审查以 `晶晶日上工程交接包/01_源码/` 下两个主工程为依据，交叉阅读交接报告、产品档案和 Gate0 性能交付副本。检查了入口、依赖、路由与服务、数据库迁移、配置、客户端数据模式、测试及部署相关代码，并在独立临时 SQLite 库中启动后端进行 HTTP 验证。

项目面向数字人 IP 经纪、AI 内容创作与定制内容交易，已具备较完整的业务页面和服务端模块。当前适合继续开发与演示；真实支付、出款、核验、部署隔离及数据契约仍有明显缺口。不能用页面数量或历史完成度百分比代替真实业务验收。

本次仅修改文档，没有修复下述业务缺陷，没有访问生产站点或调用真实支付、短信、AI 和身份服务。前端因缺少 Flutter / Dart 未执行构建和测试。此记录是项目理解与关键路径审查，不是完整渗透测试、逐接口安全审计或法律合规结论。

## 实测结果

环境：Windows PowerShell，Node.js 20.19.4，npm 10.9.2。

| 检查 | 结果与解释 |
| --- | --- |
| `npm ci --no-audit --no-fund` | 成功安装 302 个依赖包；安装器报告 multer 1.x、lodash.get、旧 uuid 和 crypto-js 等弃用信息，未运行完整依赖漏洞审计 |
| `npm test` | 21 项通过、0 项失败。5 个测试文件涉及迁移、财务退款与对账、AI 交付幂等和审核、存储、Provider 就绪状态 |
| 独立新库 `node db.js` | 成功应用 001–005 共 5 个迁移 |
| 独立新库 `node seed.js` | 成功；迁移后有 61 张非 SQLite 内部表，包含迁移记录表 |
| `GET /api/health` | HTTP 200，版本 13.0.0 |
| `GET /api/humans` | HTTP 200，JSON 响应 |
| `GET /api/projects` | HTTP 200，JSON 响应 |
| `GET /api/samples/library` | HTTP 500，响应 `{"message":"no such column: video_url"}`；再次用新临时库复现 |
| `POST /api/auth/phone`，缺验证码 | HTTP 400，不发 JWT |
| 同接口，显式配置开发验证码 | HTTP 200，返回 JWT；测试使用非生产环境、关闭短信并配置 `SMS_DEV_CODE` |
| Flutter / Dart、真机与真实上游 | 本次未验证 |

迁移测试中的“与旧生产库等价”用例在缺少本地数据库副本时直接返回成功，并未使用测试框架的 skip 标记。因此，21 项通过不能单独证明与真实生产库结构一致。部分 Provider 测试还会间接加载默认数据库，测试副作用需要后续隔离。

## 关键发现

### 1. 高优先级：定制剧付款接口可直接置为已付款

证据：[routes/samples.js](../晶晶日上工程交接包/01_源码/backend_server/routes/samples.js)，第 83–99、283–297 行。

`/:id/pay-intent` 校验登录、订单归属及 `draft` 状态后，直接设置 `intent_paid=1`。`/:id/pay-production` 在 `script_finalized` 状态下直接设置 `production_paid=1`。这两处仍有支付接入 TODO，缺少对真实支付流水的确认，也没有生产环境隔离。

这意味着订单上的“已支付”不能作为真实到账证据。建议由校验通过的支付通知或主动查单结果推进状态，并封闭直接置付费状态的旧入口。本次为静态确认，未对线上发起请求。

### 2. 高优先级：实名服务未就绪时仍自动批准

证据：[routes/identity.js](../晶晶日上工程交接包/01_源码/backend_server/routes/identity.js)，第 58–62 行。

个人身份流程在 `idVerify.ready()` 为 false 时，设置 `status='approved'`，并在响应变量中标为 `unverified_auto`。服务已就绪但未给出确定核验结果时则进入 `pending`，两种分支的信任标准不一致。

建议缺少服务配置时也进入待审核状态，并核查下游权限是否将该类批准当作真实实名。历史报告所述风险在当前主工程中仍存在。

### 3. 高优先级：新库选剧库接口不可用

证据：[routes/samples.js](../晶晶日上工程交接包/01_源码/backend_server/routes/samples.js)，第 130–138 行；[001_initial.js](../晶晶日上工程交接包/01_源码/backend_server/migrations/001_initial.js)，`sample_library` 建表段。

路由查询 `sample_library.video_url`，但 001–005 迁移没有为该表创建该列。独立新库完成迁移与种子填充后，接口两次返回 HTTP 500；`PRAGMA table_info(sample_library)` 也确认该列不存在。

建议新增版本化迁移并加入从空库到列表接口的验收。当前“迁移测试全绿”只说明既有断言满足，无法保证所有业务查询与表结构一致。

### 4. 中优先级：旧支付流水查询缺少用户归属过滤

证据：[routes/payment.js](../晶晶日上工程交接包/01_源码/backend_server/routes/payment.js)，第 64–68 行。

接口要求用户登录，但只按 `tx_no` 查询交易，没有将当前用户纳入过滤条件。已知他人流水号的登录用户可能读取他人支付信息。建议补充用户归属校验，并与新 `/api/pay` 链路统一权限契约。

### 5. 中优先级：自动回退演示数据可能遮蔽错误，体验登录修复未同步

证据：[api_service.dart](../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/services/api_service.dart) 的 `_read`、`_write`、`demoQuickLogin`；[app_mode.dart](../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/services/app_mode.dart) 的 `demoLogin`。

`auto` 模式会捕获请求异常并返回本地数据，写操作也如此。当前体验登录写入 `demo-token`，没有显式将模式设为 `demo`。因此，不能把自动模式下成功展示的列表、订单或提示视为真实接口成功。

Gate0 文档声称体验登录与模式联动已修复，但主工程所读函数未包含相应切换。应核对交付版本差异；联调使用 `online` 与真实登录，演示明确使用 `demo`。

### 6. 中优先级：本地存储没有完整私有访问语义

证据：[services/storage/index.js](../晶晶日上工程交接包/01_源码/backend_server/services/storage/index.js) 的 `localDriver`；[app.js](../晶晶日上工程交接包/01_源码/backend_server/app.js) 的 `/uploads` 静态挂载。

本地驱动的 `put` 不处理 `isPrivate`，`signedUrl` 直接返回公开相对路径；`/uploads` 由 Express 静态提供。如果业务将需私有保护的材料交给该驱动，就不能仅据接口名认定已受签名访问保护。OSS 不可用时还会回退本地。

建议为私有文件实现独立授权读取路径，或在必须私有存储的业务中拒绝不满足要求的驱动。本次未推断或验证线上材料是否已经公开。

### 7. 工程与配置边界

| 发现 | 代码证据 | 影响 / 后续建议 |
| --- | --- | --- |
| MySQL 不是运行时可切换数据库 | [db.js](../晶晶日上工程交接包/01_源码/backend_server/db.js)，第 16–20 行；始终实例化 `better-sqlite3` | 需要数据库访问层和 SQL 方言适配，不能只改环境变量 |
| 真实退款、分账和代付仍有占位 | [paymentService.js](../晶晶日上工程交接包/01_源码/backend_server/services/paymentService.js)、`routes/admin.js`、`routes/mcn.js` | 新支付宝收款代码不等于全资金链闭合 |
| Windows 启动脚本不兼容 | [package.json](../晶晶日上工程交接包/01_源码/backend_server/package.json) 的 `start` / `dev` | README 已给出 PowerShell 写法；后续可统一跨平台脚本 |
| 源码实际监听所有网卡 | [app.js](../晶晶日上工程交接包/01_源码/backend_server/app.js)，第 98 行 | 与“绑定回环”的交接说明不同，部署时核实实际隔离方式 |
| 定时任务在进程内启动 | [scheduler.js](../晶晶日上工程交接包/01_源码/backend_server/jobs/scheduler.js) | 多实例可能重复执行；Redis 目前只有预留配置 |
| 字段加密缺少强配置校验 | [crypto.js](../晶晶日上工程交接包/01_源码/backend_server/utils/crypto.js)，第 5 行 | 存在硬编码回退且不校验密钥长度；应启动时校验，不能依赖历史“安全降级”说明 |
| 管理员登录缺独立严格限流 | [admin.js](../晶晶日上工程交接包/01_源码/backend_server/routes/admin.js)，第 9 行 | 有全局 API 限流，但没有普通登录所用的独立登录限流器 |
| API 文档存在金额与来源差异 | [OpenAPI](../晶晶日上工程交接包/01_源码/backend_server/docs/openapi.yaml)、`routes/humans.js`、`routes/projects.js` | 文档声称金额一律分，实际展示接口多处转元；需要逐字段契约 |
| SDK 要求高于交接概述 | [pubspec.lock](../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/pubspec.lock) 末尾 | 锁定依赖要求 Dart ≥3.12、Flutter ≥3.44，不能仅按 Dart ^3.5 安装 |
| release 构建可回退 debug 签名 | [build.gradle.kts](../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/android/app/build.gradle.kts) | 正式出包必须独立核验证书；当前 Android 工具链本次未构建 |

## 结构、现有成果与历史差异

- 主工程确认为 Flutter + Express：77 个 `lib/` Dart 文件、40 个 `pages/` Dart 文件、25 个后端路由模块。没有发现独立完整的 H5 管理后台，也没有本地 AI 模型服务。
- 新支付宝 APP 支付路由已包含通知验签、应用归属、交易状态、金额核对与幂等推进，属于已有的实质工作；本次未使用真实渠道验证。
- 后端已经有迁移、退款与对账、AI 异步交付版本、回调幂等和可选审核等实现，21 项现有测试全通过；不能将其描述为没有后端测试。
- 主 Tab 已采用 `IndexedStack`、懒挂载和 `TickerMode`。无需重复按旧报告将它从 `AnimatedSwitcher` 改造一遍。`resource_cache.dart` 在 `lib/` 中没有其他引用，尚未接入业务页面。
- Gate0 交付包记录了真机实验及候选优化，但 `src/` 是 5 个文件的局部副本，不能替代主工程。性能结论需关联确切源码与安装包版本。
- 历史审查报告曾记录运维脚本泄露凭据。本次工作副本未发现报告列出的 4 个文件，根 `.gitignore` 已明确忽略它们；这不能证明旧分发包或历史凭据已经处置。本次未进行完整密钥扫描，不重复声称当前工作副本仍存在同一泄漏。

## 建议处理顺序

1. 补选剧库缺列迁移，收紧直接置付款状态与缺配置自动实名分支，并增加对应业务验收。
2. 核对体验登录修复、金额契约、订单归属及私有文件访问；用强制在线模式验证登录到交付的真实路径。
3. 完成支付通知、查单、退款、分账、提现与账务的联调，区分实际渠道结果和演示结果。
4. 固定前端工具链与正式签名，完成现有 Flutter 测试和真机性能验收。
5. 按实际规模规划 MySQL、任务队列、管理后台和部署自动化，并持续同步主工程与交付档案。

## README 参考方式

查阅了 [Duix-Avatar](https://github.com/duixcom/Duix-Avatar)、[LiveTalking](https://github.com/lipku/LiveTalking/blob/main/README.md) 和 [Medusa](https://github.com/medusajs/medusa/blob/develop/README.md) 官方仓库。前两者对应数字人与内容生成场景，后者对应交易平台模块。本次借鉴项目定位、场景说明、快速开始、运行要求、集成与文档导航的组织方式，没有复制其功能承诺、开源许可证或架构配置。
