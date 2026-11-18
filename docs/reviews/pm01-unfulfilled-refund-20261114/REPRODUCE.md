# 复验

配置既有隔离MySQL、FFmpeg/FFprobe及字体路径，在正式树根运行`node docs/reviews/pm01-unfulfilled-refund-20261114/RUN_BACKEND.cjs`；运行器显式保留与完整回归相同的相对NODE_OPTIONS网络预加载，关闭各本机前端开关。再用本次runtime-contract-manifest.json运行scripts/validate_contract_batch.py。

最终源码48557270，8后端文件129通过/0失败跳过、4HTTP719响应通过，接口0.31.73-rc.4/0222。BEFORE_FIX为3通过3失败（含父项），SMS修前1失败修后1通过；TEST_SETUP_FAILURE为摘要而非原始TAP。源码dd201153中间129通过另保留，不拼接为最终全量。
