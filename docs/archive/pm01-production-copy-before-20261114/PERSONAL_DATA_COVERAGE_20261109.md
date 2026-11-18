# 本人资料提供：实际覆盖和剩余工作

2026-11-14第68轮当前：企业正式交付新增逐账号读取事实，旧签收/工作日期限保留；新事实本人摘要和同申请交付尚待接入，不自动开放公司整单或他人故事。第66轮追偿摘要/选定文件交付等既有成果保留，不能当全库字段完成。接口0.31.76-rc.1/0225，无前端。151为19通过/124部分/8证据不足、18组0/18、12整链部分。见[本轮报告](../../reviews/pm01-delivery-handoff-20261114/REPORT.md)，原表见docs/archive/pm01-delivery-handoff-before-20261114。

本表是已定位类别，不是全库逐字段审计结论，行数不能当需求完成率。能查看、能复制记录、能下载原件、实际办理完成分别记录。机构经办不等于本人所有，其他人/儿童/供应商资料不能一并直接导出。

|资料类别|实际存储/实现|目前已经提供|后端仍需核查或补齐|
|---|---|---|---|
|账户/偏好/艺人基本档案|identity_accounts、privacy_preferences、artist_people|ACCOUNT/PREFERENCES/ARTISTS|其他持有字段和留存依据；不提供凭据|
|登录与换号|auth_sessions、auth_phone_changes、auth_phone_change_events|SESSION_RECORDS/PHONE_CHANGES/PHONE_CHANGE_EVENTS|只含仍保留记录；不延长期限、不恢复已清理历史|
|本人实名结果|artist_records IDENTITY|IDENTITY_CHECKS，状态/年龄段/有效期|供应商身份证/人脸原件、实际可携带与删除，须按具体产品核实|
|素材与作品|supply_assets、artist_asset_links|本人可访问素材/作品原件与记录|其他授权证据、他人资料、衍生材料须核权脱敏|
|私人故事|customization_requests及版本附件|正式历史、补件草稿、文字和本人附件|原机构故事不当个人所有；新页面完整办理待验|
|交易与钱账|trade_records/journal、wallet_records、finance_entries/records|本人买卖单、付款退款、钱包和清分记录；第66轮新增FINANCE_RECOVERIES个人申请方/原收款方案件摘要，含驳回/关闭历史及已关联回款，并实际交付选定同申请文件|自由文本理由、审核身份及银行原件按具体申请核权脱敏；机构经办不当本人所有；未关联案件金额不等于当前欠款，关闭不免债；其他账务资料继续核对|
|正式交付读取/签收|production_delivery_views、production_fulfillments、production_records/FEEDBACK|第68轮新增逐交付/账号的已核字节读取，兼容旧首读，原签收/期限保留；记录有公司业务参与语境|本人摘要/按申请交付尚待接入；须按actor事实核权，不能把公司整单/其他账号/私人故事自动归给本人；见第68轮报告|
|许可/参演/经纪等协议|privacy/agreement-copy等|本人当事人脱敏历史约定、本人个人身份会签与阶段确认|其他合同和真实签署原件；封存不等于签完|
|数字人模型|production_records DIGITAL_ASSET|本人关联制作模型记录|真实供应商长期资产、源文件/可携带/退出删除仍待工程与产品落实|
|反馈和投诉|support_tickets/events/asset_refs|SUPPORT_TICKETS/SUPPORT_MESSAGES及原受控附件下载|其他纠纷域证据继续核对，机构经办不混入本人|
|开票资料|invoice_requests/events/documents|INVOICE_REQUESTS/HISTORY/DOCUMENTS；历史更正、已签发/已替换票据与原受控下载|真实税务资料另验；待审不提供，模拟凭证不是真实发票|
|收藏与浏览|personal_collection_entries/settings|FAVORITES/BROWSING_HISTORY/COLLECTION_SETTINGS；保留、清理和撤权正反例已测|不是完整历史；已删除不恢复、失权内容不返回标题城市|
|运营按申请准备副本|复用本人五类读取入口、privacy_events|本轮可按申请范围读脱敏数据、逐页留痕；同申请独审交付/重开已验|全库逐字段与供应商原件仍未完成，运营页面组装上传/保存待验|
|隐私办理|privacy_requests/responses/events/actions/executions|本轮PRIVACY_REQUESTS/RESPONSES/EVENTS/ACTIONS/EXECUTIONS；已审核历史答复原附件已补下载；提交/审核实际读文件并锁定摘要，缺件/变件/受限不发布|内部载荷不提供；供应商删除/备份执行证据及其他未覆盖结果需继续实际办理，排队不等于完成|
|通知|notification_deliveries；ops_reads等|NOTIFICATION_DELIVERIES发送状态及本轮NOTIFICATION_READS本人已读时间|已读不含原内容，原收件箱按当前权限读取；受控消息原文与供应商回执/设备资料仍须按范围核查，发送不等于送达|
|成人提醒|privacy_usage_state|PERSONAL_USAGE_STATE当前已保存状态；只读不触发计时|不是完整历史，不恢复清零状态；不新增行为追踪|
|监护|guardian_records、guardian_usage/sessions|GUARDIAN_LINKS摘要；本轮GUARDIAN_CONTROLS有效关系设置/当天预留、GUARDIAN_CASES案件和GUARDIAN_USAGE本人按天历史|案件和设置已按有效关系核权，失效时详情为空；本轮GUARDIAN_SESSIONS提供本人时段申请回执；证明原件经人工核权脱敏，其他儿童材料不自动导出；预留不是实际用量，不开放儿童真实服务|
|经营与活动参与|engagement_records等|本轮ENGAGEMENT_RECORDS十类：排名资料、城市偏好、评价、候选报名、投票、申诉、推荐链接/点击、奖励、互动|本轮六分类已补成长/星光/推荐佣金、权益领取/抽奖、审核后排期/本人补救与抵扣记录；其他活动和原件继续核对；全局评审底稿和设备哈希不混入本人|

