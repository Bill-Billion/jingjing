# 同版复现

源码ef808905fc93c0be073fcebeb250b1812080377e，本次pm01-mcn-supplier-2026-11-13T17-15-13-507Z。仓库根配置既有本机33316测试库及媒体工具环境后执行`node docs/reviews/pm01-mcn-supplier-income-20261114/RUN_BACKEND.cjs`；再用contract-venv Python运行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。一次性库自动清理。

14文件284项，11份同次HTTP1299响应；888份冻结源码不变。实际供给HTTP限现货，其他类型规则单元与原关联回归不能扩写成全部新全链。内部合成PRODUCTION标签用于验证回执隔离，不是真实服务。无前端。
