# PM04 制作隔离环境：成年认证前置修复

负责人 chengcongcong222；对应 BE-01 已确认 CI 阻断的后端准备修复与 JT-03 环境交付。输入 PR43 `7ebc60b4f9ac75d3d4b41d56b3fc4d8ac9d3c9c6`，受测源码 `62fa0a3128f4928f76712b61b65eaa45324eff8f`。只改测试环境，不改产品 API/迁移/前端。

## 证据与结果

1. [PR41 网页作业](https://github.com/Bill-Billion/jingjing/actions/runs/45105506472/job/137465730754)在 `2026-11-23T03:27:29Z` 制作准备阶段报告 `POST /supply/avatars: 409 (VERIFIED_ADULT_REQUIRED)`；浏览器未开始制作办理，后 8 步跳过。本机未修版本实际复现，退出 1。
2. 修复以个人主体正常调用 `/artists/people` 及 `/:id/identity`，只为合成卖家和正常买家接入既有受限测试 provider。本人认证和机构资源所有权分开；没有直接更新身份表。认证前/独立未认证 OWNER 的有效请求均 409 且零新增；认证后机构形象 200；原 key 重放同一 ID，新增总数 1。
3. 第一次修后运行后端已完成 11 组准备，但新采集器读取缺失的 HTTP status 字段，整体退出 1。失败保留于 `FIRST_COLLECTOR_FAILURE.json`，未用后端 ready 冒称整个工具通过。补齐返回状态字段后草稿运行成功。
4. 固定提交后再次新建临时库，`node scripts/pm04-production-preflight.cjs` 实际退出 0，11 组全部通过，子服务正常退出 0、私有状态移除、专属临时库删除。准确记录、角色、媒体哈希及源码文件摘要在 [RESULT.json](RESULT.json)。provider 既有测试 5 通过/0 失败，见 [PROVIDER_TEST.log](PROVIDER_TEST.log)。

11 组包含正常登录/机构邀请，成年认证对照，作品/同意/许可，版本与独审，首尾款和文件许可，未付费拒绝，持久任务恢复，跨主体/自审/并发拒绝，撤权/存储失败，提交后丢回复按原请求恢复。全部是隔离 HTTP/MySQL 后端证据，不是本轮 App/Web 联合验收。认证、支付、存储和生成恢复的上游为合成渠道，不代表真实服务已启用。

## 样例编号与复现限制

本次机构 `6c5d0f48-eef8-42c5-b615-669d308bfa22`；形象 `738f6952-40e7-484e-a61c-14904c7f548b`；可用于创建制作项目的订单 `8b781d01-a2bf-48a3-b198-3e082a7baac9`；原形象 key `1b6554eb-dc0f-4a94-afbd-b7d06af8a924`。其他样例与五角色 ID 见 JSON。**该库已清理，以上是审查证据，前端不能用这些 ID 调用新库。** 前端运行同入口重新取得自己的同批记录，凭据只保存在本机受控状态文件。

完整失败原日志保留本地 `.local/pr16-before-20261123.log`；第一次采集失败在 `.local/pm04-production-preflight-EGBbPf/`；草稿通过在 `c87F6T`；固定提交通过在 `.local/pm04-production-preflight-QjkgzI/`。本目录 `EXECUTION.json` 保存相应原始文件 SHA256、退出码和不含凭据的错误节选；不上传含受控登录状态的文件。

## 前端实际进展与边界

已核 PR41 新提交 `0a668ef38f8b9f5facdd189974387c38701ad369`，不能继续使用“前端未推送”旧结论。其 [服务器检查](https://github.com/Bill-Billion/jingjing/actions/runs/45105506491)成功；[App 作业](https://github.com/Bill-Billion/jingjing/actions/runs/45105506472/job/137465731383)静态分析成功，工作流指定测试集终态 **844 通过/74 失败/1 跳过**，网页发布构建跳过。此测试集与历史本地完整 **1155/74/1** 分列，不做总数替换，不把失败数解释为缺功能数。

网页本次前面的登录、许可、交易和商单检查已成功，制作准备失败。本补丁尚未由前端接入、重跑实际制作和 8 个后续步骤；本侧没有运行浏览器/App或宣告 G0 通过。详细接收、角色与命令见 [本轮交接](../../pm04/PRODUCTION_HANDOFF_20261123.md)。双方交齐后再固定组合版本、同单 App/Web/独审验证，最后维护者实际审阅；无合入、部署或真实服务启用。
