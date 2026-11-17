# PM03 角色动作静态台账：W08 / W11–W15

基线：f15b5cc2。只读源码审计，不执行接口、测试、编译或浏览器。下表的“已接”仅指读到调用及对应后端路由，不代表运行验证。没有把“未测试”写成“未开发”。

路径缩写均相对源码目录：A = frontend_jingjingshangri_app/lib；O = frontend_ops_workspace/src；B = backend_server/src/http。端点统一省略 /api/v1 前缀。角色为页面意图和路由身份模式，最终权限仍须仓储校验，不能仅凭页面可见认定已授权。

## 共用恢复与文件边界
|动作|证据|结论|
|---|---|---|
|App交易原请求恢复|A/trade/trade_api.dart:81–141 pending/write/retry；参与结算恢复额外读取原参与进度|已实现原请求恢复，不等于重新创建付款|
|App现货/试镜/通告恢复|A/stock/stock_api.dart:31–65；A/auditions/auditions_api.dart:27–65；A/notices/notices_api.dart:27–71|各域restoreOperation保留；未知结果、版本变化不得跳过|
|App共创写入恢复|A/cocreation/cocreation_pages.dart:274–322 reconcilePending/recovered/act|实际恢复入口存在；并非只有静态表单|
|运营通用写入恢复|O/composables/useBusiness.ts:9–22，sessionStorage绑定context、原key、412重确认、身份变化清理|现货/试镜/通告/共创通用操作配置有恢复基础，不声称每个操作逐个验证|
|运营交易恢复/下载|O/composables/useTrade.ts:12–29，epoch/ticket、原command/key、checkPending、downloadLegacy|明确原请求与读取恢复；下载对象URL回收|
|App共创文件|A/engagement/community_support.dart:336–350 bytes检查epoch/party及可选SHA256；636–659 savePrivate|有身份核对与保存反馈；领取过程暂无具体片段级等待提示（可改善UI，不是缺下载能力）|
|后端私有文件|B/stock-routes.js:37–41；auditions-routes.js:33–34；notices-routes.js:36；cocreation-routes.js:11；production-routes.js:43–46|实际对象存储读取、哈希/长度校验、再次权限读取、no-store，不是公共静态链接|

## W08 新旧合同、订单、付款与退款
|角色/入口|动作与端点|前端证据|后端证据/边界|
|---|---|---|---|
|当事方，App合同/订单；运营合同阅读页|读取合同封存、引用规则及服务就绪：GET /contract-snapshots/:id/content、/rule-versions/:id/content、/contract-snapshots/:id/business-readiness|A/contracts/contract_api.dart:51–132；O/api/modules/contracts.ts:86–97；O/views/ContractsView.vue:94–116|B/account-api.js:144–149；封存与就绪不表示签署或付款。此阅读页未接电子签动作，不能伪造“已签”|
|提供方，运营/trade/specifications/new、/trade/quotes/new|建立规格/新版本与报价：POST /trade/specifications、/trade/quotes|O/router/tradeRoutes.ts:4–6；O/components/TradeSpecForm.vue、TradeQuoteForm.vue（表单细字段本轮未逐个复核）|B/trade-routes.js:17–18；报价含分期、规则、授权/商单/定制来源|
|独立审核人，/trade/reviews/...|审核规格/报价/退款/旧单：POST /trade/records/:id/reviews|O/router/tradeRoutes.ts:7；useTrade.ts:26–27|B/trade-routes.js:19；无acting-party的审核模式，不是买家自审|
|买家，App报价/原订单；运营订单|确认本版报价并选择权益：POST /trade/quotes/:id/acceptance；取消POST /trade/orders/:id/cancellation|A/trade/trade_api.dart:143–185；trade_pages.dart:564；O/router/tradeRoutes.ts:8|B/trade-routes.js:20–21；hash与expected_version存在|
|付款人，App收银台/运营payments|创建分期付款、对账：POST /trade/payments、/trade/payments/:id/reconciliation|A/trade/trade_api.dart:187–224；trade_pages.dart:530、1333；O/api/modules/trade.ts:128–137|B/trade-routes.js:22–23、31–32渠道回调；支持模拟标识和真实渠道结构，真实SDK交接/供应商配置本轮未核，不能宣称真实扣款闭环|
|退款申请人、审核/执行运营|POST /trade/refunds；/refunds/:id/execution；/refunds/:id/reconciliation|A/trade/trade_api.dart:228–254；trade_pages.dart:1395；O/api/modules/trade.ts:138、151–153校验可退金额|B/trade-routes.js:24–26；申请、审核、执行、对账分开，不能把售后决定当到账|
|历史资料运营、旧单当事方|登记POST /trade/legacy-orders；读取records；审核；下载GET /trade/legacy-orders/:id/evidence/:asset/content|O/router/tradeRoutes.ts:5、7–8；useTrade.ts:28；A/trade/trade_pages.dart:1403–1429只读历史条款/附件编号|B/trade-routes.js:27–30；App明确私有附件在运营网页按权限下载，属于有意边界，非遗漏买家下载按钮；旧报告付款不追认为渠道付款|

