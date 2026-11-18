# 复验入口

源码04fe18fc0643101944fe7e42e0c7c5b24cf487d2，正式树client-testing，接口0.31.59-rc.1/0212。仅使用原相邻full-flow/.local/mysql/runtime/test-env.json设JX_MYSQL_TEST_ENV_FILE；test、127.0.0.1:33316、jx_local/jx_dev。测试创建清理随机隔离库，不包含真实个人数据。

1. backend_server设置NODE_OPTIONS=--require ./scripts/test-network-guard.cjs，运行node --test --test-concurrency=1，文件migration-rollback.integration.test.cjs、release-policy.test.cjs、release.integration.test.cjs、refund-restore-authority.integration.test.cjs。预期40通过，无失败/跳过。演练实际启动release-tools子进程，不通过替身模拟命令；合成迁移故障是预期反例。
2. 根目录清NODE_OPTIONS及前端启用变量，配置原JX_TEST_FFMPEG/JX_TEST_FFPROBE/JX_TEST_FONT，运行node scripts/run-backend-acceptance.cjs --profile all。固定运行backend-acceptance-2026-11-12T16-01-36-116Z-fcbdcb；核源码未变、缺文件为空、无失败。
3. 同次收集runtime-contract-manifest的78文件以及migration-rollback-drill、refund-restore-authority-journey、refund-restore-journey、release-rehearsal四份业务证据，校验新鲜度/摘要；用原contract-venv运行scripts/validate_contract_batch.py，结果见FINAL_CONTRACT.json。
4. 维护命令与实际故障处理步骤见[操作说明](../../collaboration/STAGE_12_RUNBOOK.md)。recovery-check退出0不表示可运行，要核attention_required、alerts及NOT_APPROVED。恢复库一直QUARANTINED，无前端运行，无真实渠道/生产操作。
5. 核collaboration_check --render、full_business_check、acceptance_progress --check、acceptance_work_queue --check、audit_requirement_trace --check和git diff --check。首次两次夹具失败保留，UTF-8日志展示副本仅清行尾空白，原始UTF-16日志留.local。
