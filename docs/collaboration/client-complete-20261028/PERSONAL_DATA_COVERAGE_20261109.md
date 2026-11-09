# 本人资料提供覆盖：已有能力、明确差距与下一步

2026-11-09；后端负责人chengcongcong222。依据[28号第一节](../../sources/contracts-20261029/extracted/28.md)：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”

本表是本轮按可定位代码核对的资料类别，不是全库逐字段审计通过，不将每行当一个原子需求。已能在业务页查看不等于已能完整导出；人工提供需要实际收集/脱敏、独立复核和答复，不能只有“请联系客服”的文字。

|资料类别|已定位的存储/实现|当前提供方式|后端仍须做什么|
|---|---|---|---|
|账号/偏好/艺人基本档案|identity_accounts、privacy_preferences、artist_people；privacy/account-copy|ACCOUNT/PREFERENCES/ARTISTS已能复制|核对其他实际持有字段和留存依据；不导出凭据|
|保留的登录与换号|auth_sessions、auth_phone_changes；privacy/security-copy|SESSION_RECORDS/PHONE_CHANGES已补|过期清理意味着不含全部历史，不延长保留，不造记录|
|实名核验结果【本轮补】|artist_records kind IDENTITY；artists/repository.prepareIdentity/applyIdentity|IDENTITY_CHECKS，核验状态/年龄段/期限；排除session_ref、request_key、issuer、evidence_ref等|这里未保存身份证/人脸原件；供应商原件与保留/复制能力待具体产品核实，不能据此断言系统所有模块都未持有|
|本人素材/作品|supply_assets、artist_asset_links；privacy/personal-copy|本人持有且可访问素材与作品原件已有|其他授权证据、第三方资料及衍生物逐一核权/脱敏，不能一并直出|
|私人故事与附件|customization_requests及版本附件；privacy/story-copy|当前、历史正式、补件草稿和附件已有|原机构故事不当个人所有；完整交互仍待页面验收|
|本人买卖订单及钱账|trade_records/journal、wallet_records、finance_entries/records|交易副本、钱包/清分及相关条款已有|其他细分账目、退款/冻结等逐类核对，不用余额摘要代替全记录|
|许可/采购/参演/经纪|privacy/agreement-copy对应业务记录|本人当事人脱敏历史协议已有|其他合同及签署原件仍按原业务权限与真实电子签核实；封存不等于已签|
|数字人/制作模型|production_records DIGITAL_ASSET、相关授权|本人制作模型记录已有|供应商真实长期资产、源文件/可携带与退出删除能力待产品及工程落实|
|本人反馈、投诉及处理资料|support_tickets/events/asset_refs；support.repository read/history/assetAccess|业务入口已有本人/身份权限；尚未纳入统一本人副本分类|将本人资料与他方陈述/内部审阅分开，逐项补导出/受控证据或人工答复；不得把机构经办材料混入本人|
|开票请求与票据|invoice_requests/events/documents；invoices.repository list/read/documents/documentAccess|已有原业务查看和受控下载；统一副本覆盖未结案|核对本人申请与机构发票身份，整理可提供范围、历史更正和下载证据|
|收藏与保留的浏览记录|personal_collection_entries/settings；collections.repository|已有本人列表/删除/清空；过期/失权内容按原规则处理|统一副本范围、历史记录与公开源撤权后的可提供内容仍待核对，不能复活已删除浏览记录|
|其他通知/监护/活动/隐私办理等记录|相关业务模块及privacy_requests/responses/actions/executions|已有分域读取与人工答复基础|逐模块扩展清单，确定本人、监护人、机构和运营的不同范围；本轮未声称全量完成|

下一批优先由后端继续反馈/投诉、发票及收藏/浏览三项现存资料的范围与导出，然后核其他业务记录；这三项是已定位的继续工作，不是项目仅剩三项。缺口发现继续归原第4/17组，不新建商业范围。前端先接已稳定分类与“尚未完整提供”说明。

流程补全：分类白名单、脱敏、原始附件权限、分页和不自动办结申请。实际留存期限、处理联系人及供应商资料仍按甲方正式材料，不编造。没有完整提供/执行证据前不得把28号整份要求标验收完成。