## W11 现货影片、许可与退款
|角色/入口|动作与端点|前端证据|后端证据/边界|
|---|---|---|---|
|卖家，App上架/编辑；运营listings|读取销售说明/本人资格/参与人；上传正式片；POST /stock/listings及/:id/revisions|A/stock/stock_api.dart:67–93、144–155、239起；O/business/stock.ts:8、11–12|B/stock-routes.js:14–15、19–24、33；正式片/独立预览/权利依据是不同字段，不能以预览冒充交付|
|平台销售说明拟定与独审|POST /stock/sales-publications；/:id/reviews|O/business/stock.ts:5、13–14|B/stock-routes.js:16–18；独立复核后卖家选用|
|内容审核人、权利审核人|读私有正式/预览/证据；POST /stock/listings/:id/reviews、/reviews/:id/status|O/business/stock.ts:9、17–19|B/stock-routes.js:21、23、39–40；双审及暂停，不只是上架状态切换|
|买家，App视频详情/已购|读取offer、许可及预览；POST /stock/checkout|A/stock/stock_pages.dart:206–273；stock_api.dart:95–142、169–196；O/business/stock.ts:6–7、15|B/stock-routes.js:25、31–32、38；本版offer_sha256绑定下单；公开App列表使用哪条公开适配路由本轮未展开，不能把运营catalog权限直接等同App|
|卖家|下架POST /stock/listings/:id/status|O/business/stock.ts:16；App listing action页面细分本轮未逐项复核|B/stock-routes.js:22；停止新售不应删除历史合同|
|买家，已购详情|GET /stock/purchases/:id/content；POST receipt/acceptance|A/stock/stock_pages.dart:301–343；stock_api.dart:197–238；O/business/stock.ts:7、20–21|B/stock-routes.js:26、41；文件观察与本人收讫/验收独立|
|买家、售后独审运营|POST purchases/:id/cases；/case-resolution（refund_minor、license_action）|O/business/stock.ts:10、22–23；App purchaseAction同上|B/stock-routes.js:26；KEEP/REVOKE必须分别验证；退款执行回到W08，不能把许可处置混同退款到账|

