# 剧本许可与项目使用

policy.js只处理明确范围和额度，不读取数据库或调用外部服务。repository.js负责可信账号、权限、MySQL事务、合同保存、独家串行检查、外部事实核验记录、项目分配与审计。公开接线在http/licensing-routes.js，复用既有认证与私有存储；不让页面依赖内部函数。

项目改稿使用服务端validBinding，不能从请求传入授权回调。许可不授数字人脸声权利；受控阅读不授制作/训练权。详见docs/collaboration/STAGE_5_API.md。测试：设置隔离JX_MYSQL_TEST_ENV_FILE后运行node scripts/test-mysql.js licensing。缺环境拒绝，不能以跳过数据库测试报通过。
