# PM03 W16–W20、W22 角色动作源码台账

基线 f15b5cc2；仅静态阅读现有 App、原 frontend_ops_workspace 和 backend_server。没有运行测试、请求业务接口或核实线上部署。W21另表。表中“已接”仅指发现路由、实际读写调用及恢复代码，不表示该角色的所有动作齐全或运行通过；“未核”不能当作未开发。

路径缩写均位于 `晶晶日上工程交接包/01_源码/`：A=frontend_jingjingshangri_app/lib；O=frontend_ops_workspace/src；H=backend_server/src/http；M=backend_server/src/modules。HTTP端点下文省略 `/api/v1`，`:id`为对应原记录编号。

## 共用入口和恢复证据

- App入口：A/app.dart:166–176 钱包，:256–281 参演/发行，:345–363 活动/兑换/交接，:177–192 财务。
- 原网页并非静态定义：O/router/businessRoutes.ts:3–5由domains生成 `/:domain/:section/:recordId?`；O/router/index.ts:69挂载。O/views/BusinessView.vue:343把已选择operation的path、body、party、method、原version交给ui.execute。
- 通用网页实际读取/写入/恢复/文件：O/composables/useBusiness.ts:15–22，sessionStorage保留原command/key；先check原readPath再execute原请求；当前身份、代际变化丢弃旧结果；file受当前身份和pending保护。这不能替代每条业务返回值校验或完整角色验收。
- App活动/兑换/交接/参演通用恢复：A/engagement/community_support.dart:501–584 act/recover，:596–631明确核对及原编号恢复；各页reconcilePending决定先读什么。兑换页:404–444、活动页:350–372、参演页:448–455可见对应核对。
- 财务/项目采用专用写入恢复，不冒用上面通用恢复：O/composables/useFinance.ts、useProjects.ts；A/projects/project_api.dart:126–244含结果核对与原记录确认，A/finance/finance_api.dart:240–332含写入结果/原约定关联。此轮未逐行穷举两端每一种冲突分支。

## W16 积分、券与实际抵扣

|角色/动作|App实际落点|原网页实际落点|后端及结论|
|---|---|---|---|
|本人读晶钻、签到、核原单所得|wallet/wallet_pages.dart:305–340、566–594；summary/records读取65–140|business/wallet.ts:3、7–8：summary/records、check-in、earnings/sync|H/wallet-routes.js:16、18、29–30；已接，不把消费成长当可提现余额|
|本人读目录与券包、按原约定兑换|redemption/redemption_pages.dart:160–248、637–657；act exchanges带stock_id/template_sha256|business/redemption.ts:8–9、16|GET redemption/catalog、grants；POST exchanges；H/redemption-routes.js:13、23–26；已接|
|本人从共创领取服务额度|redemption_pages.dart:625–676；POST service-credits|business/redemption.ts:17|POST redemption/service-credits；原benefit/stock绑定。已接，不是现金退款|
|本人按准确制作报价锁券|redemption_pages.dart:944–1009；checkout生成hold并带回原quote/hold版本|business/redemption.ts:18|POST redemption/grants/:id/checkout；H/redemption-routes.js:9。前端有实际调用；最终下单抵扣及退款返券全链本轮未核|
|本人取消未确认锁券|redemption_pages.dart:1018|business/redemption.ts:19|POST redemption/holds/:id/release；H/redemption-routes.js:10。已接|
|权益提供方登记真实库存|App redemption页未发现stock提交；运营原生入口本轮未核全局|business/redemption.ts:26；required party|POST redemption/stock；H/redemption-routes.js:11。原网页已接，不写App已齐|
|独立运营审库存|App redemption页未发现独审动作|business/redemption.ts:15、28；none party|GET queue；POST stock/:id/review；H/redemption-routes.js:12、23。有网页动作，具体岗位授予/回避运行未核|

## W17 抽奖与奖品兑现

