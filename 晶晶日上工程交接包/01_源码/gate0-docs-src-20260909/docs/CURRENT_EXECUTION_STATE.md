# CURRENT_EXECUTION_STATE · 晶晶日上当前执行态（精简，约 150–250 行）

> 只维护"当前 Gate / 已过验收 / P0P1P2 / 性能基线 / 外部等待 / 最近 release / 下一项"。
> 长历史归档到项目档案
> 命名：总纲正文里的 WorkBuddy 即当前执行 AI（我），非外部工具（用户 2026-09-06 澄清），本协议就是我自己的开发治理章程。 27 第 5 节、15 施工记录，**不在此堆流水账**。治理规则见同目录 `WORKBUDDY_EXECUTION_PROTOCOL.md`（只读，未经用户授权不改）。
> 最近更新：2026-09-06（接收用户《开发纠偏总纲》，停止百分冲刺，切换 Gate 驱动；完成 P0-1 冻结/基线与 P0-2 的静态阶段 + 性能插桩）。
> 2026-09-08 补记：用户经微信重发《总纲》，内容与已装协议逐字一致（仅协议头部说明不同），无需重装。审计发现工作树存在 9/6 基线后的**未提交改动**：F-R1 已实施（main_scaffold 改 IndexedStack 懒挂载保活 + LiquidBackdrop 包 RepaintBoundary，home/messages/projects 三页适配）、pubspec 已 bump 12.3.1+22。`dart analyze` 四个改动文件 = 0 issues；本环境 flutter test 无法运行（flutter tool 进程孵化被限制），单测/Widget 回归与真机复测仍待做。上述改动**未提交、未宣称修好**， Gate0 仍 PARTIAL。
> 2026-09-09 晚补记：真机三轮 V0–V10 隔离矩阵完成，首页第二根因定位为「多全屏层逐帧合成地板 ≈23.5ms」（详见 §6.5）；结构性候选 V10 烘焙已实现待装机验证；实验台提交 b338996；release 正式包 12.3.1+22 已构建交付用户（§6.6）。

---

## 1. 当前所在 Gate

**Gate 0：真实设备体验与性能事实 —— 状态 PARTIAL（未通过）。**

- 已停止"百分冲刺/自评分驱动"；原 86.1 分仅作历史档案，不再驱动开发。
- Gate 1~4 暂不投入扩展（Gate1 单一闭环的链路代码已存在，但必须等 Gate0 达标后再收口）。
- 定时自动改码任务保持**关闭**（用户 2026-09-05 指示），不恢复、不新建。

## 2. Gate 0 验收项状态（对照总纲第 2 节）

| 验收项 | 状态 | 说明 / 证据 |
|---|---|---|
| Profile/Release 条件下测，不用 Debug 代表体验 | 未做 | 需真机连 DevTools Timeline（离线环境无法替代） |
| 点 Tab 选中态/页面壳立即出现 | 待真机量 | 已加 `tab tap` 时间点，真机读时间线 |
| 已加载主 Tab 切回直接显示旧内容、不回 Skeleton | **PASS（2026-09-09 真机实测）** | F-R1/F-R3 已提交（2ad6336）；约 30 次五 Tab 来回切零 load 零请求零骨架 |
| 后台刷新不阻塞旧数据（SWR） | **FAIL（现状每次回骨架）** | 见 R2/R3 |
| 单帧 ≤16.7ms、无连续超预算/长掉帧 | 待真机量 | 需 UI/Raster thread 数据，不能靠猜 |
| "很卡"结论都有时间线/Profile 证据 | 进行中 | 插桩已就位（§5），待真机跑出数据 |
| 视频 TTFF/缓冲/Seek（若为核心入口） | 待真机量 | 属 D 类，单独测，不与页面渲染混修 |

> Gate0 未通过前：不新增大功能、不加复杂视觉、不继续统一非关键控件、不为测试数量补用例、不加"高级感"动画。

## 3. 卡顿四分类现状（总纲 1.2，先归类再处理，禁止混为一谈）

- A 输入/交互延迟：待真机量（onTap 是否有同步重活、动画是否过长）。
- B 帧率/渲染：待真机量（全屏 LiquidBackdrop 流光/CustomPaint/BackdropFilter 在低端机的 UI/Raster 成本，历史做过 RepaintBoundary/降级但**不能据此宣称已解决**）。
- C 数据等待：**代码层已确认存在硬伤（R1–R3），是"切回反复 Loading/像没缓存"体感的直接来源**；贡献毫秒数待真机时间线。
- D 媒体（视频）：待真机量 TTFF/Range/硬解/控制器生命周期。

