# 本人资料提供：实际覆盖和剩余工作

2026-11-09；后端负责人chengcongcong222。依据[28号第一节](../../sources/contracts-20261029/extracted/28.md)原文：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”当前0.31.45-rc.1/0211。

本表是已定位类别，不是全库逐字段审计结论，行数不能当需求完成率。能查看、能复制记录、能下载原件、实际办理完成分别记录。机构经办不等于本人所有，其他人/儿童/供应商资料不能一并直接导出。

|资料类别|实际存储/实现|目前已经提供|后端仍需核查或补齐|
|---|---|---|---|
|账户/偏好/艺人基本档案|identity_accounts、privacy_preferences、artist_people|ACCOUNT/PREFERENCES/ARTISTS|其他持有字段和留存依据；不提供凭据|
|登录与换号|auth_sessions、auth_phone_changes|SESSION_RECORDS/PHONE_CHANGES|只含仍保留记录；不延长期限、不恢复已清理历史|
|本人实名结果|artist_records IDENTITY|IDENTITY_CHECKS，状态/年龄段/有效期|供应商身份证/人脸原件、实际可携带与删除，须按具体产品核实|
|素材与作品|supply_assets、artist_asset_links|本人可访问素材/作品原件与记录|其他授权证据、他人资料、衍生材料须核权脱敏|
|私人故事|customization_requests及版本附件|正式历史、补件草稿、文字和本人附件|原机构故事不当个人所有；新页面完整办理待验|
|交易与钱账|trade_records/journal、wallet_records、finance_entries/records|本人买卖单、付款退款、流水、钱包和清分相关记录|成长/星光/佣金及权益副本本轮已补，其他冻结和账务资料继续核对，不以余额代替全部历史|
|许可/参演/经纪等协议|privacy/agreement-copy等|本人当事人脱敏历史约定|其他合同和真实签署原件；封存不等于签完|
|数字人模型|production_records DIGITAL_ASSET|本人关联制作模型记录|真实供应商长期资产、源文件/可携带/退出删除仍待工程与产品落实|
|反馈和投诉|support_tickets/events/asset_refs|SUPPORT_TICKETS/SUPPORT_MESSAGES及原受控附件下载|其他纠纷域证据继续核对，机构经办不混入本人|
|开票资料|invoice_requests/events/documents|INVOICE_REQUESTS/HISTORY/DOCUMENTS；历史更正、已签发/已替换票据与原受控下载|真实税务资料另验；待审不提供，模拟凭证不是真实发票|
|收藏与浏览|personal_collection_entries/settings|FAVORITES/BROWSING_HISTORY/COLLECTION_SETTINGS；保留、清理和撤权正反例已测|不是完整历史；已删除不恢复、失权内容不返回标题城市|
|隐私办理|privacy_requests/responses/events/actions/executions|本轮PRIVACY_REQUESTS/RESPONSES/EVENTS/ACTIONS/EXECUTIONS；已审核历史答复原附件已补下载|内部载荷不提供；供应商删除/备份执行证据及其他未覆盖结果需继续实际办理，排队不等于完成|
|通知|notification_deliveries；ops_reads等|本轮NOTIFICATION_DELIVERIES，个人发送状态、模拟标记|阅读记录和相关消息内容的统一提供待核，设备标识/供应商回执不直出；发送不等于送达|
|监护|guardian_records、guardian_usage/sessions|本轮GUARDIAN_LINKS，本人关系状态/历史；监护人自己的关系说明|退款/信息申请详情、实际用量及证明需按有效监护关系和儿童权益核权；摘要不代儿童档案或新授权|
|经营与活动参与|engagement_records等|本轮ENGAGEMENT_RECORDS十类：排名资料、城市偏好、评价、候选报名、投票、申诉、推荐链接/点击、奖励、互动|本轮六分类已补成长/星光/推荐佣金、权益领取/抽奖、审核后排期/本人补救与抵扣记录；其他活动和原件继续核对；全局评审底稿和设备哈希不混入本人|

接下来后端按三个可执行包继续，不把本表说成全部需求已核清：

1. 成长/星光/推荐佣金、抽奖兑换与履约资料：六分类后端已补，保留历史规则且排除他人供给/运营底稿；继续同版页面及完整经营流程验收，不再列为统一副本未开发。
2. 通知阅读和监护详细资料：本人阅读记录与原内容权限分开；有效监护再核儿童范围，不因一条历史关系直接开放其他资料。
3. 隐私执行、文件与供应商：核现有自动/人工答复是否实际提供所申请内容，明确未持有原件和待供应商提供的部分。真实服务未接通不记完成。

前批193项相关回归与75份实际HTTP结构校验通过；本轮六分类证据见privacy-benefit-copy-20261109报告，页面、完整流程和真实接入未因此完成。前端接已有分类和缺项说明，原18组/12路线/151标准保留。正式联系方式、保留依据与外部产品资料仍按甲方交付，不自行编造；当前不重复索要仍申请中的配置。