|角色/动作|App实际落点|原网页实际落点|后端及结论|
|---|---|---|---|
|本人读概率、单抽/十连、读原结果|redemption_pages.dart:1069–1201；draws写pool_id/rules_sha256/count；404–444恢复原结果|business/redemption.ts:10–11、24–25|H/redemption-routes.js:8、23；已接，不自动重抽|
|活动登记方提交奖池|App redemption页未发现pool登记|business/redemption.ts:27，实际成本、奖项库存绑定|POST redemption/pools；同H文件posts定义；网页已接|
|业务/财务分别审奖池、停止新抽|App redemption页未发现审核/retirement|business/redemption.ts:29–30；channel RULES/FINANCE|POST pools/:id/review、retirement；网页已接，不能把两个岗位合成一次批准|
|本人绑定人物/曝光档案|redemption_pages.dart:875；逐项人物授权|business/redemption.ts:20|POST grants/:id/bind；H/redemption-routes.js:14。已接|
|履约方提交本权益排期/完成依据|App redemption页全文未见fulfillments或evidence-submissions|business/redemption.ts:13、21|GET fulfillments；POST grants/:id/evidence-submissions；H/redemption-routes.js:15、23。明确App该页未接，网页已接|
|运营提真实排期|App redemption页未发现该动作|business/redemption.ts:31|POST grants/:id/deliveries；H/redemption-routes.js:16。网页已接|
|另一岗位审核排期|App redemption页未发现该动作|business/redemption.ts:32|POST deliveries/:id/review；H/redemption-routes.js:17。网页已接|
|本人接受/拒绝排期|redemption_pages.dart:903–910|business/redemption.ts:22|POST grants/:id/confirmation accepted bool；H/redemption-routes.js:18。已接|
|运营记录真实兑现|App redemption页未发现finish|business/redemption.ts:33|POST grants/:id/finish；H/redemption-routes.js:19；面试未入选也是明确结果，不等同获得角色|
|本人申请补救 / 独立运营处理|本人redemption_pages.dart:928；独审未见|business/redemption.ts:23、34|POST grants/:id/remedies、remedies/:id/review；H:20–21。本人App已接，独审网页已接|
|独立运营查看履约证据文件|App该页未见独审文件入口|business/redemption.ts:15及通用file|GET redemption/records/:id/evidence/:asset_id；H/redemption-routes.js:28。授权受后端核验；不是公开下载|

## W18 钱包会员与充值退款

|角色/动作|App实际落点|原网页实际落点|后端及结论|
|---|---|---|---|
|本人读生效规则并开户|wallet_pages.dart:450–470、约898；wallet_api/models|business/wallet.ts:3、6|POST wallet/accounts；H/wallet-routes.js:15、28。已接|
|本人申请充值、看原付款|wallet_pages.dart:471–532 POST recharges；:975–977链接trade原付款|business/wallet.ts无recharge operation且note仍称资金未接通；consumer/controller.ts仅有充值消费保护适配，不等于充值表单|H/wallet-routes.js:17有接口；App已接，原网页钱包域直接充值动作缺口；真实渠道开通状态未核|
|本人六级资质申请 / 独立审核|wallet_pages.dart:598–630本人申请；App独审未核|business/wallet.ts:9、12|POST level-six与/:id/review；H:19–20。双角色网页有动作，App仅本人已核|
|运营录钱包规则 / 独审规则|App运营入口本轮未核|business/wallet.ts:10–11；页面自身提示无待审规则详情读取|H:13–14、28仅生效规则读取；待审详情不足是已知边界，不应盲批|
|本人申请原充值退款、读列表详情、取消未发送申请|App lib全文未命中recharge-refunds|O/src全文未命中recharge-refunds|H/recharge-refund-routes.js:11、13–17已有POST/GET；两端明确未接；不是“未测试”|
|监护人以自己身份申请、读取本人的代办申请|App全文未命中guardian-recharge-refunds|O/src全文未命中同端点|H:12–15已有；两端明确未接；不得切换成儿童主体冒充本人|
|独立退款岗位审申请|未接|未接|H:18–19 review；M/wallet/recharge-refunds.js:59–72。权限WALLET_REFUND_REVIEW，不是普通商单售后|
|独立岗位安排内部发送任务|未接|未接|H:18–19 scheduling；M/wallet/recharge-refund-jobs.js:14–25。任务排入不代表渠道退款成功|
|独立岗位重试已有任务|未接|未接|H:18–19 retry；jobs:28–37。不是创建第二笔退款|
|独立岗位下载本申请核验文件|未接|未接|H:22；M/wallet/recharge-refunds.js:51–57。只有运营详情给evidence_asset_ids，不能借本人读取获原件|

