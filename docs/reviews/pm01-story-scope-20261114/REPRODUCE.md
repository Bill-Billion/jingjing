# 同版复现

最终源码4a447445ab11be0ec110e2e5a9e4449581ca6a3f，本次pm01-story-scope-2026-11-13T16-49-11-112Z。在仓库根、既有本机33316测试库及媒体工具配置下执行`node docs/reviews/pm01-story-scope-20261114/RUN_BACKEND.cjs`；一次性库自动清理。随后用contract-venv Python执行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。

10文件178项，8份同次JSON HTTP捕获1135响应；文件成功读取的字节大小、SHA256和缓存/嗅探保护见BUSINESS_RECORDS。检查器runtime_tests=NOT_RUN只表示其本身不执行测试，实际运行见FINAL_BACKEND。源摘要冻结，旧响应不借用；无前端或真实服务。
