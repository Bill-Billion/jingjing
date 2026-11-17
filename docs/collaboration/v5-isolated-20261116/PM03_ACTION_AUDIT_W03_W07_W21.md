# PM03 角色动作核查：W03、W04/W05、W06、W07、W21

基线 f15b5cc2。仅源码阅读，未测试、编译、发业务请求或操作页面。不是全端验收。
路径简称：A 为源码包 frontend_jingjingshangri_app/lib；W 为 frontend_ops_workspace/src；B 为 backend_server/src。

## W03 普通通告

|角色动作|入口、端点与源码|结论|
|---|---|---|
|成年实名本人发布|A/app.dart:391–410 /notices/new；W/business/notices.ts:18；POST /notices/announcements|已有。B/modules/notices/context.js:15–30 的已审 VERIFIED_ADULT_20261111 规则支持普通发布；旧规则不机械覆盖。|
|机构资质与发布|A /notices/qualification；W/business/notices.ts:24；POST /notices/qualifications|已有，限定有效已审类别。|
|官方岗位发布|W/business/notices.ts:19|已有专属动作，不能授予普通发布者。|
|独审内容/材料/资质|W/business/notices.ts:17,28–33；POST /notices/records/:id/reviews；GET /notices/records/:id/materials/:asset_id|已有材料读取和明确审核；提交不等发布。|
|本人或受托投稿/邀约|A/notices/notices_submission.dart；W/business/notices.ts:20–21；POST /notices/submissions|已有本人/委托门禁，意向不是授权签约。|
|接收方回复|A/notices/notices_pages.dart；W/business/notices.ts:22；POST /notices/submissions/:id/decision|INTERESTED/DECLINE 已有，不开放陌生人自由聊天。|
|授权当事人读取修订历史|A/notices/notices_history.dart；GET /notices/announcements/:id/history|App已接，发布者与投稿者权限不同。|
|原发布者申请修改|A/notices/notices_revision_request.dart；POST /notices/announcements/:id/revisions|App已接，独立待审，不直接修改公开通告。|
|本人阅读后确认新版|A/notices/notices_confirmation.dart；POST /notices/submissions/:id/notice-confirmation|App已接，非合同/录用/付款或新授权。|
|不确定结果恢复|A/notices/notices_api.dart:29–59；W/composables/useBusiness.ts:11–24|原内容/版本/key保留，先查原记录再恢复；未实测。|

### 全 Web 精确复查
全 W 目录检索 notice-confirmation、notice_snapshot、notice_version、notice_sha256、NOTICE_REVISION、revision-request 及 announcements/history/revisions，并查看 notices Domain 和 BusinessView，未检得三项专用历史/修改申请/新版确认入口或调用。BusinessView:401 通用原约定 JSON 展示不等于修订历史分页或明确确认写入。

PM03_EXECUTION_20261115.md:7、27、41 要求按所需角色串联，不能据此推导本人动作必须在 Web 重复实现。App 已有三项。当前仅列“Web未检得，角色端分工待核”，不列明确待开发。运营审核修订的必需入口是否有缺口，尚需沿审核路由/记录类型完整追踪，不能从上述本人端点未接推断。

## W04/W05 资料副本

|角色动作|入口、端点与源码|结论|
|---|---|---|
|本人申请查询/副本|A/privacy/privacy_pages.dart:277–548；W/business/privacy.ts requests/request；POST /privacy/requests|已有同申请读写。|
|本人分类及分页读取|A/privacy/privacy_copy_panel.dart:127–181、privacy_copy_sources.dart；W/components/business/PrivacyCopyPanel.vue、business/privacyCopy.ts|GET /requests/:id/copy-options 与分类/来源接口已接；全类别覆盖未穷尽。|
|本人导出及取得原文件|A/privacy/privacy_copy_panel.dart:184–216；/requests/:id/copies/:copy_id/content|JSON页面导出与真实副本下载分开，文件带 content_sha256；真机保存待验。|
|运营同申请取数、整理、上传、拟答复|W/business/privacy.ts operations/response；W/views/BusinessView.vue 私有材料上传区|已有上传与 evidence_asset_ids；正式原件/留存依据不能用结构化回执冒充。|
|另一人核文件与脱敏|W/components/business/PrivacyEvidenceReview.vue:9–33；B/modules/privacy/repository.js:20–22|PRIVACY_HANDLE/PRIVACY_REVIEW 分离，禁止本人/提案人自审。|
|本人获准答复文件、历史、异议|A/privacy/privacy_pages.dart:848,1257；W privacy requests/history/reopen；B/http/privacy-routes.js:26–27|已有运营/本人分权下载；答复不代表全部删除。|
|中断恢复及失权清理|A privacy act/reconcilePending；W/useBusiness.ts:11–24（位于 composables）|原请求恢复机制存在；同申请真机与异常场景待联测。|

