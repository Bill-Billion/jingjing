# 本轮复验入口

业务a90d88a5ff53dd7649ec441eed88204362d10258，client-testing。接口0.31.59-rc.1/0212不变，无HTTP/迁移/前端变化。

backend_server中设置JX_MYSQL_TEST_ENV_FILE指向原full-flow/.local/mysql/runtime/test-env.json，NODE_OPTIONS=--require ./scripts/test-network-guard.cjs，执行：

```text
node --test --test-concurrency=1 test/private-object-inventory.test.cjs test/private-object-cli.integration.test.cjs test/release-policy.test.cjs test/release.integration.test.cjs test/migration-rollback.integration.test.cjs
```

本机45项通过（含父测试）、0失败/跳过。仅test、127.0.0.1:33316、jx_dev；测试自建随机库并清理，不碰既有人工环境。本轮未运行完整后端或HTTP批次；前批全量不算本候选结果。

新命令、参数、输出含义与Windows受控文件保管要求见[操作说明](../../collaboration/STAGE_12_RUNBOOK.md)。私有清单不上传Git，证据只存合成摘要与脱敏输出。object-verify退出0是观测成功，不是字节全部正确，更不是恢复批准；必须读counts和recovery_authorized。

验收登记仅ACC-DEL-29.02转PARTIAL，原预期和正式PASS不改。运行full_business_check、acceptance_progress --check、acceptance_work_queue --check、audit_requirement_trace --check及collaboration_check --render；统计19/77/55，18组/12路线不关闭。
