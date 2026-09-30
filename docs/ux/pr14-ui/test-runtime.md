# 第14份页面隔离联调环境

启动器为`scripts/pr14-ui-test-server.cjs`，必须显式传`--test-only`。只接受NODE_ENV=test、MySQL127.0.0.1:33316、jx_local/jx_dev；每次创建和迁移新的随机jx_test_*库，业务数据只写该库。可用JX_MYSQL_TEST_ENV_FILE选择满足这些条件的本地配置；不读取正式后端.env。

API监听127.0.0.1:3242，私有控制面3243；网页来源5202、Flutter预览8771已登记。控制面必须带本次随机密钥且拒绝Origin；密钥仅保存在0600的`.local/pr14-ui-runtime.json`，不发给网页或提交。只能读取固定合成号码验证码，切换本次内存存储及撤回/恢复固定审核账号的既有权限；没有任意账号提权入口。

|号码|用途|
|---|---|
|13900009201|作者负责人，作品与商品供给方|
|13900009202|另一位负责人，许可买方及指定阅稿账号|
|13900009203|独立资格、权属、内容及许可审核账号|
|13900009204|测试机构普通成员，验证无权访问|

页面通过正常短信挑战和登录获取真实会话；传输端只接受合成号码，短信不真实发送。文件保存实际字节并校验哈希，传输使用进程内私有内存，不证明持久存储供应商已启用。

种子包含已双审原作、有效合成规则、已上架与待审核商品、真实合同预留、人工核验的合成签约及收款依据、有效许可、未核验证据、用途项目及一个绑定、已批准和待批准阅读。全部名称及条款标记隔离测试；金额、期限与次数只是种子样本，不是商业默认值。

启动成功后另存`.local/pr14-licensing-ui-http.json`供候选协议校验，状态不保存会话令牌、验证码、正文或数据库密码。SIGINT/SIGTERM会关闭两个监听、删除本进程随机库、清空文件和短信、移除本进程状态；已有状态不覆盖，清理失败保留恢复线索。不要强杀进程或删除其他任务的数据。

本机最初缺后端依赖；默认Node26的旧SQLite原生依赖不兼容。本批实际使用锁定依赖的JavaScript/MySQL部分，不改依赖版本；MySQL和新账号HTTP不使用SQLite。具体启动及验证结果在本批交付中记录，未运行不能当通过。

## 复现步骤

先启动已有隔离 MySQL 并确认配置文件是测试配置。在根目录启动后端：

```sh
JX_MYSQL_TEST_ENV_FILE=/path/to/test-env.json node scripts/pr14-ui-test-server.cjs --test-only
```

另一个终端在网页源码目录启动：

```sh
VITE_BACKEND_ORIGIN=http://127.0.0.1:3242 npm run dev -- --host 127.0.0.1 --port 5202 --strictPort
```

根目录运行网页实际流程（使用已安装的 `playwright-core`，不增加测试框架）：

```sh
PR14_UI_STATE_FILE=.local/pr14-ui-runtime.json BASE_URL=http://127.0.0.1:5202 node scripts/pr14-ui-browser-check.mjs
```

`CHROME_PATH` 可选择本机 Chrome 或 CI 已安装的 Chromium。只允许本机来源和本次 `testOnly` 状态。单独追加项目改稿可传 `--only-adaptation`，请求恢复导航保护可传 `--only-pending-nav`，视口截图可传 `--only-final-shots`；脚本输出仅脱敏结果，私有控制面密钥和会话令牌不进入报告。

App 在源码目录用任务内 Flutter SDK 执行：

```sh
flutter build web --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:3242
cd build/web
python3 -m http.server 8771 --bind 127.0.0.1
```

本机任务 SDK 位于 `.local/tools/flutter-3.47.5/bin`。全局旧 SDK 缓存有缺失，已使用任务内 SDK，没有改用户的全局 Flutter。首次访问 Flutter Web 如需自动化，启用页面的 accessibility；手机框仅是忽略的 `build/web/mobile-preview.html` 预览文件，不是产品新增业务页。

App构建及8771预览启动后，在根目录运行最终浏览器检查。使用正常表单登录，不注入会话，检查实际HTTP、五个主入口并保存手机视口截图；证据包括本次 `main.dart.js` 指纹。

```sh
PR14_UI_STATE_FILE=.local/pr14-ui-runtime.json BASE_URL=http://127.0.0.1:8771 node scripts/pr14-app-browser-check.mjs
```

测试验证码查询示例在根目录运行，只输出合成号码的本次验证码：

```sh
node - <<'JS'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync('.local/pr14-ui-runtime.json'));
fetch(s.controlUrl + '/code?phone=13900009202', {
  headers: { Authorization: 'Bearer ' + s.controlToken }
}).then(r => r.json()).then(r => console.log(r.code));
JS
```

关闭 API 启动终端时使用 Ctrl-C，让启动器清理自己创建的随机数据库和私有状态；其他共享数据库、MySQL 容器和配置文件保留。当前预览若供审查可保持运行，关闭后需要正常重新登录。

## 原图册对齐的只读检查

两端最终源码稳定且App重新构建后，运行独立的样式脚本。它只通过正常合成短信表单登录，业务请求限只读；照片、字段、导航和长页按1440/390/320视口保存到新的 `style-*` 文件，旧功能证据不覆盖。运行成功与目视符合图册分别记录。

```sh
node scripts/pr14-style-contract-fixture.cjs --test-only
node scripts/pr14-style-browser-check.mjs
node scripts/pr14-style-browser-check.mjs --app
```

第一条仅为当前随机测试库准备治理合同的读取样本：使用原内容构造器、完整哈希、真实数据库和明确读取名单，状态固定为 `SEALED / NOT_SIGNED`，不产生外部签署或付款事实，不增加HTTP提权或写入入口。重复运行复用同一测试快照。编号登记为本次私有状态中的 `contractSnapshotId`，公开且无凭据的[样本说明](evidence/style-governance-fixture.json)另存。owner或otherOwner必须选择其个人身份读取；机构身份不在这份合同当事方范围内。

许可记录内嵌的历史合同与治理合同读取接口是不同保存域，不能把前者的编号填入后者来证明成功详情。首次实拍中发现该错误后，用上述合法样本重新验证成功页面；不放宽原有404权限边界。这里验证读取页面及内容，不代替治理合同创建、核验和正式签署的业务验收。

App脚本使用最终新浏览器上下文正常登录，并记录实际网络加载的 `main.dart.js` 指纹；不得给旧浏览器截图附上新构建哈希。源码和App构建变化后，至少更新所有受影响页面，最终单一构建的报告应从该构建重新加载。验证码以同一号码本次挑战为准，不并行运行会替换同号码挑战的登录脚本。
