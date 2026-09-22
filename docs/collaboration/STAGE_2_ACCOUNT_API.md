# 第二阶段：页面可以调用账号与机构接口

我方负责后端接口、MySQL、鉴权和外部服务保护；队友负责App与运营/合作方网页。双方核对格式并联调。当前分支core/stage-2-account-api，从已合并的第一阶段7d139ff开始；本阶段包含后端代码、隔离测试和调用说明，页面及真实短信验证仍需配合，不能写成整个产品已可用。

## 我方这次交付什么

- 独立HTTP入口，登录身份从MySQL会话验证，不信任旧JWT、客户端角色或旧MCN直接绑定。
- 短信申请与一次性校验、重复请求保护、持久限流、过期与退出登录。缺真实服务配置/验证证据时明确未启用，没有固定万能验证码。
- 当前账号、个人/机构列表与切换、机构创建和显示名更新、多种能力申请、邀请接受/拒绝/撤回、成员列表和移除。
- 列表分页、错误提示、对象版本检查和请求重放。机构成员不获得付款、作品使用或商业代理权。
- 新增5份MySQL迁移0015–0019；既有0001–0014不改，旧SQLite账号与商业授权不自动迁移。

## 队友现在怎样配合

|页面|调用顺序|必须展示的真实状态|
|---|---|---|
|登录|申请短信→用户输入验证码→创建会话→读取当前账号|未配置或未验证短信返回503，不能显示“短信已发送”|
|身份切换|读取本人身份列表→前端记住所选身份→每次请求携带对应头部|选中身份不是授予权限；以后操作仍由后端判断|
|机构申请|创建机构→申请MCN/制作/剧本等能力|均为待审，不显示机构已认证或商业合作已成立|
|邀请成员|邀请方填写对方的新账号ID和截止时间→本人查看邀请→接受/拒绝|发送邀请不自动绑定；对方账号ID由对方提供，不开放任意手机号搜人|
|成员管理|机构负责人读取成员列表和版本→移除普通成员|不能移除负责人；不删除其个人或其他机构身份|

队友任务未代为认领，也未声称页面已实现。接口候选0.2.0-rc.1待共同检查；新增路径和完整结构见[主接口文件](../../contracts/openapi.yaml)。此前实名状态、平台能力总览、运营服务列表、规则版本、合同快照5项仍未接入，不能按旧候选路径假定已能调用。

## 启动与复验

需要Node22.19.0、MySQL8；依赖继续使用原package-lock，无新增npm库。先在backend_server目录执行npm ci，按[数据库说明](../../晶晶日上工程交接包/01_源码/backend_server/docs/MYSQL_FOUNDATION.md)启动隔离MySQL。本机辅助工具默认只监听127.0.0.1:33316，首次获取代码还需安装MySQL，不能使用生产配置做测试。

在仓库根设好JX_MYSQL_TEST_ENV_FILE后执行：

```powershell
$env:JX_MYSQL_TEST_ENV_FILE=(Resolve-Path '.local/mysql/runtime/test-env.json').Path
node scripts/backend-check.cjs account-api
node scripts/backend-check.cjs all
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py --runtime-fixtures .local/account-api-http-fixtures.json
```

测试启动真实本机HTTP和独立随机数据库，在内存替换短信发送，不访问供应商、不发真实短信。没有供生产调用的“测试登录”入口，测试生成的验证码/会话不能填进运行配置。测试结束清理对应随机数据库；本地MySQL进程仍需按说明停止。

实际启动新API时，在backend_server目录指定自己的不入Git环境文件：

```text
node --env-file=<本机私有配置文件> scripts/mysql-migrate.js up
node --env-file=<本机私有配置文件> src/http/main.js
```

配置必须有NODE_ENV、DB_CLIENT=mysql及数据库连接参数，另加AUTH_SECRET_BASE64（用密码学随机源生成32字节后Base64编码，保密且稳定保存）。HOST默认127.0.0.1，PORT默认3000；网页跨域开发需要API_ALLOWED_ORIGINS明确列出来源，多个用逗号分隔，否则用同源代理。生产TLS及网关配置不在本轮自动部署。

