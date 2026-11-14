# 本轮隔离验证证据

所有人物、订单、视频和收退款为合成测试资料，真实服务关闭。本目录只保留结果、测试日志和合成截图；不含临时会话、私有访问凭据或数据库。

组合基线为1aee8226与本轮前端增量。网页509项，App固定清单781项，两端构建通过；静态检查无错误/警告，14条花括号风格提示。现货3组、认证免费4组、优惠取消6组通过。原生同单完整脚本单次通过，6张截图、实际落盘文件与原片哈希一致；具体订单与版本见SUMMARY。

红色测试保留：目录新增字段被严格拒绝；原生已写入的验收回包凭据被拒绝。实际Android首轮失败和修复后专项59项分别保存，不能把修复前单元测试全通过当整链通过。

运行新网页链：先用项目local-mysql准备隔离配置，设置JX_MYSQL_TEST_ENV_FILE；分别执行scripts/pr39-stock-eligibility-browser-check.mjs、scripts/pr39-artist-contract-browser-check.mjs，优惠模式使用JX_PR39_COUPON_TEST=1运行scripts/pr39-manual-video-browser-check.mjs。macOS需要CHROME_PATH指向已安装Chrome。脚本限定本地测试库，正常退出删除自己创建的库与凭据。

原生：运行scripts/pr39-native-manual-sandbox.cjs，使用其被忽略的defines.json连接专用Android模拟器；adb reverse映射status.json中的本机端口。flutter test integration_test/pr39_manual_video_test.dart -d emulator-5554 --no-pub --dart-define-from-file=../../../.local/pr39-native-manual/defines.json。最后由操作者在Android系统保存对话框确认本次合成文件。以实际UI提示、落盘文件及服务端DELIVERED核对；不替换真实文件选择插件。测试结束创建.local/pr39-native-manual/stop文件或发送SIGINT清理本次库。

未声明本轮完成151条全量、认证完整原生多角色链、真实支付/短信/人脸或云服务。新商单佣金批次未认领。
