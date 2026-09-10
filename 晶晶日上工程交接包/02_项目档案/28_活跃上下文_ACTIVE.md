# 28 · 活跃上下文 ACTIVE（每轮最先读 · 一屏恢复 · 只放当前态）

> 用途：超长接力防 context rot。
> 命名约定：总纲中的 WorkBuddy = 当前执行 AI（我），不是第三方工具（用户 2026-09-06 指定）。**开发模式已于 2026-09-06 切换为 Gate 驱动 / 证据驱动 / 最小修复 / 真机验收（用户《开发纠偏总纲》），停止"百分冲刺 / 自评分刷分 / 每半小时自动找活"。**
> 开工先读（按序）：① 工程内 `docs/WORKBUDDY_EXECUTION_PROTOCOL.md`（总纲，只读治理协议）② 工程内 `docs/CURRENT_EXECUTION_STATE.md`（精简执行态，权威当前态）③ 本档（档案侧一屏快照）；再按需下钻 27（历史，不再驱动）/15（施工日志）/29（六门评审）/21（UI SSOT）/22（冻结基线）。
> 最近更新：2026-09-06（接收总纲；Gate0 静态审计 + 性能插桩 + 会话缓存零件 + Git 基线；test/ 319 全绿）。

## 1. 坐标与命令（Windows PowerShell，完全访问，中文用 Node .cjs UTF-8 补丁，禁 PS 管道读写中文）
- Flutter：`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app`（**已 git init，分支 main，基线 tag `gate0-baseline`**；.gitignore 已排除 .dartserver/.flpriv/密钥/根目录 _ 临时件）
- 后端：`...\new-chat-3\work\server\server`（v13.0.0，25 路由 / 9 服务 / better-sqlite3）；线上 https://www.jingjingrishang.com（PM2: jjsr，Nginx）
- analyze：`& C:\src\flutter\bin\dart.bat analyze lib integration_test test`（须 0 issues）
- 分层验证（总纲第 7 节，不再每个小改都全量）：改动后定向 Level A；合并前全量 Level B；Release 里程碑全套 Level C。
  - 离屏全量：先 `$env:FLUTTER_ROOT=".../new-chat-3/work/fsdk"`，再 `& C:\src\flutter\bin\cache\dart-sdk\bin\dart.exe "$env:FLUTTER_ROOT/bin/cache/flutter_tools.snapshot" test --no-pub`（test/ 基线 **319**）
  - E2E：同 FLUTTER_ROOT 下 `... flutter_tools.snapshot test -d flutter-tester integration_test/golden_journeys_test.dart --no-pub`（必须显式 -d flutter-tester；3 条全绿）
- release：`$env:JAVA_HOME=C:\src\jdk17` → `flutter build apk --release --no-pub`；核验用 `C:\Android\build-tools\35.0.0` 的 aapt/apksigner；`.plugin_symlinks` 需 37 个 junction。

## 2. 当前 Gate / 版本 / 质量门
- **Gate 0 真机性能事实 = PARTIAL（未通过，当前唯一主战场）**；Gate1~4 后置。历史"86.1 分"仅存档，不再驱动。
- 版本三处一致：pubspec / lib/utils/app_version.dart / aapt = **12.3.1+21**；本轮只加测量插桩/缓存零件/docs/Git，**未 bump、未出新包**（下一包 +22 待 Gate0 修复见效后再出，不出"体验没变"的包）。
- 最新正式包 +21（apksigner v2 通过）；包名 com.jingjingshangri.jingjingshangri_app，minSdk24/targetSdk36。
- 质量门：analyze lib/integration_test/test = No issues；test/ **319** 全绿；E2E 3 条全绿；三档 360/390/840 = 38/38/38。

