# 恢复接口检查证据

60项账号/身份/开票相关检查通过，未跳过；账号46份与开票113份HTTP响应格式检查通过。这里只归档新增读取接口的合成响应，排除登录token和本机配置。测试库已清理，无外部服务调用。

- tests.log：最终专项测试日志。
- account-contract.json、invoice-contract.json：实际HTTP响应与完整接口格式检查报告。
- recovery-responses.json：新增接口实际返回示例，不是全量原始登录响应。

这些证据不证明前端4项缺陷已修复，浏览器/App必须在前端交付后同版复测。原151条不批量标通过。复验入口与限制见[任务记录](../../../tasks/records/CORE-recovery-support-20261102.md)。