数据库必须已经应用全部迁移，否则启动失败，不退回SQLite。不要用旧npm start作为新入口；新命令也可用npm run start:api，但仍须正确提供环境变量。`/health`只表示进程存活，`/ready`只检查必要数据库资源，不证明短信或商业服务已启用。

真正发送短信还需要SMS_ENABLED=true、VOLC_ACCESS_KEY_ID、VOLC_SECRET_ACCESS_KEY、SMS_ACCOUNT、SMS_SIGN_NAME、SMS_LOGIN_TEMPLATE_ID、SMS_CONFIG_REVISION，可选SMS_REGION；沿用仓库已安装的火山SDK。相应供应商/能力/环境必须具有真实验证记录且配置版本一致。配置本身不自动批准，不公开提供自行标记已验证的HTTP接口。配置化短信禁止SDK的DEBUG日志，避免正文/凭据被SDK输出。实际供应商发送、收费、模板审批均未执行。

## 最小调用示例

下面是请求形状示例，手机号、UUID、验证码和令牌须来自自己的授权测试环境，不能直接复制占位值登录。所有成功是{meta,data}；失败是{meta,error}。

```text
POST /api/v1/auth/sms-challenges
Idempotency-Key: <本次申请唯一键>
Content-Type: application/json
{"phone":"<手机号>","purpose":"LOGIN"}

POST /api/v1/auth/sessions
Idempotency-Key: <本次登录唯一键>
{"phone":"<手机号>","challenge_id":"<上一步ID>","code":"<收到的6位验证码>"}

GET /api/v1/me/parties?limit=20
Authorization: Bearer <access_token>

POST /api/v1/organizations
Authorization: Bearer <access_token>
Idempotency-Key: <本次创建唯一键>
{"display_name":"机构名称"}

POST /api/v1/parties/<机构ID>/invitations
Authorization: Bearer <邀请方令牌>
X-Acting-Party: <机构ID>
Idempotency-Key: <本次邀请唯一键>
{"invitee_account_id":"<被邀请人的新账号ID>","expires_at":"<明确UTC截止时间，含毫秒Z>"}

GET /api/v1/me/invitations
Authorization: Bearer <被邀请人令牌>

POST /api/v1/parties/<机构ID>/invitations/<邀请ID>/responses
Authorization: Bearer <被邀请人令牌>
X-Acting-Party: <机构ID>
Idempotency-Key: <本次接受唯一键>
If-Match: "1"
{"decision":"ACCEPT"}
```

POST/PATCH/DELETE必须有Idempotency-Key；修改已有对象还须原版本If-Match。相同操作重复提交保留同一键和原内容；不能每次重试生成新键。403表示不允许，404表示不可见或不存在，409同键内容冲突，412版本过期，428缺版本，429限流，503未启用或依赖失败。不要统一吞成“成功”。更多返回例子见[合成示例](../../contracts/examples/platform.json)。

## 运行维护与边界

会话24小时等是可配置技术默认，不是商业参数；详情见[协议](../../contracts/PROTOCOL.md)。定期清理过期认证秘密可用`node --env-file=<私有配置> scripts/auth-cleanup.js`，不会删除账号、机构或审计；本轮未配置正式定时任务。密钥轮换、旧账号映射和完整数据删除流程仍需后续独立处理。

本阶段无新增商业定价或权限决定，不需要用未知商品参数阻塞实现。不能自行批准机构、启用真实短信、导入旧商业授权或授予平台管理员权限。未提供所有权转移、本人退出、运营审核/停用入口；底层仍会拒绝已停用账号/机构，这些后续管理入口不被本阶段测试冒充完成。

安全依据：[OWASP会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)建议不可预测的会话标识；[登录验证指南](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)说明通用错误与限流。本实现采用32字节随机令牌、错误次数限制和数据库内的会话状态；不宣称完成安全审计或获得认证。
