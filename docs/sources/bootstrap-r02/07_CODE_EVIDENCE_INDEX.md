# 历史代码证据导航：要核验，不是当前缺陷宣判

依据：`sources/V1/README_snapshot.md`与`project-review-2026-09-10.md`。下面是旧报告定位，本次整理没有运行程序，也没有逐项复现。行号可能随当前commit变化。

## 1. 实际工程入口

```text
晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/
晶晶日上工程交接包/01_源码/backend_server/
晶晶日上工程交接包/01_源码/deploy_ops/
晶晶日上工程交接包/01_源码/gate0-docs-src-20260909/
```

最后一个是局部性能实验材料，不是完整主Flutter工程。`项目全景/`与`晶晶日上_UI设计方案/`是分析/视觉展示；不能据其新文案判断主App已实现晶选片场。

## 2. 历史报告中具体发现

|主题|旧报告定位|本轮怎样验证|
|---|---|---|
|定制首款/制作款直接置已付款|backend `routes/samples.js`旧83–99、283–297|是否仍通过业务请求直接置 paid，是否与真实支付流水、回调绑定|
|实名缺配置自动批准|`routes/identity.js`旧58–62|缺服务是否进入approved/unverified_auto，下游能否误当实名|
|新库剧本库缺列|samples library查询与`migrations/001_initial.js`|新空库是否缺video_url；是否后来补迁移；测试隔离后复现|
|交易状态越权查询|`routes/payment.js`旧64–68|是否按交易和当前用户双条件校验|
|auto回退|Flutter `api_service.dart`、`app_mode.dart`|读写错误是否切本地模拟；体验token能否混入在线模式|
|私有文件语义|`services/storage/index.js`及`app.js` /uploads|localDriver是否忽略isPrivate；OSS失败后是否公开降级|
|MySQL假切换|`db.js`及mysql脚本|运行是否仍better-sqlite3；不能只检DB_CLIENT变量|
|Tab状态与缓存|`main_scaffold.dart`及`resource_cache.dart`|旧报告已确认IndexedStack/懒挂载；缓存引用仍需检查|
|加密配置|`utils/crypto.js`|旧报告称回退key/长度缺校验；不可输出实际密钥|
|任务重复|`jobs/scheduler.js`|多进程能否重复扣减/退款/推进；数据条件是否原子|
|正式签名|Android build.gradle.kts|release是否回退debug证书；不打包或展示keystore|
|金额契约|OpenAPI、humans/projects/pay|数据库分、某些接口元，逐字段比对|

## 3. 历史工具与测试记录

README写的是09-10复现环境Node.js 20.19.4、npm 10.9.2，而不是固定发布要求；Flutter锁文件条件比pubspec声明更高。今日工具链按当前锁文件/官方兼容要求核验，不能为了通过试跑随意降级依赖。

09-10后端报告：21项测试通过，Flutter因缺工具未测。更早319前端测试声明属于另一份交接来源。不得合并成“本轮340项全部通过”。旧测试中有缺生产库时直接return的情况；必须区分真实skip与通过。

## 4. 旧接管关注点仍有用，但不能驱动本轮全部设计

`samples → launch-project`、项目详情取真实API、project_updates发布、剧本版本、机构与合同、结算单都是需核查点。现在新业务还增加样片后尾款、外部供给许可、私人与商业用途、独家权利与多主体结算。不能只修通旧链就声称新平台已完成。

## 5. 当前commit对比工具

`data/repo_snapshot_fingerprints.json`保存已上传ZIP的部分源码/配置文件摘要，不包含源码正文、.env、签名或数据库。运行：

```powershell
py -3 <资料包路径>\tools\compare_snapshot.py --repo <已核实仓库路径>
```

只比较已登记文件的增删改，不证明功能对错，不自动读取新文件内容。ZIP没有Git历史，不能用它伪造提交号或确切提交日期。
