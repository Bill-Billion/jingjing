# 同版复现

最终源码41a39ae66ca95b9e0d5bad90e61609b6e1b886ef，运行pm01-buyer-rank-2026-11-13T16-05-39-841Z。设置既有本机隔离MySQL测试环境及媒体工具变量后，在仓库根运行`node docs/reviews/pm01-buyer-rank-20261113/RUN_BACKEND.cjs`，只接受本机33316/jx_local/jx_dev，各测试建临时库并清理；无前端。

随后用contract-venv Python运行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。六份HTTP必须为同次新生成，目录日期不代替文件时间；来源摘要核验未变。最终99项/487响应；fff500c0下的99/485及修合同后对旧响应复验仅历史。
