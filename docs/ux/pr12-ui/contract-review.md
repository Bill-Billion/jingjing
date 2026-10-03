# PR12 合同原文与历史规则：接口核对及页面验收

核对日期：2026-09-29。负责范围：只读接口核对、App 与网页验收用例；不修改服务器、共享接口或前端实现。

**结论：页面可以接这三个读取接口，但只能展示获准查看的未签署合同、该合同保存的规则和外部服务条件。不能据此显示已签约、已付款、许可生效，也不能开放执行这些业务的按钮。**

本轮是源码与约定的静态核对，未启动服务、访问数据库、创建业务、调用供应商、合并或提交。下文“已有后端测试”表示读到了 PR12 的测试和断言，不表示本轮重新运行通过。App、网页的实际测试结果由各自实现者另行记录。

## 核对的版本与证据

|对象|核对结果|
|---|---|
|页面工作目录|`jingjing-pr11-pages`，分支 `ux/pr12-contract-ui`|
|当前共同版本|`599fd6139b74e003a65606e579060addde310b53`，包含最新 PR11 修复|
|PR12 候选后端|`origin/core/stage-3-rule-snapshots`，`620210bce80e1e50ea1d21bfcad38a398a1fe1e2`；通过 `git show` 读取，未 checkout|
|候选接口约定|`.local/pr12-reference/openapi.json`，`info.version = 0.3.0-rc.2`|
|接线说明与示例|`.local/pr12-reference/READ_API.md`、`platform-examples.json`；示例只用于本地显示/测试，不能当真实业务记录|
|当前接口是否已在共同版本可用|否。当前 HEAD 的 `account-api.js` 尚无这三个路由；PR12 候选分支已注册。页面完成不等于共同环境已具备它们|

以下后端相对路径均位于 `晶晶日上工程交接包/01_源码/backend_server/`，行号对应 PR12 候选提交：

- `src/http/account-api.js:100`–`121`：身份头、三个 GET 与直接 JSON 返回；`18`–`32`：缓存和响应封装；`55`–`59`：会话验证；`123`–`130`：错误处理。
- `src/http/main.js:12`：真实启动入口选择环境，但没有注入商业服务绑定。
- `src/modules/governance/repository.js:19`–`24`、`53`–`58`、`204`–`214`：账号状态、逐份合同读取授权、成员关系及当事方检查。
- `src/modules/governance/content.js:76`–`127`：字段、固定状态、内容校验和历史内容不随今天规则变化。
- `src/modules/governance/business-gate.js:4`–`28`：动作、服务条件、未启用原因。
- `src/modules/party/policy.js:5`–`17`：实际编号、请求编号、参数校验。
- `src/modules/auth/repository.js:22`–`27`：令牌、有效期和注销检查。
- `test/governance.integration.test.cjs:142`–`188`、`test/governance-service.integration.test.cjs:103`–`152`：已有隔离后端测试。

## 三个可以调用的 GET

三个请求均带 `Authorization: Bearer <当前登录令牌>` 和 `X-Acting-Party: <当前选择的本人个人或机构身份ID>`。不得静默换成另一个有权限的身份。

|用途|路径|允许的查询参数|成功数据|
|---|---|---|---|
|读取合同原文|`/api/v1/contract-snapshots/{snapshot_id}/content`|无；额外参数返回 400|`UnsignedSnapshotContent`|
|读取合同采用的某版规则|`/api/v1/rule-versions/{rule_version_id}/content`|必填 `snapshot_id`，且只允许这一个参数|`RuleContent`；从该合同保存的 `rule_contents` 中按 ID 找出|
|检查某项业务所需外部服务|`/api/v1/contract-snapshots/{snapshot_id}/business-readiness`|必填 `action`，且只允许这一个参数|`BusinessServiceReadiness`|

`action` 精确取值：`START_PAYMENT`、`START_IDENTITY_CHECK`、`START_SIGNING`、`START_DIGITAL_HUMAN`。它们分别检查支付、实名、电子签、数字人服务；请求本身不执行这些操作。

共同约束：