### W18精确实施计划（仅计划，未写源码）

1. **新增专用模型，不能复用WalletRecord或TradeRecord。** M/wallet/recharge-refund-view.js:3–9为扁平投影：id/current_status/object_version/recharge_id/requested_minor/amount_minor/currency/reason/created_at/submitted_at/settled_at/applicant_kind/task_scheduled；仅运营详情另有evidence_asset_ids。没有kind/owner_party_id/content_sha256/data。现有A/wallet/wallet_models.dart:132–142要求这些字段，直接复用会错误拒绝或诱使虚构字段。运营列表也使用普通view，只有详情有文件ID（refunds.js:46）。
2. **本人页面**从原SUCCEEDED充值详情进入，提交recharge_id、正整数分amount_minor、reason最多2000字符、1–20不重复evidence_asset_ids。文件必须本方REVIEW_EVIDENCE；申请金额不超过原充值减已退。余额已消费/冻结不阻止建案，不要前端以available余额拒绝申请；审批时才核可退来源（refunds.js:16–26、64–69）。GET列表分页limit1–100/cursor；读详情；仅IN_REVIEW/APPROVED提供取消候选，仍由服务器核版本和状态。
3. **监护代办页面**走无X-Acting-Party的guardian-recharge-refunds；额外child_party_id/guardian_link_id。后端要求当前账号为有效LINK监护人，child为对应个人主体，证据归监护人自己的PERSON主体（guardian.js:4–19）。不能复用本人owner gate。没有监护专属取消端点，勿造“代取消”；本人取消仍需实际钱包主人。有效关系查选与儿童充值来源选择本轮未核，下一批须先验证可用读取契约，不能让前端越权枚举儿童钱包。
4. **运营页面**GET operations/recharge-refunds列表/详情（无acting party）；独立权限WALLET_REFUND_REVIEW，且对退款记录与原充值都做回避（refunds.js:7、12–13、30；context.js:16–18排除创建者及钱包主体活跃成员）。前端不依据空allowed_actions假定能审；后端为最终门禁。
5. **审核**POST /operations/recharge-refunds/:id/review，If-Match原version、原Idempotency-Key；decision仅APPROVE/REJECT（不是APPROVED），amount_minor、reason、checks固定四键identity_verified/source_verified/refund_basis_verified/relationship_verified。REJECT amount=0；APPROVE前三项true，监护申请另须relationship_verified=true，正额≤requested；只接受IN_REVIEW。先读明确文件再勾核验，不代填通过。
6. **调度/重试**scheduling body={}，可选状态APPROVED/SUBMITTING/UNKNOWN；retry body={reason}要求task_scheduled及后端许可状态，不能仅凭UI推断任务一定可重试。两者均If-Match及幂等。task_scheduled布尔不是job ID；不展示虚构任务进度。内部handler/渠道适配默认关闭（jobs.js:2），不可把按钮当真实退款接通。
7. **恢复**每次保存原路径/body/version/key与身份；结果未知先GET原详情或本人/监护人列表核对，再重放原请求，不新建退款或改key。context.js:37–41按actor+op+key和整输入fingerprint去重。服务未提供按operation_key查询专用端点；不能捏造恢复查询。412后重读不默默覆盖原请求；避免把新版本当原未知请求版本。
8. **文件和状态边界**GET operations/recharge-refunds/:id/evidence/:asset_id只允许该申请列出的证据且重验来源。SELF/GUARDIAN不返回证据ID或渠道敏感信息。状态IN_REVIEW、APPROVED、REJECTED、CANCELLED、SUBMITTING、UNKNOWN、SUCCEEDED、CLOSED分别显示；UNKNOWN非失败未扣；CLOSED不等同成功到账。applyVerifiedReceipt仅签名校验/查询适配可调用，绝不能做前端“填回执确认成功”表单（refunds.js:83–102）。

## W19 曝光、排行榜与冠军

