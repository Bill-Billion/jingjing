# 晶晶日上 Flutter 客户端

晶晶日上数字人 IP 经纪与定制圆梦平台的主客户端工程，包含艺人浏览、数字人创建、AI 创作、定制剧、订单、消息和钱包等页面。

完整的项目介绍、功能边界、后端启动、连接模式、第三方配置及验证结果，请阅读[仓库根 README](../../../README.md)。本次代码审查见[2026-09-10 审查记录](../../../docs/project-review-2026-09-10.md)。

当前应用版本为 `12.3.1+22`。锁定依赖要求 Flutter ≥3.44.0、Dart ≥3.12.0 且 <4.0.0；本次文档审查未复测 Flutter 构建。

```powershell
flutter doctor -v
flutter pub get
flutter devices
flutter run -d <Android设备ID>
```

启动前确认 `lib/services/api_service.dart` 中的默认服务器地址；本地 Android 模拟器可使用 `http://10.0.2.2:3000`。应用内“我的 → 设置 → 连接与服务器”可调整地址与数据模式，真实接口联调应使用 `online` 并通过验证码登录。

`lib/` 是业务源码，`test/` 是单元与 Widget 测试，`integration_test/` 是业务旅程测试。旁边的 `gate0-docs-src-20260909/` 属于性能实验交付副本，不是该主工程的替代入口。
