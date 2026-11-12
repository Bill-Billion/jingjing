# 本批复验入口

正式树worktrees/client-testing，分支core/full-business-closure-20261028。最终业务和运行号见FINAL_BACKEND.json。接口0.31.59-rc.1/0212不变，无客户端字段或迁移。

1. 使用已有相邻full-flow/.local/mysql/runtime/test-env.json设置JX_MYSQL_TEST_ENV_FILE；只接受NODE_ENV=test、127.0.0.1:33316/jx_dev。测试自行创建随机jx_test库并清理，禁止把数据库连接或密钥入Git。
2. backend_server中NODE_OPTIONS=--require ./scripts/test-network-guard.cjs。第一批五个测试文件：refund-restore、recharge-refund-recovery、release、privacy-execution、worker.integration.test.cjs；第二批新增统计修复复跑refund-restore和release。两批有重叠，不相加。
3. 根目录node scripts/run-backend-acceptance.cjs --profile all；清NODE_OPTIONS、JX_INDEPENDENT_FULL_UI/JX_INDEPENDENT_WEB，JX_PM01_STOCK_WEB/JX_PM01_NOTICES_WEB为0，沿用本机既有ffmpeg/ffprobe及arial字体配置。没有本机前端运行。
4. 核summary的exit_code=0、FAIL=0、missing_files/changed_sources/artifact_errors为空。缺脱敏旧库样本的58表结构对照单列跳过，不能冒充实际旧库通过。
5. 同次收集78份HTTP文件、refund-restore-journey.json和ci-evidence/release-rehearsal.json；重新核冻结源码与文件新鲜度。使用相邻core/.local/contract-venv/Scripts/python.exe运行scripts/validate_contract_batch.py，以最终PASS和elapsed_seconds为准。
6. 核full_business_check、acceptance_progress --check、acceptance_work_queue --check、audit_requirement_trace --check、collaboration_check --render与git diff --check。首次失败及测试计数类型错误留档；日志展示副本转UTF-8并清行尾空白，原始日志留.local。

恢复测试不设置RELEASED，不启动恢复库HTTP/worker。原请求查询是合成渠道和直接内部引擎调用；隐私登记是合成夹具，只检验重放和访问保护，不代表真实删除审批或外部字节清理。测试不包含生产恢复或正式回退批准。
