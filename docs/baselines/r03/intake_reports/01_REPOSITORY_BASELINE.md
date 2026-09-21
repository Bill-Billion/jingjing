# 仓库基线报告｜2026-09-20

> 历史代码审查：2026-09-20。本轮9月21日仅复核本地HEAD/status保持main@eba5dae且干净，未新增应用测试。文中的MySQL条件任务/首次估算属于旧方案，已由03/04 R0.3替代：正式MySQL 8是基础范围。原静态问题和运行日志保留。

本报告为接手审查，不是上线验收。已取得实际私有仓库，完成定向静态审查及隔离后端检查；未修改业务源码、锁文件或仓库指令，未提交、推送、部署，未访问生产数据库或收费服务。

## 1. 身份、提交与目录

|项目|本轮证据|
|---|---|
|GitHub账号|用户最新指定并通过`gh api user --jq .login`核验：`chengcongcong222`；替代原启动说明的congcong222|
|仓库|`Bill-Billion/jingjing`，private，默认分支main；认证已保存在系统keyring|
|本地|工作区`repo/`，首次克隆；初始不存在可复用仓库|
|remote|`https://github.com/Bill-Billion/jingjing.git`，不含凭证|
|审计HEAD|`eba5daedf71016b5c05661498a89fba57a4b21ed`，main|
|历史|eba5dae：2026-09-18新增全景及业务讨论；c118fe5：2026-09-10新增README及审查；8501055：2026-09-10首次导入工程包|
|工作区|克隆后及报告完成前均核对`git status --short`；见最终证据，业务源码无改动|
|指令|仓库及子目录未发现AGENTS/AGENTS.override；包AGENTS显式阅读。旧SOP、主前端WORKBUDDY_EXECUTION_PROTOCOL及CURRENT保留，合并建议见06|

