# API契约入口

状态：NOT_CREATED。Core已认领CORE-S0-001，计划建立 `contracts/openapi.yaml`（OpenAPI3.1）及CHANGELOG；本次未创建或冻结API主文件。已有历史OpenAPI或路由只作盘点输入。

Core唯一维护主契约/服务端枚举；Experience先提 [CCR](../docs/collaboration/CCR_TEMPLATE.md)，交叉review后双方使用合入integration的契约。每次Handshake记录契约版本和提交。SDK wrapper由Experience维护，测试stub不能进production fallback。
