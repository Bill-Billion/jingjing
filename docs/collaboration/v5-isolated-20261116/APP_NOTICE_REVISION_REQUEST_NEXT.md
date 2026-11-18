# 已发布通告修改申请：下一批实现方案

仅静态阅读当前前后端源码，未修改App、未发请求、未测试。当前新版确认实现完成后，须重读最新模型/API/恢复方法，保留新增能力，不覆盖已有改动。

路径前缀：晶晶日上工程交接包/01_源码；后端以下相对backend_server/src，前端相对frontend_jingjingshangri_app/lib。

## 后端已有契约
http/notices-routes.js:14：
POST /api/v1/notices/announcements/:record_id/revisions。
body仅notice、reason；If-Match是原NOTICE的object_version，X-Acting-Party是本人当前主体，Idempotency-Key沿既有机制。不传新rule_id或自选base_snapshot。

modules/notices/revisions.js:43–54：
先读取原NOTICE并核当前访问权限。非官方必须原owner，继续publicationActor成年实名/代表权；官方要求无acting party及NOTICE_OFFICIAL运营权限，普通App不得提供官方修改入口。
在REVISE幂等命令内核原NOTICE版本，validate，再拒绝内容完全不变的NOTICE_REVISION_UNCHANGED。
返回新NOTICE_REVISION，owner沿原单、parent_id为原NOTICE，状态IN_REVIEW，data含rule_id/rule_sha256、notice、base_snapshot、reason、review:null。不是原NOTICE，也不是已发布修改。

## 内容校验与不可改字段
modules/notices/policy.js:6、8、32：
- notice精确字段：type/title/description/city/valid_from/valid_until/details/project_id/accept_submissions。
- 标题160、正文8000、城市80、各类型details字段2000；必填及私联信息限制沿后端text/label，不在客户端放宽。
- 日期需有效且开始早于结束；修订validate还要求截止时间晚于服务端当前时间。
- details按原type精确匹配。仅DRAMA、RECRUITMENT可accept_submissions=true。
- reason使用label上限2000，不应错误称它也采用公开正文的text私联检查。

modules/notices/revisions.js:11–19：
- 原单须PUBLISHED且不是子记录；隐私限制仍生效。
- type和project_id必须与原单完全相同，包括null；不可在表单切类型、选择项目或把非空项目改成null。
- 项目须当前有效归属原owner；按原rule检查当前发布资格及机构范围，不能用历史星探限定替换现行普通成年实名规则。
- 即使前端显示入口，仍可能被当前资格/权限拒绝，不能视入口为授权证明。

## 表单复用方案
notices_pages.dart当前_noticeForm是新建路径：suffix=/announcements、包含rule_id、project_id固定null，成功导航返回记录id。因此不能直接用于修改请求。

建议独立修改申请页面/panel，复用字段构造及noticeFacts，而不改变原新建提交：
1. 读取原NOTICE，严格核kind/id/owner/PUBLISHED及非OFFICIAL。
2. 展示原内容、版本与修改申请边界；类型和关联项目只读。
3. 从原notice初始化标题、城市、正文、日期、details和接受投稿开关；不得自动补默认内容。
4. 新增真实必填reason。buildBody仅notice/reason；type/project_id取冻结的原记录，不从输入或全局ruleId取值。
5. 日期需沿原V5本地/UTC转换，保证未修改日期不会丢精度或改变语义；实施时静态核对现有转换，不制造“未编辑却变更”。
6. 使用唯一V5Form动作“提交修改申请”，version绑定原NOTICE；提交前明确说明独立审核前公开内容保持不变。
7. 不提供不存在的保存草稿能力；沿原离页未保存确认。

## 响应模型与成功导航
现NoticeRecord不接受NOTICE_REVISION。已有历史模型NoticeRevisionItem可校验发布者完整形态，但应补一个明确的修改响应解析方法，校验kind、owner、parent、版本、内容hash、状态及base_snapshot，不能直接用api.validateRecord把成功响应当非法普通记录。
正常新申请预期IN_REVIEW；幂等缓存仍可能返回创建时状态，不推断当前审核结论。

