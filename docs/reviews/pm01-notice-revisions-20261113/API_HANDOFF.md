# 通告修订后端接续说明（前端暂停，不代表已认领）

接口0.31.60-rc.1、迁移0212。chengcongcong222负责后端；Bill-Billion仅原UI，当前不要求用户转发或启动前端工作。

|入口|用途及前提|
|---|---|
|POST /api/v1/notices/announcements/{record_id}/revisions|发布方提交完整notice与reason；If-Match为当前通告版本，Idempotency-Key固定。官方通告不传X-Acting-Party，须专门权限。类型、项目归属不可变。返回NOTICE_REVISION待审记录|
|POST /api/v1/notices/records/{record_id}/reviews|沿用独审入口审核修订记录，If-Match是修订记录版本；批准时仍检查原通告版本、发布人权限、期限、项目和内容限制。拒绝/撤回保留旧公开版|
|GET /api/v1/notices/announcements/{record_id}/history|发布方/审核员查看草稿与历史；原申请人只见已批准修订及旧公开内容，不含审核人员身份。cursor/limit按ID分页；current给当前完整快照|
|POST /api/v1/notices/submissions/{record_id}/notice-confirmation|仅原申请方操作；If-Match是申请版本，正文notice_version与notice_sha256须对应history.current，原键重试不重复。确认不改变原notice_snapshot|

所有正文变化均作为需重新确认的条件变化处理，属于实施补全；不是甲方逐字指定的交互流程。未确认时申请独审/意向/新报价关联受阻；可以撤回申请。原已关联旧报价不能因确认新条件而重新可接受；需重新申请并表达意向，由客服将当前申请与独审报价明确建立新关联。已成立及已付款订单保留原合同，不做静默改价或自动退款。

新增notice_snapshot、notice_acknowledgement、revision_id、quote.notice_revision_id均为增量字段；旧记录无快照时保持缺失，不用当前正文补造过去。NOTICE_REVISION为新增记录类型；当前页面未接续这些入口，旧页面遇到需确认/旧报价冲突会收到明确错误，不能视为页面已验。审核方使用既有NOTICE_REVIEW独审授权，官方通告发布方另须NOTICE_OFFICIAL；审核员不因本项被要求兼任官方发布方，不自动授予新权限。

主要错误：NOTICE_REVISION_ACK_REQUIRED、NOTICE_QUOTE_REVISION_CONFLICT、NOTICE_CONTENT_MISMATCH、NOTICE_REVISION_SCOPE_INVALID、VERSION_CONFLICT。独审通知失败整体回滚；原申请人受众及当前权限继续使用已有通知检查。真实推送未启用。

新申请提交补强：GET /notices/catalog/{id}返回notice_sha256；向POST /notices/submissions提交已修订通告时，必须同时带notice_version与notice_sha256，分别取当前公开记录object_version及notice_sha256。旧客户端对从未修订通告仍可省略；已修订通告缺这两个值或已过时即明确拒绝。成功后的原键重试返回原申请，不会改绑后来的修订。

历史不可撤销：仅IN_REVIEW修订可以通过既有close入口撤回。APPROVED修订是历史依据，不可单独撤回；若要停止发布，操作原通告的下架入口，保留已经生效的历史修订。
