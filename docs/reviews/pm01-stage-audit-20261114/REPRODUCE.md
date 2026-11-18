# 复验方法

在正式树根设置隔离MySQL的JX_MYSQL_TEST_ENV_FILE，执行`node docs/reviews/pm01-stage-audit-20261114/RUN_BACKEND.cjs`；输出目录中的runtime-contract-manifest.json由本地contract-venv执行scripts/validate_contract_batch.py。纯后端环境与外网保护启用，全部源码冻结，必须使用同次新生成HTTP文件。

本轮14份既有测试116通过，11文件507响应；版本0.31.73-rc.1/0222未变。没有前端、真实服务或正式独审。14条剩余对账是只读核查，不是它们的业务验收；不得据此把NOT_RUN改成通过。
