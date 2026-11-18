# 本轮证据说明

全部为本机隔离合成资料；不含API密钥、真人材料或正式资金。源代码与阶段记录见[本轮交接](../../../tasks/records/CORE-contract-intake-20261102.md)。

- contract-check.json：接口0.31.13-rc.1及87份开票真实HTTP响应检查结果。
- backend-regression-20261102.log：1055通过、0失败、3跳过；当时未指定媒体工具、未提供旧SQLite脱敏样本。
- media-regression-20261102.log：配置本地媒体工具后9项通过，补上前述两组媒体检查；旧库比较仍未跑。
- manual-blessing-tests-20261102.log：38项通过，包括祝福私有草稿到人工受理和历史客户视频入口封堵。
- browser14至browser20：各组本轮真实网页、隔离HTTP/MySQL报告与截图。按各报告结果读取，不因目录存在便当全部通过。

前期定位有重复菜单选择器故障、请求等待超时及清理超时；最终结果以本批报告为准。测试工具已改精确菜单选择和允许API完成清理；未通过时保留失败，不能跳过业务来凑通过数。浏览器使用本机Edge，报告中历史通用Chrome描述指Chromium驱动，不是安卓真机验收。

本轮网页核对方式：14—18组使用开发服务器；19/20组开发服务器发生异步模块加载/菜单等待失败，保留在browser19/browser20。重新打包后同一组业务和全部菜单通过，最终以browser19-built/browser20-built为准。没有跳过失败用例；上传后的自动检查也改为这两组先打包再检验。

复验方式：设置既有隔离MySQL配置文件路径（JX_MYSQL_TEST_ENV_FILE）和本机浏览器路径（CHROME_PATH），19/20分别运行 `node scripts/run-ui-browser-check.cjs 19 --built`、`node scripts/run-ui-browser-check.cjs 20 --built`。命令会重新构建当前源码、启动仅本机可用的网页及随机隔离数据库，退出时清理。用JX_BROWSER_EVIDENCE_DIR指定新证据目录，避免覆盖旧证据。媒体检查另设置现有本地FFmpeg/FFprobe及字体路径；不需要真实API密钥。
