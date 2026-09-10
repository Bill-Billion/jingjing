晶晶日上 工程交接包 · 内容清单（生成于组装脚本，自动统计）
============================================================

[前端 Flutter 工程] 文件 412 个，体积 6.5MB
[后端 Node 工程] 文件 124 个，体积 1.5MB
[部署运维脚本] 文件 267 个，体积 621.0KB
[项目档案治理文档(31份)] 文件 31 个，体积 706.4KB
[关键报告与设计(13份)] 文件 13 个，体积 359.2KB

合计：文件 847 个，未压缩体积 9.7MB

已剔除：node_modules / Flutter SDK缓存(.flpriv) / build / .dart_tool / .git / .gradle / Pods / ephemeral / 压缩包与APK；
敏感凭证：后端真实 .env 与部署 jjsr.env(仅留 .env.example 模板)、整个 secrets/ 目录(火山AK/SK与支付宝商户私钥)、SSH 连接 conn.json、含明文keystore密码的txt、*.db 备份与 deploy 内线上库副本、上传目录 uploads、运维截图。
Android 正式签名 jjsr-release.jks 作为工程文件保留（无密码不可用，keystore 密码与服务器/各平台后台账号由甲方线下保密移交，并建议接手后改密）。

敏感项扫描结果：全部通过，未发现 .env / secrets目录 / conn.json / 明文密码文件泄漏