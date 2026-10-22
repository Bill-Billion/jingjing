# 第四轮前端验收与复现

2026-10-22，`ux/v5-r04-production-frontend`，基于 `integration/2608ef7`。已继承PR32；现行契约0.30.1-rc.1。先看[图册](index.html)、[汇总](RESULTS.json)和[本轮报告](../../R04_FRONTEND_20261022.md)。

App346项、网页12组255项、分析和两端普通产品构建通过。110张最终截图包括App32、Web78；依据原稿34—39，PC是同语言适配。主代理已查看全组联系表、关键原尺寸图和原稿，修复后的作品下载页显示服务器“正式成片已交付”。[文件、路由、来源和SHA256](SCREENSHOTS.json)，[图册加载与筛选检查](GALLERY_CHECK.json)。

## 实证文件

|文件|证明范围|
|---|---|
|LOCAL_CHECKS.json|最终346／255、分析和产品构建日志摘要及哈希|
|API_RESULTS.json|35项实际DTO/权限/来源检查，以及原故事创意追加的真实409阻断|
|FIXTURE_SMOKE.json|最新隔离入口30项；未配置渠道不伪造到账|
|WEB_RESULTS.json|37组页面/视口、68张图；43菜单、唯一高亮、字体、颜色、方形控件与宽度|
|WEB_FLOW_RESULTS.json、CROSS_TO_APP.json|实际新建、项目独审、受派开工、私有剧本上传与独立读取审核|
|APP_CROSS_RESULTS.json|App读取并确认网页交来的同一项目、订单与SCRIPT版本|
|APP_FUNCTIONAL_RESULTS.json|未受下载刷新修复影响的订单、付款、制作、原故事、播放、通知、收讫、纠错和工单检查及23张图|
|APP_DOWNLOAD_RESULTS.json|修复后独立重建，明确最终下载、无正式内容预探测、下载后真实履约GET及3张最终图|
|WEB_RECOVERY_RESULTS.json|9项实际Web重发清旧收讫及独立恢复延期，4张图|
|MANUAL_PREPARE_RESULTS.json、MANUAL_APP_RESULTS.json|本人通过真实接口建立／绑定约定，App本人确认；无样片订单、收费或成片|
|PRODUCT_TOKEN_SCAN.json、STAGED_TOKEN_SCAN.json|普通产品与暂存内容不含本轮合成访问凭据；私有注入入口未混入正式产品|
|CLEANUP.json|9次本轮夹具的随机库、访问文件、临时注入构建、自启服务清理与只读数据库核对|

不同层级计数重叠，不合计为独立业务数。截图来自多个隔离实例；同一网页到App链由CROSS_TO_APP和APP_CROSS中的相同标识证明，不用跨实例UUID拼成业务成功。无关页面沿用通过的截图，受影响页面已重拍；失败定位图和原始输出留在忽略目录，未混进最终图册。

## 复现方式

所有业务脚本只接受显式标记的本机合成夹具。使用仓库的 `scripts/local-mysql.cjs` 和官方MySQL8准备33316隔离库，`LOCAL_MYSQL_HOME` 指向本机安装，`JX_MYSQL_TEST_ENV_FILE` 指向 `.local/mysql/runtime/test-env.json`。后端使用项目支持的Node版本；本机使用Node22。不要读取生产 `.env`。

若验证真实播放器，在本仓库 `.local/r04-synthetic-media` 生成两份不同的色条；不作为成片或水印验收：

```sh
mkdir -p .local/r04-synthetic-media
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=size=320x180:rate=12 -t 2 -vf format=yuv420p -c:v libx264 -preset ultrafast -movflags +faststart -an -y .local/r04-synthetic-media/full.mp4
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=size=320x180:rate=12 -t 2 -vf 'drawbox=x=0:y=130:w=iw:h=35:color=red@0.8:t=fill,format=yuv420p' -c:v libx264 -preset ultrafast -movflags +faststart -an -y .local/r04-synthetic-media/preview.mp4
DELIVERY_SYNTHETIC_MEDIA_DIR="$PWD/.local/r04-synthetic-media" node scripts/customization-delivery-sandbox.cjs
```

另一个终端设置 `DELIVERY_ACCESS_FILE` 为该次READY返回的access_file，不输出或提交文件内容。Vite5173以 `VITE_BACKEND_ORIGIN` 指向该次本机API源站。

```sh
node scripts/v5-r04-api-check.mjs
DELIVERY_WEB_ACTIONS=1 DELIVERY_WEB_CHANGE_PROBE=1 node scripts/v5-r04-web-browser-check.mjs
```

App使用既有 `test/support/r01_browser_main.dart` 本机入口，私有defines包含 `R01_SYNTHETIC_ONLY=true`、本次API源站、access中的本人token／account／party，以及 `R01_APP_PORT=5500`。用 `--target test/support/r01_browser_main.dart --dart-define-from-file=<本机私有文件> --output <忽略目录>` 构建并仅监听127.0.0.1:5500；此入口不被lib/main.dart引用。随后：

```sh
DELIVERY_CROSS_RESULTS=output/playwright/v5-r04/web/CROSS_TO_APP.json node scripts/v5-r04-app-browser-check.mjs
```

脚本也支持 `DELIVERY_APP_PHASE=matrix|receipt|case|cross|download` 复验受影响部分。完整App流程会提交纠错和问题，不应对同一已变更现场重复当作全新状态运行。`v5-r04-reissue-browser-check.mjs` 用于已收讫且有OPEN延期的专用现场，实际重发并独立恢复；它的预置状态与完整App流程结束状态不同，不能机械串接。

人工样片另开新实例，运行 `v5-r04-manual-prepare.mjs`，它由artist本人建／交／绑定，平台受理，不创建订单。App本机入口改用该实例artist身份，再运行 `v5-r04-manual-browser-check.mjs` 由App明确本人确认。专用成片下载资格另有App专项测试；本轮截图没有虚构可下载样片。

`customization-delivery-sandbox-smoke.cjs <该次实例目录>` 应使用未被完整浏览器流程变更的夹具，结束会自动清理。其他场景在实例目录创建stop文件，等待status中数据库及访问凭据均清理，再关闭自己启动的Vite、静态服务和MySQL；保留他人服务。临时defines、注入构建及Flutter编译缓存也要清理，普通lib/main.dart产品构建另验无凭据。

## 尚未完成

R04-CORE-01：原冻结故事的合法创意追加报价409，HTTP及Web已复现。原始唯一订单检查早于追加来源校验，审核／确认／绑定也受影响；Core需完整修复并补回归，前端未克隆故事绕过。同事实际审阅与共同合入另看PR。

色条只证明播放器可用，不证明真实成片、水印、音画或AI标识。真实支付、退款、签署、OSS、制作、后台自动超期任务与原生真机未在本轮启用或验收；历史旧全目录导航截图套件的限制沿用第三轮记录。
