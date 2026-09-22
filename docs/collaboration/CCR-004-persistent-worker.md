# CCR-004｜持久任务与 Worker 共享边界

Owner chengcongcong222；Task CORE-S0-004；Stage 0；WORK-09/14；24 项 REQ 关联见 board。状态 PENDING，未代签 Experience 评审。

基于 PR #2 的 d950950，PR 以 `core/s0-002-mysql-foundation` 为依赖基线。先完成 PR #2 的 schema review/合并，再将本 PR 改为 integration 基线并复核差异；不得先把 Worker PR 合入 MySQL 任务分支当作跨流通过。PR #1 主契约仍独立评审，本轮未新增 HTTP 接口或改 Flutter/Web。

请交叉核对：

1. 0003–0005 新增 jobs/outbox/retry audit，0001/0002 字节不改；关系和状态是任务事实，不是支付/许可/实名事实。
2. task_type + business_key 必须包含主体和版本；输入引用、输出引用不携带私密原件/密钥，冲突不可覆盖旧任务。
3. 租约和 token 防止过期写回；供应商操作仍需幂等和查询恢复，重复领取不等于 exactly-once。
4. Worker 目前 `WORKER_NOT_READY`：没有真实领域 handler；客户端不能收到假制作/付款成功。后续运营重试 API 须独立权限审查，本轮仅内部 repository。
5. API 移除自动 scheduler/视频启动恢复；旧自动验收、到期退款和对账未移植，正式启用前须完成对应领域接线/验收。现有路由仍未整体迁移 MySQL。
6. 16 个真实 MySQL Worker 场景 + 4 个单元/入口断言（框架计数含父测试为 21）；测试替身不作为真实供应商验收。

[任务证据](../tasks/records/CORE-S0-004.md)；[运行与兼容说明](../../晶晶日上工程交接包/01_源码/backend_server/docs/PERSISTENT_WORKER.md)。因共享边界，完成自验后状态为 IN_REVIEW，不标 DONE，不合并 integration。
