# 晶晶日上 · 数字人 IP 经纪与定制圆梦平台

**晶晶日上，做自己的人生主角。**

晶晶日上将数字人创建与授权、AI 内容创作、祝福视频与品牌代言交易、定制剧制作及艺人经营放在同一个应用中。普通用户可以选艺人、订制内容、参与剧集角色；艺人可以管理数字形象、接单和查看收益；平台通过后端维护订单、审核、支付记录和交付流程。

本仓库包含 **Flutter 客户端、Node.js / Express API、部署脚本、产品档案和交接资料**。AI 能力主要通过云服务接口调用，仓库没有提供本地模型训练或推理服务。

> **当前状态：可用于开发、演示和继续联调，尚需完成真实交易链路与生产验收。** 页面流程、内置演示数据和第三方服务代码同时存在；看到“支付成功”或生成结果，并不代表对应能力已完成真实渠道验收。本文以当前主工程代码为依据，核对日期为 **2026-09-10**。详细证据见[本次项目审查记录](docs/project-review-2026-09-10.md)。

[功能与流程](#功能与流程) · [技术架构](#技术架构) · [目录导航](#目录导航) · [快速开始](#快速开始) · [第三方服务配置](#第三方服务配置) · [测试与验证](#测试与验证) · [已知限制与后续工作](#已知限制与后续工作) · [文档索引](#文档索引)

## 功能与流程

### 服务对象

| 角色 | 主要用途 | 对应模块 |
| --- | --- | --- |
| 普通用户 / 内容买家 | 浏览艺人，购买祝福视频，定制个人剧情内容，管理订单和作品 | 艺人广场、选剧库、收银台、我的订单、剧场 |
| 艺人 / 数字人拥有者 | 创建数字形象、提交授权、设置价格、接单、查看使用与收入 | 我的数字人、创建向导、使用报告、钱包 |
| 品牌 / 企业客户 | 购买品牌代言、企业口播和高端定制服务 | 品牌代言、定制需求、身份认证 |
| MCN 机构 | 管理旗下艺人，查看经营数据，发起机构相关操作 | Flutter MCN 页面、`/api/mcn` |
| 平台运营人员 | 管理审核、提现申请、退款、交付物和对账 | `/api/admin` 等管理接口；本仓库未发现独立完整的 Web 管理后台工程 |

### 核心模块

| 模块 | 已有实现 | 当前边界 |
| --- | --- | --- |
| 账号与身份 | 手机验证码登录、JWT、体验账号、身份材料提交、授权记录 | 体验账号只存在于客户端；真实短信、实名、人脸核验依赖外部配置 |
| 数字人经纪 | 创建向导、艺人筛选与详情、定价、作品展示、使用报告 | 创建资料与数字人生成是不同步骤；云端生成及材料处理仍需联调 |
| AI 创作中心 | 文案、TTS、声音复刻、图像生成、视频异步任务、任务查询 | 调用火山引擎相关服务；无凭证不能完成真实生成 |
| 祝福视频与代言 | 报价、下单、接单、交付、验收、评价、售后 | 已有支付宝 APP 支付接口；旧支付、退款、分账与代付链路仍有占位实现 |
| 定制剧 / 圆梦 | 选剧、剧本反馈与定稿、分阶段付款、制作交付、角色席位与项目里程碑 | 部分付款接口直接修改状态；新库选剧库接口存在已复现的字段缺失问题 |
| 艺人经营与机构管理 | 钱包、收支流水、提现申请、MCN 艺人管理与统计 | 申请和账务记录不等于真实出款；银行或支付机构代付尚未完整接入 |
| 沟通与内容展示 | 订单相关私信、联系方式申请、视频库、剧场、分享入口 | 部分分享素材生成、画像统计仍为预留逻辑 |
| 平台治理 | 内容审核适配、审计日志、幂等、对账、AI 交付版本、定时任务 | 需要逐项验收配置和权限；不能仅据配置声明认定功能有效 |

应用主导航为：**首页 → 圆梦 → 中央创作入口 → 消息 → 我的**。

主要业务流程：

1. **数字人创建**：提交形象资料 → 身份与授权流程 → 建立数字人资料 → 展示、定价与接单。
2. **内容交易**：选择艺人 → 填写祝福或代言需求 → 报价下单 → 支付 → 制作交付 → 验收、评价或售后。
3. **定制剧**：创建订单 → 意向金 → 类型与参考剧本 → 剧本反馈、定稿 → 制作款 → 成片交付与评价。
4. **AI 创作**：输入提示词或素材 → 提交云端任务 → 查询进度 → 结果转存 → 查看作品；审核开关启用时进入交付审核。

业务档案将角色席位定义为内容消费与交付权益。价格、角色权益和状态机变更应先核对[产品与价格单一事实源](晶晶日上工程交接包/02_项目档案/01_产品与价格单一事实源.md)。

## 技术架构

```text
Flutter App
  ├─ pages / widgets / theme：页面、交互与视觉组件
  ├─ Provider：用户状态
  └─ ApiService + AppMode
       ├─ demo：内置 MockData / 本地状态
       └─ online / auto：HTTP JSON API
                          │
                    Node.js / Express
                     ├─ routes / middleware：业务入口、鉴权与校验
                     ├─ services / providers：AI、支付、核验、存储
                     ├─ SQLite WAL + 版本化迁移
                     ├─ 本地 uploads 文件存储
                     └─ 进程内定时任务、审计与对账
                          │
                 火山引擎 / 阿里云 / 支付宝

部署资料中的入口方案：HTTPS → Nginx → Node.js（PM2 管理）
```

| 层级 | 当前技术与实现 |
| --- | --- |
| 客户端 | Flutter、Dart、Material 3、自定义暗色主题；`provider`、`dio`、`shared_preferences` |
| 媒体与原生能力 | `video_player`、`image_picker`、`cached_network_image`、`webview_flutter`、`tobias` 支付宝 SDK |
| 服务端 | Node.js、Express 4、CommonJS、JWT、自定义鉴权 / 限流 / 校验中间件 |
| 数据库 | `better-sqlite3`、WAL、外键、5 个版本化迁移；新库迁移后为 61 张应用表，包含 `schema_migrations` |
| 存储 | 默认本地目录；OSS 适配代码已存在，启用还需安装 `ali-oss` 并配置凭证 |
| 测试 | 后端 `node:test`；前端 Flutter 单元 / Widget 测试和 `integration_test` |
| 运维 | Nginx、PM2、Shell / Node.js 脚本、SQLite 备份、健康检查 |

版本与规模来自当前文件：前端 `12.3.1+22`，后端 `13.0.0`；前端 `lib/` 有 77 个 Dart 文件，其中 `pages/` 有 40 个文件（含页面辅助内容）；后端有 25 个路由模块。文档中的 V15 等标识还用于视觉或交付阶段，不应直接当作包版本。

**数据库与金额约定：**运行时目前始终使用 SQLite。设置 `DB_CLIENT=mysql` 并不会连接 MySQL；MySQL DDL 与导出 / 导入脚本属于迁移准备。数据库金额通常采用整数“分”，但多个展示接口已转换为“元”，新支付宝接口还使用 `amount_fen` 等明确字段；对接时应逐字段确认，避免重复除以 100。前端价格与展示入口分别为 `lib/utils/pricing.dart`、`lib/utils/money.dart`。

## 目录导航

```text
.
├─ README.md                              # 项目入口
├─ docs/
│  └─ project-review-2026-09-10.md         # 本次代码审查与实测记录
├─ 晶晶日上工程交接包/
│  ├─ 01_源码/
│  │  ├─ frontend_jingjingshangri_app/     # 主 Flutter 工程
│  │  │  ├─ lib/                         # 页面、服务、组件、主题与工具
│  │  │  ├─ test/                        # 62 个 *_test.dart 文件
│  │  │  ├─ integration_test/            # 黄金业务旅程测试
│  │  │  └─ android/、ios/、web/…         # 平台工程目录
│  │  ├─ backend_server/                 # 主 API 工程
│  │  │  ├─ app.js / config.js / db.js
│  │  │  ├─ routes/、middleware/、services/、utils/
│  │  │  ├─ migrations/、jobs/、test/
│  │  │  └─ docs/openapi.yaml            # 部分主链路契约
│  │  ├─ deploy_ops/                     # 部署、巡检与历史迭代脚本
│  │  └─ gate0-docs-src-20260909/         # 性能实验源码片段、日志与证据
│  ├─ 02_项目档案/                       # 产品规则、架构、风险与运维档案
│  └─ 03_关键报告与设计/                 # 设计、部署与历史评审报告
├─ 晶晶日上_UI设计方案/                  # 静态设计展示与图片
├─ 晶晶日上App图文对照审阅包/            # 截图与文案审阅材料
└─ 晶晶日上_工程交接总览_先读我.md       # 历史交接入口
```

日常开发以两个主工程为入口。`gate0-docs-src-20260909/src/` 只有 5 个 Dart 文件，是性能实验交付副本，不是可独立运行的 Flutter 工程；其中的记录与修改应先逐文件核对，再决定是否合入主工程。

## 快速开始

### 环境要求

| 环境 | 说明 |
| --- | --- |
| Node.js / npm | 仓库没有声明 `engines`；本次在 Node.js `20.19.4`、npm `10.9.2` 上通过安装、测试与后端启动检查。这是复现环境记录，其他版本需另行验证 |
| Flutter / Dart | 当前 `pubspec.lock` 要求 **Flutter ≥ 3.44.0、Dart ≥ 3.12.0 且 < 4.0.0**；只看 `pubspec.yaml` 中的 `^3.5.0` 不足以复现锁定依赖 |
| Android 构建 | 需配置 Android SDK；工程 `compileSdk=36`，Java / Kotlin 目标为 17；另有 AGP 9.1.0、Gradle 9.3.1 的工具链约束，先运行 `flutter doctor -v` 检查兼容性 |
| 本地 AI 算力 | 当前代码调用云 API，本地启动业务服务不需要安装模型、CUDA 或 GPU 推理环境 |

以下 PowerShell 示例从**仓库根目录**开始。安装依赖需要联网；后端基本启动不要求开通 AI、短信或支付服务。

### 1. 启动后端

```powershell
Set-Location "晶晶日上工程交接包/01_源码/backend_server"
npm.cmd ci

# 首次创建本地配置，保留已有 .env
if (!(Test-Path -LiteralPath ".env")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
}

# 本地开发环境；当前终端中有效
$env:NODE_ENV = "development"
$env:JWT_SECRET = node -p "require('node:crypto').randomBytes(32).toString('hex')"
$env:FIELD_ENC_KEY = node -p "require('node:crypto').randomBytes(16).toString('hex')"

npm.cmd run init-db
node app.js
```

默认端口为 `3000`。在另一个终端检查：

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/health"
```

预期包含 `status: ok`、`service: 晶晶日上API` 和 `version: 13.0.0`。健康检查仅确认 API 能响应，不检验支付或 AI 上游可用性。

本地配置说明：

- 开发库默认位于后端目录的 `jingjingshangri.db`；`SQLITE_PATH` 可改为专用测试库路径。启动和 `init-db` 都会执行尚未应用的迁移。
- 上例生成的密钥只在当前终端中有效。需要跨重启保留账号会话或解密已存字段时，将生成值保存到本地 `.env`，之后沿用相同值；不要反复生成加密密钥。
- 无短信通道时，可在启动前设置 `$env:SMS_ENABLED = "false"` 和 `$env:SMS_DEV_CODE = "123456"`，使用符合格式的手机号与该测试码登录本地 API。该兜底仅适用于非生产环境，默认模板没有启用固定验证码。
- 全新库默认没有完整展示数据。**`node seed.js` 会先清空多张业务表，仅可对可丢弃的演示库执行。** 种子脚本也不会补齐所有示例图片与视频文件。
- 当前 `npm run dev` / `npm start` 使用 `NODE_ENV=... node ...` 的 POSIX 写法，Windows 默认 npm 脚本环境无法直接执行，因此上例使用 PowerShell 环境变量配合 `node app.js`。Linux / macOS 可在配置完成后使用 `npm run dev`。
- `npm run migrate:status` 会先加载 `db.js`，因此也可能执行迁移，并非严格只读命令。

### 2. 启动 Flutter 客户端

另开终端，从仓库根目录执行：

```powershell
Set-Location "晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app"
flutter doctor -v
flutter pub get
flutter devices
flutter run -d <Android设备ID>
```

**本地开发前先确认服务器地址。** `lib/services/api_service.dart` 的 `defaultUrl` 默认指向项目预设公网域名。使用 Android 模拟器时，可在首次启动前将它设为文件内已有的 `emulatorUrl`，即 `http://10.0.2.2:3000`；也可以在应用“我的 → 设置 → 连接与服务器”中修改服务器地址。

| 运行位置 | 后端地址 | 注意事项 |
| --- | --- | --- |
| Android 模拟器 | `http://10.0.2.2:3000` | 工程已为该地址放行开发 HTTP |
| Android 真机 | 开发电脑的局域网地址或开发用 HTTPS 地址 | 手机的 `localhost` 指向手机自身；任意局域网 HTTP 地址还需在开发网络安全配置中显式放行 |
| 同机浏览器 / 桌面端 | `http://127.0.0.1:3000` | 存在平台工程目录不代表所有插件均已验证；Web 还需对应的 `CORS_ORIGIN` |

### 3. 选择数据模式

在“我的 → 设置 → 连接与服务器 → 连接模式”中选择：

| 模式 | 行为 | 使用目的 |
| --- | --- | --- |
| `demo` 演示 | ApiService 使用内置示例与本地状态 | 展示页面和流程；部分媒体资源仍可能需要联网加载 |
| `online` 在线 | 请求真实后端，失败直接报错 | 本地联调与真实业务验收 |
| `auto` 自动（默认） | 先请求后端，异常时回退本地演示数据 | 体验展示；不能据此判断后端业务是否成功 |

登录页提供“免验证码 · 先体验”，它写入本地 `demo-token`，不是服务端签发的 JWT。当前主工程中的体验登录函数没有同时强制切换连接模式，因此演示时应明确选 `demo`；转回真实联调时，应选择 `online` 并重新使用验证码登录。历史性能交付记录声称该模式问题已修复，但主工程尚需核对同步情况。

## 第三方服务配置

以[后端环境变量模板](晶晶日上工程交接包/01_源码/backend_server/.env.example)和对应服务代码为准。模板含有部分历史重复项；正式接入前应整理成本地唯一配置。

| 能力 | 主要变量 | 说明 |
| --- | --- | --- |
| 基础运行 | `NODE_ENV`、`PORT`、`JWT_SECRET`、`FIELD_ENC_KEY`、`SQLITE_PATH` | `FIELD_ENC_KEY` 按 UTF-8 字节读取，应为 32 字节；生产 JWT 禁止缺省 |
| AI 文案 / 图像 / 视频 | `ARK_API_KEY`、`ARK_BASE_URL`、`ARK_LLM_MODEL`、`ARK_T2I_MODEL`、`ARK_T2V_MODEL` | 需实际可用的服务权限和模型标识 |
| TTS / 声音复刻 | `SPEECH_API_KEY`、`SPEECH_APP_ID`、`ARK_TTS_SPEAKER`、`VOLC_VOICE_ID` | 具体组合见 `services/volcSpeech.js` |
| AI 治理 | `AI_DAILY_COST_CAP_FEN`、`ALLOW_ANON_AI`、`AI_DELIVERABLE_REVIEW`、`ARK_WEBHOOK_SECRET` | 成本上限单位为分；默认要求登录；交付审核默认关闭 |
| 支付宝 APP 支付 | `ALIPAY_ENABLED`、`ALIPAY_APP_ID`、密钥或证书路径、`ALIPAY_GATEWAY`、`ALIPAY_NOTIFY_URL` | 模板默认关闭、网关为沙箱；新 APP 支付使用 `ALIPAY_APP_ID`，区别于旧链路的 `ALIPAY_APPID` |
| 火山短信 | `SMS_ENABLED`、`SMS_ACCOUNT`、`SMS_SIGN_NAME`、`SMS_LOGIN_TEMPLATE_ID`、火山 AK / SK | `SMS_DEV_CODE` 仅供本地开发，不代表真实短信已接通 |
| 实名 / 人脸 / 内容审核 | `COMPLIANCE_PROVIDER` 及 `VOLC_COMPLIANCE_*` / `VOLC_RMS_*`，或 `ALIYUN_*` / `CLOUDAUTH_*` / `GREEN_*` | 当前可选择火山或阿里云实现；需核实各能力的就绪状态及降级行为 |
| OSS | `OSS_ENABLED`、`OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` | 还需 `ali-oss` 依赖；缺依赖或配置会回退本地存储 |
| 访问来源 / 告警 | `CORS_ORIGIN`、`ALERT_WEBHOOK_URL` | CORS 为逗号分隔的来源列表；Webhook 为空时只写日志 |

`REDIS_URL`、MySQL 配置和部分支付开关属于预留配置，不能据此判断相应服务已经接入。具体适配接口见[Provider 文档](晶晶日上工程交接包/01_源码/backend_server/services/providers/README.md)。

## API 与开发入口

| 入口 | 用途 |
| --- | --- |
| `GET /api/health` | 服务响应与版本检查 |
| `/api/auth`、`/api/identity`、`/api/face-verify`、`/api/compliance` | 账号、身份、核身和授权 |
| `/api/humans`、`/api/videos`、`/api/endorsement` | 艺人、祝福视频和代言业务 |
| `/api/samples`、`/api/projects`、`/api/theater` | 定制剧、角色席位和剧场 |
| `/api/ai` | AI 生成、异步任务和回调 |
| `/api/pay` | 新支付宝 APP 支付创建、通知、状态查询 |
| `/api/payment` | 旧支付与分账入口、Apple 收据验证相关接口 |
| `/api/orders`、`/api/settlement`、`/api/messages`、`/api/mcn` | 订单、钱包、消息和机构业务 |
| `/api/admin` | 管理、审核与对账 |

普通用户使用 `Authorization: Bearer <JWT>`；管理接口支持 `X-Admin-Token`，并校验管理员身份。上述只列主要业务域，完整挂载关系见[app.js](晶晶日上工程交接包/01_源码/backend_server/app.js)。[OpenAPI 文件](晶晶日上工程交接包/01_源码/backend_server/docs/openapi.yaml)只覆盖部分主链路，其中域名、鉴权和金额描述存在历史差异，需要与实际路由核对。

## 测试与验证

后端目录：

```powershell
npm.cmd test
```

前端目录（需先安装 Flutter 并执行 `flutter pub get`）：

```powershell
flutter analyze lib integration_test test
flutter test --no-pub
flutter test integration_test/golden_journeys_test.dart -d <Android设备ID>
flutter build apk --release
```

APK 默认输出到 `build/app/outputs/flutter-apk/app-release.apk`。当前 Gradle 配置在缺少 `android/key.properties` 时会回退到 debug 签名；构建出 release APK 不代表已使用正式发布证书。拍照、核身、原生支付与性能需要真机验收。

**2026-09-10 本次验证结果：**

| 检查 | 结果 |
| --- | --- |
| 后端锁定依赖安装 `npm ci` | 通过 |
| 后端既有测试 | **21 / 21 通过**，覆盖迁移、财务、AI 交付、存储与 Provider；部分测试有本地数据文件副作用，宜使用专用工作副本 |
| 独立临时库：初始化、迁移、`seed.js` | 通过；5 个迁移、61 张应用表 |
| 健康、艺人列表、项目列表 | 本地 HTTP 200 |
| 登录校验 | 缺验证码返回 400；显式配置开发验证码后返回 200 和 JWT |
| 新库选剧库 `GET /api/samples/library` | **失败，HTTP 500：`no such column: video_url`** |
| Flutter analyze / test / APK | 本环境未安装 Flutter / Dart，未复测 |
| 生产站点、真实支付、云端 AI、短信、实名 | 本次未进行线上或真实渠道验证 |

历史档案中的“319 条全绿”、真机帧率和已发布版本属于当时的验证记录，不代表本次验证结果。

## 已知限制与后续工作

以下事项均来自当前代码或本次实测，详见[审查记录](docs/project-review-2026-09-10.md)：

1. **补齐新库迁移**：`sample_library.video_url` 缺失导致选剧库报错；应新增迁移并补新库 API 验收。
2. **闭合真实支付状态流转**：定制剧意向金 / 制作款接口直接置为已付款，缺少真实支付确认与生产隔离；旧分账、退款和代付 Provider 仍有未实现的方法。
3. **收紧身份与数据权限**：个人实名 Provider 未就绪时仍存在自动批准分支；旧支付状态查询缺少当前用户归属条件；本地文件存储的私有访问语义尚不完整。
4. **同步演示模式修复与接口契约**：自动模式会把请求异常回退为演示数据；需核对体验登录模式、金额字段、OpenAPI 和交付副本的一致性。
5. **完成性能验收**：主 Tab 已采用懒挂载与 `IndexedStack` 保活；缓存工具尚未接入业务页面。性能交付包仍记录首页渲染优化、视频首帧和列表接口延迟等后续项。
6. **完善工程交付**：补登录、支付、权限及新库端到端回归；处理依赖安装时报告的弃用项；核验 Android 构建链与正式签名；MySQL、分布式任务和独立管理后台仍需实际实现与验收。

现有部署资料以单机 Nginx + PM2 + SQLite 为主。源码中的 Node 服务实际监听 `0.0.0.0`，定时任务在每个进程内启动，不能直接将其视为已完成回环隔离或多实例部署。`deploy_ops/` 含大量绑定历史环境的脚本，按具体脚本核对路径、配置和用途后使用。

## 文档索引

| 阅读目的 | 文档 |
| --- | --- |
| 当前代码审查与复现结果 | [本次项目审查记录](docs/project-review-2026-09-10.md) |
| 交接背景与资料导航 | [工程交接总览](晶晶日上_工程交接总览_先读我.md)、[项目档案主索引](晶晶日上工程交接包/02_项目档案/00_主索引_先读我.md) |
| 产品、价格和权益 | [产品与价格单一事实源](晶晶日上工程交接包/02_项目档案/01_产品与价格单一事实源.md) |
| 技术现状与差距 | [技术架构与落地差距](晶晶日上工程交接包/02_项目档案/04_技术架构与落地差距.md) |
| 部署与运维 | [最终部署与运维手册](晶晶日上工程交接包/02_项目档案/16_最终部署与运维手册.md) |
| 性能实验及历史证据 | [Gate0 交付说明](晶晶日上工程交接包/01_源码/gate0-docs-src-20260909/README-交付说明.md) |
| MySQL 迁移准备 | [SQLite → MySQL 切换资料](晶晶日上工程交接包/01_源码/backend_server/migrations/mysql/README_mysql_switch.md) |
| 历史工程评审 | [2026-09-09 评审报告](晶晶日上_工程代码评审报告_20260909.md) |

旧报告与当前代码不一致时，先复现并核对对应工程版本；不要将报告中已声称完成的修复直接视为主工程已经包含。

## 协作与许可

提交问题时，请注明使用的是主工程还是 Gate0 副本、前后端版本、连接模式、复现步骤和脱敏后的日志。业务修改应同时核对价格口径、前后端字段、迁移和相关测试。

仓库目前未提供顶层 `LICENSE`，本 README 不新增任何开源或商业使用授权。代码、图片、剧本、人物素材和第三方模型 / 服务的使用范围，需要依据相应权利方提供的授权文件确认。配置密钥、数据库与 Android 签名文件保留在本地，不写入示例文档或提交内容。

## README 参考仓库

本文参考以下官方仓库的文档组织方式，结合本项目代码重新撰写；这些项目不是当前工程依赖，也不代表本项目已经具有其能力。

| 参考仓库 | 相似维度 | 本文采用的组织方式 |
| --- | --- | --- |
| [Duix-Avatar（原 HeyGem.ai 仓库现重定向至此）](https://github.com/duixcom/Duix-Avatar) | 数字人形象与视频内容生成 | 项目定位、运行要求、功能边界、FAQ / 文档入口 |
| [LiveTalking](https://github.com/lipku/LiveTalking/blob/main/README.md) | 数字人、语音与视频处理 | 应用场景、核心流程、安装和运行说明 |
| [Medusa](https://github.com/medusajs/medusa/blob/develop/README.md) | 交易平台、订单与可扩展业务模块 | 快速开始、模块说明、集成与贡献导航 |

参考页面查阅日期：2026-09-10。
