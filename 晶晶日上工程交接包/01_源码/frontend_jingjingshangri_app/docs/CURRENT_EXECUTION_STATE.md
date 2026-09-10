# CURRENT_EXECUTION_STATE · 晶晶日上当前执行态（精简，约 150–250 行）

> 只维护"当前 Gate / 已过验收 / P0P1P2 / 性能基线 / 外部等待 / 最近 release / 下一项"。
> 长历史归档到项目档案
> 命名：总纲正文里的 WorkBuddy 即当前执行 AI（我），非外部工具（用户 2026-09-06 澄清），本协议就是我自己的开发治理章程。 27 第 5 节、15 施工记录，**不在此堆流水账**。治理规则见同目录 `WORKBUDDY_EXECUTION_PROTOCOL.md`（只读，未经用户授权不改）。
> 最近更新：2026-09-06（接收用户《开发纠偏总纲》，停止百分冲刺，切换 Gate 驱动；完成 P0-1 冻结/基线与 P0-2 的静态阶段 + 性能插桩）。

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
| 已加载主 Tab 切回直接显示旧内容、不回 Skeleton | **FAIL（代码层已确认结构性缺陷）** | 主框架用 AnimatedSwitcher 非 IndexedStack，切走即 dispose；见 §4 根因 R1 |
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

- **R1（主 Tab 不保活）**：`lib/widgets/main_scaffold.dart` 用 `AnimatedSwitcher(child: _pages[index])`，不是 IndexedStack；切走的页面在转场后被卸载，切回重新 createState/initState。四个主 Tab（home/projects/messages/profile）均**无** AutomaticKeepAlive / IndexedStack。
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

## 6. 性能基线（待真机填，禁止编造）

| 路径 | 首次进入 tap→meaningful | 二次切回 tap→meaningful | 其中网络 request 耗时 | UI/Raster 超预算帧 | 结论 |
|---|---|---|---|---|---|
| 我的→消息 | 待测 | 待测（重点：是否回骨架） | 待测 | 待测 |  |
| 首页 | 待测 | 待测 | 待测 | 待测 |  |
| 圆梦 | 待测 | 待测 | 待测 | 待测 |  |
| 订单/列表滚动 | — | — | — | 待测 |  |
| 视频首帧 TTFF | 待测 | — | — | — |  |

A/B 矩阵（总纲 3.3，同一路径首进/二次各测）：A 流光开+真接口；B 流光关+真接口（判渲染）；C 流光开+本地固定数据（判网络/生命周期）；D 流光关+本地数据（纯 UI 基线）。

## 7. 候选修复池（测量后按贡献排序，未测量前不动手大改）

- F-R1：主框架 AnimatedSwitcher → 保活方案（IndexedStack 或等价），避免切回重建；**需与 F-R2 一起上**，否则五页首挂载会同时发请求。
- F-R2：轻量会话级资源缓存 + 请求去重 + SWR（先显示旧数据、后台静默刷新、有变化再 setState），在现有 StatefulWidget+ChangeNotifier 内做最小实现，**不迁移 Riverpod/BLoC**。✅ 零件已就绪（`resource_cache.dart` + 8 单测），待测量后接入。
- F-R3：Loading 六态拆分，Skeleton 只用于 initialLoading，已有数据刷新不回骨架。
- F-B：按真机 UI/Raster 决定是否对低端机降流光（减 blur/粒子/光带或预混色），不提前过度加 RepaintBoundary。
- F-D：视频控制器单例化/懒初始化、退出即 dispose、封面预取而非预拉整视频（仅当 D 类被数据证实）。
- 每个修复遵循"修前数据→最小改→修后同路径复测，无明显改善判失败回测量"。

## 8. P0 / P1 / P2

- **P0（当前）**：真机跑 Performance Truth——用已埋点产出 §6 时间线 + DevTools Timeline + A/B 矩阵 → 根因按贡献排序 → 只修第一名 → 复测 → 直到 Gate0 覆盖五 Tab/滚动/返回/二次进入/视频首帧。
- **P1**：Gate1 最小业务闭环（登录→选真人数字人→填祝福→提交生成→看结果→进订单/作品），Mock 边界清楚、共用同一数据模型、失败分支可恢复；不并行四条产品线。
- **P2**：Gate2 稳定可运营（接口成功率/延迟、Crash/ANR、异步任务可补偿、重复提交/前后台确定行为、密钥不进端、备份回滚）。
- Gate3 视觉精修、Gate4 扩展（定制剧里程碑/MCN/增长/出海）全部后置，且视觉增强不得让 Gate0 性能回退。

## 9. WAITING_EXTERNAL（只跟踪，不用 Mock 冒充完成，不反复催）

- 真机配合一次 Profile/带时间戳录屏（**当前唯一卡住 Gate0 的输入**；需要用户操作，见 §11）。
- 支付宝进件（经营类目+3 张 App 截图）与真机沙箱；火山实人/内容安全 rms 审批（可回退）；短信运营商报备（定时任务已删，禁重建/禁测）。
- 少年龙武/边境暗影真实片花；协议真实联系方式/真实定价/keystore 密码离线备份；软著、APP 备案；服务器 2026-09-27 到期续费（最近硬时间点）。

## 10. 最近 release / 版本

- 正式包 12.3.1+21（三处版本一致，apksigner v2 通过）；本轮只加测量插桩与 docs/Git 基线，**未 bump、未出新包**（下一包 +22 待 Gate0 修复见效后再出，避免出"体验没变"的包）。

## 11. 下一项自动执行任务（唯一最高优先）

**离线可做的零件已备齐（PerfTrace 插桩 + ResourceCache 缓存/SWR 零件）**；下一步**唯一卡点是真机输入**：拿到 `[PERF]` 时间线（adb logcat 或 DevTools）+ Timeline，填 §6，完成 A/B 矩阵与根因排序；在此之前不提前改主框架/页面、不宣称卡顿已修、不出"体验没变"的新包。

### 需要用户做的一步（Gate0 必需，无法离线替代）
完整傻瓜步骤见 `docs/GATE0_PERF_CAPTURE_GUIDE.md`：最简方式是手机开 USB 调试连电脑、说一声"连好了"，我装 profile 采集包自动抓时间线；不方便连机则按标准操作路径录 30–60 秒屏发我（冷启动→五 Tab 来回切 2–3 轮→列表快滑→进详情返回）。拿到数据即填 §6、做 A/B 矩阵、按贡献只修第一根因。
