# 复验方法

业务5830823c54a9a3ea0849d928b571eee9196b96cd，接口0.31.59-rc.1/0212。仅本机测试MySQL 127.0.0.1:33316/jx_local/jx_dev，环境文件相邻full-flow/.local/mysql/runtime/test-env.json，测试自动创建清理随机库。禁止生产、前端和真实服务。

1. 设置JX_MYSQL_TEST_ENV_FILE，JX_PM01_NOTICES_WEB=0；backend_server下node --require ./scripts/test-network-guard.cjs --test --test-concurrency=3，依次文件notices-ordinary.integration.test.cjs、notices.integration.test.cjs、cocreation.integration.test.cjs、cocreation-modern-journey.integration.test.cjs、wallet.integration.test.cjs、wallet-policy.test.cjs、operations.integration.test.cjs。130通过，与全量重叠。
2. 根目录运行node scripts/run-backend-acceptance.cjs。固定运行backend-acceptance-2026-11-13T04-07-08-348Z-bb850f，见FINAL_BACKEND.json及SOURCE_MANIFEST.json。
3. 最终完整运行配置JX_TEST_FFMPEG/JX_TEST_FFPROBE为本机工具目录ffmpeg-9.0.2-essentials_build/bin，JX_TEST_FONT=C:/Windows/Fonts/arial.ttf。第一次漏配置和奖品夹具失败见FIRST_FULL_BACKEND/FIRST_FULL_FAILURE；当时媒体补跑9项为历史诊断。修5830823c夹具后先单组7项通过，再重新完整运行。
4. 当前运行的80文件按原scripts/runtime-contract-manifest.json收集，校验mtime晚于启动及冻结源码不变，用原contract-venv运行scripts/validate_contract_batch.py；见FINAL_CONTRACT.json。最终媒体HTTP已纳入80文件，另复制MEDIA_HTTP.json/MEDIA_CONTRACT.json便于查阅；第一次补跑保留FIRST_MEDIA文件。首次补跑格式核验误指向docs路径而被校验器拒绝，改用允许的.local路径后通过；失败见MEDIA_CONTRACT_PATH_FAILURE.json。
5. 验收登记只改8条PARTIAL；核collaboration_check、full_business_check、acceptance_progress、acceptance_work_queue、audit_requirement_trace及Git中partial-business-evidence.json实际字节摘要。失败证据保留。