成功后进入原NOTICE的私有授权历史：
/notices/history?noticeId=<原NOTICE>&sourceRecordId=<原NOTICE>
或显示真实修订编号并提供该入口。不能按旧onSuccess用返回的修订id直接跳到当前尚不支持修订详情的普通页。
/records列表不支持kind=NOTICE_REVISION（repository.js:51），不可发明“我的修订列表”查询；按原NOTICE授权历史查看审核进展。

## 幂等和pending恢复
modules/notices/context.js:12按账号、REVISE、operation_key及完整输入指纹重放结果。资格/访问检查在command之前；原单版本/状态校验在command内部，不应前端预先用新状态阻止合法原请求重放。
保留account_api既有指纹/未知结果机制，不新增key绕过pending。

拟改NoticesApi：
- recoveryLabel仅增加精确/announcements/<UUID>/revisions路径。
- restoreOperation按该路径分支：读取原NOTICE核仍可访问，retry原body/原version/原key，使用修订响应解析器。
- 不将新内容或最新版本覆盖pending；不得仅为恢复把最新版作为If-Match。
- 页面恢复字段从pending.notice与pending.reason读，明确标记原申请待核。
- 列表V5RecoveryPanel现onRestored默认按r.id导航，需针对修订结果按可信parent_id导航原NOTICE授权历史；保留其他创建/回复/新版确认恢复行为。
- 原pending可能在页面外恢复，因此响应解析和导航不能仅放在表单局部。

## 审核结果与并发
modules/notices/revisions.js:21–40：
- 独立审核拒绝仅将修订设REJECTED并保存意见，原公开内容不改变。
- 批准要求content_reviewed/materials_reviewed/no_private_contact全true；重核原NOTICE版本和base_snapshot摘要，并再次检查作者当前发布资格。
- 批准后修订APPROVED，原NOTICE更新内容/revision_id并保持PUBLISHED；相关投稿留下NOTICE_REVISED审计，后续可能需新版确认，不自动同意或授权。
- 不提供前端自审或“立即发布”。
- 后端未在revise方法中限制同原单只有一条待审修订；不能宣称服务端已去重所有并行申请。界面可提示已有可见待审记录，但分页局部不能冒充全量。
- 多修订基于同原版本时，一个批准后其余可能因版本冲突不能批准；不能自动移植到最新版本。
- 本批不顺带增加撤回修订。后端虽有IN_REVIEW修订close能力，须单列用户动作、模型和恢复范围才能接。

## 刷新/错误策略
- 412：读取最新原NOTICE，清楚提示基线已变；保留用户草稿但不可静默更新If-Match继续提交。重新对照后明确确认新基线。
- NOTICE_REVISION_SCOPE_INVALID：保留只读type/project_id，停止并重读；不得自动改项目。
- NOTICE_REVISION_UNCHANGED：提示正文与原通告相同，不循环自动重试。
- NOTICE_NOT_OPEN/NOTICE_PERIOD_INVALID/NOTICE_PUBLISHER_NOT_ELIGIBLE及身份许可拒绝：提示具体原因，关闭新提交，保留可恢复草稿与原pending边界。
- 网络未知/5xx/IDEMPOTENCY_IN_PROGRESS：只恢复原请求，不另造申请。
- 每次await后先mounted/ticket/epoch/party检查再发布；切身份/离页不回写旧私有内容。
- 刷新、表单重挂载和审核状态变化都不得自动接受新版通告或覆盖原合同。

## 拟动范围与待验
拟动notices_api.dart、notices_models.dart、新修改申请页面及app.dart路由、notices_pages.dart本人私有详情入口和修订恢复导航；复用现历史组件与V5Form，不改后端/API合同、公共幂等机制或官方运营流程。
待同事验证：本人/接收方/机构权限、type/project保持、日期转换、私联内容拒绝、未改内容、原单关闭、资格失效、申请未知结果恢复、审批拒绝/批准、多申请基线冲突、投稿新版确认独立性、身份切换/离页与权限撤销。全部为待验，不称运行通过。
