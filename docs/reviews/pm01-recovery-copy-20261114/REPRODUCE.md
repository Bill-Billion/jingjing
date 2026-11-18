# 复验

正式树根配置既有隔离MySQL、FFmpeg/FFprobe与字体，运行`node docs/reviews/pm01-recovery-copy-20261114/RUN_BACKEND.cjs`，按生成runtime-contract-manifest.json执行scripts/validate_contract_batch.py。固定源码600f96793084a10717a58ef35a622cb8c79fdfa1，12文件120通过、8HTTP522响应、931源码未变；backendOnlyEnvironment及网络保护，无前端。
