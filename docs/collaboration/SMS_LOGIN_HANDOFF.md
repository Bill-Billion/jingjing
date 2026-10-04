# 短信登录：队友怎样接，哪些还没验收

2026-10-04。本侧负责后端发送和登录校验；队友负责 App／网页操作与联合检查。本次没有改页面、接口字段、数据库结构或依赖版本，不要求队友为此重写页面。队友尚未确认接手本次联调。

## 当前可以确认什么

- 用户已确认此前那一条真实短信收到，签名为“万霖新媒体”；那是独立发送测试。
- 本次把单次 HTTPS 发送方式接入应用：每次最多发起一个请求，不自动重试，不跟随跳转；超时、中断或异常响应不能冒充发送成功。
- 本机已通过申请验证码、校验验证码、建立登录、读取本人资料，以及过期、错误次数、限流、重复提交等检查。数据库和 HTTP 都是真的，短信服务是测试替身，整个测试禁止访问外部服务。
- 现有网页的8项短信专项和24项账号浏览器检查已通过；GitHub上的App125项测试、静态检查和Web构建通过。真实短信与App／网页完整联调仍未验收，原生手机测试未恢复；应用短信开关仍未打开，未写入真实服务已验证记录，未部署。

## 队友调用顺序不变

以[主接口文件](../../contracts/openapi.yaml)为准，具体形状见[账号接口说明](STAGE_2_ACCOUNT_API.md)。该旧说明中的分支和当时验收状态是历史记录，本轮状态以这里为准。

|页面操作|后端接口|页面需要注意什么|
|---|---|---|
|点击获取验证码|POST /api/v1/auth/sms-challenges，提交 phone、purpose=LOGIN|保存返回的 challenge_id；只有成功响应才能提示申请成功，不能据此保证手机已收到|
|提交收到的验证码|POST /api/v1/auth/sessions，提交 phone、challenge_id、code|验证码按字符串传，保留开头的0；成功后保存会话令牌|
|进入已登录页面|GET /api/v1/me，携带 Authorization: Bearer 令牌|以服务端返回的本人资料为准，不依赖本地假登录状态|
|重复点击或请求结果未明|原请求与原 Idempotency-Key 保持一致|申请短信和提交登录各用自己的唯一键；重试同一操作不能换新键或修改内容|
|短信未开放或结果未确认|503，例如 SMS_NOT_READY、SMS_CHALLENGE_UNAVAILABLE|提示服务暂不可用，不显示发送成功；不自动重新申请短信|
|验证码不对、过期或已不可用|401|提示重新核对，不能绕过后端校验|
|请求太频繁|429|按 Retry-After 等待；是否可重试以 error.retryable 为准，不做无限自动循环|

## 代码在哪里，怎么独立检查

本次分支为 `core/sms-login-20261004`，直接从共同版本 `28662ab39950ad6a2f0b3c4ca372df9a65195b96` 建立，不依赖待审的后续阶段分支。现已集中上传至[第22份申请](https://github.com/Bill-Billion/jingjing/pull/22)。队友可 `git fetch origin core/sms-login-20261004`，保留当前改动后在独立工作目录检查此分支；不覆盖自己的页面工作目录。功能版本8ad909c已通过GitHub后端与App／网页检查，最新提交检查以申请页为准。

需 Node 22、隔离 MySQL 8、仓库锁定的依赖。配置自己的 `JX_MYSQL_TEST_ENV_FILE`，必须指向测试库配置，不要用生产库。仓库根运行：

```text
node scripts/backend-check.cjs account-api
python scripts/validate_contract.py --runtime-fixtures .local/account-api-http-fixtures.json
```

供应商检查需在 `晶晶日上工程交接包/01_源码/backend_server` 目录运行 `node scripts/test-mysql.js providers`（沿用同一测试库配置）。

最后一项需要接口检查用的 Python 依赖（openapi-spec-validator、jsonschema、PyYAML）。本轮实际用了已安装这些依赖的隔离 Python 环境。测试用合成凭证，不需要甲方密钥，也不会发送真实短信。

## 接下来谁做什么

1. 本侧已集中上传并提供第22份唯一申请，现请另一方检查发送保护和服务启用条件。维护者验收后决定合并；本侧不代签批准。
2. 本侧现有页面隔离检查已通过，队友可依据证据复核，并与本侧安排真实测试环境的完整登录检查；此前取消的手机安装包验收不自行恢复。
3. 联合检查涉及真实发送时，先约定接收号码、条数和费用，再执行。前一条短信授权已经用完，本次没有新增发送。
4. 本侧负责真实测试环境的配置与证据。改发送实现、签名、模板、凭证或公司后应更新 SMS_CONFIG_REVISION，重新核对；不能把隔离测试的虚构验证记录写入真实环境。仅填配置或打开 SMS_ENABLED 不等于获准启用。
5. 甲方后续开通 OSS 私有测试桶并提供桶名、地域和受限访问凭证。短信材料已齐，不需重复索要；北京主体切换另行安排。

[本次代码、测试与限制](../tasks/records/CORE-sms-login-20261004.md)。

[本阶段集中交付和完整检查结果](../tasks/records/CORE-sms-login-stage-delivery-20261004.md) · [等待OSS期间继续做什么](NEXT_WITHOUT_OSS.md)。
