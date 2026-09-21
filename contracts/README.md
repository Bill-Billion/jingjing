# API契约入口

状态：**0.1.0-rc.1 / IN_REVIEW**。主文件为 [openapi.yaml](openapi.yaml)，OpenAPI 3.1.1；首批12个路径、13个操作、42个Schema。所有新路由均标NOT_IMPLEMENTED；现有后端尚不提供这些新接口。本候选尚未冻结、未合入integration。

Core唯一维护主契约/服务端枚举；Experience先提 [CCR](../docs/collaboration/CCR_TEMPLATE.md)，交叉review后双方使用合入integration的契约。每次Handshake记录契约版本和提交。SDK wrapper由Experience维护，测试stub不能进production fallback。

阅读 [协议约定](PROTOCOL.md)、[旧接口映射](LEGACY_MAPPING.md)、[变更记录](CHANGELOG.md) 和 [首批评审请求](../docs/collaboration/CCR-001-platform-contract.md)。本轮覆盖会话/主体/核验状态/能力状态/规则与合同快照元数据，不声称覆盖所有商业域或完整交易快照。

本地验证（Python3.10+，只安装开发工具，不修改后端依赖）：

```powershell
python -m venv .local/contract-venv
.local/contract-venv/Scripts/python.exe -m pip install -r contracts/requirements-lock.txt
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py
python scripts/collaboration_check.py
```

Linux/macOS将解释器路径换为 `.local/contract-venv/bin/python`。依赖安装需要网络；验证执行期间禁止网络，不导入应用、不访问数据库/Provider。可用 `--report .local/contract-validation.json` 保存结果。

[17个合成示例](examples/platform.json)用于客户端本地解析；[23个负例](tests/schema_cases.json)用于验证结构约束。示例token/证据ID/金额均为测试值，不能放到生产默认。客户端SDK生成、真机调用、权限/幂等并发行为尚未验证。

依赖选择：openapi-spec-validator负责标准结构，jsonschema负责2020-12条件及实例验证，PyYAML负责YAML读取。[requirements.txt](requirements.txt)声明直接依赖，[requirements-lock.txt](requirements-lock.txt)记录本次验证环境的完整版本，均仅用于开发；不增加API运行成本。替代方案是Node验证工具，但目前复用已用的Python校验入口，避免另建JS工具工程；本次不引入生产依赖或自动安装hook。

标准依据：[OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)；验证器用法：[维护者文档](https://openapi-spec-validator.readthedocs.io/en/latest/python.html)。检索日期2026-09-21；选择3.1.1是R0.6要求的3.1系列，不宣称它是最新规范。
