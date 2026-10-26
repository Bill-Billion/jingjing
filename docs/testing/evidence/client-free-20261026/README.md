# 本轮自由体验检查

当前结果分别见API_RESULTS.json（11项接口）、browser/RESULTS.json（28个App入口及工作台切换）、personas/RESULTS.json（16个身份入口）、functional/RESULTS.json（7项实际页面操作）、RESTART.json（8张表和112份文件重启一致）。截图为模拟资料，原视频、账号访问凭据和数据库配置不在Git。

工具22项通过；App艺人/付款/钱包84项通过，相关Dart分析与专用网页构建通过。没有重新运行全部App/Web测试，也没有启用真实服务。

接口检查命令：`node scripts/client-testing/explore-check.cjs <私有配置路径>`。实际页面命令：`node scripts/client-testing/explore-functional.mjs <私有配置路径>`；另以FUNCTION_MATCH=story检查首页写故事。业务操作会改变模拟状态，应从同脚本准备的独立样例开始；不能对正式环境运行。公网需额外显式指定CLIENT_TEST_PUBLIC_ORIGIN与私有配置一致。浏览器检查没有绕过App或后台权限。

重启证据属于本轮验证实例；对外资料由相同脚本单独生成，避免自动填写草稿、失败造数残留影响甲方初始体验。公网补记另列，不把本机截图说成公网结果。
