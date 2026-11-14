# 复验

固定源码fd7bb44c8928971396ce8eab737d706d1c5b9232。配置既有隔离MySQL和媒体工具后，从正式树执行`node docs/reviews/pm01-referral-window-20261114/RUN_BACKEND.cjs`，再用既有契约Python运行`scripts/validate_contract_batch.py --manifest <当次目录>/runtime-contract-manifest.json --report <当次目录>/contract-batch.json`。20文件341通过，16HTTP/1833响应，943源码未变。

新专项在后端目录执行`node --require ./scripts/test-network-guard.cjs --test test/referral-window.integration.test.cjs`，必须先使用backendOnlyEnvironment清除前端执行变量。7个子项加父项共8通过。前三项曾在旧代码失败；七天时钟/批量同微秒记录为明确合成前置，其余主要归因与下单由实际HTTP办理。不启用前端、生产或真实渠道。

第73轮内存替身探针只用于当时固定旧源码；新分页的复验应使用本批实际数据库测试，不用旧探针的单页SQL替身替代。完整新候选的远端结果另行登记。
