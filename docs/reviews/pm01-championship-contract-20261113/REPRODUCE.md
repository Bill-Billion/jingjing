# 同版复现

源码0f6c848eea5f85fead0326481c9c7f9d6bd433bf；运行pm01-championship-contract-2026-11-13T15-36-40-159Z。已有本机隔离MySQL测试环境变量与媒体工具变量下，在仓库根执行`node docs/reviews/pm01-championship-contract-20261113/RUN_BACKEND.cjs`。脚本仅接受本机33316/jx_local/jx_dev，各测试建立/清理临时库；禁止真实服务、无本机App/Web。

随后使用contract-venv Python执行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。5份HTTP记录必须由同次测试生成，时间和源码摘要均核验。ranking-http.json带旧目录日期但实际文件为本次新生成，不能借用旧文件。最终98项/439响应，不是完整全量；新专项9项已经包含。首次失败和中间专项不能替代此最终版。
