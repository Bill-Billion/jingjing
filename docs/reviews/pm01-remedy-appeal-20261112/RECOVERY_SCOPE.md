# W28恢复演练：已有覆盖与真实缺口

这是本次既有覆盖核查及新增同记录隔离预备验证，不是新增恢复引擎或正式旧库验收。依据PM01 W28“生产操作须有明确授权；优先在隔离环境验证”。

已有backend_server/test/release.integration.test.cjs使用合成交易、旧SQLite行和后台任务：验证加密备份、错误密钥/篡改拒绝、恢复新库逐表对账、精确整数/时间/自增、恢复后HTTP与任务仍隔离、外键失败回滚及错误源摘要拒绝。其备份明确external_object_bytes_included=false。不能声称这个数据库备份包含实际OSS私有字节。

scripts/client-testing/business-backup-drill.cjs另有合成持久业务及本机文件恢复：恢复新库、全部业务表和文件摘要、原库未改、恢复后同订单下载、同订单反馈恢复。本次没有启动该工具、没有读取人工3490数据或运行前端；不能把源码存在当本轮演练通过。

backend_server/test/migrations.test.cjs的58表旧生产结构对照必须显式JX_LEGACY_SQLITE_SNAPSHOT。缺少脱敏旧库样本时仍SKIP；不能拿自动生成新库充当旧库。其余新建库迁移和合成旧事实导入由统一后端回归记录。

后续chengcongcong222可以先核固定候选的恢复隔离与后台任务查询门禁；真实旧库、私有文件存储和W24/W26资料到位后另做原账/授权/文件同记录恢复及回退。此时才需要具体脱敏样本、存储和批准环境；当前不重复索要申请中材料、不自行启用生产。

本次新增test/refund-restore.integration.test.cjs：模拟原退款已发送但回执丢失的UNKNOWN案件，将该库加密备份恢复到新库；原退款/任务/操作键/审计和钱账核对一致，保留金额1000分，恢复库HTTP与worker拒绝启动，发送仍只有原1次、恢复后查询0次。该金额是合成资料。独立专项4项通过，最终同版证据见REFUND_RESTORE_JOURNEY.json及FINAL_BACKEND.json；不表示恢复后已获批准运行、未知请求已实际查单结清或外部私有文件已恢复。

## 下一轮避免重复开发的核对

|已有实现或证据入口|已覆盖什么|接续只补什么|
|---|---|---|
|test/recharge-refund-recovery.integration.test.cjs|原库中回执丢失后仅查询原退款；过期租约不能结清；钱账已完成但任务写回丢失后不重复扣款|将这些场景与同一份加密备份恢复后的记录组合，不能重新开发原请求查询引擎|
|test/privacy-execution.integration.test.cjs；src/operations/privacy-recovery.js|旧备份恢复后重放最新删除登记，文件停止访问，仍保持隔离；单独门禁测试用合成状态验证RELEASED与删除登记的组合|确认恢复核对与审批记录的实际入口，再设计隔离演练；直接改测试状态不构成真实恢复批准|
|test/refund-restore.integration.test.cjs（本批）|同一未知退款恢复后记录一致，HTTP和worker均被阻断|后续查询与终态、旧任务租约、重复回执与最新隐私限制的组合；不直接启动本批恢复库|

现有恢复命令只面向隔离测试库，没有据此确认生产恢复审批工具已经开发。后端可独立推进上述核查与合成组合；实际存储字节、真实旧库和正式恢复由对应环境、资料及授权到位后另验。
