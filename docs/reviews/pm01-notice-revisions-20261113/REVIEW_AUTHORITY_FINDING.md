# 施工中复核：官方发布与独立审核不得绑成同一权限

当前初版c219f6c6完整回归仍运行，未改冻结源码。只读复核发现revisions.review额外要求独审员具NOTICE_OFFICIAL，而既有普通审核入口只要求NOTICE_REVIEW并核发布人当前官方权限。额外门槛会让具独审资格、无发布资格的审核员被拒绝。

本轮修正计划：移除对审核员的额外发布权限要求；仍检查修订提交者的官方资格、当前原通告版本与独立性。新增分支在审核员NOTICE_OFFICIAL关闭而NOTICE_REVIEW有效时批准，发布人失权仍拒绝。初版完整运行作为中间证据，修正后重新冻结运行，不借中间版本冒充最终同版。

最终处理：初版完整运行结束后应用修正，已在ec82d637移除审核员的额外发布权限门槛，并校验原发布人及编辑者当前资格。59项关联检查通过；最终完整运行另见FINAL_BACKEND。

AUTHORITY_PROBE.cjs为复现用外置合成测试：在仓库根目录运行node --require ./晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs docs/reviews/pm01-notice-revisions-20261113/AUTHORITY_PROBE.cjs，须先设置隔离JX_MYSQL_TEST_ENV_FILE。它使用Node测试模块的依赖路径加载当前后端；在c219f6c6预期200却实际403的原日志见AUTHORITY_FAILURE，最终版本同场景已纳入正式修订专项。不得在生产运行。
