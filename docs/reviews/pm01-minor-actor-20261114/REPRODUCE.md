# 后端复验

沿既有隔离MySQL、FFmpeg/font配置，在正式树运行node docs/reviews/pm01-minor-actor-20261114/RUN_BACKEND.cjs；使用backendOnlyEnvironment、网络保护与源码冻结。随后contract-venv执行scripts/validate_contract_batch.py，输入.local/minor-actor-latest.json所指目录的runtime-contract-manifest.json，结果写同目录contract-batch.json。不启动前端或真实服务。
