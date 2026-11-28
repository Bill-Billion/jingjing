# PM04 S4-B 本机 Android 与管理网页冒烟

2026-11-28。**S4-B1 环境准备和 S4-B2 安装包冒烟通过。** 冻结产品候选 b1ed014c7bfb6c68668ea320cbb7b190cab9e8f9，实际工作树起点 4d4fe508，各产品源码树、OpenAPI、迁移和 CI 工作流哈希相同。API 0.31.82-rc.1，225 个已应用迁移，末版 0225。S4-C 等待需求范围和测试设计审查。

## 已实际执行

| 环节 | 实际结果 |
|---|---|
| 构建与安装 | 正常入口 lib/main.dart，独立 .pm03joint 测试包，Android Debug v2 签名。ADB 实际安装和冷启动，API 35 x86_64 模拟器。固定同版本依赖离线重复构建，APK 摘要完全一致。 |
| 登录与目录 | 从广场的视频入口进入正常登录页，真实账户 API 签发挑战及会话，本机 Mock 短信提供验证码。登录后读取原目录。补齐本机 FFmpeg/ffprobe 路径后，原目录封面、时长和获准预览均可在 Android 打开。 |
| 同单跨端 | Android 买方从「我的 → 账号与帮助 → 帮助与反馈」进入，使用系统文件选择器上传合成 JPG，提交反馈。Vue 独立浏览器和另一合法客服账号通过正常模拟短信登录，打开同一工单、读取同一附件，执行受理和答复。Android 从原工单刷新后显示原答复。 |
| 文件和落库 | Android 通过原页面下载并用系统保存。Vue 读取、Android 保存、MySQL 文件元数据和落盘字节相符。MySQL 原工单唯一，同一 ID 三条事件依次 SUBMIT、START、ANSWER，最终 ANSWERED、版本 3。 |
| 备份、恢复和停止 | 初次停服后完成加密备份，另一个离线库恢复 190 张表和 94 个文件，独立核对数据、表结构及文件摘要。两次服务退出码均为 0，移除本轮 ADB reverse，关闭本轮模拟器。本轮业务库保留用于审查。 |

原工单 **ddb0ace2-db6c-4091-8534-75130e341ccc**，附件 **7ed381c6-870a-4dad-812f-73994db6a164**，安放在合成库 jx_test_stock_pm03_251cc43270d84cdef91f9f0f。附件 3195 字节，SHA-256 ecd2cba1ab41703c0d8f42d09bd5af55bffde0d1a9277239ace1f6ad7dcafcee。

[Android 答复截图](../../testing/evidence/pm04-s4b-native-smoke-20261128/android-answered.png) · [Vue 同案截图](../../testing/evidence/pm04-s4b-native-smoke-20261128/vue-same-ticket.png) · [MySQL 事件](../../testing/evidence/pm04-s4b-native-smoke-20261128/mysql-smoke.json) · [离线恢复](../../testing/evidence/pm04-s4b-native-smoke-20261128/offline-restore.json)

## APK、工具和资料

- 本机文件位于 QA 工作树 .local/qa18/s4-b-20261128/jingjing-s4b-local.apk，124786922 字节。SHA-256 **8e502f9dfd7fe263e9d590345ef29b68cf209f939d0acf6cfddb11d38ee01766**。版本 12.3.1（22），现有生产签名和网络配置没有修改。联测包只编入回环 API http://127.0.0.1:54418，外部明文连接默认拒绝。
- 工具复用项目 D 盘缓存。WHPX、ADB 37.0.1、Android 15/API 35、SDK 36、Flutter 3.47.5、JDK 17.0.20.1、Gradle 9.3.1、MySQL 8.4.11、Microsoft Edge 和 Playwright 可用。管理网页 92 份构建文件的摘要也已归档。
- 原 PM03 批量夹具含 47 个角色条目和 33 个场景条目。烟测使用 buyer 和 reviewer，独立客服权限通过既有授权服务限定在该合成库和本次截止时间。可用的其余角色包含艺人、机构人员、客服办理、运营独审和财务。账号名册、验证码、数据库配置和备份密钥只保留本机受控目录。样例目录为同批次 samples，包含合成色条图片、可播放 MP4 和其他原测试记录。
- 本轮没有确认产品源码缺陷。首次 Android 构建在远端 Maven 元数据 TLS 等待后结束，使用相同 Flutter 参数从本地缓存构建并复核完全相同产物。首次目录封面请求 503，修正本机 FFmpeg/ffprobe 配置后，同一库恢复封面、时长和预览。初次结果和恢复结果均保留。

