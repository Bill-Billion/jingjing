# PM03 首批本机联调环境：现货与普通通告

用户已确认：**前端独立电脑，本地复现同一隔离环境**。本交付由后端负责人 chengcongcong222 准备，前端负责人 Bill-Billion 在自己的工作树接页面并填写实际回执。使用原 `stock-sandbox.cjs` 的显式 PM03 模式；不另建交易系统，不要求访问后端开发机的 127.0.0.1。

所属计划为[PM03 执行计划](PM03_EXECUTION_20261115.md)阶段0，支撑阶段1的 W11 现货购买下载退款及 W03/W14 普通通告发布投稿切片。后端实际 HTTP 办理已通过，**前端机器复现、页面办理和共同验收尚未确认**。通告报价、商单履约仍是后续步骤，不能据此关闭 E2E-04。

## 先固定版本与依赖

从原草稿 [PR39](https://github.com/Bill-Billion/jingjing/pull/39) 获取本环境补丁的准确提交；保留已有 UI 和未提交工作，在自己的接入工作树整合，不硬重置。接口仍为 **0.31.78-rc.11，迁移0225**，本补丁不改业务接口或迁移。启动记录会保存实际 HEAD 和后端/夹具源码摘要，恢复时核对两者；不同电脑创建各自新环境，不复制数据库、state.json 或登录凭据。

需要 Node 22、仓库锁定的后端依赖、MySQL 8 和带 libx264/drawtext 的 FFmpeg。本次后端验证使用 Node 22.19.0、现有本机 MySQL 8、FFmpeg 9.0.2。脚本不会下载安装软件，也不会读取生产 `.env`。

以下命令在接入工作树根目录执行；路径示例需换成本机安装位置。已有隔离 MySQL 时沿用其测试配置，不重复启动或停掉别人使用的实例。

```powershell
npm ci --prefix '晶晶日上工程交接包/01_源码/backend_server'
$env:LOCAL_MYSQL_HOME=(Resolve-Path '<本机已解压的MySQL目录>').Path
node scripts/local-mysql.cjs start
$env:JX_MYSQL_TEST_ENV_FILE=(Resolve-Path '.local/mysql/runtime/test-env.json').Path
$env:JX_TEST_FFMPEG=(Get-Command ffmpeg).Source
$env:JX_TEST_FONT=(Join-Path $env:WINDIR 'Fonts/arial.ttf')
node scripts/stock-sandbox.cjs --pm03
```

`local-mysql.cjs` 若因 Windows 中文路径要求 ASCII 别名，按其既有规则让 `LOCAL_MYSQL_ROOT` 指向**同一工作树**的已核对别名；不要照抄后端机器的 J 盘路径。FFmpeg若未在PATH中，显式填写本机可执行文件位置。本次实际验证平台为Windows；其他系统应使用自己的 MySQL/FFmpeg/字体路径，尚未代前端实测。测试配置必须为 test/mysql、127.0.0.1:33316、jx_local、jx_dev；不匹配会拒绝。

最后一条命令保持运行，输出 `READY`、本机动态 `base_url`、`expires_at` 和 `access_file` 路径，不输出口令。配置当前前端 API 地址时以该输出为准：`base_url` 带 `/api/v1`，若页面配置要求 origin，则去掉这段后缀。网页开发源允许 `http://localhost:5173`、`http://127.0.0.1:5173` 以及同主机的5000端口；页面由前端启动和验证。这里只监听127.0.0.1，尚未提供安卓模拟器/实体机的额外网络接法，不把本轮 HTTP 自验当原生设备验收。

## 账号、样片与实际登录

每次启动得到随机独立库 `.local/stock-sandbox/jx_test_stock_pm03_<随机值>`。本机 `access.json` 保存角色的合成手机号、账号、办理主体、允许的运营动作、样例ID和请求模板，受当前操作系统用户权限保护并被Git忽略。**不要提交、贴聊天或放进构建包**。这些手机号只在本机短信替身中使用，不向真实手机发送。

|角色|用途与边界|
|---|---|
|stock_buyer / stock_seller|已具合成成年实名的买家/卖家，买家不能独审或读取其他人的订单|
|stock_reviewer|现货权属/内容、交易审核及退款，不能代普通通告运营|
|stock_publication_editor|现货销售许可提议，与独审账号分开|
|notice_publisher|有效合成成年实名、没有星探会员，使用新普通发布规则|
|notice_artist|已有针对发布人的投稿授权及形象资料|
|notice_reviewer / notice_rule_editor|通告处理及规则提议分开；保留自审拒绝|
|unverified|未实名、无运营权的反例账号，不能当正常买家或发布人|

本批不是全能账号，也没有把未成年、过期等所有异常都预制为角色；这些后续按实际联调补充。合成实名和审核不是现实认证，商品条款是隔离测试条款，不能作为正式销售授权。

按现有页面登录流程调用 `POST /api/v1/auth/sms-challenges`，请求 `{phone, purpose:"LOGIN"}`，带新的 `Idempotency-Key`。短信替身只接收上述角色手机号，将验证码写入环境目录的 `sms/<challenge_id>.json`，只在本机受控文件里查看。随后调用 `POST /api/v1/auth/sessions`，提交 `{phone, challenge_id, code}`，同样带幂等键；服务器真正核验挑战并发放会话。验证码5分钟、重发至少60秒，原接口限流保持。没有公共“获取验证码”接口。

登录后先读取 `/api/v1/me`、`/api/v1/me/parties`。业务请求带 Bearer 会话；本人操作带对应 `X-Acting-Party`，运营独审请求不带这个头；修改已存在记录使用服务器当前版本作为 `If-Match`。不要为消除403/409而切换成运营账号或关掉实名条件。

`scenarios.stock` 提供已审现货和待审商品；`requests.stock_listing` 可创建新的商品，逐项权属/内容独审后购买。原片和预览是两份**实际可解码、有可见测试字样的合成色条MP4**，不是旧占位字节，不代表真人作品。`scenarios.notices` 提供新普通规则及已发布通告，`requests.notice/submission` 提供本机模板；选择新通告时替换投稿中的 `notice_id`。旧星探规则保留历史，不用来判断当前普通发布资格。

## 付款与退款怎样模拟

下单、发权、审核、退款和账目均走真实后端业务及MySQL，仅外部支付结果使用现有 `createPaymentSimulator`。启动付款后，用买方自己的会话及主体调用测试专用 `POST /api/v1/testing/payments/outcome`，提交 `{record_id:付款记录ID,state:"SUCCEEDED"}`；再调用原付款核对接口，才会实际发权。可选择 PENDING/UNKNOWN/CLOSED/SUCCEEDED，成功终态不可反改；无关账号不能设置别人的付款。

退款先开售后、独立审核员明确 `refund_minor` 和 `license_action: KEEP/REVOKE`，再按批准金额申请退款、独审、执行。测试端只改变已执行的退款记录外部结果；买方核对到账后，原业务决定是否恢复或撤销许可。到账前下载仍暂停。不能把测试结果接口当免审核退款接口，也不能在真实服务中启用它。

可复跑的后端自验命令如下，它会**新增两笔现货订单和一笔通告投稿**并保留，方便页面找到同记录；不会停服务、删记录或替前端验收。

```powershell
node scripts/stock-sandbox-pm03-smoke.cjs '.local/stock-sandbox/本次环境目录名'
```

成功结果在该目录 `smoke-<时间>.json`；包含业务ID和12组实际检查，不含登录口令。它检查七角色实际登录、本人读取、未登录/跨源拒绝、预览文件、两条部分退款许可分支、未知付款不发权、重复核对不重复计账、普通发布→独审→投稿→意向和运营同记录读取。源码是 HTTP 接法示例，前端仍须按自己的页面操作并另留结果。

## 停止、恢复、重新开始与记录保留

本环境从初始化起有效 **8小时**，不因重启延长。Ctrl+C、终端 `quit`，或在本次环境目录创建空文件 `stop` 都可关闭服务。等待 `status.json` 变为 STOPPED 后再恢复；退出会关闭HTTP和数据库连接，**不删业务库与上传文件**。

```powershell
# 停止（也可在启动终端 Ctrl+C）
New-Item -ItemType File -Path '.local/stock-sandbox/本次环境目录名/stop' -Force
# 同一提交、同一源码且尚未到期时恢复；地址可能改变，重读access.json
node scripts/stock-sandbox.cjs --pm03-resume '.local/stock-sandbox/本次环境目录名'
# 已跑过上面自验的环境，验证旧会话、同订单、文件、通告仍可核对
node scripts/stock-sandbox-pm03-smoke.cjs '.local/stock-sandbox/本次环境目录名' --verify-retained
```

并发启动同一环境会拒绝；到期、版本或源码摘要不符也拒绝，不能改state绕过。到期后重新 `--pm03` 建新环境；旧数据库及文件仍保留供双方核对，不会迁移或伪装成新版本数据。**重新开始不等于删除旧记录**。环境清理由后端与记录持有人核对具体库和目录后另行处理，本启动器不提供批量删除，也不接触3490和离线APK。正常停止后旧地址不可访问；异常退出按真实状态排查，不直接重复覆盖。

## 前端第一张回执

按[接手说明](PM03_FRONTEND_HANDOFF_20261115.md)回填实际前后端HEAD、页面构建、环境目录/到期时间（不填凭据）、角色、现货订单或通告ID、最小写入与运营读到同记录的结果。前端若遇失败，提供请求方法/路径、错误码、记录版本及脱敏结果，由双方判定是资料、页面调用还是后端行为。

当前远端网页PR15卖方前置仍由前端主办；本环境的正常角色证明后端可接，但没有改写PR15脚本或代其复验。G01—G04/G07本侧已准备并自验，不代前端把阶段0标通过。实际[后端证据](../reviews/pm03-local-environment-20261115/REPORT.md)和原任务板一起查看。