## 3. Gate0 已确认事实与本轮产出（2026-09-06，读码可复核）
- **卡顿先分四类（A 输入 / B 帧率渲染 / C 数据等待 / D 媒体），没测量不许猜根因、不许宣称修好。**
- 代码层已确认的 C 类硬伤：①R1 主框架 `main_scaffold.dart` 用 AnimatedSwitcher 非 IndexedStack，切 Tab 即 dispose，四主 Tab 均无 KeepAlive；②R2 数据只在页面局部 State（messages/projects/profile 同构），无会话缓存/去重；③R3 单一 `_loading` 每次清空回 Skeleton，未做六态与 SWR；④R4 无统一 Repository 层，网络统一走 ApiService(Dio)。
- 本轮产出（纯增量、零业务行为改动）：
  1. `docs/WORKBUDDY_EXECUTION_PROTOCOL.md`（总纲只读落地）、`docs/CURRENT_EXECUTION_STATE.md`（执行态）。
  2. `lib/utils/perf_trace.dart`：release no-op 性能时间线；Dio 拦截器统一 request_start/end/error 埋点，main_scaffold `tab tap`、messages `postFrame->load/meaningful frame/error` 样板。
  3. `lib/services/resource_cache.dart`：会话级 TTL + SWR + 在途去重 + 后台失败保旧值（**未接页面**），`test/services/resource_cache_test.dart` 8 条全绿。
  4. Git 基线两笔提交（c8f9b18 基线、efeae8b 缓存零件），tag gate0-baseline，tracked 304，无私钥/缓存。

## 4. 下一步（唯一最高优先，按序）
1. **真机输入（当前唯一卡点，WAITING_EXTERNAL）**：用户 USB 调试连机跑 profile，或录一段"冷启动后五 Tab 来回切 2–3 次 + 列表滚动"的操作；读 `[PERF]` 时间线 + DevTools Timeline，填执行态 §6，做 A/B 矩阵（流光开/关 × 真接口/本地固定数据，首进/二次各测）。
2. 按时间线给根因**贡献排序**，只修第一名（候选 F-R1 主 Tab 保活、F-R2 接 ResourceCache+SWR[零件已备]、F-R3 Loading 六态、F-B 低端机降流光、F-D 视频专项），修前/修后同路径复测，无改善判失败回测量。
3. Gate0 覆盖五 Tab/滚动/返回/二次进入/视频首帧达标后，才进 Gate1 单一最小业务闭环。
- 在此之前：不提前改主框架/页面、不新功能、不复杂视觉、不统一非关键控件、不为数量补测试、不出新包、不宣称卡顿已修。

## 5. 硬约束（违反必返工，详见 22 / 29 / 总纲）
- 只换皮/补细节：不改导航、27 路由、类名、接口、状态机、商业逻辑与价格；金额唯一常量 lib/utils/pricing.dart、唯一展示 lib/utils/money.dart，对外用元、不 /100、不写死第二处。
- 色值只取 lib/theme/app_theme.dart（曜石蓝黑+冷青+克制金+液态玻璃），无旧紫粉橙；自有 IP 仅 黄帝史诗·天下合 / 少年龙武 / 边境暗影；AI 只出无文字素材、UI 文字 Flutter 叠加、真人头像非动漫。
- 定制剧(isProject:false) 与圆梦(isProject:true) 严格分版；三角色=买家/艺人/MCN（MCN 仅 H5 后台，不在 C 端下单）；协议默认不勾、提交防重复、三态齐全、开屏引导仅冷启动首装一次。
- 总纲叠加：不迁移 Riverpod/BLoC（先在现有 StatefulWidget+ChangeNotifier 内证明最小改动）、不推倒重来、不自我制造工作、不用 Debug 代表真机体验、不用"加了缓存/RepaintBoundary/测试全绿/自评+分"充当 Done。

## 6. WAITING_EXTERNAL（只跟踪，不硬推、不操作外部控制台、不谎报）
- **真机性能 Profile/录屏（卡住 Gate0 的唯一输入，最优先）。**
- B1 短信运营商报备：短信定时任务已删，**禁重建/禁测短信**，现免验证码。
- B2 火山实人/内容安全 rms 审批中（V12.6 本地就绪未上线，可 COMPLIANCE_PROVIDER 回退）。
- B3 支付宝进件（经营类目+3 张 App 截图）+ 真机沙箱；正式 APPID/PID/RSA2 已备、前端不传金额、服务端 trade.query 对账；待真机端到端。支付内部加固待办 W1 旧 payment.js 的 GET /status/:txNo 补归属过滤（低危，只读审查结论见 29）。
- B4 少年龙武/边境暗影片花等用户（未到用占位，不臆造）。
- B5 协议真实联系方式 / 真实定价 / keystore 密码离线备份，待用户。
- B6 软著、APP 备案、资质；**服务器 2026-09-27 到期续费（最近硬时间点）**。
- 定时任务「晶晶日上开发自检与百分冲刺」cron_job_id=11732429623042 保持**暂停（enable=false），不自动恢复/不新建**；恢复前重读 doubao-cron-scheduler 再 update 同一 id。