[准确版本、工具和 APK 清单](../../testing/evidence/pm04-s4b-native-smoke-20261128/RESULT.json) · [管理网页产物清单](../../testing/evidence/pm04-s4b-native-smoke-20261128/vue-build-manifest.json) · [初次请求记录](../../testing/evidence/pm04-s4b-native-smoke-20261128/traffic-initial.jsonl) · [媒体复测请求记录](../../testing/evidence/pm04-s4b-native-smoke-20261128/traffic-media-recheck.jsonl)

## 本机启动和复跑

在 QA 工作树准备新输出目录，沿原环境手册加载已有合成本地 MySQL 配置。源目录用工作树当前的短路径映射。服务进程应分别在独立终端运行。

~~~powershell
# 在本机已有 MySQL 测试配置上指定媒体工具，路径使用已安装工具的绝对路径
$env:MEDIA_FFMPEG = (Resolve-Path -LiteralPath $env:JX_TEST_FFMPEG).Path
$env:MEDIA_FFPROBE = (Resolve-Path -LiteralPath $env:JX_TEST_FFPROBE).Path
node scripts/stock-sandbox.cjs --pm03-batch
~~~

记录 READY 中 access_file 的父目录作为 $batch，输出目录 $out 使用仓库 .local/qa18 下的绝对路径。旧批次只有在自身原有效期内才可通过 --pm03-resume 接续，过期时新建合成批次。构建普通 Vue 到 $out/vue，随后起固定回环入口。入口每次最多运行 90 分钟，且受原批次截止时间约束。

~~~powershell
Push-Location R:/frontend_ops_workspace
npm.cmd run build-only -- --outDir "$out/vue"
Pop-Location
node scripts/qa18-s4b-local-gateway.cjs $batch $out
~~~

APK 可复用已交付文件，也可用现有入口生成单独包。Windows 环境若卡在已缓存依赖的远端 TLS，可在独立新输出目录对这次构建正常输出的参数使用 -FlutterBuildLog，以原参数离线完成。ADB 只接 JX_API35，--no-rebind 保留已经存在的其他映射。

~~~powershell
powershell -NoProfile -File scripts/android-local.ps1 -Action build-s4b -OutputDirectory $out
powershell -NoProfile -File scripts/android-local.ps1 -Action start
$adb = 'J:/.local/tools/android-sdk/platform-tools/adb.exe'
& $adb -s emulator-5554 reverse --no-rebind tcp:54418 tcp:54418
& $adb -s emulator-5554 install -r "$out/jingjing-s4b-local.apk"
python -X utf8 scripts/qa18-s4b-android.py $adb emulator-5554 $batch $out open
~~~

Android 驱动以已安装的正常 APK 为对象，使用 Android 辅助功能树、系统文件选择器和 ADB。新安装时点「视频」和「登录并继续」，然后使用同一驱动的 login buyer 和 submit-feedback 分段操作。驱动的 inspect、tap、swipe、screenshot 可按现场页面单步运行。本轮实际使用这些分步入口保留完整页面证据，组合入口沿同样的页面动作封装。测试和预览旧入口保留给历史集成用例，旧登录注入、旧导航断言和预览专用页面从本轮证据中排除。

- 以同一输出目录的 traffic.jsonl 中首次 Android 读取 /api/v1/support/tickets/{id} 为准取得工单 ID。
- 使用 scripts/qa18-s4b-support-smoke.cjs 的 grant $batch $out 设置合成客服权限，再用 vue $batch $out $ticket 以正常 Vue 登录处理。
- Android 用 verify-reply 和原附件 UUID 读取答复并保存原文件。verify $batch $out $ticket 比对原工单、事件、MySQL、磁盘和 Android 本地保存文件。
- 停止时写入 $out/gateway.stop 和 $batch/stop，移除本轮 tcp:54418 reverse，再按需要停止本项目模拟器。备份和离线恢复沿 qa18-batch-backup.cjs 执行。

[原隔离环境手册](../JOINT_ENVIRONMENT_20261124.md) · [Android 工具](../../../scripts/android-local.ps1) · [正常 APK 驱动](../../../scripts/qa18-s4b-android.py) · [Vue 和 MySQL 核验](../../../scripts/qa18-s4b-support-smoke.cjs)

## 交给下一阶段

本轮具备真实 Android 安装与页面操作、合法模拟短信登录、浏览器独立角色、同案办理、文件和数据库核对、受控备份恢复。原 Flutter Integration Test 可继续用于控件和复杂动作。S4-C 应按需求方确定的批次安排原生导航、12 条主线、断网和恢复、设备权限等，模拟支付、发票、身份、模型及电子签按场景启用或验证。Android 实体机、真实供应商、支付退款、发布签名和人工体验仍待其对应阶段。原 151 项正式状态保持 19/124/8，S4-A 的 18 组和 12 链原结果仍按原机测范围登记。本轮停止并等待审查。