- 请求路径、身份头和规则查询中的 ID 在实际后端中均按**小写 UUID**验证。页面应把返回的 ID 当不透明字符串保存，按 URL 参数编码发送；手工录入时不得把业务名称、短示例 ID 或整数改造成假 UUID。
- `X-Request-Id` 可选，实际允许正则为 `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`；响应头与 `meta.request_id` 一致。不传时服务器生成。
- GET 无请求体要求，不需要 `Idempotency-Key` 或 `If-Match`。不要携带 `role`、`ready`、`environment`、`provider` 等额外查询参数。
- 成功 HTTP 200，JSON 为 `{ meta, data }`。三接口的 `meta` 均有 `request_id`、`actor: {account_id}`、`acting_party`。错误验证发生较早时，`actor` 或 `acting_party` 可以为 `null`。
- 全程 `Cache-Control: no-store`；内容接口不发 ETag，发送 `If-None-Match: *` 也应重新检查权限并返回 200 或实际错误，不返回 304。
- 没有合同/规则列表、公开创建、修改、删除、审批、下载或签署接口。当前合同 ID 需来自有权限人员提供的封存结果；页面不能编造列表或自动创建合同。

## 成功响应必须展示或保留的字段

### 合同原文 `UnsignedSnapshotContent`

下面字段全部必有，顶层不允许额外字段。`commitments` 和规则的 `terms` 内部是业务自定义 JSON。

|字段|实际类型/值|页面含义|
|---|---|---|
|`format_version`|固定 `contract-content-v1`|用于识别格式；不能把旧文件元数据按此解析|
|`id`|字符串 ID|合同内容编号，应与本次查询一致|
|`contract_version_id`|字符串 ID|合同来源版本编号，不是可下载文件编号|
|`party_ids`|1–100 个互不重复的 ID|当时的当事方；没有当事方名称，不能猜测名称或请求无权读取的机构资料来补齐|
|`created_at`|有效 ISO 时间，当前生成格式包含毫秒和 `Z`|封存时间，不能写成签约时间或生效时间|
|`rule_contents`|1–100 个 `RuleContent`|该合同当时保存的完整规则；内部 ID 和 `rule_key` 不重复|
|`commitments`|非空 JSON 对象，可含嵌套对象、数组、字符串、数字、布尔值、`null`|当时的承诺；保留键名和真实值，不擅自补价格、次数、期限|
|`object_version`|固定数字 `1`|该内容版本；不能据此提供编辑入口|
|`current_status`|固定 `SEALED`|显示“已封存”，不表示签署或许可生效|
|`signing_method`|固定 `NOT_SIGNED`|明确显示“未签署”|
|`content_sha256`|64 位小写十六进制字符串|内容校验值；不称为电子签、第三方存证、合法性或已授权证明|

没有 `content_asset_id`、`rule_version_ids`、`signing_evidence_refs`、`allowed_actions`、价格、订单付款状态或许可状态。规则编号从 `rule_contents[].id` 取得。不得沿用旧 `ContractSnapshot` 元数据类型。

### 历史规则 `RuleContent`

|字段|实际类型/值|页面含义|
|---|---|---|
|`format_version`|固定 `rule-content-v1`|识别规则正文格式|
|`id`|字符串 ID|本合同保存的规则编号，应与本次查询一致|
|`rule_key`|非空字符串，最多 100 个字符|规则名称键；不是可推导业务默认值的类型枚举|
|`version`|非空字符串，最多 64 个字符|保存时的版本标签，按原文显示|
|`terms`|非空 JSON 对象|条款原文；结构开放，不能只支持一个 `notice` 字段|
|`content_sha256`|64 位小写十六进制字符串|该版条款的内容校验值|

规则接口从已获准的合同副本中返回内容，不直接读取今天的规则状态。新规则上线或原规则退役后，历史合同仍返回旧原文。此 DTO 没有 `current_status`、`effective_at`、`object_version`、`content_asset_id` 或 `allowed_actions`；页面不得显示“当前有效规则”或“最新规则”。

正文使用普通文本组件或转义后的结构化展示；保留换行、数组顺序、`0`、`false` 和 `null`，禁止 `v-html`、HTML WebView 或执行条款中的脚本/链接。可折叠长对象，但不能截断后把未显示部分当作不存在。

### 外部服务条件 `BusinessServiceReadiness`

