# 第三轮：人物、数字人与机构受托验收

本侧Bill-Billion已实现并提交[PR31](https://github.com/Bill-Billion/jingjing/pull/31)，目标为integration。开工继承PR30/273d0d0；收尾已同步integration/b8775fe，保留同事的安卓配置和已确认报价底部订单入口。前两轮PR30已经chengcongcong222实际审阅通过并随PR29合入；这一事实不代表第三轮已审阅。远端检查和第三轮实际审阅以PR31实时结果为准，本目录保存上传前的本机验收快照。

[77张截图与原稿对照](index.html) · [检查结果](RESULTS.json) · [逐图映射及校验值](SCREENSHOTS.json) · [任务和下一步](../../../tasks/records/UX-v5-r03-artists-frontend-20261021.md)。

## 已经接通的范围

本人建立真人/数字人、私有材料及受控读取、逐项脸声和用途同意、造型/声音版本、本人确认机构委托；机构只见获托对象及允许代办事项。免费认证、L2审核服务、原申请补件和异议、创建与托管服务、原订单及提醒、公开展示申请和受控目录均按现有接口办理。运营按独立岗位读取本申请证据、补件或决定。

创建、托管、认证审核使用已审商品。商户按本人提供的服务编号、买方和商品报价，后端核对并冻结来源；商户不读取本人私有SERVICE记录。报价、App确认弹窗、订单和合同均保留具体真人/数字人/服务。HALO_REVIEW按真人办理，数字人为null；续托衔接原有效期限，首次付款和续期均按真实记录显示。

账户切换、403/404及授权类409清除旧私密内容；未知上传或提交保留原字节、请求键、内容和版本，先核对原结果。412保留输入并读取当前版本。没有改正式服务器、接口、数据库、权限或付款规则，没有新增依赖或锁文件变更。

## 实际检查结果

|检查|结果与证据|
|---|---|
|项目规定App检查|322项通过；包含13个业务模块和interaction_flows/widget两个通用文件，与工作流命令一致。源码及测试分析无问题，合并后正常lib/main.dart构建通过|
|网页检查|238项通过，含artists25、trade25；类型检查和发布构建通过。星号同行修正后重跑artists25及构建；合并段没有网页产品源码变化|
|真实返回格式|[26份实际DTO](API_DTO_RESULTS.json)，覆盖本人9类、受托4类、独立岗位5队列、服务/托管原订单与材料|
|网页业务|[10组](ARTISTS_WEB_RESULTS.json)：三种业务身份、独立岗位、私有上传、明确同意、原申请补件再审、L2请求、儿童限制和目录撤权；17张过程图|
|服务跨端|[网页3组](WEB_CROSS_RESULTS.json)+[App3组](APP_RESULTS.json)：报价真实落库后丢回复，原键原内容恢复；独立审核；App确认同一未付款未签署订单；9张过程图|
|App最终页面|[16项/18张](APP_PAGES_RESULTS.json)，375/390/768；新fixture完整接受关系真实GET，受控材料和公开预览真实GET；唯一[HALO服务POST](HALO_MUTATION.json)为null数字人、提醒关闭、REQUESTED、无订单、无自动扣款|
|网页最终页面|[12页/27个视口/33张](WEB_VISUAL_MATRIX.json)，1440/390/375；业务写入0、原41菜单保留且共43项、无横向溢出、JS/console错误0，字体实际加载。星号修正后重捕11个视口，16个不受影响视口复用并有标注|
|隔离服务|[最终20项](FINAL_FIXTURE_SMOKE.json)通过；机构关系由真实repository创建并由合成人接受，[分页查询OPTIONS204/GET200、POST403](FIXTURE_CORS_PROOF.json)|
|正式包和清理|[正式包67文件扫描](PRODUCT_TOKEN_SCAN.json)无本次会话；[5个随机测试库和凭据全部清理](CLEANUP.json)，临时fixture构建、defines和Flutter构建缓存已移除；本次HTTP/Vite/MySQL进程已停|

这些检查有重叠，不能相加当独立需求数量；App322是项目规定范围，不是全仓所有历史测试通过。额外全目录试跑加载了旧截图套件，出现旧“首页”导航断言并停止，详见[历史测试限制](LEGACY_TEST_LIMITATION.json)。本轮没有删除、跳过或改产品来迎合旧断言。

## 原稿和适配判断

原稿来源为2026-10-15保存的[27人物](../../../reviews/v5-d1-intake/figma-evidence/27-avatar-top.png)、[28托管/MCN](../../../reviews/v5-d1-intake/figma-evidence/28-avatar-extra.png)、[30认证](../../../reviews/v5-d1-intake/figma-evidence/30-cert-growth.png)、[31认证/公开范围](../../../reviews/v5-d1-intake/figma-evidence/31-cert-extra.png)画面；没有重新读取被拒绝的live Figma或验证原型连线。纸灰#F3F0E7、墨黑#171717、朱红提示、随包宋体大标题、细线、方形控件贯穿页面，逐图比较主次、分组、间距和操作位置。

App18张已逐图复看；主代理另复看本人、机构委托、服务确认、跨端报价/订单及网页同意和认证窄屏。没有明显文字/按钮截断或横向溢出。真实编号和权限字段按接口需要展开，正文触控与字体为可读性适配，不声称逐像素一致。原稿没有完整PC工作区，网页属于同语言适配。开发服务截图里的Vite工具浮钮不是产品设计，原图保留未修图。公开预览的1像素素材只证明受控读取，不作肖像质量验收。

## 同事怎样复现

先使用项目已有的本机MySQL隔离配置，限定127.0.0.1:33316、jx_local/jx_dev和NODE_ENV=test；不得换生产库。Node22.5.1完成过本机fixture，CI使用项目固定Node/Flutter版本。以下从仓库根目录执行，access文件由启动输出提供，含会话，不上传、不打印内容。

```sh
JX_MYSQL_TEST_ENV_FILE=.local/mysql/runtime/test-env.json node scripts/artists-sandbox.cjs
```

网页Vite固定127.0.0.1:5173，VITE_BACKEND_ORIGIN指向该fixture的origin。设置ARTISTS_ACCESS_FILE指向其access.json，按顺序运行：

```sh
node scripts/v5-r03-api-read-check.mjs
ARTISTS_SCOPE=web node scripts/v5-r03-cross-browser-check.mjs
node scripts/v5-r03-artists-browser-check.mjs
node scripts/v5-r03-web-visual-check.mjs
```

跨端App阶段须与网页阶段使用同一个fixture和WEB_CROSS_RESULTS.json。用现有test/support/r01_browser_main.dart构建仅本机测试包；私有defines设R01_SYNTHETIC_ONLY=true、R01_API_ORIGIN、R01_BUYER_TOKEN/ACCOUNT_ID/PARTY_ID取该fixture的artist、R01_APP_PORT=5500。defines存App的.local目录、权限0600；仅将该测试构建在127.0.0.1:5500提供。不要在lib/main.dart注入会话。

```sh
ARTISTS_SCOPE=app node scripts/v5-r03-cross-browser-check.mjs
```

App逐页脚本使用另一份新fixture，避免前一脚本已撤回公开同意；同样准备其本机App测试构建，再执行node scripts/v5-r03-app-browser-check.mjs。它明确执行一次HALO_REVIEW请求，其余页面只读。不要对同一已提交fixture重复写入；验收完成向启动给出的stop_file写stop并核对status.json，再删除私有defines、测试构建和相关缓存。node scripts/artists-sandbox-smoke.cjs实例路径会执行20项并自行停止，使用独立新实例，不与浏览器共享变更。

静态检查及构建命令与[前端工作流](../../../../.github/workflows/pr11-frontend-checks.yml)一致；网页新增npm run test:artists，App分析/测试新增lib/artists和test/artists，原检查保留。新浏览器验收脚本本轮在本机实际执行，未写成远端已经执行这些脚本。

## 当前没有验收的范围与下一步

第三轮原生手机安装包、真实实名、OSS、支付/退款及长期模型没有验证；儿童实际处理、L3购买和自动扣款保持关闭。隔离托管付款、预置实名与素材均是合成测试资料，不是正式业务。第三轮没有自动合入integration、推main或部署。

本侧已实现、验证并集中上传PR31，继续处理该申请的实际检查及审阅反馈。同事接下来审阅第三轮本人/受托/独审边界、服务订单来源及页面；前两轮已审阅不代替本轮。人工手机与外部服务分别安排；下一批制作付款交付按原计划推进，未代他人认领。