实际工程位于`repo/晶晶日上工程交接包/01_源码/`，下文 **B/** 表示其`backend_server/`，**F/** 表示`frontend_jingjingshangri_app/`。`gate0-docs-src-20260909`为交付副本，不是另一个应直接覆盖主工程的最新分支。`deploy_ops`绑定历史环境，本轮没有运行。

清单共768个仓库文件（不含.git）、160个静态路由声明；表声明与运行表数量分别记录，不能拿数量作完成率。详见[机器清单](evidence/repository_inventory.json)。

## 2. 与接手包的差异

9月18日提交只新增文档和静态全景网页，没有业务源码变更。V3会议DOCX和原32项工作簿与包内逐字节相同；README、9月10日审查、旧SSOT、ACTIVE及V3融合清单在规范换行后相同，Windows检出CRLF解释了原始哈希差异。完整匹配见[比对记录](evidence/package_repository_matches.json)。

包内V2两份会议文档、R01/R02和最新版权DELTA没有对应的逐字节仓库文件；不能因为远端9月18日更新就覆盖它们。`项目全景/data.js`仍使用旧P0/P1/P2裁剪建议，本轮按用户完整范围取代，网页不是正式批准记录。未找到REQ-060“样片六条”全文。

已回看V2一张、V3两张原始嵌图：V2绿色“已明确”是会议图标签，不等于代码或产品已开通；V3图2的“约2分钟”明确为**样片示例**，不能补成最新“2分钟旗舰成片”的规格。原始32项会议结论仍为空。阅读范围及剩余限制见[SOURCE_READ_LOG](SOURCE_READ_LOG.json)。

## 3. 环境和构建能力

|组件|实际结果|
|---|---|
|Git|按本轮追加指令安装；2.55.0.windows.3，`C:\Program Files\Git\cmd\git.exe`|
|GitHub CLI|2.101.0，`C:\Program Files\GitHub CLI\gh.exe`；浏览器授权完成、私库可读，HTTPS凭据助手已设置|
|Node/npm/Python|v22.19.0 / 10.9.3 / 3.10.11|
|后端|package版本13.0.0；Express4、better-sqlite3、支付宝及阿里/火山SDK；锁文件存在|
|App|pubspec版本12.3.1+22，Dart约束^3.5.0；Provider/Dio、锁定video_player与Android override存在|
|Flutter/Dart/Java|PATH及先前常见位置未找到可用工具；未安装大型SDK|
|Android/iOS|未构建；SDK、正式签名和真机未验；Windows不能完成macOS/Xcode签名构建|
|Web|未发现独立完整A/B业务后台工程；全景、UI设计HTML为资料展示|

后端`start/dev`使用POSIX风格`NODE_ENV=... node app.js`，Windows执行需适配环境变量设置。原`node --test test/`在本机Node22把目录作为模块查找而失败；改为**仅在报告验证脚本中显式枚举5个原测试文件**后可运行，未改仓库package.json。不是所有安装后的新终端都已经刷新PATH；旧终端可重开或使用上述绝对路径。

## 4. 本轮运行证据与边界

验证脚本：[verify_backend.py](verify_backend.py)。源码只复制到`intake_reports/verification/backend`，不复制.env、库、证书、上传文件。新进程只继承运行所需系统环境，业务凭据为空；SQLite与临时文件在verification下，Node预加载钩子拒绝http/https/net/tls/fetch外发。未启动完整app（其导入会起调度器并恢复生成任务），未执行seed/deploy。

|检查/命令|结果及证据|
|---|---|
|`python intake_reports/verify_backend.py install`|隔离副本`npm ci --ignore-scripts --no-audit --no-fund`成功；[安装日志](evidence/npm_ci.log)|
|`python intake_reports/verify_backend.py native`|仅执行better-sqlite3原生绑定构建脚本成功；[原生日志](evidence/npm_native.log)|
|原package测试命令等价调用`node --test test/`|本机失败：Cannot find module .../test；[原命令日志](evidence/backend_original_test_command.log)|
|`python intake_reports/verify_backend.py test`|原5个测试文件显式枚举，Node报告21通过/0失败；[运行日志](evidence/backend_tests.log)|
|旧库结构等价测试|虽然测试框架报告PASS，但原用例在无`jingjingshangri.db`时直接return；**未实际对照旧生产库**。其余20条执行主体，使用临时库/替身，不代表真实渠道|
|全新库|5迁移、61表；执行与选剧库路由同样的SELECT失败`no such column: video_url`；[新库查询日志](evidence/fresh_db_probe.log)。这是SQL复现，未伪称本轮HTTP500|
|JS语法|见[syntax_check.json](evidence/syntax_check.json)；只解析，不执行部署/付款脚本|
|首个验证辅助脚本|NODE_OPTIONS中Windows反斜杠解析错误，修正为正斜杠后运行；[辅助脚本错误日志](evidence/backend_harness_path_error.log)，不计为产品失败|

没有运行Flutter analyze/test、APK/iOS构建、浏览器交互、真机性能、真实付款/退款/出款、短信、实名、云AI或发行验收。21条旧测试不是60条新ACC的运行结果；其中存储测试还明确认可本地公开回退，不能据其通过认为隐私设计已合格。历史319条Flutter测试仍仅作历史。

## 5. 可复用能力与缺口

|领域|代码状态及范围|
|---|---|
|主Tab框架|VERIFIED_EXISTING（静态）：F/lib/widgets/main_scaffold.dart:38、89懒挂载/IndexedStack/TickerMode；无需重复施工。真机性能未验证|
|金额/迁移/组件|PARTIAL：旧金额格式、5迁移、幂等与交付版本护栏可复用；新多卖方许可交易不能照搬旧费率和枚举|
|账号与数字人|PARTIAL：登录、人像档案、授权scope、核验适配存在；账号/主体/成员/多能力/权利人需要解耦|
|作者与剧本|PARTIAL：B/routes/scripts.js:10申请、29投稿、64我的作品、81浏览；B/migrations/001_initial.js:605、616有scriptwriters/scripts。不可称完全没有作者能力，也不可称已做许可交易|
|许可链与独家|MISSING：当前迁移/路由中没有作品版本→许可SKU→已购许可→项目绑定、同源范围冲突、超时预留/迟到付款链|
|制作交付|PARTIAL：B/routes/samples.js:241、301、323有剧本/成片交付及验收；缺新样片流程、制作机构自助分配、人员和版本确认矩阵|
|商单/MCN|PARTIAL：代言订单/接单/交付、MCN申请/艺人/看板已有；通用需求市场、委托权限、真实应付及多能力工作台未闭合|
|发行|PARTIAL：项目/角色固定价认领/节点审核/发起意向存在；渠道提交补正、发行许可、版本会签及发行账单未形成完整能力|
|支付/财务|PARTIAL：新支付宝APP路由有服务端金额/验签/查询；旧退款财务用例有护栏。直付通、分账、代付不完整，未作真实验收|
|AI与存储|PARTIAL：生成与异步任务、版本审核适配存在；长期人像资产效果、私有访问、供应商许可和删除待补|
|A/B工作台|MISSING（完整Web操作面）：有admin API、MCN App页和投稿API，不等于个人作者/制作/多能力机构可完成自助全流程|

REQ总表按**完整需求**评定：44 PARTIAL、10 MISSING、1 MOCK_ONLY、5 NOT_VERIFIED；没有任何一项完整新REQ被本轮宣布已验收。每条附实际文件/行号及下一动作。

## 6. 历史问题复核及新增发现

严重度描述启用风险，不使用旧产品分期P0作安全级别。以下除F03外为静态事实，不冒充攻击复现。

|ID/严重度|现状与证据|对应施工/验收|
|---|---|---|
|F01 阻断|B/routes/samples.js:83、89和283、290直接将意向金/制作款置为已付，没有通道成功前置|WORK07/14；可信回调前不置paid，旧假付记录逐单核对|
|F02 阻断|B/routes/identity.js:60未配置个人实名provider时approved/unverified_auto；与compliance.js:49生产人脸未配置拒绝并存|WORK02/14；缺配置返回待核验，旧记录不迁成真实核验|
|F03 高|B/routes/samples.js:132查询video_url，迁移无列；隔离新库已复现|WORK04/14；追加迁移，同时验新库及旧库，不改历史迁移|
|F04 高|B/routes/payment.js:64仅按txNo取交易，缺用户/主体归属|WORK02/07；跨用户查询拒绝|
|F05 阻断|B/services/storage/index.js:25本地忽略isPrivate，signedUrl返回公开相对地址；B/app.js:44公开挂载uploads；OSS缺依赖/凭据回退本地|WORK08；私密上传/下载受控，存储失败不能公开降级|
|F06 高|F/lib/services/api_service.dart:146起auto捕获读写异常后返回本地数据；默认URL指向正式域名|WORK07/14；业务失败可恢复但不伪装成功，测试默认仅本地|
|F07 阻断（真实结算）|B/services/paymentService.js:66、104的微信/直付通方法抛待实现；Mock退款成功只用于开发|WORK07/12；渠道准入、验签、真实退款/出款分别验收|
|F08 高|B/utils/crypto.js:5默认加密key未按环境拒绝，字节长度也不保证32；未运行真实身份数据处理|WORK02/14；启动校验与安全迁移，禁止以fallback掩盖配置|
|F09 中|B/app.js:96、98每进程启动scheduler且监听0.0.0.0；jobs/scheduler.js:110有进程定时器，无所需分布式领取模型|WORK09/14；任务持久化、租约/幂等；部署防护另验|
|F10 高（正式包）|F/android/app/build.gradle.kts:50缺正式资料回退debug签名|WORK14；正式发布构建必须失败或提供正式签名并验证证书|
|F11 高|B/routes/scripts.js:40本地hash(title+synopsis+URL+时间)，第三方txid为null，却提示已生成时间戳存证；81的角色/NDA检查TODO|WORK03/05/08；区分摘要、可信时间、第三方证据；阅读权限落后端|
|F12 高|B/routes/mcn.js:45添加艺人未校验本人接受/委托，还覆盖user_identities|WORK02/10；邀请本人确认、授权范围与有效期，禁止无感接管|
|F13 高|B/utils/watermark.js:38、44、54没有真正嵌入文件仍返回success；production没有使占位自动生效|WORK08/09/14；实际文件显式/隐式标识检验，失败阻止错误交付声明|
|F14 中|F/docs/CURRENT_EXECUTION_STATE.md:24、40仍称AnimatedSwitcher、不保活，与主源码不符；实际ResourceCache只见定义未接页面|WORK01/14；修订事实记录，性能仍须测量，不重新换IndexedStack|

MySQL DDL不是缺陷修复完成证据：B/db.js:16–21非sqlite配置也回落SQLite；没有mysql运行依赖。WORK14保留条件迁移预算，是否切换由真实并发/部署需求决定。

## 7. 工程结论

保留Flutter、Express、旧订单/生成/迁移和通用UI资产，在同一工程渐进扩展。先处理资金事实、身份/文件权限与新库缺列等阻断，搭主体及许可结构，再贯通三端交易和履约。性能Gate保留真实测量标准，但旧“Gate0没过就排除全部B端/发行”的范围限制由本轮完整任务取代。业务代码尚未施工；下一步是整体设计审阅。
