# 复验

正式树根配置既有隔离MySQL、FFmpeg/FFprobe与字体，运行`node docs/reviews/pm01-recovery-case-20261114/RUN_BACKEND.cjs`，按生成runtime-contract-manifest.json执行scripts/validate_contract_batch.py。固定业务源码ee16f3f1874500ae27016401314a3ec7a8eb831b，15文件155通过、9HTTP842响应、929源码未变；backendOnlyEnvironment及网络保护，无前端。
