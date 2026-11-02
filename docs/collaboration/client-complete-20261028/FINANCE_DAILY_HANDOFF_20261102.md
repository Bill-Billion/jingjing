# 财务每天把钱核对清楚：前端接入说明

后端负责人 **chengcongcong222**；前端负责人 **Bill-Billion**。接口 **0.31.23-rc.1**，数据库迁移 **0204**，从原PR39的当前分支获取。此项归原第11/12/16/17组，不新增产品阶段。后端已提供可调用接口与隔离检查；前端尚未确认认领。用户表示会转发上一批六项，本项按其最新要求直接在仓库同步。

## 给谁用、做到什么程度

这是财务运营人员的核账页面。先选公司、日期、支付渠道及商户账号，再核五类记录：收款、退款、实际支付/退回的分成、手续费、银行流水。缺账单或有差异不能结案；录入人与复核人必须不同。对账只保存核对结果，不执行收付款，不改变订单状态。

[35号原文](../../sources/contracts-20261029/extracted/35.md)：“分账订单多批次幂等、不可重复清分；尾差（≤1 分）平台承担并记 rounding_diff；建立每日对账机制（订单、分账、退款、手续费、银行流水）。”

**实施补全，不冒称合同逐字指定**：按北京时间已结束的入账日，按主体/渠道/应用/商户/测试正式环境分别建批次；收退款及已审核付款事实由服务器读取；手续费和银行流水的核验依据人工录入并附不同来源的凭据，由独立财务人员核对完整性。暂不自动获取银行或支付账单，不支持任意CSV格式自动识别，也不替正式资金托管产品。

## 前端建议分两份可独立检查的工作

|工作|具体页面及交互|结束标准|
|---|---|---|
|财务日对账工作台|运营菜单进入列表、固定范围新建、五类明细、差异、附件、独立复核、重开与历史版本|空白日也须解释和凭据；有差异不能变绿；编辑者不能自审；原请求断网恢复；原历史结果可查|
|分账金额解释|沿用已有订单/收入页面，识别新版尾差算法；显示“历史尾差需复核”具体原因|不自行重新算分钱，不改旧单；只显示服务器金额和阻断原因，不把待复核变成可提现|

运营端新增工作台即可，普通客户App不需要新增财务审核入口；App/网页原有金额展示仍使用接口。两份工作建议前端4–8、1–2人时作初排，实际以认领核查为准，非承诺工期。优先完成上一批六项中的交接/期限/直推/注销，再与监护、侵权流程并行接本工作台，避免互相等待。

## 接口与权限

统一前缀 `/api/v1/finance/daily-reconciliations`。全部是账户级已审 `FINANCE_REVIEW` 权限，**不带 X-Acting-Party**；用户本人或机构管理员身份不自动有此权限。登录、停权后清除私密缓存。

|方法和后缀|用途|
|---|---|
|GET /|列表；cursor、limit（1–100）、merchant_party_id、business_date|
|POST /|创建；scope和note|
|GET /{id}|当前版本、真实有效状态、来源是否变化|
|GET /{id}/facts|服务器真实账；cursor、limit、source_fingerprint|
|POST /{id}/statements|导入某类外部账单；kind、mode、items、external_reference、evidence_asset_id、no_activity_reason|
|POST /{id}/manual-evidence|手续费/银行核验依据；mode、items|
|POST /{id}/comparison|计算差异，正文{}|
|POST /{id}/review|独立复核；decision、reason、verification|
|POST /{id}/reopen|重开已审批次；reason；原审核快照保留|
|GET /{id}/history|不可变的独立审核快照|
|GET /{id}/files/{asset_id}|当前及历史快照引用的受控凭据；不可转公开链接|

所有写入带 `Idempotency-Key`；除创建外还带 `If-Match: "当前版本"`。同一原请求恢复须沿用**原正文、原版本、原请求键**，不得自动换键；409先查询当前记录解释冲突，再让用户明确下一步。GET无副作用，不自动重新提交。

scope包含 `business_date / merchant_party_id / provider / environment / app_id / merchant_id`；provider当前ALIPAY或APPLE，environment为SANDBOX或PRODUCTION。列出渠道不代表真实产品已开通。日期是平台入账日，不等于渠道发生日。

