# 复验

在正式树根配置既有隔离MySQL、FFmpeg/FFprobe和字体环境，执行`node docs/reviews/pm01-representative-copy-20261114/RUN_BACKEND.cjs`；再按生成的runtime-contract-manifest.json执行scripts/validate_contract_batch.py。

固定源码1d43700a，12文件205通过/1旧库比较未验证；4HTTP186响应。运行器显式禁用本机前端，已知原库缺样本单列不算PASS；其他跳过或失败仍拒绝。
