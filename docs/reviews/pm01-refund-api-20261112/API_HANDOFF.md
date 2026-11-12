# W18退款后端接口交接

接口0.31.59-rc.1，迁移0212不变，正式树client-testing。本文件用于维护者和未来接入方查阅，不给Bill-Billion派新任务，本侧不实施前端。所有路径以/api/v1/wallet为前缀，需要登录；真实渠道未注册。

|身份|操作|路径（省略前缀）|权限与完成标准|
|---|---|---|---|
|本人|POST申请、GET列表、GET详情|/recharge-refunds、/recharge-refunds/{record_id}|X-Acting-Party只能本人个人主体；原充值属于本人。未成年人新申请仍受现有总入口限制|
|本人|POST撤销|/recharge-refunds/{record_id}/cancellation|只允许IN_REVIEW/APPROVED且未发送，必须本人、If-Match和Idempotency-Key；儿童也可撤销自己的未发送案件|
|监护人|POST申请、GET列表、GET详情|/guardian-recharge-refunds、/guardian-recharge-refunds/{record_id}|禁止X-Acting-Party；提交child_party_id、guardian_link_id及原充值。核当前关系、材料所有人、儿童原充值；关系失效拒绝详情和新申请|
|独审|GET队列、GET详情|/operations/recharge-refunds、/operations/recharge-refunds/{record_id}|禁止X-Acting-Party；当前WALLET_REFUND_REVIEW权限及非关联方；队列不返回自己关联的案件|
|独审|GET私有材料|/operations/recharge-refunds/{record_id}/evidence/{asset_id}|仅本案关联材料；下载前后重核权限、当前材料与实际字节，不给公开链接|
|独审|POST核定|/operations/recharge-refunds/{record_id}/review|明确APPROVE/REJECT、金额、理由和身份/来源/依据核验；监护案另需relationship_verified=true；不足资金不自动认定案件不成立|
|独审|POST排队、POST重试|/operations/recharge-refunds/{record_id}/scheduling、/operations/recharge-refunds/{record_id}/retry|当前非自审权限、If-Match与Idempotency-Key；重试填写原因，同案原编号恢复|

所有写操作带Idempotency-Key；变更已有案件再带If-Match。详情/变更返回ETag及object_version；同键回原命令结果，后续再GET取当前状态。分页limit为1—100，游标限本范围，使用服务端next_cursor。

RechargeRefundResponse为脱敏投影：案件编号、当前状态/版本、原充值编号、申请/核定金额、币种、申请理由、创建/发送/结清时间、SELF/GUARDIAN以及是否排队。独审详情/写入可见本案evidence_asset_ids，普通响应没有。task_scheduled=true仅表示案件有持久任务，不表示已发送、到账或真实服务接通；APPROVED与SUCCEEDED不能混用。

资料副本沿既有本人privacy/requests/{request_id}/account-data（含独审按申请取数入口）：
- WALLET沿原白名单，儿童可见本人充值退款，监护人不能借此读取儿童整个钱包。
- 新GUARDIAN_RECHARGE_REFUNDS要求申请含TRANSACTIONS或ALL；只包含本人作为监护申请人或儿童所有者的案件。
- 监护关系失效只给案件ID/状态/版本/自身角色，detail_access为CURRENT_GUARDIAN_ACCESS_REQUIRED，data=null；儿童本人仍保留自身退款详情。
- 不含商户绑定、渠道交易号、后台任务ID、可信回执、审计及材料原件。

没有/claim或/receipt的外部操作，不得由人工输入把退款标成成功。新权限未自动授予，生产handlers注册表仍为空，真实商户/产品/验签/幂等查询按后续独立接入。
