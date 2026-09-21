# Core CURRENT

- R0.6 / Stage 0 / CORE-S0-004 / IN_REVIEW；owner=chengcongcong222；branch=core/s0-004-persistent-worker。
- Handshake起点：PR #2 @ d950950；origin/integration=ac34c4836c005bd7b4f8b903d21782fe380bc432；dirty=false；WORK-09/14；24个REQ见任务记录/board。
- 交付：MySQL jobs/outbox/人工重试审计、并发领取、租约/token/心跳、恢复与独立Worker；API移除旧启动定时器和视觉恢复。领域handler未启用，旧路由未整体切库，不能当生产切换包。
- 自验：Worker21 PASS/0 SKIP；MySQL16 PASS/0 SKIP；限定后端57 PASS/1 SKIP（缺显式脱敏旧库）。[任务证据](../tasks/records/CORE-S0-004.md)及[源码hash/命令](../tasks/records/CORE-S0-004-validation.json)。
- CORE-S0-000 DONE；001/002 IN_REVIEW；契约0.1.0-rc.1在独立PR #1，本分支不包含其主文件。三项均不代签review。
- 评审：CCR-004/schema-migration PENDING；依赖PR #2先评审合入，随后本PR改base integration；本轮不合并main/integration。
- 下一项优先CORE-S0-006后端CI，随后CORE-S0-005 Provider/Readiness；旧库导入先做工具，实证仍缺脱敏样本。
- 详细说明：[主线当前计划、累计完成与下一步](MAINLINE_PROGRESS.md)。各次任务记录保留历史证据，汇总页每轮更新。

本轮本机收尾：便携MySQL已正常关闭，33316无监听，校验同一目录身份后撤销J盘临时别名；未注册系统服务。二进制/数据/随机口令保留在忽略的.local，可用于后续复验。

发布记录：实现提交 `f798f7925a63b0f43f50cb25f1a07c9698503917` 已推送，[PR #3](https://github.com/Bill-Billion/jingjing/pull/3) OPEN，base=`core/s0-002-mysql-foundation`。本段发布元数据在后续文档提交中记录；测试绑定文件hash不受影响。
