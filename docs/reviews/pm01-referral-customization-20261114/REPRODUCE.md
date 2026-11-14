# 复验

正式树根配置既有隔离MySQL、FFmpeg/FFprobe与字体，运行`node docs/reviews/pm01-referral-customization-20261114/RUN_BACKEND.cjs`，再按生成的runtime-contract-manifest.json运行scripts/validate_contract_batch.py。固定源码c1da750d，14文件186通过，8HTTP1296响应，925源码未变。backendOnlyEnvironment与本机网络保护。