## 4. 已确认的代码事实（静态审计，2026-09-06，读码可复核，非猜测）

- **R1（主 Tab 不保活）**：原状 `lib/widgets/main_scaffold.dart` 用 `AnimatedSwitcher(child: _pages[index])`，切走的页面在转场后被卸载，切回重新 createState/initState。**2026-09-08 审计：工作树中已实施 F-R1 修复（IndexedStack + `_visited` 懒挂载 + TickerMode 停 ticker + LiquidBackdrop RepaintBoundary），analyze 0 issues，但未提交、未经单测/真机复测，按 DoD 不能标记 Done。**
- **R2（数据只在页面局部 State）**：以 `messages_page.dart` 为典型，`_list/_loading/_error` 是页面级 State，页面 dispose 即丢；无会话级缓存、无 TTL、无同资源并发去重。projects/profile 同构。
- **R3（Loading 未拆分、每次清空回骨架）**：`_load()` 开头统一 `_loading=true`，把已有内容清掉回 7 行 Skeleton；未区分 initialLoading / refreshing / loadingMore / empty / errorNoData / refreshErrorWithData（违反总纲 4.2/4.3 的 SWR）。
- **R4（无统一 Repository/缓存层）**：lib 下仅 user_provider 一个全局态；网络统一走 `ApiService`（Dio 单例，双模 online/auto/demo 兜底，连接超时 8s）。网络层是干净的单一插桩点（已利用）。
- 这些是"对照 Gate0 验收项即可判 FAIL"的确定缺陷；但**修复排序必须等真机时间线**（若 B 类全屏模糊在用户机型占主导，应先修 B；R1–R3 是确定要修、只是排序待定）。

## 5. 本轮已完成（P0-1 / P0-2 准备，纯增量、不改业务行为）

1. 总纲落地为只读协议 `docs/WORKBUDDY_EXECUTION_PROTOCOL.md`，每次开发前先读。
2. 新增 `lib/utils/perf_trace.dart`：release 完全 no-op（kReleaseMode 短路），debug/profile 输出相对毫秒 + Timeline 标记，不含敏感数据。
3. 统一时间线埋点（拼总纲 3.1 的十段）：
   - Dio 拦截器（`api_service.dart`）：每个请求 `request_start` / `request_end(耗时,status)` / `request_error`，一处覆盖全部接口；
   - `main_scaffold.dart`：`tab tap i= from=`；
   - 五个主 Tab 全覆盖：`messages_page.dart`（postFrame->load / load start / meaningful frame / load error），以及 `home_page.dart`（initState、artists/projects 两路 meaningful）、`projects_page.dart`、`profile_page.dart` 的 load start / meaningful frame；
   - 真机采集傻瓜步骤与 adb 命令见 `docs/GATE0_PERF_CAPTURE_GUIDE.md`。
4. 版本控制基线：工程首次 `git init`（分支 main），.gitignore 增补排除 `.dartserver/` 分析缓存、`.flpriv` 签名私件、`*.jks/*.keystore/*.key/.env`、根目录历史 `_*` 临时脚本；baseline 提交只含 301 个源码/资产/测试/docs 文件，0 私钥/缓存。
5. 质量门：`analyze lib integration_test test` = No issues；test/ **319** 全绿（含新增 8 条缓存单测）；三条黄金链路 E2E 全绿（埋点零行为改动）。
6. 备好 R2 修复零件 `lib/services/resource_cache.dart`（纯 Dart 会话级缓存：TTL + stale-while-revalidate + 同 key 在途去重 + 后台失败保旧值，**尚未接入任何页面**），配 `test/services/resource_cache_test.dart` 8 条单测全绿；真机测量确认排序后即可最小接入，不提前改主框架。

## 6. 性能基线（2026-09-09 14:17–14:24 真机实测，荣耀 NOP-AN00 / Android 12 / Wi-Fi / profile 包 12.3.1+22，103 条 [PERF] 事件）

| 路径 | 首次进入 tap→meaningful | 二次切回 tap→meaningful | 其中网络 request 耗时 | 结论 |
|---|---|---|---|---|
| 首页（冷启动） | initState→artists 1166ms；全部内容 2087ms | — | humans 1040ms / projects 2001ms | 冷启动可接受，projects 请求慢 |
| 圆梦 | **352ms** | **即时（零重载零请求）** | 239ms | 达标 |
| 消息 | **289ms**（但接口报错，渲染的是错误/空态） | **即时（零重载零请求）** | 232ms（badResponse） | 速度快但数据是失败的，见 P0-B |
| 我的 | **541ms**（3 个鉴权接口全部报错） | **即时（零重载零请求）** | 234–244ms（全 badResponse） | 同上 |
| 艺人详情 | ~1400–1750ms | — | humans/N 225–1745ms | 偏慢，待优化 |
| 列表分页 /api/humans | — | — | 225–**3154ms**（P95≈3.2s） | 慢，响应体/服务端待查 |
| 视频首帧 TTFF | 未测 | — | — | 待测 |

