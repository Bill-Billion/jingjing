# 本批复验入口（仅后端）

业务提交：b104d941cd8e124d944f3ae5c8a74d7591b7128a。正式工作树：worktrees/client-testing。接口0.31.58-rc.1/0212。本批固定运行：backend-acceptance-2026-11-12T09-17-58-228Z-15a691。

已有隔离数据库配置位于相邻full-flow树的.local/mysql/runtime/test-env.json，数据库仅本机33316/jx_dev。不得将生产连接替换进测试。本批没有安装新依赖，契约检查使用相邻core树已有.local/contract-venv；路径为本机环境，不代表他人环境已准备。

1. 七组专项从backend_server运行node --test，设置JX_MYSQL_TEST_ENV_FILE为上述绝对路径、NODE_OPTIONS为--require ./scripts/test-network-guard.cjs。文件为test/artists.integration.test.cjs、test/redemption-delivery-evidence.integration.test.cjs、test/privacy-guardian-copy.integration.test.cjs、test/recharge-refund-recovery.integration.test.cjs、test/recharge-refunds.integration.test.cjs、test/wallet.integration.test.cjs、test/privacy-execution.integration.test.cjs。最终115项通过；失败日志另保留，专项不与完整计数相加。
2. 完整回归从仓库根运行node scripts/run-backend-acceptance.cjs --profile all。保留隔离数据库环境，清除外部NODE_OPTIONS及JX_INDEPENDENT_FULL_UI/JX_INDEPENDENT_WEB，JX_PM01_STOCK_WEB和JX_PM01_NOTICES_WEB设0。媒体处理使用本机已有ffmpeg/ffprobe与arial.ttf。此profile读取全后端测试，未运行本机App/Web。
3. 完整运行目录包含source-manifest.json、checks.jsonl、backend.tap和summary.json。必须exit_code=0、FAIL=0、missing_files为空、changed_sources为空；唯一旧库对比跳过仍不算旧库已验。启动后不修改后端、契约和运行器，最终再核源码哈希。
4. scripts/runtime-contract-manifest.json规定的75个HTTP文件必须全部为本次运行新生成，使用run-backend-acceptance.cjs的collectEvidence校验开始时间并复制进运行目录。不得拿旧目录通过结果替换；业务文件recharge-refund-journey.json、recharge-refund-recovery-journey.json、ranking-listen-restrictions.json同样检查新鲜度。
5. 用上述运行目录生成的runtime-contract-manifest.json运行scripts/validate_contract_batch.py --manifest <manifest> --report <contract-batch.json>；使用现有契约虚拟环境Python。等待最终result=PASS且elapsed_seconds已写入，不能把中途报告当结束。
6. 上传前核full_business_check.py、acceptance_progress.py --check、acceptance_work_queue.py --check、audit_requirement_trace.py --check、collaboration_check.py --render和git diff --check。本批还检查24项验收登记反例、2项后端证据保护、7项批量契约工具测试。

生产worker/handlers.js仍为空，处理器仅注入模拟适配器；无真实调用。测试通过不授权注册真实渠道、部署、收费、公开服务或合并。前端不由本侧实施；原草稿PR39候选和远端状态见REPORT及CURRENT_REMOTE回执。

