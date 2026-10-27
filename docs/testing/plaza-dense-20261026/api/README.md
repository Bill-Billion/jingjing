# 本轮接口检查与联合合成资料

接口结论见 [API_REPORT.md](../../../reviews/plaza-dense-20261026/API_REPORT.md)。此目录不保存账号令牌、数据库密码或 `access.json`。

## 已完成的接口检查

- `readonly-http.cjs`：GET-only，四个既有独立沙箱合计 82 项检查。`artists/stock/notices/auditions-http.json` 保留状态、字段名与请求摘要。
- `*-existing-smoke.json`：本轮复用既有四个 smoke 的结果，合计 68 项。这些既有脚本会更改自己的合成资料后关闭沙箱。
- `*-cleanup.json`：只证明前述四个独立随机数据库与短期访问文件清理完成。
- `joint-http-check.cjs` / `joint-http.json`：新增同城联合沙箱 GET-only 检查，35 项通过，供页面继续验收。
- `COVERAGE.md` / `browser-acceptance.json`：最终映射为 36 组、755 次采纳真实 HTTP、232 张截图、累计5次限定合成写入。受影响 UI 已按 `b95b7ffe…` 复验；中性“入口”末版 `0f38bca1…` 仅补 search-directory 三宽，共139次真实HTTP、36张截图、0写入。旧试镜缺页已修复，并用 canonical 路由、郑州、真实200和可见方案三宽复验；旧误报与修复前报告仍保留在 `browser-runs/`。撤权一组继续区分原截图/请求链复核与补充只读 HTTP。
- `browser-evidence/index.html`：可提交的截图索引。每组明确记录运行和编译哈希，早期 `26d1d0e9…` 文案图仅作历史来源；没有受末次标签改动影响的已过场景保留其明确版本。视觉逐页对照见 [主页审阅](../../../reviews/plaza-dense-20261026/VISUAL_HOME.md) 与 [子页审阅](../../../reviews/plaza-dense-20261026/VISUAL_SUBPAGES.md)，原始图片未覆盖。

## 联合沙箱启动

需要已有隔离 MySQL（test、127.0.0.1:33316、jx_local/jx_dev），现有后端依赖及本机 ffmpeg；不读取正式后端 `.env`。启动器拒绝其他数据库配置，加载现有外网阻断器，每次创建自己的随机数据库。

```sh
JX_MYSQL_TEST_ENV_FILE=/本机私有路径/test-env.json FFMPEG_PATH=/opt/homebrew/bin/ffmpeg node docs/testing/plaza-dense-20261026/api/joint-sandbox.cjs
```

启动结果会给出本次 `base_url`、`.local/plaza-dense-sandbox/jx_test_plaza_<随机>/access.json` 和 `stop` 路径；私有文件权限为 0600，仅供本机运行时读取。默认有效 240 分钟，界面可使用 5500、5000、5173 的 localhost/127.0.0.1 来源；其他本机端口可在启动时显式设置 `JX_UI_ORIGIN=http://127.0.0.1:<端口>`。

```sh
node docs/testing/plaza-dense-20261026/api/joint-http-check.cjs .local/plaza-dense-sandbox/<本次随机目录>
```

`joint-seed.cjs` 复用现有 stock/notices/auditions helpers，以及正式艺人、授权、托管、作品、通告仓储。没有修改业务后端。数据准备中的模拟身份核验、模拟付款和模拟审核只存在于隔离库，不接外部服务。

## 角色与页面数据

城市查询值均为 `郑州`，不是 `郑州市`；字段和公开权限仍由真实接口决定。

