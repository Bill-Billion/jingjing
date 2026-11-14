# 复验方法

设置既有隔离库JX_MYSQL_TEST_ENV_FILE与本机FFmpeg/FFprobe/字体后，在正式树根运行`node docs/reviews/pm01-release-recovery-20261114/RUN_BACKEND.cjs`；按本次runtime-contract-manifest.json执行scripts/validate_contract_batch.py。单独运行`python scripts/provider_config_audit_test.py`。

源码c7132a6f，8后端文件82通过、13隐私响应、11配置工具通过；源码冻结且无前端/真实服务。BEFORE_RELEASE_FIX.tap为4通过2失败，BEFORE_CONFIG_FIX.txt为10通过1失败（原PowerShell UTF-16LE及stderr包装保留），最终文件UTF-8。合成库187表317行及3私有对象不能替代真实旧库/OSS/正式回退与独立签收。
