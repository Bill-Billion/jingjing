# CORE-S0-004 持久任务与独立 Worker

状态：实现与隔离自验完成，待 schema/migration 交叉评审。本分支依赖 PR #2 MySQL 基础，不是完整生产切换包。没有新增 Redis、消息中间件或依赖库。

## 数据与执行

新增迁移 0003–0005，不修改既有 0001/0002：`platform_jobs` 保存 R0.6 要求的任务类型、业务键、供应商/任务编号、状态、尝试次数、下次执行时间、租约、错误码、输入/结果引用；另有 fencing token、最大尝试数和原始意图 hash。`platform_outbox` 保存同事务产生的任务意图；`platform_job_retries` 保留人工重试操作者、依据和原状态/次数。

`createJobRepository(db)` 是内部基础设施接口，不是对外 HTTP API。输入引用不得包含明文身份证件、密钥或带签名的下载 URL。`task_type + business_key` 唯一且区分大小写；领域必须把主体、对象、操作和不可变版本纳入 business_key（例如 `partyId:orderId:render:v2`）。相同键而不同 payload/provider/retry budget 明确冲突，不能用重复请求偷偷覆盖已完成任务；变更业务意图须新版本键。最大尝试数由领域显式传入，不能把重试次数视为产品套餐次数。

service 示例（只示意内部接口，不是已实现订单流程）：

```js
await db.withTransaction(async tx => {
  await domainRepository.save(tx, approvedChange);
  await jobs.publish(tx, eventKey, {
    task_type: 'production.render', business_key: versionedBusinessKey,
    provider: providerName, payload_ref: privatePayloadRef, max_attempts: retryBudget,
  });
});
```

`publish` 必须使用当前领域事务的 tx。dispatcher 用同一个 MySQL 事务锁定一个 outbox、幂等插入任务并标记已投递；事务失败两者回滚。并发 dispatcher 使用 `FOR UPDATE SKIP LOCKED`；意图冲突转 BLOCKED，数据库异常不标已投递。它是数据库内 outbox→jobs 投递，不代表任何第三方消息已经送达。

Worker 领取同样使用短事务加行锁，提交租约后才运行 handler；时钟用数据库 UTC，心跳周期为租约的三分之一。`lease_owner + lease_token + 未过期 lease_until` 限制心跳、任务编号保存和结果写回，过期 Worker 即使名称复用也不能覆盖接管结果。MySQL 官方将 SKIP LOCKED 的适用场景包括多个会话访问队列表；不能据此承诺严格 FIFO 或高负载吞吐。[官方锁定读取说明](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)

## 处理器与恢复协议

- 本地 handler 提供 `execute(job,context)`，必须以 job.id/业务键实现副作用幂等；重复领取并不保证外部副作用只发生一次。
- Provider handler 的首次调用可执行 `execute`；后续尝试或已有 provider_task_id 时只走 `recover`。context 含 AbortSignal、稳定 `idempotency_key=job.id` 和有租约保护的 `saveProviderTask(id)`。恢复器先查询再决定下一步；无 recover 直接 BLOCKED。
- 返回 `SUCCEEDED` 必须有 result_ref；明确可重试的情况返回 `RETRY + error_code`；不可恢复返回 FAILED，需核查返回 BLOCKED。错误只保存受约束的机器码，不直接落原始供应商响应。
- 自动重试按 1s、2s、4s…到最多 300s 的退避，达到显式 max_attempts 转 FAILED。进程死亡后的租约接管也计入尝试。业务长轮询策略应由领域设计，不能把该退避当服务商完成时限。
- 未捕获异常被视为效果不明，转 BLOCKED，不盲目重放。`manualRetry` 只供后续已鉴权的运营 service 使用，必须有 actor_ref/reason_ref/额外尝试预算；保存审计，不抹掉历史次数和 provider_task_id。本轮未提供公网重试 API 或运营 UI。
- 停止时不领取新任务，通知活动 handler 中止；退出前未确认的工作保留租约等待恢复。进程入口对不响应停止的 handler 有 30s 退出期限。租约只控制本库写回，无法撤销已经发送的外部请求，因此不宣称 exactly-once。

## 启动与旧逻辑边界

先按 [MySQL 基础说明](MYSQL_FOUNDATION.md) 设置明确隔离配置并运行迁移。新入口不加载旧 `.env`，不自动执行 DDL。

```powershell
node --env-file=../../../.local/mysql/runtime/client.env scripts/mysql-migrate.js up
node --env-file=../../../.local/mysql/runtime/client.env src/worker/main.js
```

当前静态 handler registry 为空，第二条命令预期以非零退出并报告 `WORKER_NOT_READY`。这是实际未启用状态，不是启动成功。后续 CORE-S0-005 和对应领域任务完成真实 Adapter/Readiness 后，再以已审代码登记 handler；不支持通过环境变量任意加载脚本。独立进程运行已用隔离测试 fixture 验证，测试处理器从不注册进生产入口。

API 已移除启动 scheduler 和 `resumeUnfinished`；旧 scheduler 不再导入即注册定时器。**旧自动验收、退款/到期、对账、启动后恢复视频轮询不会自动执行**，尚未迁移为新 handler。现有路由内直接发起的旧异步调用也尚未改造，不能声称所有 AI 流程都已进入持久队列。原业务参数/支付副作用需后续分别审查，不能把旧函数直接挂上 Worker。旧 API 仍受 PR #2 的生产 SQLite 拒绝机制约束。

`npm run test:worker` 要求 JX_MYSQL_TEST_ENV_FILE，未配置直接失败。测试仅使用 127.0.0.1:33316 上本次生成的 jx_test_* 数据库，外部 TCP 被 guard 拦截；含测试进程异常退出/新进程恢复，供应商用 test-only fixture。`npm test` 是有隔离配置时的全部限定回归；未提供 MySQL 配置会显式跳过相应集成用例，不能当完整验收。

尚未验证：真实供应商幂等/查询、托管 MySQL、复制/故障切换、压力与公平性、COMMIT 确认丢失、完整 API E2E、已签发业务许可或支付结算事实。没有生产部署。
