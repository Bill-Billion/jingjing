# 复验与证据限制

既有隔离MySQL配置及FFmpeg/FFprobe/字体路径下，在正式树根运行 `node docs/reviews/pm01-buyer-scale-20261114/RUN_BACKEND.cjs`，后用contract-venv对本次输出的runtime-contract-manifest.json执行validate_contract_batch.py。入口沿已修复backendOnlyEnvironment移除网页目录/UI开关；全程本机隔离，无前端。

本批8d664984，8测试文件101通过、5HTTP文件同次验证。批量500身份、5000空订单/赠分为SQL合成；180笔不同商品经真实后端方法创建并应用合成PRODUCTION回执，验收时间人为回拨8日。只检业务逻辑和事务，不是生产容量或真实款。
