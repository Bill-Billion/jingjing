# 同版复现

源码b06a8aee8844d87669d2a81fa9678bd17f78ba7c，本次pm01-cast-rights-2026-11-13T16-25-59-031Z。既有本机33316/jx_local/jx_dev测试配置和媒体工具变量就位后，从仓库根运行`node docs/reviews/pm01-cast-rights-20261114/RUN_BACKEND.cjs`；各测试建立并清理一次性库，没有前端/真实服务。

随后用contract-venv Python运行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。9份HTTP必须同次产生并检查时间，源文件摘要前后一致。最终179通过、1472响应格式通过；接口校验器的runtime_tests=NOT_RUN表示它不执行测试，实际测试以FINAL_BACKEND为准。
