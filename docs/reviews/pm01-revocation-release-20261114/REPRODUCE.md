# 复验方法

正式树根配置JX_MYSQL_TEST_ENV_FILE为既有隔离库环境文件，运行`node docs/reviews/pm01-revocation-release-20261114/RUN_BACKEND.cjs`，再用本地contract-venv对输出runtime-contract-manifest.json执行scripts/validate_contract_batch.py。纯后端环境、外网保护、源码冻结及同次HTTP文件检查均启用。

12份关联测试127通过，7HTTP文件528响应；源码6d68d0c5，接口0.31.73-rc.2/0222。只有三个新增集成场景；其余是既有代码现版复验。修前原始日志21通过/3失败含父项；UTF-16LE原字节保留。无前端，无真实服务或正式合规/独审结论。
