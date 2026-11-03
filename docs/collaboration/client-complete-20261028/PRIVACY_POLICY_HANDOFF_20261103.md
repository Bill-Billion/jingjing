# 隐私办理收尾：App补本人注销和更正的首次方案入口

后端负责人 **chengcongcong222**；前端负责人 **Bill-Billion**。原第4组本人资料权利、第16/17组资料和完整测试内补缺口。接口 **0.31.31-rc.1**、迁移 **0209**。沿原PR39获取完整版本，不另串旧分支。前两项共创邀请、试镜材料选项用户已转发，认领/交付未确认；本项是本轮新发现，尚未确认转发/认领。

## 用户应该能办成什么

[28号原文](../../sources/contracts-20261029/extracted/28.md)：“平台提供与开户同等便捷的注销、删除与退出路径。”以及“更正不准确信息；对特定内容行使删除权（"被遗忘"）。”注销前提原文：“存在未完成交易的，先完成结算或退款；属于交易依法须留存的记录，不因注销而立即删除。”

独立测试发现：网页新申请和独立核验能完成，但本人注销/更正和运营留存选不到适用规则。旧文件规则目录仅筛FILE_ERASURE，不能混用给注销或更正。后端本轮已补受控目录，网页由本轮主测补最小接线并独立复验，准确结果见CURRENT；不能因此冒称App也已补齐。

App现有 `privacy_pages.dart` 能执行**已存在**的APPROVED注销/更正方案，但只有FILE_ERASURE的首次创建表单；需补从新申请开始的首次方案选择和提交，避免必须先用网页创建方案才能在App继续。此判断来自代码审阅，原生实际复现/修复验收由接手者补齐。

## 后端已提供

|谁用|接口|查询参数/权限|
|---|---|---|
|申请本人|GET `/privacy/requests/{request_id}/execution-policy-options`|action为PROFILE_CORRECTION、FILE_ERASURE、ACCOUNT_CLOSURE；核验账号本人、申请类型及资料范围，不用机构身份扩大访问|
|隐私处理人员|GET `/privacy/operations/requests/{request_id}/execution-policy-options`|action为RESTRICT_CONTENT或RELEASE_CONTENT；须PRIVACY_HANDLE，申请须为COMPLAINT|
|隐私处理人员|GET `/privacy/operations/requests/{request_id}/retention-policy-options`|scope为既有单类别：PROFILE、ARTIST_MATERIALS、PRIVATE_STORY、CONTRACTS、TRANSACTIONS、DIGITAL_MODELS、CONTENT；须在该申请范围内，不能ALL|

均支持limit 1–100（默认20）及UUID cursor；只列已生效且适用规则。**过滤后当前页可为空，next_cursor仍可能非空**，应继续翻页。个人响应data含request_id、action、items、next_cursor；items为id、version、basis、contact_reference、retention_rule_id（可null）。留存响应data含request_id、scope、items、next_cursor；items为id、version、categories，categories仅含请求类别的scope、basis、max_review_days。不能自行把max_review_days当正式法定保留年限，它是已审规则给出的下一次复核上限。

这些接口只提供选择，不执行删除/关闭，也不代替独立审核。原提交/审核/执行路径不变；执行时重新核规则状态和原内容摘要。拿到选项后规则停用，提交会拒绝，页面应保留已填说明并要求重新选择，不能换成另一条规则静默提交。

## Bill-Billion具体工作

1. App本人CLOSE_ACCOUNT（范围ALL）和CORRECT（PROFILE/ALL）申请详情，新增适用规则选择和首次处理方案表单。target_id来自本人账号，不让用户输入任意账号；更正只处理已实现的展示名，不声称能任意修改实名资料。
2. 读取上述本人目录，核对返回request_id/action，展示规则依据和联系说明；切账号、切申请、切处理事项清掉旧选项和过期响应。没有规则时明确未配置，保留原申请，不默认批准。
3. 接原proposeExecution提交，遵循原请求恢复；等待另一人审核后使用既有执行按钮。注销前保留明显后果说明与二次确认，实际关闭后清会话；关闭账号≠全部数据删除。
4. 原文件清理目录继续兼容，无需重做；本轮网页已补规则目录接线，勿按旧缺口重新开发网页。检查同版网页结果并补原生完整链。

## 怎样验收

- 同一新注销申请：提交→运营受理→核验/独审→本人选正确规则提出方案→另一人审核→本人再次确认执行→旧登录拒绝；原申请编号仍可由获准运营处理，剩余留存和实际数据删除状态不能假完成。
- 另一个新CORRECT申请：本人选择更正规则→独立审核→实际修改展示名；原合同、机构名称不随之改变。
- 仅删除文件规则不能冒充注销规则；另一账号、无处理权限、请求类型不匹配、规则停用、分页空页、切身份/断网恢复都要测。
- 运营留存使用同请求适用类别和已审依据，后端会再次核对依据字符串与复核日期；未开通真实规则或第三方删除服务时明确边界。网页本轮复验证据不代App原生或正式服务。

属于流程补全：按申请筛选规则、展示摘要、分页和恢复是把既有个人信息权利落成能办理的流程；不新增保留期限或擅自填写甲方合同空白。正式联系人、依据和供应商删除条件仍按既有外部清单索取，测试合成政策不能正式启用。