|角色/动作|App实际落点|原网页实际落点|后端及边界|
|---|---|---|---|
|公众读人物榜、买家榜、活动、曝光|engagement_pages.dart:218–288、330–335|business/engagement.ts:11–17|GET engagement/rankings、buyers、competitions、exposures；H/engagement-routes.js:21。不是本人收益或实际奖励到账|
|本人设参榜档案|engagement_pages.dart:795–821 profiles|business/engagement.ts:26–27含人物/买家榜|POST profiles / buyer-city-profile；App本轮只核人物提交，买家参榜提交未核|
|本人提名参选|App engagement页全文仅见候选展示，未见candidates写调用|business/engagement.ts:29|POST engagement/candidates；网页已接，App全局lib补核未找到engagement/candidates写入或nominate入口；仅项目域candidates不能替代，属本人App候选缺口|
|本人以晶钻投票|engagement_pages.dart:387–433 owner PERSON与canVote；竞争页剩余次数|business/engagement.ts:30|POST votes，GET votes；有实际扣点调用，不是按钮示例|
|本人申诉|engagement_pages.dart:676|business/engagement.ts:31|POST appeals；已接|
|本人读奖励/取证书|engagement_pages.dart:834–859 download rewards/:id/file|business/engagement.ts:16|H/engagement-routes.js:24实际文件与sha256校验。已接，不把优先机会当已经出演|
|运营定榜/活动/候选审核/评判|App该活动页未发现独审提交；全局运营未穷举|business/engagement.ts:33–42，各动作单独operation|POST rules/review、rankings、competitions/review、candidates/review、judgments；已定义并走实际通用执行，独立角色分配未运行核|
|风控审票/申诉处理/平票双审/正式决议|App该活动页未发现对应操作|business/engagement.ts:43–47|votes/:id/review、appeals/:id/resolve、tie-reviews、tie-reviews/:id/review、competitions/:id/finalize；网页已接，不自动完成平票|
|奖励提供方登记 / 运营审库存 / 记录交付|App该活动页未见运营兑付|business/engagement.ts:32、38、48|reward-stock、review、rewards/:id/redeem，真实证据/时间/位置；网页有动作，真实奖品兑现未核|

## W20 机构员工及旧单交接

|角色/动作|App实际落点|原网页实际落点|后端及边界|
|---|---|---|---|
|机构负责人读员工授权并逐人委托|engagement_pages.dart:304–311、948–1055；isOwner门禁|business/engagement.ts:7–8、19|GET mcn/dashboard、mcn/staff；POST mcn/staff，person_ids/actions/valid_until；已接，不是只有看板|
|负责人撤回成员委托|engagement_pages.dart:970–978|business/engagement.ts:20|POST mcn/staff/:id/revoke；已接|
|负责人单笔派试镜/商单|engagement_pages.dart:1090|business/engagement.ts:21|POST mcn/assignments，booking_id/order_id/account_id；已接|
|受派员工读受限看板|engagement_pages.dart:21–50按账号筛assignments；:931–944限定受派订单应计|business/engagement.ts:7；网页角色过滤细节本轮未核|GET mcn/dashboard；App已有受派视角，不能说员工完全未开发；材料/会话全部动作本轮未穷举|
|负责人批量清单与原批次恢复|App engagement页未命中batch/mcn/batches|O/business/organizationBatch.ts:7校验逐项结果；BusinessView.vue有加入清单/批量看板入口|H/engagement-routes.js:17–19 POST/GET mcn/batches和/:batch_id；网页已有批量，App该页无批量入口，其他页未穷举|
|关系双方读解除后旧单并逐笔确认|contract_six/contract_six_pages.dart:88–89、174–230读；:556–563填order_id/note/version；:779–实际旧单显示|business/handover.ts:2，/handover/orders/:recordId；GET与ack共用原关系|H/gigs-routes.js:19–20 GET/POST relations/:id/handover；双方动作有代码，7天及旧授权由后端控制，不把逾期补记当恢复权限|
|有MANAGE_MEMBERS的机构管理者邀请/撤回|account/account_page.dart:234–260、285–299；:651–674实际按钮|WorkspaceView.vue:123–125、167–168；api/modules/account.ts:23、25|H/account-api.js:邀请/撤回parties路径；两端已有真实调用和版本，不是MCN委托替代|
|被邀请人本人接受/拒绝|account_page.dart:263–282、639–642实际按钮|WorkspaceView.vue:174；account.ts:24|POST parties/:party/invitations/:id/responses，ACCEPT/DECLINE；H/account-api.js:129。两端已接|
|机构管理者移除ACTIVE普通员工|account_page.dart:301–314、651、680–694；排除OWNER|WorkspaceView.vue成员表移除；account.ts:26 DELETE|H/account-api.js:135；两端已有。移除后授权如何停止由后端控制，此轮未运行复验；不是本人主动退会入口|
|成员列表/收到邀请读取与未知恢复|account_page.dart:103、152及_session.pending/write；受MANAGE_MEMBERS门禁|account.ts:10–11、15–26保留key/version；WorkspaceView.vue:加载/act|GET me/invitations、parties/:id/members；已接。历史发出邀请列表接口未开放，App仅保留本次登录回执（account_page.dart:675–677），不能称完整发件箱|

