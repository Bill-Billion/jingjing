# 复验

固定源码1cfa9aa99eed435d34a1ea5851a68d01800f94e7；配置既有隔离MySQL与媒体工具后执行`node docs/reviews/pm01-w21-w22-review-20261114/RUN_BACKEND.cjs`，再用既有契约Python执行`validate_contract_batch.py --manifest <当次目录>/runtime-contract-manifest.json --report <当次目录>/contract-batch.json`。15文件165项、11HTTP/791，backendOnlyEnvironment清理前端变量并加载网络限制。