## W12 人工定制、版本与私人交付
|角色/入口|动作与端点|前端证据|后端证据/边界|
|---|---|---|---|
|个人/机构有效身份的创建本人；App/customization；运营/mine|读品类/本人列表/详情；POST /customization-requests；PATCH /:id；POST /:id/submissions|A/customization/customization_api.dart:64–197；customization_page.dart:458–601；O/router/customizationRoutes.ts:4–6；O/stores/customizationOwn.ts|B/customization-routes.js:95–115；API parse校验created_by和party；有真实草稿，不是独立手记或公开分享|
|创建本人|原补充草稿、正式重提、历史提交、关联报价|A/customization/customization_api.dart:215–282；customization_page.dart:502–601；O/api/modules/customizationOwn.ts|B/customization-routes.js:127–149；保存不等于正式重提，保留原请求|
|创建本人/获准处理者|附件列表、上传、下载、撤回与原上传恢复|A/customization/customization_attachments.dart:77–215；O/api/modules/customizationAttachments.ts|B/customization-routes.js:77–91；上传绑定与正式提交分开|
|受理专员，运营/operations/customization|GET队列；POST intake；POST supplements；看提交历史及原报价|O/router/customizationRoutes.ts:7–8；O/stores/customization.ts:17、61–80|B/customization-routes.js:119–149；本人视图与运营受理视图区分|
|制作承制方/获派专员|原订单建项目、分派、上传文件、提交样片/成片版本|O/router/productionRoutes.ts:4、7–10；O/api/modules/production.ts；A/production/production_api.dart（方法逐项未展开）|B/production-routes.js:16、18–19、36；实际项目必须原单来源，不是自由生成即交付|
|独立制作审核人|项目/版本/生成独审POST /production/records/:id/reviews|O/router/productionRoutes.ts:12；O/composables/useProduction.ts|B/production-routes.js:17；审查细粒度检查本轮未逐项复核|
|买家/制作方，原项目履约|GET fulfillment/story；POST start、delivery-receipt、reissue；版本反馈POST /versions/:id/feedback|A/production/fulfillment_api.dart:13–106；O/api/modules/customizationDelivery.ts:44–47；O/router/productionRoutes.ts:5、11|B/production-routes.js:20–26；样片确认、最终验收、付款和下载各自办理|
|原单当事方、独立售后处理者|POST projects/:id/cases、case-resolution、refund-sync；私有证据GET cases/:case/evidence/:asset|A/production/fulfillment_api.dart:35–108；O/api/modules/customizationDelivery.ts:45、48；O/router/productionRoutes.ts:6|B/production-routes.js:22–24、46；OPEN补证独立端点未在本轮路由看到，不应造补证按钮|
|有权查看/领取方|GET versions/:id/content?variant；story附件；manual-sample-content|A/production/private_video.dart及production_api.dart（保存平台分支本轮未展开）；O/api/modules/production.ts|B/production-routes.js:43–45；真实文件路由已开发，未运行验证；不可把版本可读当全款或许可满足|
|人工样片双方|POST manual-sample、manual-sample/confirmation；GET manual-sample|A/production/manual_sample_page.dart；O/api/modules/customization.ts（UI动作逐行未核）|B/customization-routes.js:92–94；是独立本版确认，不自动签合同|

## W13 试镜预约与履约
|角色/入口|动作与端点|前端证据|后端证据/边界|
|---|---|---|---|
|艺人/服务方，App offer；运营offers|建立方案、公开预约/价格范围、位置同意|A/app.dart:231–247；A/auditions/auditions_offer_form.dart；O/business/auditions.ts:9、17–18|B/auditions-routes.js:10、12–13；精确定位独立权限，不推断公开|
|预约人，公开catalog或有效邀约|读取方案、POST bookings、已审预约checkout|A/auditions/auditions_api.dart:85–118；O/business/auditions.ts:8、11、19–20|B/auditions-routes.js:14–15、26–28；付款另走W08|
|独立审核人|方案/预约/交付/改期/追加范围审核及安全争议决定|O/business/auditions.ts:16、34–43|B/auditions-routes.js:10、14、17、21–22、35–37；检查实际证据，不由本人自审|
|受约方/履约方|POST decision、travel、delivery；读取真实交付选项|A/auditions/auditions_actions.dart:119–226；auditions_api.dart:118–163；O/business/auditions.ts:21–23|B/auditions-routes.js:16、25；取样照片/视频/授权分别提交|
|预约双方|POST receipt/confirm/cancel/dispute-evidence/reschedule/reschedule-response|A/auditions/auditions_actions.dart；O/business/auditions.ts:24–29|B/auditions-routes.js:16–18、22；取消与退款核定不等于自动到账|
|双方/客服|联系卡同意、会话、行程、客服介入、已读；原材料下载|A/auditions/auditions_api.dart:172–212；O/business/auditions.ts:12–14、30–33|B/auditions-routes.js:19、22、31、34；运营风险读取:24，私有争议证据:33|
|追加范围发起/购买方、审核人|提出supplements、独审、supplements/checkout、退款决定|O/business/auditions.ts:15及后续operations；App预约详情已接追加读取、发起、独立结算与原订单跳转，详见后附逐动作补核|B/auditions-routes.js:35–39；确有后端能力，App连接完整度仍待补核，不能直接记缺开发|