## W22 参演、发行与清算

|角色/动作|App实际落点|原网页实际落点|后端及边界|
|---|---|---|---|
|出品方为已选候选建参演约定、已付变更|projects/participation_pages.dart:1055–1248 body与act；读取267–318|business/participation.ts:18、24|H/projects-routes.js:18–24；candidates/:id/participations、participations/:id/amendments。保留旧款及新会签，不把试镜当商用权|
|各方确认准确参演版本 / 出品方启用变更|participation_pages.dart:897、931；证据核对415–444|business/participation.ts:19、25|confirmation/activation带hash与version；H:19、23。已接|
|出品方结账、登记里程碑、撤回未绑定约定|participation_pages.dart:977、1015；trade/participation_checkout_page.dart；App路由app.dart:227|business/participation.ts:20–22|trade/participation-checkout；projects/participations/:id/milestones、withdrawal；已接，真实渠道支付本轮未核|
|独立岗位审参演 / 收入约定|App此页未核运营独审入口|business/participation.ts:28–29，none party及checks|H/projects-routes.js:16、22；网页有独审提交，不等于所有账号获权限|
|出品方立未来收入约定 / 受益方会签|participation_pages.dart:1242、1275及income分支|business/participation.ts:26–27|projects/:id/income-agreements、income-agreements/:id/confirmation；H:15–17。未来收入不是已到账|
|权利方读取参演依据文件|participation_pages.dart全文件无download/api.evidence/读取原证据按钮；evidenceFields:1042–1050仅上传，项目链接:711、1036仅去父project，不是本约定证据。project_pages.dart:850–893有通用材料按钮但限定项目owner；不能当本人参演会签页已接|business/participation.ts:12、17文件栏|H/projects-routes.js:49 records/:id/evidence/:asset_id；须分本人/独审权限，不以API存在断言所有按钮齐|
|出品方提交发行、记录外部结果|projects/project_forms.dart:72–78实际paths；:154–169旧版关联；project_api.dart:136–144结果核对|ProjectsView.vue:99、101；projectsRoutes.ts:11、22|H/projects-routes.js:39–40 projects/:id/releases、releases/:id/external-events；已接。外部提交和外部成功分开|
|独立岗位核渠道/发行/外部结果|App独审入口本轮未核|ProjectsView.vue:100、113；projectsRoutes.ts:20–24|POST channels、records/:id/reviews；H:37–38。网页有实际调用；外部渠道回执真实性未核|
|财务/出品方建结算约定、登记渠道账单与到账|App finance_forms.dart仅PAYOUT/DISPUTE，本轮未见此三项原生创建|FinanceView.vue:87–88；financeRoutes.ts:6、10、17|H/settlement-routes.js:15、18–19 agreements、statements、receipts；网页已接，App专门创建缺口候选|
|受益各方确认结算 / 财务生成期间单|App finance_pages及api有确认读取，本轮未穷举全部动作|FinanceView.vue:98；financeRoutes.ts:7–8、15|H/settlement-routes.js:16–17 confirmations、settlements；网页已接|
|本人看余额/分录、申请收款与异议|finance_api.dart:62–185；finance_forms.dart:124–141、243–258；app.dart:177–192|FinanceView.vue:88及financeRoutes.ts:9、18–21|H/settlement-routes.js:24、27、33–38；App实际两类表单，不等于运营出纳功能齐|
|出纳登记真实付款依据 / 独立核验|App此角色写入口未核|FinanceView.vue:88–99；financeRoutes.ts:16、22|H/settlement-routes.js:25、30；网页有写入。不得把人工登记当真实银行转账|
|当事方/独审取财务文件|finance_pages.dart:963–1005实际“读取材料”按钮，:1063插入；仅[g.owner,x.owner]含当前身份可用，api.evidence→FilePicker.saveFile前后核epoch/owner；不是所有受益方均可取|useFinance.ts文件能力；具体各表单按钮本轮未穷举|H/settlement-routes.js:41 records/:id/evidence/:asset_id。接口已接能力不等所有角色动作齐|