**真机验证的关键结论：**
1. **F-R1/F-R3 生效（已实测）**：冷启动后首次进入各 Tab 各加载一次；其后约 30 次五 Tab 来回切换**零 load start、零重复请求、零骨架**——"切回反复 Loading"的结构性根因已在真机上消除。
2. **P0-B 已修复并复测 PASS**（见 §8）。
3. **B 类帧率证据（性能浮层直采，2026-09-09 17:10–17:40）**：瓶颈在 **Raster（GPU 光栅化）**，UI 线程全程健康（avg 1.6–3.7ms）。首页列表 avg 26.8ms/max 471ms、艺人 hero avg 23.0ms/max 209ms、文本区 avg 13.6ms——**持续掉帧（≈37–44fps）与大图场景强相关**。
4. **A/B/C 三组实验（2026-09-09 17:10–17:55）定位 B 类第一根因**：流光动画静态化无改善（证伪，已回滚）；**艺人详情统计条的实时 BackdropFilter 是主凶——去掉后 hero 场景 Raster avg 23.0→13.0ms，回到 16.7ms 预算内**（fix 7c0feb4）。全项目审计：剩余真实模糊仅 FrostedBar（固定顶/底栏/浮层），符合设计约定，无漏网。
5. **首页场景：第二根因已定位（2026-09-09 18:30–19:20 三轮 V0–V10 隔离矩阵）**。用 Profile 隔离实验台（PerfIso，commit b338996：单因素变体 + FrameTiming 自驱统计上屏，不依赖 VM Service/logcat）三轮实测：①艺人卡阴影/Banner/照片/渐变遮罩逐元素关闭后 Raster 全部仍在 22.5–23.8ms——**内容元素全部排除**；②基线本身随设备热状态在 25.3–32.1ms 波动，流光动画在 GPU 繁忙时贡献 2–8ms（V1 静态两轮稳定 23.5/24.1）；③**真正的第二根因 = 多全屏层逐帧合成的地板成本（≈23.5ms）**：丝缎位图 + 流动层（光团/光带/scrim/vignette 各一层全屏 fill）+ 底栏毛玻璃。结构性候选 **V10 烘焙**（位图+场景层离屏烘成单 ui.Image，每帧 1 张全屏图+46 微粒，~8 次 fill → ~1 次）已实现待装机验证；V8（30fps 量化重绘）/V9（仅微粒闪烁）两个无损降级已实测=与静态等价。
6. **正式包 12.3.1+22 release 已构建交付用户**（2026-09-09 19:24，jjsr-release.jks 正式签名 apksigner 校验通过，60.6MB，含全部已验证修复；实验台代码 release 编译零开销不轮换）。注意：手机上现装 debug 签名 profile 包，覆盖装 release 需先卸载（仅丢演示数据）。

A/B 矩阵（总纲 3.3，同一路径首进/二次各测）：A 流光开+真接口（本次已测）；B/C/D 待后续补测（优先级已降低，因 R1/R3 已证实为主根因）。

## 7. 候选修复池（测量后按贡献排序，未测量前不动手大改）

- F-R1：主框架 AnimatedSwitcher → 保活方案（IndexedStack 或等价），避免切回重建；**需与 F-R2 一起上**，否则五页首挂载会同时发请求。**（9/8 状态：工作树已实现懒挂载保活——未访问 Tab 不实例化，规避并发首请求；待提交 + 复测。）**
- F-R2：轻量会话级资源缓存 + 请求去重 + SWR（先显示旧数据、后台静默刷新、有变化再 setState），在现有 StatefulWidget+ChangeNotifier 内做最小实现，**不迁移 Riverpod/BLoC**。✅ 零件已就绪（`resource_cache.dart` + 8 单测），待测量后接入。
- F-R3：Loading 六态拆分，Skeleton 只用于 initialLoading，已有数据刷新不回骨架。
- F-B：按真机 UI/Raster 决定是否对低端机降流光（减 blur/粒子/光带或预混色），不提前过度加 RepaintBoundary。
- F-D：视频控制器单例化/懒初始化、退出即 dispose、封面预取而非预拉整视频（仅当 D 类被数据证实）。
- 每个修复遵循"修前数据→最小改→修后同路径复测，无明显改善判失败回测量"。

