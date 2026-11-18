# 财务依据被限制后仍可审批：独立复现

2026-11-04，新前端 b0ed8878 合入后专项调查。属于原财务与隐私业务的流程补全，不是新增商业功能。依据文件已经正式限制时，旧页面读取成功不能替代提交时服务器检查。

红测使用独立随机MySQL库，复用原settlement前置，真实HTTP上传/读取财务材料。限制由已有隐私流程建立：申请、提出方案、独立审核、实际执行；没有SQL插入限制状态。

|检查|预期|修复前实际|
|---|---|---|
|已合法读取的付款凭据随后被限制，再提交独立审批|409 CONTENT_RESTRICTED，申请、付款、账目均不变|200；付款变PAID，实付0→1000分，账目2→3|
|新调整草案引用受限依据|409且不新增草案或账目|200，新增1条草案和1条审计|
|已审核会签的原约定依据被限制，使用另一个未受限收款文件申请新付款|409且保留旧账、不新增付款申请|200，新增1条付款申请和1条审计|

已确认后端缺陷，根agent负责context.js统一资料检查修复；独立测试准备了限制解除后同一申请可重新审批、草案可正常创建的正向断言。第一处守卫修复后的两项业务检查及既有迁移前置通过，见green；静态复查进一步发现liveAgreement未重查原约定依据，补充新用款红测后确证，见agreement-red。根agent已补liveAgreement对原约定依据的重查，最终完整新库回归通过。最终测试分别使用付款回执文件、原约定文件与收款资料，避免两个入口互相遮掩。

- [红测日志](red/test.log)
- [修复前实际状态及金额](red/observations.json)
- [红测源码摘要](red/source.json)
- [第一处修复后绿测](green/test.log)
- [原约定新用款红测](agreement-red/observations.json)

本次数据库和服务已清理；全部材料和钱账为合成资料，没有真实资金变动。正式151条验收状态不因这两项测试自动变化。

## 最终结果与复验

最终5项 Node 检查通过、0失败、0跳过；其中3项为业务回归、1项为既有迁移前置，另1项为父测试，不表示5个功能。三处受限提交均返回409 CONTENT_RESTRICTED，不新增钱账、不改原状态。解除后同一付款凭据可重新审核，实际合成已付变1000分；新草案和新付款恢复可办。限制期间历史原约定仍APPROVED，原有已付1000分仍可读取，没有删除或回滚旧账。

- [最终绿测日志](final-green/test.log)
- [最终记录、状态与金额](final-green/observations.json)
- [最终代码摘要](final-green/source.json)

修复位置：backend_server/src/modules/settlement/context.js:12 统一文件检查；source.js:25 已批准约定在后续用款时重查原依据。新增测试 settlement-evidence-restriction.integration.test.cjs 的93、106、112行对应付款回执、草案、新用款三条。

工作树根目录设置 JX_MYSQL_TEST_ENV_FILE 为已有隔离MySQL配置后：

```powershell
$env:JX_FINANCE_RESTRICTION_PHASE='recheck'
node --require './晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs' --test './晶晶日上工程交接包/01_源码/backend_server/test/settlement-evidence-restriction.integration.test.cjs'
```

finance完整模块由根agent独立执行；此报告仅记录上述新回归，不能借其数量替代全模块/全业务验收。
