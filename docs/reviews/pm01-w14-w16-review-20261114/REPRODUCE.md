# 后端复验

固定源码86bd5f2aa2b5f13c7677e234bb087120142eadb1。使用既有隔离MySQL、媒体工具配置运行`node docs/reviews/pm01-w14-w16-review-20261114/RUN_BACKEND.cjs`；随后用既有契约Python执行`validate_contract_batch.py --manifest <当次目录>/runtime-contract-manifest.json --report <当次目录>/contract-batch.json`。运行器使用backendOnlyEnvironment与网络限制，11文件188通过，12HTTP/1897；只代表该范围。
