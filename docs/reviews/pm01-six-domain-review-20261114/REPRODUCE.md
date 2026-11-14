# 复验入口

固定验证源码`abb5cf63fe82bd1afb3d44cdf1230c3f475ff0e2`，接口0.31.76-rc.2/0225。配置既有隔离MySQL和媒体工具，在正式树执行`node docs/reviews/pm01-six-domain-review-20261114/RUN_BACKEND.cjs`。它动态枚举全部后端测试，以backendOnlyEnvironment和网络保护运行，冻结源码并要求全局HTTP清单文件来自当次运行。随后用既有契约Python环境运行`scripts/validate_contract_batch.py --manifest <本轮目录>/runtime-contract-manifest.json --report <本轮目录>/contract-batch.json`。

本轮209文件2038通过，1项缺真实旧库样本明确未验证，115HTTP/8644响应，942源码未变。旧库跳过严格匹配唯一已知项，其他失败/跳过/缺文件/源码变更均拒绝。

离线另跑`provider_config_audit_test.py`、`review_material_audit_test.py`、`audit_personal_copy_scope_test.py`及`audit_personal_copy_scope.py`。没有前端、真实供应商或部署步骤。复验禁止重置人工3490，不把合成凭据换成真实材料。
