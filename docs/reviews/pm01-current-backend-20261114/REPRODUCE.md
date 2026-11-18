# 复验

正式树根沿既有隔离MySQL/FFmpeg/font环境运行 node docs/reviews/pm01-current-backend-20261114/RUN_BACKEND.cjs。自动枚举backend/test下与正式run-tests.cjs相同的全部测试文件，4并发，backendOnlyEnvironment与网络保护。原始输出及同次新鲜HTTP保存在.local/current-backend-latest.json指向目录；再由contract-venv执行scripts/validate_contract_batch.py，禁止借旧文件补数。仅对准确58表历史旧库缺样本允许记未验证，不豁免其他跳过或失败。结果不是正式服务/全产品完成认证。