## 下一批优先顺序

1. W18充值退款SELF与OPERATIONS模型、页面、原请求恢复及证据读取，按上面专用契约实现；监护来源查选先核实际目录能力。
2. W19本人提名为候选待补项（见下方全局补核）。W17履约与运营/财务独审、W20批量沿PM03既定端分工使用已有Web，不要求重建App，不列App缺页任务。
3. W22原生端财务/独审是否属于约定交付角色，须在17范围主台账明确端分工；原网页已有实际动作，不可笼统写未开发。剩余权限、同记录闭环与外部凭据均待同事固定版本验证，不以无测试推定源码未实现。

### 监护新申请目录补核
H/guardian-routes.js:18 的 information 调用 M/guardians/repository.js:28，仅以 PROFILE/ARTIST_MATERIALS/CONTENT/TRANSACTIONS scopes 调 exportPersonalCopy；M/privacy/personal-copy.js:33 的 PROFILE 只有 account_id/display_name/object_version，:51 的 TRANSACTIONS 是 trade ORDER 索引，不是钱包充值记录。已查范围未发现监护可合法选择 child_party_id 与儿童 RECHARGE 的目录。不能将 account_id 当 party_id，也不能将 ORDER 当 RECHARGE；监护新申请保持目录契约缺口，先实现已有监护申请的列表和详情可独立推进。这里是当前源码查证范围的负面结果，非宣称全仓所有接口均不存在。

### 端分工与W19/W22补核结论
W17履约/运营、W20批量及W22财务独审已有Web办理，不因App无对应页面就自动列为要重建的缺口。W19对App全lib搜candidates/nomina，活动域只有候选展示，实际写入candidates均为projects角色候选；未见月冠军POST engagement/candidates。W22参演会签详情既有条款和证据上传，但无本约定依据读取按钮；通用项目材料按钮只对项目owner开放且参演页只链接父项目。应先核后端参演当事人evidence授权，再决定为参与者补本记录文件入口，不能放开项目owner门禁绕过权限。

### W22证据授权补核与W20入口补核
M/projects/release.js:23 对 PARTICIPATION/INCOME_AGREEMENT 明确特判：先 access，再严格要求asset_id等于本记录evidence_asset_id，最后核证据owner与状态；M/projects/repository.js:9 access允许实际项目owner或该记录confirmers中的主体，空acting party走独审operator。M/projects/checks.js:12仍要求READY、合法证据purpose及未被隐私限制。因此参演页补“本约定依据”是已有契约可接，不需要放宽通用项目文件按钮。

原Web成员入口 O/router/index.ts:41–43 `/workspace`，WorkspaceView.vue:26要求owner+ORGANIZATION+MANAGE_MEMBERS，:170有ACTIVE非OWNER成员“移除”实际按钮，:157有原请求重试，:84 act执行。App account_page.dart:651同样以MANAGE_MEMBERS显示管理区，:693–694移除普通ACTIVE成员；不能称原生员工管理尚未开发。离职后的业务委托撤销与不可自动复活属于后端行为，本轮不声称验收通过。

## f15b5cc2之后的当前续批
上表W18“未接”是核查基线事实，本批已新增本人充值退款与监护列表详情App、运营独立核验/任务/证据页面；具体源码及未接监护新申请见APP_RECHARGE_REFUND_PM03_HANDOFF.md、APP_W18_RECHARGE_REFUND_OPS_HANDOFF.md。W22本约定证据按钮及专用受控下载已补，见APP_PARTICIPATION_EVIDENCE_W22.md。上述均未运行验证，不将基线缺项重复统计为仍全部未开发。

W19本人App提名后续已接，见APP_CHAMPIONSHIP_NOMINATION_W19.md。上表“未见candidates写入”保留为f15b5cc2基线，不再作为当前未开发结论。资格/截止在幂等查重前重核的服务器恢复边界仍欠，不擅自改写为已解决。
