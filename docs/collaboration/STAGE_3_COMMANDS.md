# 后台怎样录入、复核并保存合同内容

这是服务器维护入口，供获准人员使用。写入不用页面直接碰数据库。没有自动管理员账号，也没有绕过短信的测试登录接口；真实登录尚未开通时，用隔离自动测试验证功能，不能往正式库塞测试会话。

## 使用前准备

在backend_server目录执行。私有环境文件包含明确的NODE_ENV、DB_CLIENT=mysql、MySQL配置、AUTH_SECRET_BASE64，以及已有登录返回的GOVERNANCE_SESSION_TOKEN。令牌与密钥不写入Git、不作为命令行参数。维护数据库凭据应限制访问；有直接数据库写权限的人超出应用权限的防护边界。

```text
node scripts/governance-command.js <操作JSON文件>
node --env-file=<本机私有配置> scripts/governance-command.js --execute <操作JSON文件>
```

第一条仅预览操作名称，不连接数据库，也不证明内容已通过业务验证。第二条才执行，先核对实际登录，写操作再查逐项权限。读取操作也须--execute，因为它们要连接数据库。输出可能含合同正文，只保存到获准的私有位置。

文件外层固定为`{"command":"操作名","input":{...}}`。下表给出所有操作和input内容，尖括号是需替换的真实值，不是可直接复制的业务参数。

|操作名|input内容|所需权限或条件|
|---|---|---|
|create_rule|rule_key、version、terms、effective_at、operation_key|CREATE_RULE，创建草稿；明确UTC毫秒生效时间，不自动审批|
|transition_rule|rule_id、target_status、expected_version、operation_key|依次IN_REVIEW、APPROVED、EFFECTIVE、RETIRED，分别授予RULE_对应状态|
|read_rule|rule_id|READ_RULE，读取规则库|
|create_source|content、operation_key|CREATE_SOURCE，保存不可覆盖的来源版本|
|read_source|source_ref|READ_SOURCE，读取录入内容及复核状态|
|transition_source|source_ref、target_status、expected_version、review_ref、operation_key|REVIEW_SOURCE允许DRAFT→REVIEWED；WITHDRAW_SOURCE允许DRAFT/REVIEWED→WITHDRAWN|
|seal|source_ref、operation_key|SEAL；已复核来源、规则已生效、人员有效，调用者须在明确读取名单|
|read_snapshot|snapshot_id、party_id|当前身份是合同当事方且账号获准读取|
|check_business|snapshot_id、party_id、action|同上；action取START_PAYMENT/START_IDENTITY_CHECK/START_SIGNING/START_DIGITAL_HUMAN|

## 来源录入格式

```json
{
  "command": "create_source",
  "input": {
    "content": {
      "business_ref": "<业务引用>",
      "revision": "<明确修订号>",
      "party_ids": ["<个人或机构UUID>"],
      "rule_ids": ["<已录入的规则版本UUID>"],
      "reader_account_ids": ["<录入人员账号UUID>", "<获准阅读者账号UUID>"],
      "commitments": {"<明确条款名称>": "<实际经过核对的条款内容>"}
    },
    "operation_key": "<本次唯一操作键>"
  }
}
```

引用、修订号、操作键用字母数字及`_.:-`，最多128字符。UUID必须真实存在；读取名单最多100人且无重复。录入人员必须被明确列入，其他阅读者必须是某一合同当事方的有效成员；录入时、复核时和首次封存时均检查。机构成员身份本身不新增阅读授权。

相同业务引用与修订号只能有一份来源，返回服务器生成的source_ref和contract_version_id。同内容重试保留operation_key；相同键换内容会拒绝。条款变化用新revision和新操作键，旧版本没有修改入口。封存保存明确采用的规则原文和承诺，不会随之后改价改规则变化。

内容先DRAFT，经获REVIEW_SOURCE权限的人明确复核才REVIEWED。review_ref仅记录实际复核依据，不自动核验证据，更不代表客户签署。同一个人是否同时拥有录入、审核权限由实际人员授权决定，本轮没有擅自指定。

撤回阻止尚未发生的首次封存；如果此前已保存历史内容，仍可按权限读取或重复取得原记录，不会删除历史。保存过程与撤回用锁确定先后；已经取得锁的保存可先结束，不能把撤回解释成抹除过去。

录入的terms/commitments是明确内容，服务不自动填写价格、次数、地域、期限，也不能替代后续交易模块的完整字段与合法性核对。business_ref仅用于关联，不证明一个真实订单已经存在。当前工具可录入经人员核对的合同版本；将来下单程序接同一内部服务，避免页面依赖表结构。

## 服务检查结果怎样理解

NOT_ENABLED表示缺实现、配置、匹配环境的验证证据，或状态不可读；不会继续声称业务成功。SERVICE_READY只表示检查当时必要外部服务条件满足，绝不是已签、已付或有权发行。真正执行时必须再次用已有Provider Adapter核对状态，并由对应交易模块核对业务授权与金额等条件。

现有启动入口未绑定这四类商业动作，因此全部明确未启用。测试中的服务验证是合成证据，不能搬到真实配置。查询不调用供应商、不产生费用。库服务可用assertReady在业务执行前拒绝不满足的条件；该函数不能替代后续业务本身。