kind为RECEIPT/REFUND/SPLIT/FEE/BANK；mode为REPLACE/APPEND。外部明细为：
`{record_id, external_reference, direction: IN|OUT, amount_minor}`。
record_id对收款/退款是支付/退款记录编号，对分成是已审付款依据编号，对手续费/银行流水是本批人工依据的id；不得用订单编号替代。金额全为整数分，界面转换一次，保存不能误乘100。

人工依据为：
`{id, kind: FEE|BANK, source_ids, external_reference, direction, amount_minor, evidence_asset_id, reason}`。
source_ids关联真实已记账收退款或已审收付凭据。附件复用私有材料上传，purpose取REVIEW_EVIDENCE或RIGHTS_EVIDENCE，归当前录入人个人主体或本批商户主体。该依据与对应外部账单不得用字节相同的同一份文件证明彼此。材料审核仍需人工，服务器不会自动判断银行文件真伪。

每次最多200条；APPEND须沿用同一外部账单编号与附件，每类最多2000条。事实列表每页最多100条，后续页带首次返回的source_fingerprint，变化则明确重新加载。当前整日超过2000条平台事实会明确拒绝继续，不能分段假装已对完整日账；大体量分页账日扩展另作后续容量工作。当前不静默截断。

复核verification四项全为true才可通过：
`scope_verified / statements_complete / manual_evidence_verified / sources_verified`。
录入人、本批商户的有效成员均不能审核；不能通过切身份绕过。

## 状态与失败提示

|返回|面向人的解释/操作|
|---|---|
|DRAFT|资料未齐，可继续整理|
|DIFFERENCES|存在差异，逐项修正；不提供“忽略并结案”|
|READY|数字一致，仍待另一名财务人员核凭据，不显示已经完成|
|REVIEWED|独立审核通过；查看effective_status，不能只读这个字段|
|RECHECK_REQUIRED|已审后新到账或凭据失效，旧结果保留，需重开复核|
|RECONCILIATION_SOURCES_CHANGED|账已变化，重新读取，不能把旧分页拼到新记录|
|SELF_REVIEW_FORBIDDEN|换独立复核人，不是换机构身份|
|FINANCE_ROUNDING_REVIEW_REQUIRED|历史分钱存在超过1分或负数问题，保留旧账并暂停新增付款，人工处理原约定|
|MULTI_CHANNEL_PAYOUT_REQUIRES_ALLOCATION|同单涉及不同商户渠道，不能随意把分成全归一个渠道，保持差异待核|

同批次唯一范围不能重复创建；创建结果未知时先查同范围列表，再恢复原请求。未能确认写入结果不提示“失败后另建”。

## 新尾差规则与旧单

新规则枚举 `LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN`：按准确比例分配整分，剩余分按小数余数及冻结参与方次序分配，平台差额记录不超过1分。旧枚举继续原算法，历史订单不重算；发现旧算法造成超过1分差额或负分配时，阻止继续付款并提示人工复核。本轮新增算法选择是流程补全，须与新规则文本一起审核后发布。

正式切换配置 `FINANCE_ROUNDING_CONTRACT_POLICY=CONTRACT_20261029` 会拒绝发布/新建使用旧算法的新规则；默认兼容只为历史环境升级。不开关不等于新需求已正式启用。前端不能给旧订单偷偷换新枚举。

## 同版验收

1. 同日同商户只建一批；换商户/正式环境读不到另一批的账。
2. 缺任一账、差1分、收支方向错、未知记录，均不得结案；零活动仍须凭据和说明。
3. 已申请提现未执行不入实际分账；支付、退回、退款按实际事实分开。
4. 手续费和银行核验依据须有关联事实及独立材料；两人审核，不产生转账。
5. 提交后丢响应，原键恢复只有一个结果；旧版本冲突有提示。
6. 已审后迟到账→待重查；重开后历史快照和旧附件仍可查。撤销/删除凭据应阻止继续下载并提示重查。
7. 新小金额、多方分钱不出现负数，平台差额≤1分；旧合同原算法保留，异常旧单暂停新付。

后端隔离命令：在backend_server配置现有一次性MySQL环境后执行 `node scripts/test-mysql.js daily-reconciliation` 与 `node scripts/test-mysql.js finance`（两条分别执行）。接口真实响应验证命令见本轮记录。测试不调用银行、支付或云服务。
