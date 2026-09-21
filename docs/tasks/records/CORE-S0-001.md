# CORE-S0-001｜首批OpenAPI与协议约定

- Owner：chengcongcong222；Stage0；分支core/s0-001-openapi-baseline。
- Handshake：repo=Bill-Billion/jingjing，起点/当时origin/integration=ac34c4836c005bd7b4f8b903d21782fe380bc432，dirty=false，baseline=JX-R06-EXECUTION-BASELINE-20260921，contract=NOT_CREATED→0.1.0-rc.1。
- REQ：006/007/010/023/033/034/042/043/044/045/046/047/059/060。对应WORK-01；细分关联以board为准。
- 状态：IN_REVIEW。Core自验通过；Experience review=PENDING，未集成。不以Schema通过代替任务全部验收。

## 交付

[主契约](../../../contracts/openapi.yaml)、[协议语义](../../../contracts/PROTOCOL.md)、[旧接口映射](../../../contracts/LEGACY_MAPPING.md)、[变更记录](../../../contracts/CHANGELOG.md)、[CCR-001](../../collaboration/CCR-001-platform-contract.md)。12路径/13操作/42Schema；账号与主体、核验状态、能力/Provider、规则/合同快照元数据及探针。未知商业参数未填。

新增仅契约、合成样例、开发验证工具及任务文档；没有修改既有backend/Flutter/Web业务代码，也没有连接生产/真实Provider。新端点逐项NOT_IMPLEMENTED；旧接口继续保留，迁移需后续实现和客户端切换。

## 已运行

- Windows / Python3.10.11；隔离venv，固定开发依赖（[入口](../../../contracts/README.md)及lock）。
- `python -m openapi_spec_validator contracts/openapi.yaml`：PASS。
- `python scripts/validate_contract.py`：PASS；17正常示例、23异常样例、320项结构/协议检查；执行期间网络禁止。对精确契约字节的SHA-256见[机器证据](CORE-S0-001-validation.json)。
- `python scripts/collaboration_check.py`：需求/任务/原件一致性；最终发布前检查。
- `git diff --check`、变更路径核对：最终发布前检查。

测试在工作树候选上执行；起始记录提交757367a，具体被测内容以契约SHA-256和随本记录提交的文件为准，不伪称已在未来commit运行。实际发布commit用git log查询。

## 未运行及后续

未运行运行时权限/短信/登录、数据库事务、幂等竞态、真实实名/Provider、Flutter/Web SDK生成和构建。这些还没有对应实现或端侧环境，不因本次结构校验升级状态。Shared Boundary依根AGENTS需另一流review；PR保持未合并，后续据review修订。

MySQL准备可另开CORE-S0-002并行推进。对旧API的迁移采用增量路径，未修改历史接口；若候选需调整，修订契约版本及变更记录，不强推公共历史。