## W14 通告、意向与商单
|角色/入口|动作与端点|前端证据|后端证据/边界|
|---|---|---|---|
|浏览者/发布方，App通告频道；运营catalog/announcements|GET catalog、详情、规则/eligibility；POST announcements|A/notices/notices_api.dart:73–113；A/notices/notices_pages.dart；O/business/notices.ts:10–18|B/notices-routes.js:13、24、30–34；普通通告不能擅加星探门槛；准确资格由规则返回|
|发布方/已投稿人|修订原通告、历史读取、确认本版变化|A/notices/notices_history.dart、notices_revision_request.dart、notices_confirmation.dart；notices_api.dart:27–71、130–145|B/notices-routes.js:14–15、23；版本hash与原请求恢复存在|
|投递人/邀约人、接收方|POST submissions（实际三类型）、decision、close；读取本人材料/选项|A/notices/notices_submission.dart:50–179；O/business/notices.ts:12、20–23|B/notices-routes.js:16、18–19、28–29、36；感兴趣转客服，不是签约或付款|
|机构、资格/内容独立审核人|申请qualification；登记fact/rule；独立reviews；官方通告|O/business/notices.ts:14–19、24–33|B/notices-routes.js:10–12、17；不是普通用户虚构充值或成长|
|客服转单专员|GET CASE/assignment-options/history/quote-options；POST assignment、quote|O/business/notices.ts:16、25；赋派UI本轮未逐项核|B/notices-routes.js:20–21、25–27；App CASE不是实时客服或补件聊天；报价联入W08|
|商单需求方、艺人/代理方|商单requests、offers、acceptance；MCN relations、decision及handover|A/gigs/gig_pages.dart:480–602；O/router/gigsRoutes.ts:3–5；O/composables/useGigs.ts|B/gigs-routes.js:17–24；原商单提案转报价 O/router/tradeRoutes.ts:4|
|商单双方/客服|原订单消息、联系卡、文件；客服moderation/control；佣金记录|O/business/auditions.ts:45–51 conversations；A/gigs/gig_pages.dart:585文件入口|B/gigs-routes.js:25、33–40；会话付款/接单门槛仓储细节本轮未展开，不能仅凭路由宣称验证|

## W15 共创
|角色/入口|动作与端点|前端证据|后端证据/边界|
|---|---|---|---|
|本人故事发起方，App/cocreation?view=new；运营rooms|GET creation-options；POST rooms绑定本人已提交故事、承制方和规则|A/cocreation/cocreation_pages.dart:487–694；O/business/cocreation.ts:5、14；cocreationCreation.ts|B/cocreation-routes.js:3–4；不是仅保存草稿就自动开房|
|发起方、明确被邀本人|POST rooms/:id/invitations；GET invitations；本人join|A/cocreation/invite_panel.dart；cocreation_pages.dart:696–925、927起；O/business/cocreation.ts:6、15–16|B/cocreation-routes.js:3–4；同一真人计数，不能替人授权|
|参与本人|读取/更新member、withdraw；本人材料文件|A/cocreation/cocreation_pages.dart:927起；O/business/cocreation.ts:7、17–18|B/cocreation-routes.js:3–4、11；private_story/material/sharing_allowed独立字段|
|发起方/运营核定方|截止close、申请EXTEND/RESUME/CANCEL、sync原单退款|A/cocreation/cocreation_pages.dart:696–925；O/business/cocreation.ts:8、19–21、27|B/cocreation-routes.js:3–4；申请不等于自动延期、取消或退款|
|独立审核人|规则review、cases review、queue|O/business/cocreation.ts:12–13、23–25|B/cocreation-routes.js:3–4；人数与有效条件细节仍需同一记录链路验收|
|获派制作方、片段独审|GET rooms/:id/materials；POST snippets；GET review-file；POST snippets/:id/review|O/business/cocreation.ts:9、22、26；App未接制作方材料列表/片段提交，运营已接；详见后附权限与来源依据|B/cocreation-routes.js:3–4、11；真实文件/对应本人/成片版/审核条件均非静态占位|
|本人片段领取者|GET snippets、snippets/:id/file；核对原member与分享选择|A/cocreation/cocreation_pages.dart:396–435；O/business/cocreation.ts:10|B/cocreation-routes.js:11；审核通过不等于当次全部授权有效，后端snippetFile具体条件本轮未逐行展开|
|权益本人|GET benefits、转真实权益目录|A/cocreation/cocreation_pages.dart:437–450；O/business/cocreation.ts:11|B/cocreation-routes.js:4；20人是一份不可提现服务额度，不是全部制作免费|

