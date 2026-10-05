# 第四批：App业务操作与文件保存问题

用户要求继续。本批沿用完整流程主测任务，本侧负责实际测试、记录、必要修复和复测；队友审阅页面变更，没有替其认领或批准。开工 `ee34a71`，工作树干净，fetch后共同版本仍为 `28662ab`。分支仍为 `core/full-flow-acceptance-20261005`，保留第21、22份待审依赖。

本批范围：App商单、MCN合作、选角、本人入组、方案及成片会签、发行材料和导航；项目文件重新读取与设备保存失败。接口、数据库、业务规则和页面版式不变。实际页面使用Flutter Web与本机隔离MySQL，外部短信、文件、支付传输为模拟，不进行真实收费操作或安卓设备验收。

## 已复现和修复

项目文件先读成功后，再遇服务503或文件内容摘要不一致，App仍保留旧“已按当前权限读取材料”；设备保存插件抛出异常时，原页面没有处理，形成未捕获错误。

新增三项控件回归，原代码三项均失败。现在开始读取时清旧成功/错误提示；设备保存异常给出“文件保存未完成，请检查设备后重试”；保存窗口返回后再次检查办理身份是否仍有效。恢复后可以重新读取和保存。测试也核对失败没有增加成功保存次数，成功重试后旧错误提示消失。

产品修复已单独保存为 `84a09a6`：仅 `lib/projects/project_pages.dart` 及 `test/projects/project_download_test.dart`。队友无需改接口，需要审阅项目材料下载的提示与异常行为。文件保存插件在控件测试中使用替身，不能据此宣称安卓系统保存窗口已经实测。

## 测试脚本的历史预期

原商单App脚本仍在 `/messages` 寻找“商单通知”。当前 `lib/app.dart` 已将该路径指向统一业务通知页，专门的商单通知路径为 `/gigs/notifications`。实际截图显示统一页面已经取得商单通知，因此这是旧脚本预期，不是新发现的产品缺陷。

本批按当前入口验证通知记录以及“查看对应业务”的实际接口和跳转，保留首轮停止记录在 `docs/testing/evidence/20261005/app-business/script-before-update/`。没有把调整断言算作产品修复，也没有让产品退回旧通知页。两份App脚本增加独立证据目录和构建路径参数，避免覆盖历史记录；真机状态改为明确的“本轮未运行”。

## 独立复跑方法

在仓库根目录使用第三批的 `scripts/full-flow-business.cjs`，商单和项目可以分别运行。每次完整测试前新建资料，不能重复使用已经确认/结束合作的场景。

1. 设置已有隔离MySQL的 `JX_MYSQL_TEST_ENV_FILE`；项目另外设置已有 `JX_TEST_FFMPEG`。分别运行 `node scripts/full-flow-business.cjs projects start --test-only` 或 `gigs start --test-only`。
2. App工程构建项目版本：`flutter build web --no-pub --no-web-resources-cdn --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:3322`；用 `python -m http.server 8775 --bind 127.0.0.1 --directory build/web` 预览。
3. 商单版本用 `--output=build/web-gigs --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:3302` 构建；用8774端口提供 `build/web-gigs`。两套构建分开保存，不互相替换接口地址。
4. 设置已有浏览器 `CHROME_PATH`、对应构建目录 `JX_APP_BUILD_DIR` 和本次 `JX_BROWSER_EVIDENCE_DIR`，再分别运行 `node scripts/pr18-app-browser-check.mjs` 或 `node scripts/pr17-app-browser-check.mjs`。本批项目证据在 `docs/testing/evidence/20261005/app-business/`，商单在其 `gigs/` 子目录。
5. App自动回归：`flutter test test/projects test/gigs test/account --no-pub --reporter expanded`；独立文件回归：`flutter test test/projects/project_download_test.dart --no-pub`。这两条不需要MySQL或外部服务。静态检查针对变更的页面与测试文件。
6. 分别用 `full-flow-business.cjs projects stop`、`gigs stop` 正常清理，确认自建库、运行文件和媒体消失，再停止网页预览和自己的测试MySQL。

## 当前边界与下一步

本批不更新手机中原来的短信测试包，不开启公网，不调用真实短信、OSS或付款渠道。真实发行材料、账户与授权仍需要实际依据，模拟资料不构成正式业务核验。

下一步由本侧整理前三批和本批的稳定修复、安卓构建与模拟业务访问方案，形成一个集中交付入口；队友审阅页面差异。真机验收仍须新版安装包及手机可访问的测试后端。旧临时入口授权已结束，不自动重新开放。甲方继续补OSS，当前本地检查不需新增业务资料。

## 最终实际结果

|工作|结果|证据与限制|
|---|---|---|
|App选角、本人入组、方案/成片会签、发行补件和外部凭据|9组通过，页面异常0；含机构身份选择、503原请求恢复和320宽子页检查|[项目页面结果](../../testing/evidence/20261005/app-business/app-browser-results.json)，Flutter Web，未在安卓设备上操作|
|App商单、需求发布、客户确认、直接MCN合作、佣金历史、通知与导航|最终全新资料7组通过，页面异常0；统一通知能取得业务记录并跳转|[商单页面结果](../../testing/evidence/20261005/app-business/gigs/app-browser-results.json)，首轮旧脚本预期失败单独保留|
|账号、商单、项目自动回归|82项通过，包含新增3项；保存提示断言补充后又单独复测3项通过|不能将重复3项另加；[修复前后摘要](../../testing/evidence/20261005/app-business/download-regression.json)|
|静态检查与构建|改动页面/测试文件检查无问题；两个不同本机接口地址的JavaScript网页构建成功|构建有既有Wasm兼容提示，不是Wasm构建或安卓安装包|
|隔离清理|项目实例和商单两次实例的自建库均消失，运行记录及媒体清理；授权关闭的三个进程均退出0|[清理记录](../../testing/evidence/20261005/app-business/fixture-checks.json)，页面预览和本机MySQL也已停止|

[本批汇总](../../testing/evidence/20261005/app-business/check-summary.json)。最终16组浏览器流程与82项自动测试属于不同检查层次，不混成98个完整业务场景。原始自动检查日志在本地 `.local/fourth-*.log`。本批产品代码没有放宽后端权限，没有改商业数字，没有新增真实外部接入。

**写完并完成所列测试，仍待队友审阅；本地保存，未推送、合并、部署或更新安卓包。** 主测总任务继续保持进行中，下一步是稳定修复的阶段交付与新版安卓验收准备。

## 截图复核仍待改进

[MCN合作详情截图](../../testing/evidence/20261005/app-business/gigs/screenshots/pr17-app-notification-linked-record-mobile.png)显示双方主要以长编号呈现，用户难以确认实际合作方。此项已加入问题清单，尚未修复。下一步优先确定现有授权范围内的名称来源并补页面展示；不伪造名称、不放松主体权限。16组通过只证明所列操作和接口检查，不代表所有体验问题已解决。