|字段|取值|
|---|---|
|`action`|上述四种动作之一，应与本次查询一致|
|`environment`|`SANDBOX` 或 `PRODUCTION`，由服务器启动配置决定；不允许客户端选择覆盖|
|`current_status`|`NOT_ENABLED` 或 `SERVICE_READY`|
|`reason_code`|未启用时为下面八种原因之一；`SERVICE_READY` 时必须是 `null`|

|未启用原因|页面可用说明|
|---|---|
|`PROVIDER_NOT_IMPLEMENTED`|服务尚未接入|
|`PROVIDER_NOT_CONFIGURED`|服务尚未配置|
|`PROVIDER_ENVIRONMENT_NOT_VERIFIED`|当前环境尚未验证|
|`PROVIDER_NOT_VERIFIED`|服务尚未验证|
|`PROVIDER_CONFIGURATION_CHANGED`|服务配置已改变，需要重新验证|
|`VERIFICATION_EVIDENCE_REQUIRED`|缺少服务验证记录|
|`PROVIDER_STATE_UNAVAILABLE`|暂时无法确认服务状态|
|`PROVIDER_ENVIRONMENT_MISMATCH`|服务环境不匹配|

`SERVICE_READY` 建议显示“当前所需服务条件已满足”。这只是某次读取时的前置检查，不是付款/实名/签署/生成完成，不是账号获准执行业务，也不代表合同已生效。后续真正执行业务的 API 必须再次检查服务和业务条件；本次页面不增加执行按钮。

`main.js` 在 `NODE_ENV=production` 时选 `PRODUCTION`，其余支持的开发/测试环境选 `SANDBOX`，且不传 `governanceBindings`。因此 PR12 当前真实启动入口对四种动作均返回 HTTP 200 + `NOT_ENABLED` + `PROVIDER_NOT_IMPLEMENTED`。隔离测试通过注入绑定可覆盖 `SERVICE_READY`，不能拿测试结果宣称供应商已经开通。

## 谁可以读，以及失败如何显示

一次成功读取同时需要：有效且未注销/过期的账号令牌、账号仍为 `ACTIVE`、该账号在所选身份下的成员关系为 `ACTIVE`、身份未 `SUSPENDED/CLOSED`、所选身份在合同 `party_ids` 内、账号拥有该份合同的独立 `governance_snapshot_readers` 记录。每次请求重新检查。

这里没有 OWNER 专享限制，也没有 OWNER 自动放行。普通成员在符合所有条件且取得独立读取授权时可读；负责人没有该授权也不可读。机构 `PENDING_REVIEW` 本身不是此读取代码的拒绝条件，不得擅自把它等同停用。`READ_PARTY` 或机构业务能力不代表合同读取授权。

|HTTP / 实际错误码|触发条件|页面处理|
|---|---|---|
|400 `ACTING_PARTY_REQUIRED`|缺少当前身份头|提示选择身份；不能自动尝试别人的身份|
|400 `INVALID_ID`|路径/身份/查询 ID 非实际允许格式，或规则缺 `snapshot_id`|提示编号/查询不完整；不展示旧内容|
|400 `INVALID_INPUT`|出现不允许的查询键|按请求错误显示，不降级到旧接口|
|400 `UNKNOWN_BUSINESS_ACTION`|缺失、未知或重复数组形式的 `action`|保持服务检查失败，不默认选支付|
|400 `INVALID_REFERENCE`|请求编号非法|说明请求未通过校验，保留可用诊断信息|
|401 `AUTHENTICATION_REQUIRED`|缺令牌、格式不符、令牌未知、已注销或过期|当前会话失效时清除私有页面并重新登录；旧会话迟到的 401 不应退出新会话|
|403 `ACCOUNT_NOT_ACTIVE`|账号已停用|隐藏正文，提示账号停用；不能以机构切换绕过|
|403 `ORIGIN_NOT_ALLOWED`|网页跨域预检不在允许名单|说明连接配置问题；不当成登录失败|
|404 `SNAPSHOT_NOT_FOUND`|合同不存在，或成员、身份、当事方、独立读取授权任一不满足|统一“内容不存在或当前身份无权查看”，不泄漏究竟哪项权限缺失|
|404 `RULE_NOT_FOUND`|指定规则不在已获准合同副本内|说明该合同下无法读取该规则；不能查新版本替代|
|404 `NOT_FOUND`|旧元数据路径、未实现路由或错误方法|保留服务尚未支持/无法读取的错误；不能用示例成功兜底|
|503 `SERVICE_UNAVAILABLE`|存储内容损坏、校验不符、数据库/依赖异常|隐藏本次内容，说明暂不可用；不显示底层损坏内容、SQL 或旧缓存|
|429 / 其他网关或网络失败|OpenAPI 保留 429；这三个 GET 未注册独立业务限流，仍需处理基础设施失败|显示真实错误；若有有效 `Retry-After` 则尊重等待时间，不编造秒数、不自动循环重试|