## 可执行下一批与不能误记的缺口
1. 低风险UI候选：本人片段下载记录级等待提示；已有安全下载链，不是新增下载或分享权限。需独占cocreation页面，不动后端授权。
2. 已补核：W13追加范围的App发起/付款/原单退款入口已接；独立退款核定由运营办理。W15制作方片段提交只在运营端接入，App无对应制作材料/片段提交页，不能把本人领取页视作提交页。详见补核表。
3. 明确保留：App旧单证据只展示编号，独立运营网页下载；没有理由把运营私有附件下载复制给普通用户。合同阅读页是封存/规则/就绪，不是签署页。
4. 本轮未逐行审仓储角色判定、真实支付SDK/环境配置、所有调用链分支。上表不是全量完成证明，也不是端到端通过证明。
5. 同事待验：前后端版本记录一致，按同一记录ID执行登录→最小写入→运营读取；W11商品/许可→订单→模拟付款→权益→播放下载→KEEP与REVOKE售后分别处理；随后普通通告及W12–W15原单链路。均未执行。

## 追加补核：W13 App入口、付款与退款（源码调用追踪）

|角色/动作|入口与完整调用|权限/恢复/结论|
|---|---|---|
|服务方提出追加范围|A/app.dart:235–249 /auditions/booking与/action；auditions_pages.dart:370–371 action导航；922–927“提交已付试镜的独立补差约定”；auditions_actions.dart:338–345构建title/terms/amount_minor/expires_at；539–600 V5Form POST /auditions/bookings/:id/supplements|actions.dart:454–458真正canSubmit：非买家、ACCEPTED、paid_at存在、未出发、无改期。外层入口未检查paid_at，但动作页会检查。恢复金额反填564–570，返回SUPPLEMENT且parentId绑定原预约590–592。**已接，不是缺追加功能**。|
|双方读取追加记录|auditions_pages.dart:274–278详情加载；928–934逐条显示金额/条款/状态/截止；auditions_api.dart:165–170 GET /auditions/bookings/:id/supplements|读取真实返回列表。后端src/modules/auditions/supplements.js supplements方法固定LIMIT 100，不是分页全量保证；不应宣称任意数量全部追加单已读。|
|买家确认已审追加订单|auditions_pages.dart:935–968：有order_id时跳转/trade/record；无order_id且买家且APPROVED显示V5Form POST /auditions/supplements/checkout，带supplement_id、supplement_sha256、channel；成功进入原订单|api.dart:15、27–64恢复白名单包含/supplements/checkout，按ORDER解析；不是单纯按钮占位。后端supplements.js:13 checkout再次核buyer、原单ready、hash/状态/截止，建立独立supplement分期并保留original_order_id/contract_sha256。|
|追加付款与对账|独立订单复用A/trade/trade_pages.dart:948–955收银台；964–978付款退款列表；1315–1335付款对账；trade_api.dart:187–224 POST /trade/payments及/:id/reconciliation|已有原交易链，不另造追加支付。CUSTODY选项明确“服务未接通”，不能记成余额支付可用；真实支付供应商运行仍未验。|
|独立客服核定追加应退金额|O/business/auditions.ts:43–44 review-supplement/supplement-refund；POST /auditions/supplements/:id/refund-decision|后端src/modules/auditions/supplements.js:10 supplementRefundDecision要求AUDITION_SUPPORT、版本、已付/部分退原追加订单、金额不超净额，写REFUND_REQUIRED与refund_limit_minor。App无独立客服核定入口，**符合运营角色分工，不是应向买家开放的按钮**。|
|买家申请/跟踪实际追加退款|追加订单→付款记录→trade_pages.dart:1336–1347“申请逐项退款”→app.dart:251 /trade/refund→trade_refund_form；订单下退款列表964–978，退款详情1395 reconciliation|后端supplements.js:15 refundAllowed要求REFUND_REQUIRED、仅supplement分配且累计不超核定额。已有通用退款入口，不能称买家可自行核定追加退款。待改善候选：追加卡目前仅展示状态/金额/条款/截止，未显式展示refund_limit_minor/refund_reason及“先由独立客服核定”的定向提示；需保留真实字段和后端限制。|