## W06 机构五动作：纠正范围

最新 PM03 不要求把原管理网页重建为 App 模块。此前“App未检得批量入口可优先补开发”不成立，不作为已确认缺项或待开发。

|机构角色动作|现有代码|结论|
|---|---|---|
|艺人送审入队|W/views/ArtistsView.vue:26 queueListing；:196 ArtistForm @batch|本轮补查已精确定位；此前待核解除，未运行验证。|
|影片送审入队|W/views/BusinessView.vue:92,341 STOCK_LISTING|已有。|
|拟定新价格|W/components/business/OrganizationBatchPanel.vue:35–48 PRICE_REVISION|原listing/version和金额按分，非改旧订单。|
|经纪分派入队|W/views/BusinessView.vue:92,341 MCN_ASSIGNMENT|已有。|
|制作负责人分派|W/components/business/OrganizationBatchPanel.vue:35–48 PRODUCTION_ASSIGNMENT|已有真实项目、有效成员选择。|
|整批预览/提交|W/views/BusinessView.vue:403；OrganizationBatchPanel.vue:50–59；POST /engagement/mcn/batches|已有有效机构与整批明确确认。|
|逐项结果/原批恢复|OrganizationBatchPanel.vue:61–70,89；business/organizationBatch.ts:5–13|GET批次ID或operation_key，区分成功/拒绝/待恢复/不可读取/未运行，保持原key与内容。|
|逐人逐动作权限|B/http/engagement-routes.js:16–19；modules/engagement/batch.js:14–35|有效机构成员及原业务授权，重放重核权限、成功项不重办。|

App /mcn 的关系记录入口不是批量网页的替代，也不证明缺少所需端能力。五动作已有源码链，整批部分成功、失权、恢复仍待集中联测。

## W07 条件匹配

|角色动作|证据|结论|
|---|---|---|
|登录用户明确条件匹配|A/discovery/public_discovery.dart:157–267,470–565；W/views/DiscoveryView.vue:24–38；/discovery/matches|已有类别/城市/关键词及类型专属条件。|
|理由、分页、进入原业务|W/business/matching.ts:3–24；A activeFilters/cursor/seen|ARTIST/STOCK/AUDITION/NOTICE 已有，不代表接受或许可。|
|明确匹配与推荐分离|B/http/discovery-routes.js:26–27|matches 与 recommended-matches 不同；推荐路径全端范围未核。|

## W21 隐私与注销

|角色动作|证据|结论|
|---|---|---|
|本人六类权益申请|A/privacy/privacy_pages.dart；W/business/privacy.ts request；POST /privacy/requests|查询/复制/更正/删除/注销/投诉已有。|
|本人提出具体执行方案|A/privacy/privacy_pages.dart:856；W privacy propose/execute|具体目标、已审规则、明确确认已有，申请不是执行。|
|运营答复、另一人独审|W privacy response/review、execution-review；B/privacy repository|版本/hash、脱敏、留存与未完成项已列。|
|本人执行已审注销和恢复|A/privacy/privacy_pages.dart:905–987、closure_reference.dart|专用恢复引用，不把可能完成的注销走普通重复重试。|
|运营核期限/延期/结案|W privacy closure-queue/closure-operations；B/http/privacy-routes.js:31等|真实方案与独审已有；不代表历史版本、备份和多方钱账全部删除。|

## 当前结论
本轮无新增已证实必须开发的角色端缺口。Web通告三项未检得专用接入，但必须先明确必需角色端范围。资料副本、机构五动作、条件匹配、注销已有实际源码，不能重列未开发。未穷尽类别覆盖、实际文件、失权及恢复继续保留，整批开发后集中联测；不提高任何全端验收状态。
