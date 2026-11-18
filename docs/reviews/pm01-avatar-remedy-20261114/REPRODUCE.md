# 复验

固定源码2417c9f37b81bc1fe01effbee5c2c1a34251ab7d。配置既有隔离MySQL和媒体工具后，从正式树执行`node docs/reviews/pm01-avatar-remedy-20261114/RUN_BACKEND.cjs`，再用既有契约Python运行`scripts/validate_contract_batch.py --manifest <当次目录>/runtime-contract-manifest.json --report <当次目录>/contract-batch.json`。运行器清除前端变量并加载网络限制，12后端文件112通过，7HTTP/634，944源码未变。只复验这一范围，不等于当前全后端/全业务完成。