## 追加补核：W15 App发起方与制作方的不同范围

|角色/动作|入口/API/源码|结论|
|---|---|---|
|发起方建立房间|A/app.dart:351–354 /cocreation按view/recordId进入；cocreation_pages.dart:128–161读取本人已提交故事，487–580 creation-options与createRoom，582–694表单|已接真实来源选择及POST /cocreation/rooms；不是仅有路由。当前new加载会遍历故事分页（有重复cursor拒绝），性能上限可另审，不影响已有能力判断。|
|发起方邀请|roomView:800–832按allowed_actions INVITE展示InvitePanel与已关联真人选择；OPEN且enabled才POST rooms/:id/invitations并带object_version|已接；家人邀请还有独立invite_panel，不能描述成伪静态“分享链接”。|
|发起方截止核定/原单|roomView:834–858，CLOSE才显示POST rooms/:id/close；真实order_id/project_id跳转/trade/record与/production/project|已接原订单付款和主片制作入口，不是新建孤立订单。|
|发起方延期/取消/恢复/同步|roomView:859–910 REQUEST_CANCEL权限分支，选择CANCEL/EXTEND/RESUME、原因及新截止，POST rooms/:id/cases；POST rooms/:id/sync；load:207–210读取cases|已有实际写入与读取。act/reconcilePending:274–322保留原请求/版本；没有把申请当立即成功或退款到账。|
|制作方读取获派成员材料|App全lib搜索rooms/.../materials、review-file、SUBMIT_SNIPPET无调用；cocreation_pages.load:128–225只接new/room/join/member/claim/invitations/members/snippets/benefits/rooms；菜单334–349亦无制作材料|**App未接**。运营O/business/cocreation.ts:9已接GET /cocreation/rooms/:id/materials；后端src/modules/cocreation/delivery.js:4、10要求关联project、producer_party_id与assignee_account_id同时匹配及生产条件核验，返回锁定production_member_ids/cutoff.member_ids中的分页材料。不能对发起方仅因创建房间就开放。|
|制作方提交独立本人片段|App无POST rooms/:id/snippets；本人片段listView:396–435只是领取与查看原参与记录。运营O/business/cocreation.ts:22已有提交配置|**App未接而运营已接**。后端delivery.js:12 submitSnippet要求同项目READY mp4、当前APPROVED FINAL、文件不能等于整片正式/预览文件、member属于房间生产名单；生成IN_REVIEW。若后续补App，必须先提供获派生产身份/房间来源、真实独立文件与版本选择及原请求恢复，不可复用成员上传或假“下载完成”。|
|独立片段审核|运营O/business/cocreation.ts:13、26；GET review-file、POST snippets/:id/review|后端delivery.js:5–7 reviewFile要求COCREATION_REVIEW且与发起/制作方无活跃关联，当前有效参与指纹及当前成片/文件哈希；不能把此动作放在普通成员或制作方自审页。|
|本人领取|A/cocreation/cocreation_pages.dart:217–218、396–435；GET snippets，APPROVED时savePrivate snippets/:id/file|已接本人领取，不是制作方上传，也不等于公开分享能力。|

补核仅文档更新，没有修改源代码、功能测试或接口执行。后端权限依据此次具体追到了auditions/supplements.js及cocreation/delivery.js；其余仓储未扩大审计结论。

## 当前续批处理
本表追加退款限额/原因显示候选已按真实字段补入App追加卡，见APP_W13_SUPPLEMENT_REFUND_FACTS.md；累计核定上限不等于本次退款或到账。W15制作方已有管理网页，App无同功能不自动列新增开发义务，待端分工要求核定。全部运行验证留整批联合测试。

## 集中候选最终有界静态复核
W13 追加卡核定退款累计限额/原因已落源码。W14 原 Web 新投稿现接 useNoticeSubmissionContext 的当前正文/规则与版本 hash 确认，原请求恢复保持；后端在幂等前重核资格/有效期的边界仍在。W15 制作材料、片段提交和独审已有 Web 分工，不要求重建同款 App 工作台。
本次只复核台账待核/未接条目，未发现额外证据充分的可独立新增前端动作，不等于全仓穷尽或运行通过。当前未提交候选详见 PM03_CONCENTRATED_CANDIDATE_SCOPE.md；本轮不测试、合并或部署。
