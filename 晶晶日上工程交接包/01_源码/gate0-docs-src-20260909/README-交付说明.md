# 晶晶日上 · Gate0 工作文档与源码交付包（2026-09-09 晚）

本包汇总今天（9/9）性能纠偏全天工作的文档、变更源码、测量脚本与原始证据。

## 一、文档（docs/）

| 文件 | 说明 |
|---|---|
| `CURRENT_EXECUTION_STATE.md` | **执行态单一事实源**（已更新至今晚）：Gate 状态、性能基线、四分类结论、A/B/C 三组实验、V0–V10 隔离矩阵结论、下一项计划 |
| `WORKBUDDY_EXECUTION_PROTOCOL.md` | 开发治理协议（Gate 驱动、测量优先、根因优先，只读） |
| `GATE0_PERF_CAPTURE_GUIDE.md` | 真机性能采集傻瓜步骤（logcat [PERF] 口径） |

## 二、变更源码（src/，均为仓库相对路径，已提交 b338996 / 825758e）

今日所有提交：`2ad6336`（F-R1 主 Tab 保活 + F-R3 刷新不回骨架）→ `30046c7`（request_error 埋点补 status）→ `c929975`（P0-B 401 修复）→ `7c0feb4`（详情页 BackdropFilter 去除，hero 23→13ms）→ `b338996`（隔离实验台 V0–V10）→ `825758e`（文档回填）。

本包 src/ 只含**今晚实验台相关**的 5 个文件；此前修复已包含在已交付的 release 正式包 12.3.1+22 内：

- `lib/utils/perf_isolation.dart` —— **新增**。隔离实验台：V0–V10 单因素变体、FrameTiming 自驱轮换统计（15s/变体，raster/UI avg/max 上屏）、VM Service 扩展 `ext.flutter.jjsIso`；kProfileMode 门控，release 编译零开销
- `lib/main.dart` —— 注册实验台扩展 + 启动自驱轮换（仅 profile）
- `lib/widgets/main_scaffold.dart` —— 背景按变体切换（V1 静态 / V8 30fps 量化 / V9 仅微粒 / V10 烘焙）+ 测量报告条
- `lib/widgets/liquid_backdrop.dart` —— 背景渲染重构：V8 相位量化、V9 冻结光带光团、V10 离屏单纹理烘焙（BitMap+场景层烘成一张 ui.Image，每帧 1 张全屏图 + 46 微粒）
- `lib/pages/home/home_page.dart` —— Banner/艺人卡阴影/照片/渐变遮罩四个隔离开关

## 三、测量脚本（scripts/，本机工作区根目录）

- `iso_auto.py` —— 一键无人值守采集：冷启动 → App 内自驱轮换 V0–V10 → 持续滚动 → 每 5s 截屏（约 3–4 分钟出全矩阵）
- `make_sheet.py` —— 把各截图顶部报告条裁剪拼成一张大图供读数
- `vm_call.py` / `vm_overlay.py` —— VM Service 调用工具（荣耀抑制三方 logcat 时 VM 鉴权码拿不到，备用）

## 四、原始证据（evidence/）

- `_iso_sheet.png` —— 三轮隔离矩阵报告条拼图（V0–V10 实测读数）
- `gate0_perf_run1~5.log(.clean.txt)` —— 白天五轮 [PERF] 时间线原始日志（基线/P0-B 复测等）

## 五、关键结论速览（详见执行态文档 §6）

1. C 类切 Tab 重载 PASS；P0-B 401 PASS；B 类第一根因（详情页 BackdropFilter）PASS
2. 首页第二根因 = **多全屏层逐帧合成地板 ≈23.5ms**（内容元素逐项排除；基线随热状态 25.3–32.1 波动）
3. 结构性候选 **V10 烘焙**（~8 次全屏 fill → ~1 次）已实现，待装机最后一轮验证
4. Gate0 剩余：V10 验证落地、视频 TTFF、/api/humans P95≈3.2s 瘦身、换可靠 USB 线
