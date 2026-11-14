# 复验方法

正式树根配置既有隔离库JX_MYSQL_TEST_ENV_FILE，执行`node docs/reviews/pm01-material-isolation-20261114/RUN_BACKEND.cjs`，再对本次runtime-contract-manifest.json执行scripts/validate_contract_batch.py。仅API，不运行页面。执行`python scripts/review_material_audit_test.py`；用完整提交运行`python scripts/review_material_audit.py --commit <40位提交> --report <全新报告路径>`。

源码aa66b220，4文件38后端通过，46响应，10扫描工具通过。扫描固定提交8,975文本/7,250未检查；报告不能被覆盖。SMS前两日志为调试环境阻断，SMS_BEFORE_CONFIG_FIX为有效配置失败，SMS_AFTER_CONFIG_FIX为错误冷却预期429，SMS_AFTER_FIX_VERIFIED最终通过；最终统一运行另见FINAL_RUN。初始SMS日志UTF-16LE，其余工具及最终报告UTF-8。