同一请求存在多个问题时，代码按顺序报出最先发现的问题；前端不能依赖所有坏输入都返回同一个固定码。重复 `snapshot_id` 会被 simple query parser 解析为数组并触发 `INVALID_ID`。内容校验的底层异常在 HTTP 层统一掩码为 503，不向用户暴露 `CONTENT_HASH_MISMATCH` 等内部细节。

## 与最新 PR11 以及旧响应的兼容问题

1. **沿用新账号会话。** PR12 使用同一套账号、身份与 `{meta,data}/{meta,error}` 封装。实际 Bearer 令牌是 43 字符的不透明值；旧 `legacy.jwt` 在后端测试中明确返回 401。不要根据 OpenAPI 中过时的 `bearerFormat: JWT` 自己解码、生成或转用旧登录。
2. **不要覆盖 PR11 新错误处理。** PR12 候选基于早期 PR11，错误处理仍固定 `retryable:false`，CORS 暴露头也没有 `Retry-After`。当前共同版本已对 `IDEMPOTENCY_IN_PROGRESS`、`COMMIT_OUTCOME_UNKNOWN`、`RATE_LIMITED` 按原因设为可重试，并返回真实限流等待秒数。未来整合应保留最新 PR11 修复，再增加 PR12 路由。本轮没有合并或改后端。
3. **查询可重发不等于写入重试。** 本次都是 GET，失败后的“重新读取”仍是同一账号/身份下的原查询；不能触发业务写操作。不要为接合同页面而放宽既有账号写入的幂等键、身份、请求体和版本保持规则。PR12 的 `retryable:false` 也不证明任何旧写操作确定失败。
4. **约定中的编号较宽，运行时更窄。** OpenAPI 通用 `Id` 是最多 64 字符的不透明字符串，而运行时请求验证为小写 UUID；`X-Request-Id` 约定允许的首字符也较宽。记录这一差异，前端用真实返回的编号，不把 schema 示例当可登录、可请求的实际记录。
5. **不要根据示例包版本选错 DTO。** 示例包根 `contract_version` 仍为 `0.2.0-rc.1`，其中同时保留未实现的旧 `ContractSnapshotResponse` / `RuleVersionResponse` 和新增的三个正文示例。按目标接口的 schema 选择后者，不用根版本号把新正文回退成旧文件元数据。
6. **拒绝旧或损坏的成功响应。** 只检查 `data` 存在不足以识别正文。至少验证当前格式、必有字段、固定状态、嵌套数组/对象及哈希字符串形状；旧 `content_asset_id` DTO、未知格式、缺正文、错误状态组合都显示“响应格式不受支持”，不补空对象、不当成功。客户端不必复制服务器的内容哈希算法；显示哈希不能冒称已独立验证。
7. **新增页面必须自己隔离请求时序。** Vue 已有会话 `capture/current` 与 `revision`，Flutter 有 `epoch`；可沿用会话/身份检查，但同一身份下更换合同、规则、动作或连续刷新还须用页面请求序号/取消机制。迟到的成功、错误、loading 收尾都不能覆盖新选择。A→B→A 切换也必须使旧请求失效。
8. **私有内容不持久化。** 不放进 localStorage、sessionStorage、旧 Preferences、离线缓存或日志。退出、身份切换、读取失败及失去权限后清除正文和服务状态；浏览器后退、App 返回旧页面不能恢复旧正文而跳过读取。可保留非敏感导航输入，但不把其存在当授权。

## App 与网页共同验收清单

下面是应由两端实现测试覆盖的用例，不是本轮测试通过声明。合成数据只能放在明确的测试 fixture 中；验收无需真实付款、短信或供应商服务。

