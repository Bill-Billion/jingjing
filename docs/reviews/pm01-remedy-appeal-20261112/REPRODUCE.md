# 复验入口和固定版本

正式树worktrees/client-testing，分支core/full-business-closure-20261028。第一业务391d8009，最终a0128095；接口0.31.59-rc.1/0212不变。

1. 使用已有相邻full-flow/.local/mysql/runtime/test-env.json，仅NODE_ENV=test、127.0.0.1:33316/jx_dev，测试新建随机jx_test_*库。密钥/连接/完整备份保留.local，不进Git。
2. backend_server中NODE_OPTIONS=--require ./scripts/test-network-guard.cjs。第一专项文件：reward-remedy-lifecycle、redemption、redemption-delivery-evidence、redemption-lottery、engagement、privacy-benefit-copy、wallet-refund-entitlement-journey.integration.test.cjs，共86项。最终专项：candidate-withdrawal、refund-restore、engagement、release、recharge-refund-recovery.integration.test.cjs，共69项；包含重叠，不能相加成业务数。
3. 仓库根node scripts/run-backend-acceptance.cjs --profile all；清NODE_OPTIONS、JX_INDEPENDENT_FULL_UI及JX_INDEPENDENT_WEB，JX_PM01_STOCK_WEB/JX_PM01_NOTICES_WEB为0；沿已有ffmpeg/ffprobe及arial字体。没有本机App/Web运行。
4. 第一运行backend-acceptance-2026-11-12T13-37-52-697Z-d75630仅对应391d8009；最后运行backend-acceptance-2026-11-12T13-57-53-113Z-f49350对应a0128095。必须检查exit_code=0、FAIL=0、missing_files/changed_sources/artifact_errors空；唯一旧库样本跳过单列。
5. 最终运行后收集runtime-contract-manifest.json中的78份新鲜HTTP文件及六份同记录业务摘要，mtime不得早于开始；收集时重新核冻结源码哈希。四个业务为奖品、实际中奖、投票与互动申诉；新增候选/奖励文件和未知退款恢复各一份。
6. 使用相邻core/.local/contract-venv/Scripts/python.exe运行validate_contract_batch.py；以最终PASS、elapsed_seconds和全部文件为准，不使用“未完成”的中间占位报告。
7. 上传前运行full_business_check、acceptance_progress --check、acceptance_work_queue --check、audit_requirement_trace --check、collaboration_check --render和git diff --check。18组/12路线/151标准不随测试数量改变。

候选探针及恢复预备最初在backend_server/.local准备，不改第一轮冻结源码。正式纳入test目录后再固定a0128095统一验证。历史失败日志保留，最终证据明确分轮。只使用合成资产、已规范化的合成渠道回执及隔离历史时间，不是实际活动、真实款或正式旧库。

日志副本转为UTF-8并清理行尾空白，首次失败内容保留；本机原始UTF-16日志在.local保留。上传前格式检查曾因此拒绝，修正后另核。
