# R0.6 MySQL8异步基础（CORE-S0-002）

本分支实现数据库基础，不代表全部Express路由或历史SQLite数据已迁移。`db.js`仍为本地/测试同步入口；production或DB_CLIENT非sqlite时会在打开数据库前拒绝，配置MySQL不会偷偷打开SQLite。部署此分支到旧生产入口将拒绝启动，因此不能把它当作生产切换包。

## 使用边界

- `src/infrastructure/database`提供`openDatabase(env)`、`execute(sql, params)`、`withTransaction(async tx => ...)`、`close()`。Repository/service必须await调用，事务内传递同一个tx，不用同步prepare/get/run伪装MySQL。
- 配置在进程环境显式传入；新CLI不加载旧生产.env。MySQL连接失败直接失败，无SQLite回退。
- mysql2/promise **3.24.4**为唯一新增运行时依赖，package-lock锁定。收益是Promise接口/参数化执行/连接池；成本是有限连接数和一个驱动，无Redis/ORM。替代旧同步shim会掩盖事务/等待语义，未采用。
- MySQL8服务端版本校验；每次获取会话设置UTC、InnoDB默认引擎和strict SQL mode。BIGINT返回字符串，避免超过JS安全整数时丢精度；金额仍需业务层/契约验证，不能直接Number强转。
- production要求非root用户、verify_identity TLS与显式可信CA文件；不关闭证书或主机名校验。本机自签证书实例只做loopback测试，没有证明正式TLS链或托管库可用。
- `withTransaction`只接收受信任repository的读/DML语句；DDL和事务控制语句拒绝。业务失败rollback；提交响应丢失标COMMIT_OUTCOME_UNKNOWN，调用方按业务键对账，不能自动重放交易。
- `withConnection`只给基础设施（迁移）使用；不要在业务service中绕过事务边界。

## 本地实例与测试

本机验收使用官方MySQL Community **8.4.11 LTS** ZIP，安装到仓库`.local/mysql/mysql-8.4.11-winx64`。原包MD5与官方页面一致，mysqld.exe的Oracle Authenticode签名有效。下载地址：[官方8.4页面](https://dev.mysql.com/downloads/mysql/8.4.html)。更换版本应更新记录并复验，不自动下载最新版本替换已验实例。

helper在仓库根运行：

```powershell
node scripts/local-mysql.cjs start
node scripts/local-mysql.cjs status
node scripts/local-mysql.cjs stop
```

仅监听127.0.0.1:33316，不注册Windows服务；mysqlx关闭。二进制、数据、随机口令、日志及生成的client.env/test-env.json均在`.local`、不入Git。测试用户只能管理jx_dev与jx_test_%数据库；本机维护账号只有SHUTDOWN权限。helper不覆盖已有数据目录或借用其他进程端口。

**Windows中文路径**：本机MySQL读取默认配置中的中文路径失败，采用指向同一仓库的ASCII盘符别名，未搬动源文件。例如确认J盘未占用后，在仓库根执行：

```powershell
subst J: "$PWD"
$env:LOCAL_MYSQL_ROOT='J:\'
node scripts/local-mysql.cjs start
```

helper校验别名与真实仓库目录的文件身份一致。停止MySQL并确认端口已关闭后才可`subst J: /d`撤销别名；不要删除其他人的盘符映射。若J已占用选择其他空闲盘符，或在ASCII路径clone/worktree后配置LOCAL_MYSQL_HOME。

在backend_server目录执行（Node22.19.0已验）：

```powershell
npm ci
node --env-file=../../../.local/mysql/runtime/client.env scripts/mysql-check.js
node --env-file=../../../.local/mysql/runtime/client.env scripts/mysql-migrate.js status
node --env-file=../../../.local/mysql/runtime/client.env scripts/mysql-migrate.js up
$env:JX_MYSQL_TEST_ENV_FILE=(Resolve-Path ../../../.local/mysql/runtime/test-env.json).Path
npm run test:mysql
npm test
```

完整test:mysql命令无测试配置会失败，不能通过skip冒充验收。集成测试仅接受loopback:33316/jx_local/jx_dev作为隔离控制连接，创建唯一jx_test_进程号_随机数据库；清理只drop本次成功创建且符合严格前缀的数据库，不碰jx_dev或任何外部库。测试保留无秘密SQL fixture供排错。

`npm test`使用显式test目录文件列表，避免Node全仓自动发现旧运维脚本；测试子进程带外部TCP拒绝guard。真实MySQL测试未配置时普通回归会明确skip；CI MySQL任务必须用test:mysql并提供隔离配置。

旧SQLite结构等价用例必须显式提供`JX_LEGACY_SQLITE_SNAPSHOT`脱敏旧库路径。默认开发库可能刚被测试生成，不能作为历史参照；无明确样本时报告SKIP，不再以空断言或新库自比较计为验收通过。

## 迁移与恢复

新的`migrations/mysql-runtime`与旧SQLite migrations/和旧MySQL整库DDL分开，CORE-S0-002版本仅有generation marker和元数据表；CORE-S0-004追加0003–0005的jobs/outbox/重试审计，不导入真实旧数据。标记用于识别R0.6异步存储代际，不能把旧DDL准备脚本误认为新运行时结构已齐。

每个四位编号SQL文件只包含一条语句；驱动关闭multipleStatements。文件名唯一、按序执行；SHA-256基于规范化LF内容。已经尝试过的文件不得改名/改内容或删除；新增变化只能追加新版本。

- `status`只读information_schema和现有journal，不建表、不运行迁移。
- `up`用同一连接GET_LOCK实现同库互斥，然后记录APPLYING→APPLIED/FAILED；失败SQL只保存错误码，不把SQL/秘密写日志。
- journal每次尝试独立行，保留失败时间、错误码和人工重试理由。同源重跑已成功版本为no-op。
- MySQL DDL可能隐式提交：后面的语句失败不会撤销先前已成功DDL。不要把整个迁移批次包装成“可回滚事务”。依据：[MySQL官方隐式提交说明](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html)。
- 明确FAILED时先核查真实结构与前置条件，再用`retry VERSION 原checksum "处理依据"`显式重试原语句；版本/校验和不符拒绝，旧失败记录保留。不能借retry变更历史迁移。
- 连接断开/进程中断或成功语句后journal未确认，保留APPLYING并拒绝自动重试，防止已提交DDL重复执行。需维护者核查结构与备份、记录处置依据，制定前向补救或隔离恢复方案；本工具不提供把APPLYING一键标成功的捷径。

第一次真实迁移、备份恢复、表结构/数据兼容及高风险迁移必须按对应Stage6/检查点安排；本工具的本机测试不是生产迁移授权。

接口库依据：[mysql2 Promise文档](https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper)。验收记录见仓库docs/tasks/records/CORE-S0-002.md。