|编号|准备与动作|必须观察到的结果|
|---|---|---|
|C01 基本读取|当前登录/身份，输入真实格式合同 ID，返回完整正文|仅发 GET 和正确身份头；展示 SEALED 为已封存、NOT_SIGNED 为未签署；没有下载/签署/支付/审批按钮|
|C02 历史条款|从合同某个 `rule_contents[].id` 打开规则|路径使用该规则 ID，query 带当前合同 ID；展示原 version/terms，不读“最新规则”|
|C03 完整内容|fixture 含两个规则、嵌套对象、数组、`0/false/null`、多行和 HTML/script 字符串|所有值可读且按纯文本显示，不执行 HTML，不丢失 false/0，不把未知条款改成默认价格|
|C04 服务未启用|四种 action 分别返回 NOT_ENABLED；覆盖八种原因|显示对应动作、环境与未启用说明；HTTP 200 不显示业务成功|
|C05 服务条件满足|SERVICE_READY + reason_code:null，分别 SANDBOX/PRODUCTION|只显示条件满足，合同仍未签署；不触发 POST 或自动开放业务按钮|
|C06 缺身份|未选择身份、空编号、缺规则合同上下文|无错误身份的网络请求；提示补全；不自动回退个人身份、不沿用上次内容|
|C07 跨身份|A 的合同读取未完成时切 B；B 无权限|立即清空 A 内容；B 请求带 B；A 的迟到成功/错误/收尾被忽略；B 的 404 不透露 A 内容|
|C08 同身份换查询|同账号同身份依次查合同 A/B，或规则 A/B，或动作支付/签署；第一请求后返回|仅最新查询的结果和 loading/error 可见；服务检查不能挂到另一个合同|
|C09 切换后返回原身份|A→B→A，最初 A 的请求最后返回|最初 A 的请求仍作废，不能因身份 ID 又相同而恢复|
|C10 退出/换账号|读取中退出；或账号1请求中退出再登录账号2|正文立即清空；旧成功不能出现；账号1迟到的401不能退出账号2；旧错误不能覆盖新页|
|C11 当前401/403|当前请求返回401或ACCOUNT_NOT_ACTIVE|当前401进入既有失效流程；停用隐藏内容；不留下旧正文或显示“验证码错误”来误导合同查询|
|C12 越权一致性|无reader grant的OWNER、无grant普通成员、有grant但非合同身份、失效成员分别返回404|统一不可见提示；不靠OWNER/READ_PARTY放行，不轮询其他身份找可读对象|
|C13 普通成员获准|普通成员有效且显式获准读取，接口200|可以展示内容，页面不能误加“仅负责人可读”门槛；服务动作仍只读|
|C14 权限被撤回|先读取成功，刷新后返回404/403；或退出再后退到旧页|旧正文/规则/服务状态清空，不能继续从缓存展示|
|C15 旧及坏响应|返回旧元数据DTO、未知format、缺字段、错误类型、NOT_SIGNED以外状态、SERVICE_READY带非null reason、未知状态或reason|明确格式错误，不用默认SEALED/NOT_SIGNED/NOT_ENABLED补齐，不把坏响应画成空的正常合同|
|C16 错误与恢复|400、404、503、网络中断、HTML网关错误、有效/无效Retry-After|保留真实失败状态和可用request_id；重新读取只发当前上下文GET；无假成功或无限重试|
|C17 缓存与请求格式|读取成功后重新读取；收到异常304；检查持久化与日志|不发条件缓存请求；304不能恢复缓存正文；新读取重新鉴权；持久化/日志无正文或令牌|
|C18 PR11回归|新页面读取失败后继续登录、身份切换、邀请原请求重试和退出|原有账号行为不退化，写入仍保留原幂等键/请求内容/版本/身份；旧错误处理不被带回|

后端联调时，再用隔离测试账号确认 C12/C13/C14 的真实权限差异、规则退役后的原文不变、损坏内容只返回 503，以及四项默认服务均未启用。浏览器预检配置与 `no-store`/无304属于 HTTP 联调证据；仅通过前端 mock 不能声称真实服务联调完成。

## 本轮交付边界

本文件已经核对真实路由注册、权限分支、字段构造、服务条件与已有后端测试断言，并将发现同步给 App、网页实现者。仍需两端分别执行上述相关测试、构建和界面检查；PR12 后端合入及真实联调由后续阶段处理。本轮没有替其他负责人声称已测试、已合入或服务已启用。
