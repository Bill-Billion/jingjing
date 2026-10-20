# 第二轮前端检查证据

本目录只保存合成资料的结果、截图及安全日志，不含会话、真实故事、私有数据库或发布构建。当前交付范围和接法见[第二轮前端交接](../../../collaboration/V5_R02_FRONTEND_HANDOFF.md)。

- `R01_REVIEW.json`：本前端对Core第一轮及共享修补的实际审阅/隔离复验；不是Core对PR24的批准。
- `R01_WEB_RESULTS.json`：新版页面下第一轮真实运营列表、受理、身份清理与390视口16组回归。
- `CORE_R02_CHAIN.json`：18组真实接口串联，没有页面验收含义。
- `R01_SHARED_PATCH_CHECK.json`：身份读取六项边界；对应一次性库和凭据已清理。
- `FINANCE_BOUNDARY.json`：新合成财务试算入口的只读语义、权限和比例输入拒绝。
- `WEB_LOCAL_SUMMARY.json`：网页完整209项、类型检查及产品构建；四个受影响专项另有独立运行日志。
- `REVIEW.json`：本轮五项状态、并发和入口问题的修正范围。

App最终289项、静态分析及产品构建见 `APP_LOCAL_SUMMARY.json`；同一故事32组跨端见 `CROSS_RESULTS.json`，第一轮App13/网页16组回归另列。截图稳定重拍及390金额可读性见 `VISUAL_QA.json`。随机库、凭据、测试构建、编译缓存和本次服务清理见 `CLEANUP.json`。汇总为 `RESULTS.json`；功能版本27f23a7的八项远端检查通过，见 `PUBLICATION.json`、`REMOTE_FRONTEND_SUMMARY.json` 和 `REMOTE_BACKEND_SUMMARY.json`；App289、网页209，后端20组通过，综合586通过/1项缺脱敏旧库样本跳过。后续文档提交的最新检查以PR Checks为准，不以本机结果替代。原生真机、真实支付/电子签/生成服务及最新十二轮整包后端运行不包含在本次测试内。共同版本和生产仍未变更。