## 8. P0 / P1 / P2

- **P0（当前）**：Gate0 大头已落地——F-R1/F-R3 真机验证 PASS（2ad6336），五 Tab 切回零重载；B 类第一根因修复 PASS（7c0feb4）；首页第二根因已定位为多全屏层合成地板，结构性修复 V10 待验证；剩余：视频 TTFF 未测、/api/humans P95≈3.2s 偏慢（响应瘦身/分页待做）、换可靠 USB 数据线（当日又断线 2 次）。
- **P0-B（已修复，2026-09-09 16:55 真机复测 PASS）**：鉴权接口全 401——根因=auto 模式一键体验登录发 demo-token 打真实服务器；修复 c929975（demoLogin 显式进 demo 模式 + 真实登录成功恢复 auto）。**复测证据（run5）**：清数据冷启动 → 一键体验登录 → 全程 **0 真实请求、0 个 401**；消息页显示演示会话、我的页 orders=3 来自本地 mock、各页 14–92ms 即时渲染；Mock 边界清晰，符合总纲 6.4。
- **P1**：Gate1 最小业务闭环（登录→选真人数字人→填祝福→提交生成→看结果→进订单/作品），Mock 边界清楚、共用同一数据模型、失败分支可恢复；不并行四条产品线。前置：真实登录通路（短信验证码或真实体验账号接口）。
- **P2**：Gate2 稳定可运营（接口成功率/延迟、Crash/ANR、异步任务可补偿、重复提交/前后台确定行为、密钥不进端、备份回滚）。
- Gate3 视觉精修、Gate4 扩展（定制剧里程碑/MCN/增长/出海）全部后置，且视觉增强不得让 Gate0 性能回退。

## 9. WAITING_EXTERNAL（只跟踪，不用 Mock 冒充完成，不反复催）

- 真机配合一次 Profile/带时间戳录屏（**当前唯一卡住 Gate0 的输入**；需要用户操作，见 §11）。
- 支付宝进件（经营类目+3 张 App 截图）与真机沙箱；火山实人/内容安全 rms 审批（可回退）；短信运营商报备（定时任务已删，禁重建/禁测）。
- 少年龙武/边境暗影真实片花；协议真实联系方式/真实定价/keystore 密码离线备份；软著、APP 备案；服务器 2026-09-27 到期续费（最近硬时间点）。

## 10. 最近 release / 版本

- 正式包 12.3.1+21（三处版本一致，apksigner v2 通过）。**9/8 审计：工作树 pubspec 已 bump 12.3.1+22（未提交，随 F-R1 改动一起），本会话未出新包**；按原则新包应在 Gate0 修复经真机复测见效后再出，避免"体验没变"的包。

## 11. 下一项自动执行任务（唯一最高优先）

Gate0 收尾（按优先级）：①装机跑 V10 烘焙验证（包已构建 build_profile_log10；若 Raster 明显下降→落为正式 LiquidBackdrop 渲染路径+复测+提交，若无效按纪律回滚）；②视频首帧 TTFF 实测；③/api/humans P95≈3.2s 响应瘦身（分页/字段裁剪）；④换可靠 USB 数据线（当日断线 2 次）。三项实质完成 + V10 落地后 Gate0 判 PASS，正式进入 Gate1 闭环（祝福视频下单链路已在 demo 模式走通页面路径，待真实生成/支付凭证回填后切真接口）。

> 实验工具沉淀：隔离实验台 `lib/utils/perf_isolation.dart`（V0–V10 自驱轮换+FrameTiming 上屏统计，kProfileMode 门控）+ 采集脚本 `iso_auto.py`/`make_sheet.py`（工作区根目录，一键 3–4 分钟出全矩阵）；VM Service 扩展 `ext.flutter.jjsIso` 备用（荣耀抑制三方 logcat 时不可用）。测量结束、修复落地后实验台可整体移除或收编。

### 需要用户做的一步（Gate0 必需，无法离线替代）
完整傻瓜步骤见 `docs/GATE0_PERF_CAPTURE_GUIDE.md`：最简方式是手机开 USB 调试连电脑、说一声"连好了"，我装 profile 采集包自动抓时间线；不方便连机则按标准操作路径录 30–60 秒屏发我（冷启动→五 Tab 来回切 2–3 轮→列表快滑→进详情返回）。拿到数据即填 §6、做 A/B 矩阵、按贡献只修第一根因。
