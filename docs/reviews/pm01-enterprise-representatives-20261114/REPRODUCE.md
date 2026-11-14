# 复验

在正式树根配置既有隔离MySQL、FFmpeg/FFprobe和字体环境后运行`node docs/reviews/pm01-enterprise-representatives-20261114/RUN_BACKEND.cjs`。运行器关闭本机前端，按固定源码生成同轮清单；再以生成的runtime-contract-manifest.json运行scripts/validate_contract_batch.py。

最终37722e77：160通过/0失败/1旧库样本比较未验证，3HTTP163响应通过。运行器仅允许准确名称的旧库缺样本跳过，另存UNVERIFIED_LEGACY，不算PASS；其他跳过/失败仍拒绝。
