# Staging 预发环境搭建手册（零额外采购：复用现有 ECS，进程/库/目录隔离）

> 原则：不新购服务器。Staging 与生产同机不同进程、不同端口、不同 SQLite/上传目录/环境变量，
> 仅绑定 127.0.0.1，经 Nginx 内网路径或 SSH 隧道访问，不暴露公网。数据用脱敏快照，禁止用真实手机号/人脸。

## 1. 目录与隔离
```
/opt/jjsr            # 生产（PM2: jjsr，端口 3000，库 /opt/jjsr/jingjingshangri.db，uploads/）
/opt/jjsr-staging    # 预发（PM2: jjsr-staging，端口 3100，库 /opt/jjsr-staging/staging.db，uploads/）
```
- 代码：从同一发布包解出到 `/opt/jjsr-staging`，`npm i --omit=dev`（better-sqlite3 本机编译）。
- 环境变量 `/opt/jjsr-staging/.env`（与生产完全分开）：
  ```
  NODE_ENV=staging
  PORT=3100
  SQLITE_PATH=/opt/jjsr-staging/staging.db
  UPLOAD_URL_PREFIX=/staging-uploads
  JWT_SECRET=<另生成一套，禁止与生产相同>
  ALLOW_ANON_AI=false
  AI_DELIVERABLE_REVIEW=true   # 预发默认打开交付审核，验证人工流转
  # 上游用独立测试 Key；短信可用 SMS_DEV_CODE 兜底，避免真实下发
  ```

## 2. 脱敏数据快照
```
node /opt/jjsr/scripts/db_export_sqlite.js /tmp/prod_export.json   # 生产只读导出
# 脱敏：手机号/身份证/人脸特征向量清空或替换为假数据后再导入 staging
# staging 首次启动会自动迁移建表，再导入业务数据；空库也可用注册接口造测试用户
```

## 3. PM2 拉起（独立进程名，不影响生产）
使用 `docs/ecosystem.staging.config.js`：
```
pm2 start /opt/jjsr-staging/ecosystem.staging.config.js
pm2 save
```
日志独立：`/root/.pm2/logs/jjsr-staging-{out,error}.log`。

## 4. 访问方式（二选一，均不占公网）
- 方案A（推荐）：SSH 隧道 `ssh -L 3100:127.0.0.1:3100 root@server`，本地访问 http://127.0.0.1:3100/api/health。
- 方案B：Nginx 加内网 server，仅允许公司出口 IP，路径 `/staging/` 反代；不申请独立域名/证书。

## 5. 发布前在 Staging 必跑
1. `node scripts/migrate.js status`：迁移版本齐全；
2. `npm test`（node:test 全绿）；
3. `node scripts/reconcile.js`：四账 balanced；
4. 主链路：验证码登录→广场→报价→下单→Mock 支付→AI 任务（测试 Key）→交付审核→对账；
5. 退款：全退/部分退/重复回调幂等；
6. `GET /api/admin/providers/status`：通道就绪度符合预期。
全绿后再按档案16第四节发布生产。

## 6. 回滚
Staging 不影响生产；`pm2 delete jjsr-staging`、删除 `/opt/jjsr-staging` 即可。
