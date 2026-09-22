# CCR-002｜MySQL基础共享边界评审

Task CORE-S0-002；Owner chengcongcong222；Stage0；WORK-14关联REQ见board。分支core/s0-002-mysql-foundation，从integration@ac34c48开始，与PR #1契约候选独立。

范围：async MySQL边界、版本迁移journal、基础generation metadata及SQLite拒绝回退。没有创建未审业务表或修改Flutter/Web/主OpenAPI。跨流review状态PENDING，未代签。

请Experience重点核对：

1. ID/金额数据库BIGINT保持字符串，客户端继续按契约安全范围处理，不通过同步SQLite shim改变API语义。
2. 新元数据只标存储代际，不表示账号/支付/许可表或业务路由已迁移；旧API暂时不改响应。
3. 旧生产入口拒绝SQLite是明确失败，客户端不得Demo兜底；此分支不能直接作上线包。
4. schema迁移只由Core新增；失败/中断不伪造成功，未知状态停止并由实际核查恢复。
5. 两个Core PR合并时保留双方任务证据和当前进度；正式新API仍依赖PR #1评审及后续实现。

[实现与运行说明](../../晶晶日上工程交接包/01_源码/backend_server/docs/MYSQL_FOUNDATION.md)；[测试记录](../tasks/records/CORE-S0-002.md)。本机自验不是生产迁移批准。
