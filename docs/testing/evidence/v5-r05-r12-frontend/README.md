# 第5—12轮前端验收与复现

2026-10-22，`ux/v5-r05-r12-frontend`。继承第四轮 `11abe25` / [PR33](https://github.com/Bill-Billion/jingjing/pull/33)，共同版本 `integration/2608ef7`，接口0.30.1-rc.1。本批已上传[PR34](https://github.com/Bill-Billion/jingjing/pull/34)，远端检查按该申请当前提交核对。[最终图册](index.html) · [汇总](RESULTS.json) · [完整报告](../../R05_R12_FRONTEND_20261022.md) · [后端阻断](../../../collaboration/V5_R05_R12_FRONTEND_BACKEND_BLOCKERS.md)。

本机App461项、Web13组297项、分析和两端普通网页构建通过。最终图册404张：App246、Web158；主App87场景174图，另有320/768各10场景及实际动作和表单；Web45页面/表单状态、90个尺寸场景，其中88通过、2个预期员工管理403。图片已实际查看，原稿、路由、哈希和采样边界见相应视觉记录。不同层级、重拍及Node版本计数重叠，不合计为独立业务。

## 实证入口

|文件|证明范围|
|---|---|
|CI_FIX.json|首次远端旧项目用例缺参演约定的前后对照；补托管和三方会签/原参演钱账，11组前置+14组网页流程通过，产品与404图未改|
|LOCAL_CHECKS.json|461/297、分析、普通产品构建及Gradle网络阻塞的日志摘要与SHA-256|
|api/API_RESULTS.json|20项真实接口、状态、权限、余额与20人共创检查|
|app/APP_RESULTS.json、APP_PARTIAL_320_RESULTS.json、APP_PARTIAL_768_RESULTS.json|最终87场景主矩阵、两宽度抽样及最终偏好标签补拍|
|app/APP_FORMS_RESULTS.json、APP_05_08_FINAL_VISUAL_REVIEW.json、APP_09_12_VISUAL_REVIEW.json|实际表单展开和逐图检查；未提交表单、L0禁用等采样限制逐项保留|
|app/APP_ACTIONS_BUSINESS_*.json、APP_ACTIONS_COUPON-CANCEL.json|实际视频解码/明确收件/验收、全额券订单及取消原券释放、勾选条款后抽奖、各方同哈希会签后建立未付款出演订单、商单实际文字及客服申请|
|app/APP_ACTIONS_CROSS.json、APP_INCOME_BUYER_RESULTS.json|读取Web同一案件、隐私答复、MCN接单；发行收入各方同一哈希的实际确认及最终读回|
|web/WEB_RESULTS.json、WEB_DELIVERY_MANIFEST.json、VISUAL_REVIEW.json|Web最终矩阵、158张独立图片、源码哈希、原稿语言及实际视觉检查|
|web/WEB_FLOW_RESULTS.json、WEB_MCN_RESULTS.json、CROSS_TO_APP.json|412重新核对、丢回复原键恢复、预留释放、实际案件/隐私答复及MCN受派接单|
|web/WEB_COMMERCIAL_*.json、app/APP_ACTIONS_CONVERSATION-READBACK.json|同一商单隐藏与冻结、App/Web真实读回及清除旧正文；首次JOIN阻断另列|
|api/SUPPORT_FIXTURE_PREREQUISITE.json|合法夹具预JOIN是后续客服动作前置，不是UI初次加入通过|
|web/WEB_APP_ORDER_READ.json、WEB_COUPON_CANCEL_READBACK.json|同一App零现金订单/未付款出演订单的Web读取，以及取消后原券AVAILABLE读回|
|web/WEB_INCOME_SIGNER_READ.json、WEB_INCOME_CROSS_READBACK.json|合法非项目所有者受益方读约定无需越权GET项目、双方确认同哈希读回|
|SOURCE_SHA256.json、SCREENSHOTS.json、GALLERY_CHECK.json|交付源码/图片哈希与图册链接、筛选、搜索、390/1440宽度检查|
|PRODUCT_TOKEN_SCAN.json、STAGED_TOKEN_SCAN.json、CLEANUP.json|普通产品与暂存凭据检查；V5五次夹具及旧项目回归复验均清理，私有构建、临时媒体及本任务服务已移除/停止|

旧50143与新54691为不同合成实例，各自的跨端记录只在同一实例内核对。不得用另一实例的相同角色或场景名冒充同一业务。截图含真实合成ID与服务端合成文案，不含token。旧动作截图保留当时界面；受影响的最终页面已重拍，定位失败图和瞬时缺字收件图不纳入最终404张。

## 复现

使用项目支持的Node22、官方MySQL8及`ffmpeg`，安装两端既有锁定依赖。通过`scripts/local-mysql.cjs`准备本机33316隔离库；`JX_MYSQL_TEST_ENV_FILE`指向`.local/mysql/runtime/test-env.json`，不要读取生产`.env`。本机ffmpeg位于`/opt/homebrew/bin/ffmpeg`，其他机器显式设置`FFMPEG_PATH`。

```sh
node scripts/v5-r05-r12-sandbox.cjs
```

从READY输出保存本次`access_file`，只在忽略目录使用，设置`V5_ACCESS_FILE`与`V5_FRONTEND_ACCESS_FILE`指向它。API基址由本次随机端口决定，不复制旧端口或旧ID。Vite在127.0.0.1:5173运行，`VITE_BACKEND_ORIGIN`指向该次API源站。随后可分别执行：

```sh
node scripts/v5-r05-r12-api-check.mjs
node scripts/v5-r05-r12-web-browser-check.mjs
```

App使用`test/support/v5_business_browser_main.dart`验收入口，设置`R05_R12_SYNTHETIC_ONLY=true`，构建时加`--no-web-resources-cdn`，输出到忽略目录；只监听127.0.0.1:5500，将本次access复制为该目录`synthetic-access.json`。普通`lib/main.dart`不引用该入口。然后运行`v5-r05-r12-app-browser-check.mjs`、`v5-r05-r12-app-forms.mjs`。`V5_APP_WIDTH=320|768`及`V5_APP_CASES`（逗号分隔场景名）用于定点重拍，脚本头部列出实际环境参数。

真实动作由`v5-r05-r12-app-actions.mjs`的`V5_APP_ACTIONS`/`V5_APP_PHASE`及Web脚本的`V5_WEB_ACTIONS_ONLY`、`V5_WEB_MCN_ONLY`等场景开关控制。它们会改变案件、券、订单和会签状态，需先核对对应初始条件；不可机械地对变更后的同一现场重复整个流程。客服预JOIN及本次原请求恢复的人工读回均在各JSON独立记录，不以修改数据库伪造UI成功。

结束时向本次READY的`stop_file`写入文件或在夹具进程Ctrl-C，等待status明确数据库与访问文件清理成功，再关闭自己启动的Vite、5500静态服务和本次MySQL。删除私有构建、`synthetic-access.json`及本轮临时媒体；另用普通`lib/main.dart`构建并检查不含本次访问凭据。

## 验收边界

后端未全部完成，具体入口和最小复验见独立阻断清单。表单截取、权限禁用、实际写入、跨端读回和真实服务分别记录。色条MP4和试镜占位材料不证明作品质量。Android安装包本次受Gradle下载网络错误阻塞；Android/iOS手机、正式支付/实名/签署/存储、真实音画/水印/AI标识、长期模型、旧库迁移和容量未在本轮完成验收。辅助代理检查不代表另一位同事实际审阅；本批不推main、不部署。
