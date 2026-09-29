# 本地合同页面联调启动器

`scripts/pr12-ui-test-server.cjs` 只用于本机隔离联调。它加载真实 PR11/PR12 后端，用真实短信挑战与登录流程建立合成账号，再经治理操作授权、规则审核生效、来源审核、封存流程创建两份未签署合同。没有替换三个 GET 的响应，也不调用真实短信或其他供应商。

本轮已通过 `node --check`、隔离库启动与真实 HTTP 自检，已用于两端浏览器联调。为保留本地预览，当前实例仍在运行；此实例的结束清理尚未执行，不能写成已经清理。当前共同版本尚无 PR12 后端，联调应明确指定已经临时整合 PR12 的本地后端目录。

## 启动与结束

在仓库根执行，`JX_MYSQL_TEST_ENV_FILE` 使用现有的本地隔离 MySQL JSON 配置文件路径：

```sh
JX_MYSQL_TEST_ENV_FILE=/绝对路径/本地测试mysql.json \
PR12_UI_BACKEND_ROOT="$PWD/.local/pr12-backend/晶晶日上工程交接包/01_源码/backend_server" \
node scripts/pr12-ui-test-server.cjs --test-only
```

启动器严格要求配置为 `NODE_ENV=test`、`DB_CLIENT=mysql`、`MYSQL_HOST=127.0.0.1`、`MYSQL_PORT=33316`、`MYSQL_USER=jx_local`、`MYSQL_DATABASE=jx_dev`。连接后只创建并迁移新的随机 `jx_test_<pid>_<随机值>` 数据库，不迁移或写入 `jx_dev`。配置不符即退出，不回退其他数据库。

默认 API 为 `http://127.0.0.1:3222`，私有控制端为 `http://127.0.0.1:3223`。API 仅允许本机 `127.0.0.1` / `localhost` 上 5199、5200、8769、8770 四个页面端口的 CORS。两个服务只监听 IPv4 loopback；控制端不提供 CORS，并拒绝带 Origin 的请求。

用前台 Ctrl-C 或状态文件中的进程号发送 SIGINT/SIGTERM 结束；程序关闭本次服务、连接并删除本次随机数据库，只移除属于自身 controlToken 的状态文件。不要用 SIGKILL 代替正常清理。端口占用、建样本失败等错误也会进入清理流程。

可选环境变量：`PR12_UI_BACKEND_ROOT`（默认本仓库 backend_server）、`PR12_UI_STATE_FILE`（默认 `.local/pr12-ui-runtime.json`）、`PR12_UI_API_PORT`、`PR12_UI_CONTROL_PORT`。状态文件采用独占创建且权限 0600，已有同名文件时不会覆盖；先确认旧进程已结束及旧测试库已清理，再处理旧状态文件。

## 账号、合同及权限

- `13900009001`：owner，拥有个人身份及“青禾制作（隔离测试）”机构 OWNER 身份，两者均在两份合同当事方中，账号拥有两份合同独立读取授权。
- `13900009002`：recipient，经真实邀请和本人接受成为同机构普通成员，但没有合同读取授权。选择机构后读取合同仍返回 404，用于验证“成员身份不自动获得合同权限”。其个人身份也不是合同当事方。
- 两份合同采用不同规则，均 `SEALED` / `NOT_SIGNED`。正文含中文、嵌套对象、数组、`0`、`false`、`null` 及需要原样显示的 HTML/script 字符串，全部明确标注隔离测试，不设商业价格或默认规则。
- 建样本所需临时治理操作权限通过 `maintainOperatorGrant` 授予，样本封存后撤回。普通界面没有创建、审核或封存测试合同的按钮。
- 四个服务检查使用真实默认逻辑，始终应是 `SANDBOX` / `NOT_ENABLED` / `PROVIDER_NOT_IMPLEMENTED`。仅合成短信被接入；未绑定付款、实名、签署或数字人服务。

启动末尾会通过真实 HTTP 检查两份合同的两种 owner 身份、规则读取、四种服务状态及 recipient 的 404；全部符合预期才发布状态文件。因此“文件已生成”表示本次启动自检结束，不代表前端验收或正式服务验证完成。

状态文件只有控制端地址/随机密钥、进程与随机库标识、测试手机号、账号/身份/合同/规则编号，不保存会话令牌、短信验证码或合同正文。`snapshots` 数组项含 `id`、`ruleId`、`contractVersionId`、`partyIds`。前端不要导入此文件或把控制密钥打包。

## 私有测试控制

先由页面发送真实短信挑战，再从本地测试工具调用控制端读取最新验证码，最后在页面填写登录。验证码只在启动器内存中；建样本消耗过的验证码不能再次登录。为便于本地反复验收，合成账号短信冷却为 1 秒、每手机号每小时上限 1000；这只是测试启动参数，不修改正式账号规则。

控制请求必须在 Authorization 中带状态文件的 `controlToken`，且不携带 Origin。它不是用户会话令牌。

|请求|用途|
|---|---|
|`GET /code?phone=13900009001`|读取 owner 最新合成短信码；recipient 同理|
|`POST /reader?snapshot_id=<本次合同ID>&enabled=false`|撤回 owner 对该份合同的独立读取授权|
|`POST /reader?snapshot_id=<本次合同ID>&enabled=true`|恢复 owner 原有授权|

reader 控制只接受本次创建的两份合同，且只操作 owner 原有授权；不能修改任意账号或合同。撤回后 owner 的个人和机构身份读取同一份合同都应 404，另一份合同仍可读。恢复后重新读取才可显示正文，页面不得复用撤回前缓存。

控制端属于本地测试工具，不是产品 API。用户页面不得出现查验证码、撤权、恢复或激活测试机构按钮。会话和身份切换、旧响应丢弃、正文纯文本与权限撤回后的清空，仍按 [接口核对及验收清单](contract-review.md) 验收。
