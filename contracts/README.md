# 页面与服务器的数据约定

当前候选版本0.3.0-rc.2，主文件[openapi.yaml](openapi.yaml)。共25个操作，其中20个已接入独立MySQL账号API并进行隔离测试；其余5个仍未实现。具体状态见各操作的x-implementation-status及[实现清单](implementation.json)。这些是后端自验结果，不是短信供应商已开通、前端已联调或正式上线。

新增的账号API独立于旧app.js，不接受旧JWT或客户端自报角色。调用方法与环境准备见[第二阶段接口交付](../docs/collaboration/STAGE_2_ACCOUNT_API.md)。[协议细则](PROTOCOL.md) · [变更记录](CHANGELOG.md) · [旧接口映射](LEGACY_MAPPING.md)。第一阶段合并并不自动批准本次新增格式，仍需队友核对。

Python3.10或以上，先在仓库根安装锁定开发工具，再验证：

```text
python -m venv .local/contract-venv
.local/contract-venv/Scripts/python.exe -m pip install -r contracts/requirements-lock.txt
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py
```

Linux将Scripts/python.exe替换成bin/python。安装需要网络，校验期间禁用外部网络。运行账号接口集成测试后可进一步核对实际HTTP返回：

```text
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py --runtime-fixtures .local/account-api-http-fixtures.json
```

[示例](examples/platform.json)与[反例](tests/schema_cases.json)均为合成数据，不能拿示例令牌当作登录凭据。格式校验不替代并发、权限或供应商真实验证。

第三阶段新增两个只读内容接口，说明见[规则合同读取接线](../docs/collaboration/STAGE_3_READ_API.md)。原规则/合同文件元数据接口仍未实现，不伪造asset ID。校验实际返回时另执行`--runtime-fixtures .local/governance-http-fixtures.json`。当前仅本地集成待审第11份依赖，未推送或批准新格式。