|商单/试镜业务消息|gig_records / audition_records及原会话权限|申请范围内运营工作稿；选定本人消息已沿独审答复实际下载|正文人工处理、原件和其余字段继续核；有权限操作不等于有权复制整个机构资料|

接下来后端按三个可执行包继续，不把本表说成全部需求已核清：

1. 成长/星光/推荐佣金、抽奖兑换与履约资料：六分类后端已补，保留历史规则且排除他人供给/运营底稿；继续同版页面及完整经营流程验收，不再列为统一副本未开发。
2. 通知阅读与监护资料四分类后端已补；本轮会话级回执和当前提醒状态已补，证明及受控消息边界已核；商单/试镜工作稿及选定本人消息独审下载本轮已验，继续全文人工处理、其余字段、页面及权限变化整链。
3. 隐私执行、文件与供应商：本批已补人工答复实际文件校验与同一文件确认，已验证部分答复继续办理和历史下载；是否完整覆盖申请仍须独立人工逐项审核，不用技术校验代替。未持有及供应商原件边界本轮已列明，继续逐申请实际提供与供应商执行。真实服务未接通不记完成。

前批193项相关回归与75份实际HTTP结构校验通过；前批六分类证据见privacy-benefit-copy-20261109报告；本轮四分类52项回归及52份HTTP通过，页面、完整流程和真实接入未因此完成。前端接已有分类和缺项说明，原18组/12路线/151标准保留。正式联系方式、保留依据与外部产品资料仍按甲方交付，不自行编造；当前不重复索要仍申请中的配置。

本轮详细边界见[资料与原件](PERSONAL_DATA_BOUNDARIES_20261109.md)；已建179表1207列底册并核16个表范围；完整逐字段审计仍未完成，不以分类表全部有行当全部资料齐全。

2026-11-10字段补缺：个人身份档案与艺人创建时间、参演本人实际订单/变更生效历史/本人约定保留应退已补。换号动作历史、本人参演会签、本人阶段确认现已补齐并通过144项相关检查；本批已核素材及核心交易JSON并补办理背景字段；同申请实际文件交付已于11月11日复验，继续原件与其余适用范围；[逐列状态和缺项](../../requirements/PERSONAL_COPY_FIELD_AUDIT_20261110.md)。原件、第三方资料与供应商执行仍独立核查，不能把1207物理列当需求或缺口数。

本轮阶段确认的旧表无时间，返回未知；证据编号不代表可直接下载或已付款。机构员工操作、其他人的会签不随个人副本提供。历史会签摘要与当前协议摘要分别保留，比对不是电子签效力结论。

2026-11-10素材/交易增量：补本人档案关联、素材上传/订单创建时间、取消原因、付款截止；ERASURE_PENDING/ERASED不开放下载。160项相关回归通过。核心交易JSON与内部字段的范围见[核对表](../../requirements/MATERIAL_TRADE_COPY_AUDIT_20261110.md)，商品特定约定已定位至冻结CONTRACT，具体第三方/供应商原件仍未逐件审完。
