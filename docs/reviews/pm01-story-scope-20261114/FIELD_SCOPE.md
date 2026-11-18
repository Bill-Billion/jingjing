# 故事字段、用途与保留边界核对

本轮核仓库现有模板和服务器读写路径，不冒充生产动态配置清单；动态模板需CUSTOMIZATION_TEMPLATE_PUBLISH维护权限发布，现有草稿不会被新模板自动改写。来源为原DEL-14.03/V5 §2.12①—③；本表是实现核对，不新增用户授权或保留期限。

|现有字段|本次制作用途|当前存储/读取边界|本轮证据及限制|
|---|---|---|---|
|祝福occasion、recipient、message|场合、收件人称呼和表达内容|customization_requests草稿；正式提交后不可变customization_submissions|草稿只有创建账号及其当前主体；受理看正式提交；列表不含正文；不提取为全平台关系图|
|祝福use_scope、performers|声明使用场合及出镜意向|同一提交快照；正式报价绑定摘要|自由文本不等于已取得真人/形象许可；上一轮角色与声音许可检查继续有效，文字仍需独审核实|
|祝福duration_wish、deadline_wish|期望时长/日期，非自动合同承诺|同一草稿/提交快照|正式规格及交期看报价；不从愿望字段自动扣费或生成|
|祝福private_material|本次制作参考文件|customization_attachments私有对象，正文只存编号|本轮新项目入口仅匹配合同绑定提交的PRIVATE_ATTACHMENT字段，旧提交/未提交/异项目拒绝；无公开URL|
|自由创作story、notes、material|故事、备注、私人参考文件|相同草稿、补件、正式提交和附件机制|描述原文：附件不会自动获得人物使用授权；维护者自定义模板的字段不据本次自动认定都必要|
|项目角色person/avatar/look/voice及费用|本次项目的明确参与人及使用版本|既有角色、协议和履约快照|上一轮已验证当前许可、换角费用和原剧本不改；本轮不把这些历史数据作为新增营销来源|

## 谁能取到什么

- 本人故事与附件：创建账号及当前办理主体；机构其他成员不能凭同机构读取私人故事。本人资料COPY还须PRIVATE_STORY范围，机构故事不会混入个人副本。
- 受理：有CUSTOMIZATION_INTAKE才可看正式提交和历史正式引用文件；不能看未提交草稿/文件。全局受理职责不等于项目独审职责。
- 制作项目：买方负责人、平台商家负责人、当前受派人；独审读取同时需要独立PRODUCTION_REVIEW和CUSTOMIZATION_INTAKE。新文件入口与既有story入口共用此边界，转派/移除成员/撤销操作权限之后重核。
- 本项目文件必须来自该项目order_id绑定的request_id/submission_id及内容摘要；不是任意同一买家的文件。获取字节后再检查权限和文件元数据，私有内容摘要或大小不符拒绝。

## 保留不等于二次使用

正式提交引用附件显示FORMAL_SUBMISSION，现有普通撤销入口拒绝直接撤销它；未正式引用文件可以标记REVOKED。该操作不是物理删除回执，也不是承诺永久保存。隐私申请答复里的保留事项须有效privacy.retention规则、具体范围/依据及复核日期，不能随意写2099；本轮复验既有规则门禁，未新定保留年限。

已下单的历史文本/附件与后台备份、真实供应商物理删除属于不同事项。真实保留配置、到期清理策略和隐私案件处理仍须既有合规/运营程序与独立核验；不以本次代码读取代替正式确认，也不借“保留”授予新的制作或营销许可。

marketing/personalization默认false；个性化和营销开关独立于故事提交。现有通知发出前重核营销选择、安静时段及每日限制，关停后队列不再发送；本轮复验相关既有测试，未启用真实推送。检索未见故事答案自动导入营销人群的实现，这仅是当前代码范围核查，不是对所有未来或外部系统的保证。

代码来源：customization/blessing-template.json、free-creation.js、policy.js、repository.js、attachments.js、trade-context.js；production/customization-workflow.js；privacy/story-copy.js、repository.js；operations/push-delivery.js。均位于晶晶日上工程交接包/01_源码/backend_server/src/modules。实际测试覆盖见CHECKS.jsonl，合成状态、身份和文件的限制见REPORT.md。
