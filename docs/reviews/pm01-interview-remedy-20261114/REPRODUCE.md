# 复验

固定源码532c1b996549e7911a6ca24d354864002b4be5b9。配置既有隔离MySQL和媒体工具后，从正式树执行`node docs/reviews/pm01-interview-remedy-20261114/RUN_BACKEND.cjs`，再用既有契约Python运行`scripts/validate_contract_batch.py --manifest <当次目录>/runtime-contract-manifest.json --report <当次目录>/contract-batch.json`。运行器清除前端变量并加载网络限制，只运行12后端文件。109通过/7HTTP585响应；944源码冻结不变。

首次授权前置错误及跨账号实名前置错误分别保留INITIAL_FIXTURE_ERROR.tap/CROSS_ACCOUNT_FIXTURE_ERROR.tap，修正后原代码业务失败在INITIAL_BACKEND.tap。先确认前次进程终态后才重跑，不因观察超时重启。身份、奖池、公示和面试经过时间合成；不代表实际奖品履行或概率验证。
