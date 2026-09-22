# CORE-S0-004｜持久任务、租约、outbox 和独立 Worker

2026-09-21；Owner chengcongcong222；Stage 0；IN_REVIEW。分支 core/s0-004-persistent-worker，从 PR #2 的 d9509507544743898644c1d6232d143bf03c86af 开始，起点 dirty=false；origin/integration=ac34c4836c005bd7b4f8b903d21782fe380bc432。已先认领提交 960b8a3 并推送，再实现。契约 0.1.0-rc.1 仍在 PR #1 待评审，本分支不含其主文件。

WORK-09/14；关联 REQ-001/002/003/008/011/012/013/015/021/029/032/033/037/038/039/040/042/043/044/045/052/056/059/060。基础设施覆盖这些需求的共同技术依赖，不代表 24 项业务全部完成。

## 已交付和边界

1. 新增 0003 jobs、0004 outbox、0005 人工重试审计；不改已发布的 0001/0002。业务键幂等/冲突拒绝、数据库时钟租约、心跳、过期接管、随机 token 限制旧执行者写回。
2. 同事务写业务事实/outbox；outbox→任务/投递确认在单一事务内提交，重复投递不新增任务，冲突可见。退避、次数上限、人工处理依据和历史尝试保留。
3. 独立 Worker runner/入口，首次执行与 Provider 恢复分开；错误结果不明时 BLOCKED，缺处理器明确未启用。新入口不加载旧 .env、不启动 HTTP API、不自动迁移数据库。
4. API 不再启动旧 scheduler 或启动恢复视频轮询；scheduler 不再导入即注册计时器。旧定时业务未接入新队列，旧路由内异步调用和同步 SQLite 仍待迁移；本分支不可直接上线。
5. 明确模块职责、服务/仓储/事务/outbox边界；没有创建整套未完成模块的空 CRUD。支付/实名/生成/退款处理器未启用，测试替身仅在 test/fixtures。
6. 固化每轮报告要求：仓库及工作区 AGENTS、主线进展、CURRENT、任务记录与证据配套；工作区 README 继续作为用户入口。

## 验证结果

- Worker 专项：**21 PASS / 0 FAIL / 0 SKIP**，包括 16 个真实 MySQL 场景、4 个单元/入口检查、1 个父测试计数。[日志](CORE-S0-004-evidence/worker.log)
- MySQL 基础回归：**16 PASS / 0 FAIL / 0 SKIP**，新增迁移后首次/重复/漂移/失败和连接中断恢复仍通过。[日志](CORE-S0-004-evidence/mysql.log)
- 后端限定回归：**57 PASS / 0 FAIL / 1 SKIP**，跳过项是缺显式脱敏 SQLite 旧库的等价对比。[日志](CORE-S0-004-evidence/regression.log)
- 关键场景：并发幂等/冲突、事务和 outbox 同时回滚、插入任务后确认前故障回滚、多 dispatcher、12 次并发领取、同名 Worker 过期 token 被拒、心跳续租、延时退避/上限/审计、运行中丢租、未知提交查询恢复、缺恢复器阻断、实际测试子进程非零退出后由新进程恢复、停止信号不假报成功。
- [机器证据与被测文件 hash](CORE-S0-004-validation.json) 保存命令和 LF 规范化源码 SHA256；三个计数是重叠测试入口，不能相加成独立业务验收项。

首轮 Worker 测试的回滚 fixture 漏写元数据 INSERT 列名，实际表还有时间列，导致 1 个子场景失败。修正 fixture 后重新完整采集上述三组通过日志；未通过的试跑不记为通过证据。

环境：Windows / Node22.19.0 / MySQL8.4.11 / 127.0.0.1:33316；每个场景唯一 jx_test_*，只清理本次创建的数据库。外部 TCP guard 生效，未访问生产、未调用真实供应商或收费能力。生产 worker 当前预期 WORKER_NOT_READY，测试进程能运行不表示真实业务已启用。

限制：启动不挂 scheduler 的检查为源码静态断言，不是全 API E2E；未测试托管库/TLS、负载/复制/故障切换、COMMIT 确认丢失、真实供应商的幂等/查询能力。数据库租约不保证外部副作用 exactly-once。完整路由切库、旧数据、域处理器、真实支付及原 14 项真实性整改仍在后续任务。

## 评审与接续

[CCR-004](../../collaboration/CCR-004-persistent-worker.md) 待 Experience 交叉评审。依赖 PR #2，先评审/合入基础，再调整本 PR 到 integration 并检查最终差异；不把合入基础分支当作审批通过。未合并 integration/main，未代签评审。

[运行说明](../../../晶晶日上工程交接包/01_源码/backend_server/docs/PERSISTENT_WORKER.md)；[当前计划与下一步](../../status/MAINLINE_PROGRESS.md)。下一项优先 CORE-S0-006，把已通过的隔离测试固化到 CI；随后 CORE-S0-005 Provider/Readiness。CORE-S0-003 导入工具可先做，真实旧数据验收仍需显式脱敏快照。

本轮本机收尾：便携MySQL已正常关闭，33316无监听，校验同一目录身份后撤销J盘临时别名；未注册系统服务。二进制/数据/随机口令保留在忽略的.local，可用于后续复验。

发布记录：实现提交 `f798f7925a63b0f43f50cb25f1a07c9698503917` 已推送，[PR #3](https://github.com/Bill-Billion/jingjing/pull/3) OPEN，base=`core/s0-002-mysql-foundation`。本段发布元数据在后续文档提交中记录；测试绑定文件hash不受影响。