| 角色键 | 用途 | 本次访问文件定位 |
| --- | --- | --- |
| `stock_buyer` | 浏览全部四类公开目录、查看自己的已购/未付订单 | `accounts.stock_buyer`；`scenarios.stock[]` |
| `artist_1` 至 `artist_8` | 对应合成艺人本人资料、撤回自己公开授权的异常验收 | `scenarios.artists[]` 带本人、数字人、公开条目、同意和预览资产编号 |
| `notices_seller` | 已有本人投稿及新建投稿 | `scenarios.submissions[]`；表单所需规则、接收方、本人、数字人和同意记录在 `scenarios.submission_form` |
| `notices_buyer` | 合成通告发布方、接收已审核投稿 | `scenarios.notices[]` |
| `notices_reviewer` | 合成投稿审阅；与投递/接收方分离 | `accounts.notices_reviewer` |
| `auditions_buyer` | 查看安全审阅中的预约、从公开试镜服务进入 | `scenarios.audition_booking`、`scenarios.audition_offer` |

同一登录账号可以读取所有公开目录；其本人订单/投稿仍必须使用对应角色，不能把不同人的私人记录混成一个演示账号。六类通告都有内容，但只有 DRAMA/RECRUITMENT 开启投稿。8 名公开艺人中 3 名 `audition_public=true`，这只是展示标记；独立公开试镜属于另一名合成服务者，不能因此声称这 3 名艺人有实时可约服务。

头像为程序绘制的 240×320 合成人形 PNG；作品预览为 1 秒色条 MP4。没有伪造明星标记、作品封面、播放量、时长字段或真实业务销量；测试价格和已付款状态均明确属于合成资料。真实付款、短信登录等路由在联合沙箱入口关闭。

## 浏览器验收入口与执行

`browser-check.mjs` 使用项目已有 `playwright-core` 和 Chrome，不另增框架。`fixture-web-server.cjs` 只绑定 `127.0.0.1:5500`，动态读取当前联合访问文件，不把令牌复制到构建目录或证据。准备脚本和语法检查不代表浏览器用例已经通过，实际结果以本轮运行的 `browser-results*.json` 为准。

先由构建负责人冻结业务源码，在 Flutter 应用目录单独构建测试入口。不要与其他代理同时构建同一输出。普通 `lib/main.dart` 构建仍单独验证；此测试入口只注入本轮随机库的身份，业务页使用当前源代码。

```sh
flutter build web --release --no-web-resources-cdn --target=test/support/figma_restore_browser_main.dart --dart-define=FIGMA_RESTORE_SYNTHETIC_ONLY=true --output=.local/plaza-browser-final
```

在仓库根目录分别启动服务和验收：

```sh
PLAZA_ACCESS_FILE=.local/plaza-dense-sandbox/<本次随机目录>/access.json node docs/testing/plaza-dense-20261026/api/fixture-web-server.cjs
```

```sh
PLAZA_ACCESS_FILE=.local/plaza-dense-sandbox/<本次随机目录>/access.json PLAZA_ALLOW_SYNTHETIC_WRITES=1 node docs/testing/plaza-dense-20261026/api/browser-check.mjs
```

测试构建打开方式：`http://127.0.0.1:5500/?fixtureGroup=r05r12&fixtureRole=stock_buyer#/square`。`notices_seller` 用于本人投稿，`auditions_buyer` 用于原预约，`artist_1` 至 `artist_8` 用于对应本人的授权。

