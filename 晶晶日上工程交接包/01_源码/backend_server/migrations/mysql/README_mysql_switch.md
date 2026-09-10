# SQLite → MySQL 8.0 切换手册（开关式、可回滚，需负责人决策后执行）

> 现状：生产仍为单文件 SQLite（WAL，`/opt/jjsr/jingjingshangri.db`），运行良好。
> 本目录与 `scripts/db_export|import` 仅为**切换准备**，本次整改**不安装 MySQL、不切库、不删任何数据**。
> 铁律：金额一律 `BIGINT` 整数「分」，禁止 DECIMAL/浮点金额；字符集 `utf8mb4`；引擎 `InnoDB`。

## 1. 类型映射（已在 01_schema_mysql8.sql 落地）
| SQLite | MySQL 8.0 | 说明 |
|---|---|---|
| INTEGER PRIMARY KEY AUTOINCREMENT | BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY | 主键 |
| INTEGER（金额/计数/布尔） | BIGINT | 金额=分，整数；布尔用 0/1 |
| REAL | DOUBLE | 税率/比例等非金额浮点 |
| TEXT（长内容/JSON） | TEXT | 文案、JSON、脚本正文 |
| TEXT（URL/路径，中等） | VARCHAR(512) | 各类 url/cover/avatar |
| TEXT（普通短字段） | VARCHAR(255) | 状态、名称等 |
| TEXT + UNIQUE/主键 | VARCHAR(191) | utf8mb4 索引安全长度 |
| BLOB | LONGBLOB | 人脸特征向量（加密） |
| DATETIME DEFAULT CURRENT_TIMESTAMP | 同 | MySQL 原生支持 |

## 2. ECS 自建 vs 云 RDS 决策
- **ECS 自建 MySQL（省钱、运维自担）**：1GiB 小内存机不建议与 Node 同机常驻（InnoDB buffer pool 至少 256–512MB，会挤压应用）。若同机，`innodb_buffer_pool_size=192M`、关闭性能模式，仅作过渡。
- **RDS MySQL（推荐生产）**：自动备份/主备/慢日志/监控，免运维；选 1C1G 基础版即可起步，按备份保留 7 天。费用为外部采购项，**需负责人拍板，本次不开通**。
- 决策建议：DAU/订单量上来、或需要多实例/读写分离时直接上 RDS；当前单机 SQLite 足够，不提前花钱。

## 3. 切换步骤（决策通过后，在维护窗口执行）
1. **备份**：服务器 `node /opt/jjsr/ops/backup_sqlite.js 30`，并把 `jingjingshangri.db` 再下载一份到本地。
2. **准备 MySQL**：建库 `CREATE DATABASE jingjingshangri CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`，建最小权限账号。
3. **建结构**：`mysql -u<user> -p jingjingshangri < migrations/mysql/01_schema_mysql8.sql`，并处理文末「部分唯一索引」人工项（见第 5 节）。
4. **导数据**：
   - `node scripts/db_export_sqlite.js jjsr_export.json`（只读导出）
   - 服务器 `npm i mysql2`（仅切换机需要）
   - 先 dry-run：`MYSQL_HOST=.. MYSQL_USER=.. MYSQL_PASSWORD=.. MYSQL_DATABASE=.. node scripts/db_import_mysql.js jjsr_export.json`
   - 核对行数无误后：同样命令加 `--apply`（事务导入，失败回滚）。
5. **切连接（开关）**：在服务器 `.env` 设置
   `DB_CLIENT=mysql` 及 `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE`。
   > 注意：当前 `db.js` 运行时尚未实现 MySQL 驱动接入（保持 SQLite 现状）。切换时需补一个 `db/mysqlAdapter`（mysql2 连接池，接口对齐 better-sqlite3 的 prepare/all/get/run/transaction），这是切换的剩余开发项，已在档案 18 列明。
6. **灰度验证**：`pm2 restart jjsr --update-env && pm2 save`，跑 `node ops/smoke_api.js`（58 项）与公网 17 项；比对关键表行数与金额合计。

## 4. 回滚步骤
- 连接开关回退：删除/置空 `.env` 的 `DB_CLIENT=mysql`（回到默认 sqlite），`pm2 restart jjsr --update-env`。
- SQLite 文件从未被删除，WAL 继续可用；切换窗口内如对 MySQL 写过新数据，需把增量反向导回（切换窗口应停写或只读维护，避免双向 diff）。
- RDS 实例在观察期（建议 ≥7 天）后再释放，避免过早销毁。

## 5. MySQL 不支持「部分唯一索引」的人工项
SQLite 的 `CREATE UNIQUE INDEX idx_payments_one_pending ON payments(order_no, stage) WHERE status='pending'`
在 MySQL 无对应语法，改用**生成列 + 唯一键**：
```sql
ALTER TABLE payments
  ADD COLUMN pending_key VARCHAR(191) GENERATED ALWAYS AS
    (CASE WHEN status='pending' THEN CONCAT(order_no,'#',stage) ELSE NULL END) STORED,
  ADD UNIQUE KEY uq_payments_one_pending (pending_key);
```
01_schema_mysql8.sql 中该索引以注释标出，建库后按上面语句补建（语义与 SQLite 完全一致：同一订单同一分期至多一条 pending 支付单）。

## 6. 迁移运行器与 MySQL 的关系
- `migrations/`（JS 运行器）当前面向 SQLite；切 MySQL 后，增量结构变更改为：每个迁移同时维护 SQLite DDL 与 MySQL DDL，或由运行器按 `config.db.client` 选择方言。
- `schema_migrations` 表在 MySQL 结构脚本中已建，数据导入时一并迁移版本记录，保证两边版本一致。
