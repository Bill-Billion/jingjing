# PM03 整批候选接收、四项接口答复与环境

前端已由用户明确交付 `handoff/v5-isolated-20261116` 的 **1d9c0fc4938f71a89ba6ab3f7bca453f47872ac0**。本侧已实际 fetch 并读取17范围总索引和三份角色动作台账；其中“20文件本地未提交”是提交前的写作状态，以本次用户交付的准确SHA为准。前端文档已明确引用53f6c485的两份共同计划，双方执行依据一致。

阶段由“等待集中开发候选”进入“候选已收、后端补齐具体缺项与整批联测准备”。集中交付→整体联合测试→阶段末审阅的顺序不变。不得恢复逐路线排队门槛，也不得因为本候选未编译/测试而认定违约。

后端增量基于53f6c485，发布在原草稿[PR39](https://github.com/Bill-Billion/jingjing/pull/39)及其分支 `core/full-business-closure-20261028`；取包含本文的准确提交并登记。接口 **0.31.79-rc.1**，数据库迁移 **0225**（225项实际应用，无新增SQL）。前端1d9c0fc4包含旧后端8a7ac311/0.31.78-rc.11，**不包含本批5个读取接口的端侧接入**；不能将旧后端响应当新契约使用。

## 四项确认结果与端侧接续

所有路径以下均省略 `/api/v1`。除监护接口外，使用原账号 Bearer 和原办理主体 `X-Acting-Party`。GET不产生新业务操作。

|范围|实际结论与新增接口|前端需一次性接续的动作|
|---|---|---|
|W18监护充值退款|原监护关系只给子女账户，不能据此冒充子女钱包。本批新增 `GET /wallet/guardian-recharge-refund-options?guardian_link_id=...&limit=20&cursor=...`|先账户级 `GET /guardians/records` 选择当前本人监护LINK，再取本接口给的 `child_party_id` 和已到账原充值；按原 `POST /wallet/guardian-recharge-refunds` 建案。两接口及POST不带X-Acting-Party，不手填儿童主体/充值ID，不使用儿童凭据。|
|W14/W19未知结果|原POST确实在幂等回放前核截止/资格，409不能说明之前没成功。本批新增 `GET /notices/operations/{operation_key}?operation=SUBMIT` 和 `GET /engagement/operations/{operation_key}?operation=NOMINATE`（同时支持VOTE/APPEAL）|保留原账号、主体、正文、版本、key，未知结果优先查询原key。按下方COMMITTED/NOT_OBSERVED语义处理，不能改key重办或因409清掉pending。当前原POST资格规则保持。|
|W16券占用|原来只有建立/解除，没有按HOLD ID读取。本批新增 `GET /redemption/holds/{record_id}`|离页保留HOLD ID；回来读取当前COUPON_HOLD及ETag，以其版本办理。GRANT版本不能代替；已绑单占用先按订单规则处理。|
|W22商业分佣规则|原办理POST需要rule_id，但普通办理者没有合法目录。本批新增 `GET /projects/candidates/{record_id}/participation-rules?limit=20&cursor=...`|已确认人选的本人OWNER读取候选适用目录，展示/选择规则版本、摘要、有效时间和财务条款，再按原参演提交。免费参演返回空目录，不手填规则ID。|

监护选择每次重核当前本人、双方账号、有效实名年龄和有效监护关系；撤销、过期或无权拒绝。仅返回该子女已到账RECHARGE的ID、版本、金额、累计已退款和币种，不开放完整钱包、支付凭据、银行资料或其他孩子信息。`amount_minor - refunded_minor`仅是原充值金额上界，已消费/冻结不能直接当作建案拒绝；核定金额、处理任务与真正到账仍分别处理，独审不能自审。

原key回执的 `COMMITTED` 表示已经找到原成功事务，返回 `record_id / record_kind / request_sha256 / original_object_version / original_status`。`request_sha256`使用现有 `digest` 的规范化原方法输入（含party_id、operation_key及该接口正文映射字段），不是当前详情摘要，也不是客户端随意拼接字符串的hash。original_*是原提交快照，不能覆盖当前版本或视为当前权利。当前详情、文件仍走正常授权接口；失去当前账号/主体权限时不提供历史敏感结果。

`NOT_OBSERVED`只说明这次没有读到成功事务；原请求可能仍在途，**不等于失败、未扣费、可换key重办**。前端必须保留未知状态；需后台核查时附脱敏原key和上下文。查询本身不会补提交或放宽截止/资格。初次POST明确业务拒绝与网络未知后的查询要分开。

HOLD读取不自动释放或修改状态。HELD即使时间已过，仍应结合expires_at和实际办理响应解释；读取到的object_version属于占用记录。W22目录复用现有分佣快照规则，筛当前EFFECTIVE、已到生效时间、COMMERCIAL及22%平台口径，并核财务条款、主体和机构关系；过滤后页可能为空但有next_cursor。最终POST重新验证并冻结规则，目录不等于签署或独审批准。

## 整批本机环境

沿用[原隔离MySQL、短信、文件与停止恢复操作](PM03_LOCAL_ENVIRONMENT_20261115.md)。前端在自己的电脑按仓库源码创建新环境，不复制另一台电脑的数据库、地址、state/access或8小时旧凭据。Node22、MySQL8、FFmpeg等依赖仍须本机准备；不读取生产.env，不开公网。

在准确后端候选的工作树根目录执行，路径按本机实际配置：

```powershell
$env:JX_MYSQL_TEST_ENV_FILE=(Resolve-Path '.local/mysql/runtime/test-env.json').Path
$env:FFMPEG_PATH=(Get-Command ffmpeg).Source
node scripts/stock-sandbox.cjs --pm03-batch
# 在另一个终端运行；ENV目录取READY输出，不照抄别人机器的随机目录
node scripts/pm03-batch-smoke.cjs '.local/stock-sandbox/ENV目录'
# 停止保留数据；也可Ctrl+C或终端quit
New-Item -ItemType File -Path '.local/stock-sandbox/ENV目录/stop' -Force
# 等STOPPED后，同提交、同源码、未过期才恢复
node scripts/stock-sandbox.cjs --pm03-resume '.local/stock-sandbox/ENV目录'
node scripts/pm03-batch-smoke.cjs '.local/stock-sandbox/ENV目录' --verify-retained
```

8小时从创建开始计算，恢复不延期；127.0.0.1动态端口，停止不删库/文件。受控access.json给出实际HEAD、源码摘要、API版本、实际迁移版本与数量、角色、业务ID和请求模板。所有人经真实短信挑战/会话接口登录，本机短信文件取合成验证码；无公共验证码接口，原种子token撤销。凭据文件不可入Git/聊天/构建包。修改提交或受测源码后必须建新环境，不编辑state绕过核验。

本次准备47个角色入口、45个独立账号、32组样例，复用既有多业务种子并增加当前普通通告、原投稿回执、已审监护关系及历史充值。MCN负责人/员工是相应账号的不同办理主体，不是新增全能账号；运营授权限时，正常当事方与独审分开。

|环境覆盖|本批可用范围与限制|
|---|---|
|现货/普通通告/原key/监护退款|真实HTTP已核登录、选择、建案、原key与越权拒绝；原现货模拟付款退款工具保留。未代端侧完成付款页面验收。|
|券/参演|实际锁券、按原HOLD读取与跨主体拒绝；本人有效分佣目录及参演读取通过。原key专项另验证跨截止恢复。|
|试镜/评选/共创/机构/隐私/运营|有多状态业务记录，HTTP读取已验证；包括20人共创及独立片段、MCN员工视角、本人资料申请。不能将读取检查等同每角色全部写动作通过。|
|文件|现货及共创有合成可播放MP4；试镜照片/视频仍有旧占位字节，不能用来通过试镜媒体和实体机视觉验收。|
|支付/退款|交互模拟支付商户目前为现货卖方；其他预制付款为合成历史事实。跨商户新付款、监护退款外部处理到账等全业务模拟适配尚未齐，不能宣称所有资金链常驻可跑。|
|商单/正式发行等|`commercial`与原`notice`样例明确保留历史契约；当前普通通告另在`ordinary_notice`。正式发行、真实渠道/财务签收等仍须原范围资料，不能以老样例替新契约整链验收。|

整批环境是统一准备工具，样例数不是功能完成数；仍缺的媒体、跨商户模拟和当前商单履约样例由后端接续准备，不把已有代码重新派给前端。当前配置只回环，原生模拟器/实体机接法及Flutter视觉验收仍需实际设备；不以独立npm预览代替App。

## 验证与下一批责任

本轮5文件44项后端检查通过；新回执采集格式修正后该文件另4项通过。439份实际HTTP响应通过0.31.79-rc.1契约校验。整批环境15组HTTP检查以及停止恢复的原会话、同HOLD ID/版本、同监护退款案件检查通过。具体原始输出、源码清单和限制见[本轮报告](../reviews/pm03-batch-readiness-20261118/REPORT.md)。旧2334项是前批全量结果，不代本候选全量；本轮不是App/Web或端到端业务验收。

前端集中接这4组明确增量（5个GET）并更新自己的CURRENT/三份逐动作表；后端继续补上述环境缺项，双方记录准确候选与兼容性。固定版本后统一构建实际App和原管理网页，按17范围台账以同记录ID覆盖当事方、机构、独审、恢复、权限、支付退款和文件，最后Flutter实机视觉检查及维护者阶段末审阅。前端本轮源码交付被接受，但未代其确认已经读取或接入本次新增契约。

本侧未开发修补前端，未覆盖EXPERIENCE_CURRENT；未合入、未部署、未启用真实/收费/生产/公网，未动3490及离线APK。全局18组0/18、12整链部分、151为19/124/8保持。用户现在不需提供儿童资料或口令；可把本文件及PR39准确提交提醒前端接收。
