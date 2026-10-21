# 电脑安卓模拟测试：本侧已测，交给双方人工检查

2026-10-21用户授权配置模拟器、逐业务条线测试、修复并记录。本侧负责执行；队友后续确认页面改进与正式构建配置，尚未替队友作审阅或认领。

基线为共同版本5fba043，目录worktrees/android-test、分支core/v5-android-functional-test；继承上一轮合并后核验记录1e6f579。未改动其他工作树中的未提交内容。

## 实际交付

- 安装本机Java17、安卓SDK/API35虚拟手机，提供启动、停止、自动测试、人工预览命令。工具与合成会话不上传。
- 安卓三场景通过并保存13张截图：五入口/返回/登录空态，故事保存/提交和四次身份切换，报价查未付款订单。首次确认生成订单单独通过，最终全组复测是查回同一订单。
- 修复报价订单按钮位置，统一插件构建处理，取消正式签名回退和正式HTTP例外；修复本机测试文件重复保护权限问题，补机构模拟资料。没有变更业务接口约定或数据库结构。
- 七组模拟资料115项、补充后端197项、页面52+11项、工具7项通过；故事资料新增机构后21项复验通过，静态检查无问题。数量可能覆盖同一业务，不加总当成独立功能数。

## 复现与依赖

本机先按docs/testing/JOINT_TEST_20261022.md启动隔离MySQL，运行node scripts/joint-test-data.cjs check；补充后端在backend_server目录执行node scripts/test-mysql.js <engagement|cocreation|redemption|participation|privacy|wallet>。只接受本地测试配置。

原生测试使用scripts/android-local.ps1 -Action start，启动story模拟资料后，-Action test -AccessFile <本次路径>。人工窗口改用start -Visible与preview；详细操作见[人工接手和各业务线范围](../../testing/ANDROID_LOCAL_TEST_20261021.md)。

页面检查：Flutter项目内flutter test --no-pub test/navigation test/customization；报价用flutter test --no-pub test/trade/trade_widgets_test.dart；工具用node --test scripts/run-ui-browser-check.test.cjs scripts/test-fixtures/private-state.test.cjs。静态检查flutter analyze --no-pub。安卓网络资源用aapt2实际检查，签名配置用Gradle signingReport。

## 分工与剩余

本侧已完成本机可执行的这一批测试和修复。双方下一步先人工操作故事到未付款订单、身份和返回导航；本侧负责资料与问题复现。建议队友优先补真人/机构、制作交付新版页面，再按业务表推进；尚未代其认领。缺页面的业务只记录接口/后端证据，没有假报原生通过。MCN推荐全部经营规则本轮未新增专项重跑。

本轮未调用真实短信/付款/OSS，不是实际手机测试。未构建正式发布包；正式签名与网络配置须经队友实际审阅后再合入。阶段集中上传与检查状态以docs/status/CORE_CURRENT.md为准。

[证据目录](../../testing/evidence/android-functional-20261021/README.md)

## 集中上传记录

2026-10-21，本批实现9d4b26d已上传[PR29](https://github.com/Bill-Billion/jingjing/pull/29)，基于integration/5fba043；远端检查已启动，实际结果见申请最新提交。正式构建配置待队友实际审阅，未合并或部署。本轮随机测试库、临时会话、测试API、MySQL和模拟器已停止并核对清理结果；下次人工测试重建资料即可。
