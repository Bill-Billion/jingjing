# 页面怎样接作者、作品、材料和脸声同意

候选接口版本0.4.0-rc.1，新增15项操作。总共40项操作，35项已有隔离实现，5项仍未实现。数据字段以[OpenAPI](../../contracts/openapi.yaml)为准，仍待队友共同审阅。服务器启动及真实登录配置沿用[第二阶段说明](STAGE_2_ACCOUNT_API.md)。

## 通用规则

所有路径以下均省略前缀`/api/v1/supply`，都需要真实登录Bearer。写操作还需要Idempotency-Key；修改已有记录必须带If-Match，值为带双引号的原object_version，如`"1"`。同次重试保留键和原内容，修改内容使用新键；重放返回当时结果，若随后发生其他操作，应再GET获取当前状态。

以个人/机构办理申请、投稿、上传、数字人资料时，带X-Acting-Party且必须为本人有OWNER权限的身份。普通MEMBER不能因此查看私有稿件。审核操作使用当前账号的明确平台权限，不靠客户端声明角色；审核人不能是提交人，也不能属于该投稿机构。

读取带X-Acting-Party时只读自己所选身份的内容；不带时需对应审核权限，草稿及撤回记录不在审核队列。个人同意由本人个人身份提交，机构不能代替本人同意。本人撤回是账号级操作，服务器从原同意记录查找本人。

JSON请求最多64KiB；原始材料上传最多8MiB，这是当前技术限制，不是商品时长或价格。所有响应不缓存，文件下载强制附件且不返回公开地址。

## 页面操作顺序

|页面动作|接口|关键结果|
|---|---|---|
|上传稿件、权利材料或同意证据|POST /assets?purpose=...&media_type=...|发送原始二进制，Content-Type为application/octet-stream；只有READY返回才可引用|
|查看材料信息/下载|GET /assets/{asset_id}；GET /assets/{asset_id}/content|核对当前归属或审核权限；下载也核对实际字节哈希|
|申请个人作者或机构供给|POST /profiles|提交显示名、说明、证据；首次previous_profile_id=null，补正填写上一版ID|
|运营处理供给申请|POST /profiles/{record_id}/reviews|APPROVED、CHANGES_REQUESTED或REJECTED，理由必填|
|录入原作/新修订|POST /work-versions|首次work_id与previous_version_id为null；新稿使用稳定work_id及上一版本ID|
|提交审核/撤回作品|POST /work-versions/{record_id}/actions|action为SUBMIT或WITHDRAW；撤回必须说明原因|
|分别核对权属、内容|POST /work-versions/{record_id}/reviews|channel为RIGHTS或CONTENT；分别记录决定与理由|
|查看列表/具体记录|GET /records?kind=...&limit=20；GET /records/{record_id}|kind为PROFILE、WORK_VERSION、AVATAR或CONSENT；下一页带返回的next_cursor|
|保存数字人资料|POST /avatars|显示名及AVATAR_MATERIAL文件引用；不创建供应商资产|
|本人记录脸声同意|POST /consents|consent内明确本人身份、数字人、FACE/VOICE、用途、地域、起止时间、条款及证据|
|独立审核同意材料|POST /consents/{record_id}/reviews|记录审核结果；不自动完成实名或电子签|
|本人撤回|POST /consents/{record_id}/withdrawals|保存原因，立即失去范围匹配条件，后续处置事件待处理|
|检查具体用途是否匹配|GET /consents/{record_id}/scope?feature=FACE&purpose=...&territory=...|scope_matches仅表示当前已审范围匹配；usable_for_generation当前明确false|

purpose上传分类：WORK_CONTENT、RIGHTS_EVIDENCE、CONSENT_EVIDENCE、REVIEW_EVIDENCE、AVATAR_MATERIAL。可用媒体类型在接口枚举中；文件类型字符串只是声明，下载始终按不执行的附件返回。文件上传未配置真实存储时明确503，不改用公开存储或本地假成功。

## 作品示例

以下是请求形状，占位ID必须替换为自己的已授权测试数据，不能复制成真实权利证明。作者、权利人和代理都用party_id和明确证据表示，可有多个；至少明确一个权利人。录入者身份与这些声明分开，最终由独立审核确认材料。

```json
{
  "work_id": null,
  "previous_version_id": null,
  "title": "实际作品名称",
  "kind": "ORIGINAL",
  "source_version_id": null,
  "project_id": null,
  "content_asset_id": "<上传稿件返回的UUID>",
  "evidence_ids": ["<权利材料UUID>"],
  "credits": [
    {"party_id":"<作者UUID>","role":"AUTHOR","evidence_asset_ids":["<材料UUID>"]},
    {"party_id":"<权利人UUID>","role":"RIGHTS_HOLDER","evidence_asset_ids":["<材料UUID>"]}
  ]
}
```

原作不填项目和来源；PROJECT_ADAPTATION须来源版本和项目，且需要真实许可绑定核验。当前未接该后续服务，所以拒绝，不因填写UUID就认定有权改编。新修订不会继承上一稿审核，也不绕开将来的同一作品独家冲突检查。

Record返回包含id、kind、stream_ref、revision、owner_party_id、created_by、current_status、object_version和按kind区分的data；WORK_VERSION的stream_ref就是稳定work_id。页面从正式格式消费，不直接读取数据库。审核全部完成状态REVIEWS_COMPLETE只表示双审，不显示“已售/已授权/已发行”。补材料时创建新修订，旧结论不覆盖。

## 同意示例及状态

```json
{
  "consent": {
    "avatar_id": "<数字人资料UUID>",
    "subject_party_id": "<本人个人身份UUID>",
    "features": ["FACE"],
    "purposes": ["<明确的实际用途代码>"],
    "territories": ["<明确地域代码>"],
    "valid_from": "<UTC毫秒时间>",
    "valid_until": "<明确截止时间>",
    "terms": "<本人看到并同意的明确条款>",
    "evidence_asset_ids": ["<本人上传的同意证据UUID>"]
  }
}
```

FACE不包含VOICE；私人定制不自动包含商业或发行用途；期限与地域不默认无限。用途和地域当前按明确字符串精确匹配，不推断行政层级或隐含授权。同意是IN_APP_DECLARATION，identity_verification保持NOT_VERIFIED，不冒充电子签或实名。真实用途代码目录、实名与生成服务接入仍按业务阶段完善，不擅自扩张范围。

撤回后历史材料保留，生成后续处置事件，但事件未处理不表示清理完成。对已有合同/成片的影响要走相应业务处理，不能在页面统一显示“已删除全部资产”。

## 错误与验证

401重新登录；403无身份或审核权限/禁止自审；404没有可见对象；409缺材料、未获供给批准、重复请求冲突、需人工核对上传或项目许可未就绪；412原版本过期；428缺If-Match；413内容过大；503外部存储或服务不可用。不要把这些结果替换成演示数据。

供给审核权限用既有governance-access.js受控维护工具授予：SUPPLY_REVIEW_PROFILE、SUPPLY_REVIEW_RIGHTS、SUPPLY_REVIEW_CONTENT、SUPPLY_REVIEW_CONSENT，分别配置。没有真实账号自动获得权限，也没有HTTP自助提权；查看[权限维护说明](GOVERNANCE_OPERATOR_ACCESS.md)。

队友可在独立隔离数据库运行`node scripts/test-mysql.js supply`验证真实HTTP链路。这个测试创建并清理合成用户、会话和材料，供应商传输用内存替身，不给正式环境提供假登录入口。`.local/supply-http-fixtures.json`为字段样例而非真实数据。真实页面联调还需双方实际执行并留证。
