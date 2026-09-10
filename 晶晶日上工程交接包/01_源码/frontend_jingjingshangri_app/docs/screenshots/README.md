# 离屏渲染验收效果图（offscreen golden）

由 `flutter test test/shots_test.dart` 在无模拟器环境下离屏渲染生成（demo 数据、确定性）。
源文件输出到 `build/shots/`，此处为归档副本。

| 文件 | 覆盖验收点 |
| --- | --- |
| 01_login.png | 登录/注册页：手机+验证码、协议勾选、三方登录、金墨视觉 |
| 02_home.png | 首页 + 五槽等宽底部导航 + 中央凸起鎏金创作钮 |
| 03_create_panel.png | 中央创作 GlowPanel 五板块严格分区、长文案不溢出 |
| 04_ai_progress.png | AI 文生视频线性阶段进度定格 60%（前三步完成/渲染中/后两步待开始） |
| 05_profile.png | 我的页登录态真实数据（含 ¥1,286.50 金额格式化） |
| w360_humans.png | 艺人广场 360 紧凑宽：2 列、地区超长省略、零溢出 |
| w390_humans.png | 艺人广场 390 基准宽：2 列 |
| w840_humans.png | 艺人广场 840 展开宽：4 列响应式 |

> 注：headless 引擎不自带中文字体，harness 在 setUpAll 从本机注入
> NotoSansSC / NotoSerifSC / MaterialIcons（仅本机存在时生效，跨机自动跳过）。
