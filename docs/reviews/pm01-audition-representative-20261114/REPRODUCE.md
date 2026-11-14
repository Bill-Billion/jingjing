# 复验

正式树根配置既有隔离MySQL、FFmpeg/FFprobe与字体，执行`node docs/reviews/pm01-audition-representative-20261114/RUN_BACKEND.cjs`，再以本次输出runtime-contract-manifest.json运行scripts/validate_contract_batch.py。固定源码adeeea9c，11文件139通过、7HTTP598响应，921源码未变。运行器清除前端开关，不访问真实服务。
