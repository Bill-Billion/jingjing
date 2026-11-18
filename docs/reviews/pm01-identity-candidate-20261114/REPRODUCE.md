# 复验方式与范围

沿现有隔离MySQL、FFmpeg和字体环境，从正式树运行 node docs/reviews/pm01-current-backend-20261114/RUN_BACKEND.cjs；自动枚举全部后端测试，backendOnlyEnvironment和网络保护。只允许准确的旧库58表缺样本项记未验证，其他失败/跳过都不能算成功。实际终态后用contract-venv运行scripts/validate_contract_batch.py与同次runtime-contract-manifest.json。原始HTTP在.local/current-backend-latest.json所指运行目录；摘要和命名断言随报告保存。新源码需重新核对，不复用旧绿灯。
