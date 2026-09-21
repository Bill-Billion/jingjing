# CORE-S0-002｜MySQL8异步基础

Owner chengcongcong222；Stage0；IN_PROGRESS。独立分支core/s0-002-mysql-foundation从integration@ac34c48开始，不依赖未评审的API候选。

执行计划：

1. 本机便携MySQL8.4，仅127.0.0.1，独立端口与.local数据目录；不注册服务、不使用生产.env。
2. mysql2/promise连接池、参数校验、UTC/utf8mb4、显式async事务；无同步SQLite兼容伪装。
3. 独立MySQL迁移目录、版本/校验和/执行记录、同库迁移互斥；status只读；历史SQLite迁移不挪用。
4. 实测新库应用、重复运行、校验和漂移、并发互斥、DML回滚、DDL失败后不误报已回滚/成功；记录恢复方式。
5. 检查旧入口：生产SQLite或MYSQL配置下的SQLite回退应明确拒绝；正式API路由迁移仍是后续任务，本轮不声称全应用已切换。
6. 更新证据/CURRENT后push并提交schema/migration交叉review；未评审不合入integration。

MySQL DDL可能隐式提交，不能将“包裹transaction”写成整个DDL批次可回滚。本任务区分事务业务操作和DDL迁移，保留失败/中断记录，由验证后的前向修复恢复。
