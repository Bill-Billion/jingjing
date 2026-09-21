# CORE-S0-002｜MySQL8异步基础

Owner chengcongcong222；Stage0；IN_REVIEW。独立分支core/s0-002-mysql-foundation从integration@ac34c48开始，不依赖未评审的API候选。实现及自验完成，尚未获得跨流评审，不能标DONE或合入integration。

发布：实现提交65db595已推送，[PR #2](https://github.com/Bill-Billion/jingjing/pull/2)已创建，目标integration。main/integration保持原提交；未代队友review。

执行计划：

1. 本机便携MySQL8.4，仅127.0.0.1，独立端口与.local数据目录；不注册服务、不使用生产.env。
2. mysql2/promise连接池、参数校验、UTC/utf8mb4、显式async事务；无同步SQLite兼容伪装。
3. 独立MySQL迁移目录、版本/校验和/执行记录、同库迁移互斥；status只读；历史SQLite迁移不挪用。
4. 实测新库应用、重复运行、校验和漂移、并发互斥、DML回滚、DDL失败后不误报已回滚/成功；记录恢复方式。
5. 检查旧入口：生产SQLite或MYSQL配置下的SQLite回退应明确拒绝；正式API路由迁移仍是后续任务，本轮不声称全应用已切换。
6. 更新证据/CURRENT后push并提交schema/migration交叉review；未评审不合入integration。

MySQL DDL可能隐式提交，不能将“包裹transaction”写成整个DDL批次可回滚。本任务区分事务业务操作和DDL迁移，保留失败/中断记录，由验证后的前向修复恢复。

## 已交付

- mysql2/promise 3.24.4异步连接/参数化执行/显式事务；UTC、utf8mb4、InnoDB、BIGINT字符串与生产TLS配置校验。
- 独立MySQL迁移目录，版本/内容hash/尝试历史、GET_LOCK互斥、只读status、失败后显式校验和重试；连接中断保留APPLYING，拒绝盲目重放。
- 阻止旧同步db.js在production或DB_CLIENT=mysql时打开SQLite；旧路由未迁移，生产入口会明确失败，不假装已经使用MySQL。
- 便携实例helper及操作说明；[MySQL基础说明](../../../晶晶日上工程交接包/01_源码/backend_server/docs/MYSQL_FOUNDATION.md)。数据/凭据/二进制留.local，不入Git。
- 修复Windows/Node22下原npm test入口；显式仅运行test目录，并给测试子进程加外部TCP拒绝保护。旧SQLite对比改为明确样本输入，无样本真正SKIP。

## 验证与证据

Windows、Node22.19.0、MySQL8.4.11。真实隔离实例127.0.0.1:33316，无系统服务，唯一生成的jx_test_*数据库测试后清理；jx_dev只含本轮基础元数据。本次结束已正常SHUTDOWN，移除临时J盘别名，安装文件仍可复用。

- 后端限定回归：**36 PASS / 1 SKIP / 0 FAIL**。缺少显式脱敏旧库样本的等价比较跳过，不用新生成库冒充历史库。[回归日志](CORE-S0-002-evidence/regression.log)。
- MySQL专项：**16 PASS / 0 SKIP / 0 FAIL**，含5个单元检查、10个真实库场景与1个父测试；不是16项独立商业验收。[专项日志](CORE-S0-002-evidence/mysql.log)。
- 实测新库只读status、应用/重复迁移、BIGINT/中文emoji/参数化、事务提交回滚、并发增量、同库互斥、hash漂移、DDL失败保留先前结构、带依据重试及断开真实连接后禁止自动重放。
- 连接/CLI/status/repeat-up结果见[CLI证据](CORE-S0-002-evidence/cli.json)；被测源码LF规范化hash、命令和试验限制见[机器记录](CORE-S0-002-validation.json)。

测试命令调整期间，全仓自动发现曾误包含历史沙箱脚本（自生成凭据、只读沙箱查询尝试，无真实支付）；该试跑不作为Provider验收。最终runner排除scripts目录并阻断外部TCP。另一个旧问题是默认开发库可能由测试自己创建，现已要求JX_LEGACY_SQLITE_SNAPSHOT显式提供参照。

未验证：完整Express路由切库、真实旧数据导入、托管MySQL/正式TLS信任链、备份恢复、负载、COMMIT响应丢失故障注入和真实Provider。旧公开存储/Demo等Stage1问题仍存在；旧测试通过不表示这些生产问题已修复。

## 评审与兼容

共享边界为schema/migration；[CCR-002](../../collaboration/CCR-002-mysql-foundation.md)等待Experience交叉review。与PR #1独立；合并时保留两个Task的最新状态，不整份覆盖board/CURRENT。

本分支若直接部署到旧生产入口会因SQLite禁用而拒绝启动；需要后续路由异步迁移、旧数据迁移与正式切换验收，不能靠把DB_CLIENT改回sqlite绕过。当前没有生产部署或正式数据库访问。