- 输出：`output/playwright/plaza-dense-20261026/` 下的截图、ARIA、请求与写入摘要、逐用例结果、静态索引。已检查令牌不会进入这些文本证据；不保存请求鉴权头。
- 默认宽度：320、390、768。可设置 `PLAZA_BROWSER_WIDTHS=390` 先预检；`PLAZA_BROWSER_CASES=channels,city,search-directory` 可只跑指定用例；`PLAZA_BROWSER_RUN_TAG=preflight` 保留分段结果。输出和构建路径可用 `PLAZA_BROWSER_OUTPUT`、`PLAZA_APP_BUILD_DIR` 覆盖。
- 真实数据用例：四频道 8/6/6、精确城市与无结果、持久化、搜索与全部入口返回、公开艺人详情/肖像、作品许可/播放、六类通告、三种本人投稿表单、原投稿结果、无接收方同意、真实 404。
- `network-recovery` 另行中断三个目录各一次浏览器 GET，验证失败态和实际 HTTP 重试。它只证明前端对受控传输失败的处理，记录在 `controlled_transport_faults`，不计作后端真实错误或真实 HTTP 响应。
- `stock-quote-change` / `artist-unavailable` 分别在每个宽度拦截一次412/409，单列 `controlled_http_responses`；前者的checkout不会到后端，后者不再次撤权。它们只验S06/S05新布局与恢复，真实创建未付订单和真实撤权沿用原独立证据。
- 显式合成写入用例：`checkout` 创建一个未付订单；`submit-profile`、`submit-role`、`submit-create_drama` 各递交一份待独立审核投稿；最后的 `artist-revocation` 撤回第 8 位合成艺人的公开同意，用真实 HTTP 拒绝验证旧预览与操作清除。默认未开启 `PLAZA_ALLOW_SYNTHETIC_WRITES=1` 时这些用例记为未执行，不写业务。
- 撤权必须最后执行。撤权后公开艺人变为 7 位，重跑完整 8/6/6 前置检查须新建联合沙箱；不能为复测“恢复”不可撤销的原同意记录。
- 撤权后复验受影响 UI 时，设 `PLAZA_EXPECT_ARTISTS=7` 并用 `PLAZA_BROWSER_CASES` 明确选择只读用例；脚本拒绝开启写入，且额外确认第 8 位原同意为 WITHDRAWN、目录已排除该条，不是任意放宽数量断言。试镜入口现在必须核对 canonical 路由、原城市、真实目录 200 与实际可见方案，不能把缺页或通用失败页算作成功。
- 联合入口未开放 engagement、customization、production、supply 上传和真实 payments。`全部功能` 检查保留其入口；未开放服务不能算业务通过，也不能把 `LOCAL_FIXTURE_ROUTE_DISABLED` 当成生产缺陷。附件上传、真实支付、短信登录、私有真实媒体、原片下载、设备/IP 定位均不在本脚本通过范围。
- 脚本不伪造业务成功响应；原始结果中的 `PASS_PENDING_VISUAL_REVIEW` 只表示行为和请求断言通过。汇总中的 `PASS_FUNCTIONAL_AND_VISUAL_REVIEWED` 另需已完成的逐图审阅记录，原运行JSON仍保留当时状态。

本轮复核撤权的 `verify-revocation-evidence.cjs` 只读旧截图/原 HTTP 顺序及当前三个接口，不重复撤回。`assemble-browser-evidence.cjs` 保留原始 JSON 后按 case 汇总，不会将失败行改写成自动通过。视觉负责人完成实际看图后，汇总才验证每幅当前截图在审阅文件中列名或与已列图SHA-256一致：

```sh
PLAZA_FINAL_COPY_RUN=final-copy PLAZA_UI_RECHECK_RUNS=visual-final,visual-final-recheck,visual-final-form320,visual-final-s05,visual-entry-final PLAZA_VISUAL_REVIEW_CONFIRMED=1 node docs/testing/plaza-dense-20261026/api/assemble-browser-evidence.cjs
```

## 结束

本轮联合沙箱已清理，见 [joint-cleanup.json](joint-cleanup.json)：随机库与短期凭据已删除，5500界面服务和53781后端服务均停止；独立数据库查询再次确认本轮库不存在，共用MySQL仍可查询。PR37独立体验环境及全部历史截图保留。最终[凭据扫描](secret-scan.json)对1074个文本文件检查26个本机私密值，无命中。

后续复现结束后，在该次启动结果指定的 `stop` 文件写入任意内容。核对同目录 `status.json` 为 STOPPED，且 `database_removed`、`credentials_removed` 都为 true，再把无凭据的清理结果存入本证据目录。不要删除或停止共用 MySQL，不要用旧沙箱的清理记录代替新建联合沙箱结果。
