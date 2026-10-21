# 本机安卓模拟测试证据

当前共同版本基线5fba043，本轮改动在core/v5-android-functional-test。模拟器实际安装APK，连接本机HTTP与随机隔离MySQL；不是浏览器截图冒充安卓。

- NATIVE_RESULTS.json：三个业务测试场景与13张PNG的摘要；框架tearDownAll不计业务场景。报价首次确认已单独通过，最终全组复测重看同一未付款订单。
- NATIVE_PASS.log：最后一轮原生通过摘要，删除调试地址和会话输出。
- SIMULATED_BUSINESS_RESULTS.json：七组115项模拟资料检查；STORY_FIXTURE_RETEST.log为新增机构身份后21项复验。
- BACKEND_SUPPLEMENT_RESULTS.json：榜单、共创、权益、参演发行、隐私和余额六组197项。
- BUILD_POLICY.json：实际Gradle签名配置及包内网络资源核验；release无证书时为null，debug为debug。没有构建正式发布包。
- TOOLS_TEST.log：七项工具回归，包括重复设置Windows测试文件访问权限。
- ENVIRONMENT.json：安装工具、系统、来源和下载校验值。

原始诊断日志和带测试会话的配置保留在忽略目录，未上传。截图仅含合成账号和测试故事，不含真实甲方资料。实际局限与人工流程见[本轮说明](../../ANDROID_LOCAL_TEST_20261021.md)。

- UI_CHECKS.json：静态检查及页面/工具结果。FIRST_ORDER_SCENARIO.log保留早先单独报价场景通过、整组身份定位失败的记录。
- CLEANUP.json：本轮合成数据库与会话已删除，测试API、MySQL和模拟器已停止；人工检查前重新启动。
