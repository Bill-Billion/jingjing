# 复验

正式树根配置既有隔离MySQL、FFmpeg/FFprobe与字体，运行`node docs/reviews/pm01-partial-recovery-20261114/RUN_BACKEND.cjs`，再按其runtime-contract-manifest.json运行scripts/validate_contract_batch.py。固定源码9c2e9b26，12文件132通过，6HTTP611响应，924源码未变。backendOnlyEnvironment清除前端选项，网络保护只允许本机测试。
