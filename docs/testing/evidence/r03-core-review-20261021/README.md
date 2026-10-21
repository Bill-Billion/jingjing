# 本侧第三轮复审证据

来源PR31/d242816，共同版本b8775fe；本侧修复369e038。全部为隔离模拟资料。RESULTS.json记录检查范围，不能把同一业务的不同检查次数相加当独立需求数。

- REVOCATION_BEFORE.txt：新增两项检查先在原代码失败，实际残留公开名称；修复后324项App检查通过。
- permissions：26份实际接口返回、10组网页操作、实际撤回公开同意后App清旧资料的3步检查及截图。
- service-flow：修正交接脚本输出文件名后，直接顺序执行网页与App脚本，6组通过；同一未付款未签署订单，没有手动改名衔接。
- app-pages：16项检查、18张截图。web-pages：27个视口、33张截图，业务写入0。
- 本侧目视抽查本人档案、机构获托页面和撤回后App目录；完整逐页自动截图不冒充全部人工体验审阅。

本机准备时曾因Vite尚未启动结束而连接失败；已读取确认原服务请求并复用，没有重建请求。初次Flutter分析的本机路径问题通过专用短路径解决。本机已运行隔离MySQL，复用该实例；未改生产配置。以上环境问题没有计作产品检查通过。

真实实名、支付、OSS、长期模型和真机仍未验；网页编号填写的易用性需双方人工检查。第三轮不代表第四至十二轮全部页面完成。

安卓本轮真实模拟器3个业务场景通过，4张截图见android；运行入口integration_test/android_artists_test.dart，驱动沿用test_driver/native_screenshots.dart。新测试脚本首次定位假设有误：实际禁用按钮为OutlinedButton，长列表需滚动，原生预览按实际Semantics组件检查；更正测试后重跑通过，没有因此修改产品代码。首次失败不计入通过。

独立复验：在已配置的项目安卓环境中，用当前artists隔离实例生成仅本机defines（R01_*为artist账号，另设R03_PERSON_ID、R03_HOSTING_ID），通过adb reverse连接该本机端口，然后运行flutter drive --no-pub --no-dds --keep-app-running --enable-software-rendering --no-enable-impeller --driver=test_driver/native_screenshots.dart --target=integration_test/android_artists_test.dart --dart-define-from-file=<本机忽略文件>。不要将defines或测试包上传。初始化环境沿用scripts/android-local.ps1的Java、SDK、缓存和Gradle配置。
