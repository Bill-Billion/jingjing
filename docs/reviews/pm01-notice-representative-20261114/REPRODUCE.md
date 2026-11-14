# 复验

正式树根配置既有隔离MySQL、FFmpeg/FFprobe及字体，运行`node docs/reviews/pm01-notice-representative-20261114/RUN_BACKEND.cjs`；再按其生成的runtime-contract-manifest.json运行scripts/validate_contract_batch.py。源码ebef534b，12文件195通过、9HTTP812响应，922源码未变。运行器明确清除前端开关，无真实服务。
