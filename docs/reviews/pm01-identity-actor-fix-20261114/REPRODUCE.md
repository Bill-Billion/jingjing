# 复验

沿既有隔离MySQL/FFmpeg/font环境，从正式树运行node docs/reviews/pm01-identity-actor-fix-20261114/RUN_BACKEND.cjs。18测试、backendOnlyEnvironment、网络保护和源码冻结；使用.local/identity-actor-fix-latest.json指向的同次runtime-contract-manifest.json交给contract-venv的scripts/validate_contract_batch.py。初始完整失败及独立探针原输出已归档，不拿其数据混成本次成功。
