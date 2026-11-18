# 复现

最终源码65c3df3878daa6214542acf7fb731da73adca28a，运行pm01-mcn-cross-business-2026-11-13T14-40-49-267Z。使用本机隔离MySQL测试环境文件J:/worktrees/full-flow/.local/mysql/runtime/test-env.json；runner验证本机33316/jx_local/jx_dev配置，每份业务测试自行建测试库并清理。只运行本目录RUN_BACKEND.cjs所列9份后端测试，不启本机App/Web。

在仓库根执行 `node docs/reviews/pm01-mcn-cross-business-20261113/RUN_BACKEND.cjs`（需既有JX_MYSQL_TEST_ENV_FILE及测试媒体工具环境）。执行后用contract-venv的Python运行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。不得沿用旧文件；runner检查捕获时间、源码摘要和全部文件结果。

初次68/3失败见FAILED_ATTEMPTS；其后三份响应不合格的同版248/0运行只为中间证据，不和最终数量相加。最后改测试建立合作方式，运行代码未变，重新整批冻结。原旧库缺样本仍缺，本轮未执行其对照用例。
