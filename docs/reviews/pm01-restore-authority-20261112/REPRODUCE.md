# 本轮复验

1. 正式树client-testing，使用相邻full-flow/.local/mysql/runtime/test-env.json设置JX_MYSQL_TEST_ENV_FILE；仅test、127.0.0.1:33316/jx_dev，测试自行创建并清理随机jx_test库，不将连接或密钥入Git。
2. backend_server目录设置NODE_OPTIONS为--require ./scripts/test-network-guard.cjs，运行：

```text
node --test --test-concurrency=1 test/refund-restore-authority.integration.test.cjs test/refund-restore.integration.test.cjs test/recharge-refund-recovery.integration.test.cjs
```

3. 预期32项通过（含父测试）、0失败/跳过；核.local/refund-restore-authority-journey.json及refund-restore-journey.json。源码提交与三文件SHA256见VERIFICATION.json。首次单独9项和联合32项不能相加。
4. 只运行后端内部引擎，不解除QUARANTINED、不启动恢复库HTTP/worker。原库状态不变，恢复库无再次发送。到账和关闭分别在同一备份的不同隔离分支验证。
5. 本轮没有全量后端或HTTP批次，不借用前批数字；没有前端开发、修补或本机App/Web运行。远端自动工作流状态单独记录。
