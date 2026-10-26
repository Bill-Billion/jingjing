# 让甲方从首页自由操作、补齐测试业务和交互

任务 CORE-CLIENT-FREE-20261026。本侧负责人 chengcongcong222；分支 core/client-free-exploration-20261026；依赖PR37，复用其远端分支 core/client-browser-testing-20261025。起点a5c771ea，共同版本767d2ffc。尚待另一方实际审阅，不直接推main。

用户2026-10-26明确要求取消客户邀请码和路线下拉列表、完善业务路线与付款/核验反馈，并使用video目录三份甲方样片。实现、测试、上线测试站与正式启用分别记录。

本地实现和自验已经完成：统一保留的模拟库、16个体验身份、31组初始业务样例及补充资料；免邀请码首页、模拟付款退款/核验/充值、私有样片、浏览器反馈隔离、重启保存。实际发现并修复新建故事分类阻断、跨商家模拟付款、机构测试关系缺失、空白页导航、资源加载频率误限及媒体策略问题。

验证：22项工具；84项相关App测试与分析/网页构建；11项隔离接口；28个App入口及一次工作台切换；16个身份入口；7项实际页面操作；8张表/112份文件重启一致。详细证据、限制和复现入口见[完整交付记录](../../testing/CLIENT_FREE_EXPLORATION_20261026.md)。

受影响模块：独立测试工具、模拟数据脚本、App专用测试入口及3处仅在测试编译开关下展示的提示/表单。后台生产接口没有改格式；普通App和Vue入口不加载模拟处理。新增测试辅助标题参数保持原默认值。队友无需为接口改名，只需按本地资料重建专用测试站，并审阅测试/正式隔离。

独立验证：`node --test scripts/client-testing/free-entry.test.cjs scripts/client-testing/portal.test.cjs scripts/client-testing/backup.test.cjs scripts/client-testing/persistent-story.test.cjs scripts/client-testing/synthetic-files.test.cjs`；有本机隔离数据库后运行本轮explore检查。真实费用、生产库和外部服务不在这些命令的授权范围。

当前交付准备完成，集中上传、公网替换与最新远端结果在交付补记登记。下一步本侧负责维护与问题闭环，队友建议检查公共边界，甲方自由验收；不把这次模拟验收写成所有业务正式可用。
