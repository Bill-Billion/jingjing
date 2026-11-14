# 复验

固定源码5adf55d2725b6ad591804e6cb44ff7731d81df92。从正式树运行`python scripts/audit_personal_copy_scope_test.py`与`python scripts/audit_personal_copy_scope.py`，前者5项、后者50分类/15组/2端点；需要既有Python YAML与Node。配置既有隔离MySQL和媒体工具后运行`node docs/reviews/pm01-scope-exit-audit-20261114/RUN_BACKEND.cjs`，再对生成的runtime-contract-manifest.json运行validate_contract_batch.py。14文件207通过、13HTTP1072响应、942源码未变。backendOnlyEnvironment及网络保护，不运行前端。
