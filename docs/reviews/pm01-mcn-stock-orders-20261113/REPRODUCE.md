# 同版复现

源码1a1e9ab66065429311ceb899d45ed001e230746e，运行pm01-mcn-stock-orders-2026-11-13T15-06-53-795Z。仓库根运行`node docs/reviews/pm01-mcn-stock-orders-20261113/RUN_BACKEND.cjs`；需已有本机隔离MySQL环境文件、测试媒体工具变量。runner校验本机33316/jx_local/jx_dev，测试各自建库清理，禁止真实服务。

新运行结束后用contract-venv的Python执行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。批量响应路径为prelaunch-independent-20261106/organization-batch.json，但必须从本次测试生成、按开始时间校验；目录中的日期不等于可以用旧文件。

最终11份测试及9份HTTP都是同次新文件，源码摘要未变；包装器退出0。此前265/1219仅修关闭状态前基线，捕获路径失败和恢复记录在FAILED_ATTEMPTS，不与最终相加。旧库58表样本仍缺，本轮不含该用例。
