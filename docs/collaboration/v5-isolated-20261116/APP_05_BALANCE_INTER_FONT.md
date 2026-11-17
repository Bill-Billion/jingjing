# 05 本人钱包余额 Inter 局部接入

## 范围
修改前已在仓库外备份。仅调整 Flutter pubspec.yaml、navigation/app_shell.dart，新增 assets/fonts/Inter-variable.ttf、Inter-OFL.txt、INTER_SOURCE.md。本批不改全局 AccountTheme、63 页面、独立预览、总矩阵或业务接口。

05 既有本人钱包摘要仍读取 available_balance_minor，经原 v5Money 格式化。中文标签与金额拆为同一 Text.rich 中的 TextSpan，仅金额（含 ¥）使用独立 WalletBalanceInter；中文 fallback 保留 NotoSansSC。保持原 16px、600 字重、1.25 行高，不增加固定高度、单行限制或省略号，仍随文本与系统字号增长。

## 字体与实现依据
复用已取得的官方 Inter 原始 TTF，完整 SIL OFL 1.1 与来源说明随源码保存，OFL 同时列入 Flutter assets。字体 SHA256 为 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031；内版本 4.001;git-66647c0bb。未下载新字体或安装依赖。

官方 Flutter 文档明确支持 TTF、pubspec family 注册及局部 TextStyle 字体；fontVariations 用于显式指定变量轴。本批以独立 family 的 600 字重注册原变量 TTF，并在金额样式指定 wght=600、opsz=14，opsz=14 沿用已存 calibration-05.css 的本地预览选择，且在该字体公开轴范围内；未获得 Figma 历史 opsz 参数，不能称已证明与原稿同轴。不推广到其他页面。

- https://docs.flutter.dev/cookbook/design/fonts
- https://api.flutter.dev/flutter/painting/TextStyle/fontVariations.html
- 原始来源及许可详见 Flutter assets/fonts/INTER_SOURCE.md。

## 保留边界与待验
本人身份门禁、钱包读取、错误/加载状态、余额字段含义、钱包导航与返回刷新均未更改。未新增示例金额；待核对或锁定余额、晶钻等其他文本未改字体。63 当前真实报价说明是中文，不强行替换字体或增加示例数字。

仅完成源码和资产静态核对，未运行测试、编译、格式化、安装或业务请求；未提交或推送。Flutter 各平台字体加载、实际字形/行高、窄屏及大字号换行、语义阅读仍待集中验收，不声称整页像素还原或 Figma 历史字体二进制一致。
