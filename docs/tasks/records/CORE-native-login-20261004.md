# 安卓安装包与真实短信登录验收准备

用户本轮明确恢复安卓安装包验收（不是恢复iPhone测试）。手机不在远程开发机旁边，不能USB连接；计划提供独立测试APK，由用户手动安装，连接临时HTTPS测试后端。

已获短信授权：尾号1757、最多2条、总费用上限1元、不自动重发；额度独立于此前已用完的单条测试。本轮尚未发送。用户同意临时测试入口，但自动审批拒绝首次Cloudflare启动：具体目的地、端口和访问控制未明确。未绕过拒绝；已实现限定测试登录接口的网关和持久发送计数，7项离线检查通过，正在就 *.trycloudflare.com → 127.0.0.1:3280、75分钟上限的具体方案等待确认。

本侧准备发送保护、测试后端与构建脚本；用户负责在手边安卓手机安装及实际点击，并反馈安装、收件、登录、退出。无需把验证码发给本侧。测试包使用独立包标识与测试名称，debug签名；不是正式发布包。App业务源码不改，CI临时构建目录加入测试身份和HTTPS配置。

当前安卓原始release配置仍存在缺证书回退debug的旧问题，已列正式发布前修复项；本次不调用release构建，也不宣称正式签名验收通过。六阶段人工审阅另见历史审阅工作树中的 docs/reviews/20261004/04_STAGE_REVIEW_GUIDE.md；已经发现顺序合并冲突，未自动合并。

构建入口为 `.github/workflows/android-acceptance.yml`。首次无已批准的具体地址时，安装检查包使用不可访问的 not-configured.invalid；不得称为真实登录包。只有具体测试入口获准且验证后，才构建带实际HTTPS地址的登录包。该包不含火山密钥、数据库或验证码。

## 首次安卓构建失败及修复

运行37205774947在编译安卓插件时失败，尚未生成APK。锁定版本file_picker 11.0.3在AGP 9且android.builtInKotlin=false时遗漏Kotlin编译；修复仅由测试包准备脚本在CI临时目录启用该插件的Kotlin编译并统一Java 17目标，原App依赖和正式配置不变。需重新构建验证，不能用网页测试代替。

上游依据：[插件问题2200](https://github.com/vicajilau/flutter_file_picker/issues/2200)、[Flutter迁移说明](https://docs.flutter.dev/release/breaking-changes/migrate-to-built-in-kotlin/for-app-developers)。
