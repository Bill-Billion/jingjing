# Core CURRENT

- 基线：JX-R06-EXECUTION-BASELINE-20260921；Stage0；2026-09-21。
- 当前Task：CORE-S0-002；owner=chengcongcong222；branch=core/s0-002-mysql-foundation；IN_REVIEW。
- Handshake：起点/origin/integration=ac34c4836c005bd7b4f8b903d21782fe380bc432，dirty=false；REQ-008/011/013/015/032/033/037/042/043/044/045/052（WORK-14基础范围）。
- 已实现：mysql2/promise异步连接/事务、MySQL迁移journal/互斥/漂移检测/明确失败重试、SQLite拒绝回退、便携实例工具、限定范围且阻断外部TCP的测试入口。
- 实证：真实MySQL8.4.11；专项16 PASS/0 SKIP；限定后端回归36 PASS/1 SKIP。旧库样本未提供，不把新开发库当历史参照。[任务记录](../tasks/records/CORE-S0-002.md)与[机器证据](../tasks/records/CORE-S0-002-validation.json)。
- 环境收尾：本机实例正常关闭，临时J盘别名已撤销，二进制/数据/随机口令只在.local；无系统服务、无生产库连接或部署。
- 当前限制：旧Express路由尚未异步迁移；生产使用旧db.js会明确拒绝启动。本分支不是完整生产切换包；托管库/TLS、旧数据、备份恢复、负载、Worker和真实Provider未验。
- 共享边界：CCR-002/schema-migration待Experience交叉review，不标DONE，不合入integration。
- 契约：0.1.0-rc.1候选在独立[PR #1](https://github.com/Bill-Billion/jingjing/pull/1)，同样IN_REVIEW；本分支不包含未合并主契约。两流评审不能由本侧代签。
- 下一步：依据基础分支安排CORE-S0-003旧库导入或CORE-S0-004持久Worker；依赖与评审状态按board检查，正式合入前保持schema单一Owner。无旧样本只阻断对应旧数据实证。
- 原CORE-S0-000已完成；main/integration本轮未变。合并两个Core PR时保留双方任务状态与证据，不整份覆盖board/CURRENT。
