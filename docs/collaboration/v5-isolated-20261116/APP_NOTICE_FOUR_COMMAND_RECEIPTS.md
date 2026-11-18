# 通告四项写操作的原请求回执关联

修改前已在仓库外备份，保留本批先前新版确认回执修复。本次仅追加 `lib/notices/notices_api.dart` 与本交接，不改页面、后端、矩阵或共享写入机制。

## 实际实现

NoticesApi.post 对四类精确路径冻结实际 JSON body 和 version，校验后才交给原 parse：

| 原动作 | 返回关联 |
| --- | --- |
| /qualifications | QUALIFICATION、本人 owner、无 counterparty/parent、IN_REVIEW、版本1，以及原 types、起止时间、evidence_asset_ids、terms |
| /announcements | NOTICE、本人 owner、无 counterparty/parent、IN_REVIEW、版本1，以及原 rule_id 和完整 notice |
| /submissions/:id/decision | 原路径 id、SUBMISSION、本人 counterparty、原 version+1、原 decision、对应 INTERESTED/DECLINED；感兴趣带合法 case_id，婉拒 case_id 为 null |
| /records/:id/close | 原路径 id、本人 owner、允许的 NOTICE/SUBMISSION/QUALIFICATION 类型、原 version+1、WITHDRAWN、原 closed_reason |

JSON 递归比较不受对象键顺序影响，数组仍按原顺序。首次提交和通用 retry 恢复共走此 post；不从重新读取记录取版本代替原 pending.version。更新动作缺版本在发送前 uncertain 阻断；不匹配响应由原 AccountApi validate 路径保持 pending/body/key/version。未新增重试、发送或自动确认。

## 后端依据

路径相对 backend_server/src：
- modules/notices/repository.js:13：资格原字段进入 QUALIFICATION 创建回执。
- :15–16：发布的 notice 经 policy.notice 校验后复制，原 rule_id 与 notice 进入 NOTICE 回执。
- :30–35：close 返回本记录 WITHDRAWN 与 closed_reason；连带关闭其他记录不改变返回对象。
- :36：decision 返回本 SUBMISSION，decision、case_id 与结果状态对应原选择。
- modules/notices/context.js:10–12：insert 版本1；save 增一；幂等 command 返回原 result_json，不是后来状态。因此恢复不要求原回执等于最新重读记录。

这是前端关联补强，不表示已观察到后端错发或越权。不能识别两个内容完全相同、服务端未回显原操作键的新建请求；不伪造不存在的关联字段。

## 前序只读核查与本次接续：App 新投稿

`notices_submission.dart:334–357,400–456` 的邀约及投稿表单仍采用 `api.validateRecord`。前序核查时 `/submissions` 不匹配上述四类或新版确认专用分支，未绑定原 body；现已按下节补齐。Web 的修复不能替代这个 App 入口。

后端 repository.js:17–25 的确定返回语义：
- SUBMISSION、本人 owner、原 target_party_id 为 counterparty、原 notice_id 为 parent、IN_REVIEW、版本1；data.rule_id 与原规则对应。
- policy.submission 复制正文、人物/形象/同意、purpose/content/role/material_asset_ids 等输入。
- 唯一需特别处理的变换：INVITATION 未给 source_listing_id 时，后端可查得并补入真实 source_listing_id。因此不能盲目要求整份 submission 与输入逐键完全相等。原来传了该字段时必须相等；没传时只允许邀约新增合法来源 ID，其他原字段仍逐项对应。
- 关联通告的 notice_snapshot 来自当时通告；只有原 body 确有 notice_version/notice_sha256 时才可要求这两个值相等，不能以当前页面或新 GET 值代替。未提供摘要的旧请求不能凭空补出确认依据。
- expires_at、rule_sha256、服务端生成 id 等仅校验其真实形状/内部关系，不从客户端推算或伪造。

最小后续方案是在同一 post 增加 /submissions 专用原 body 绑定，适配上述可选来源补全；不重写表单或恢复逻辑。接续实现已完成，具体如下。

## 静态核查与冻结

已阅读局部源码差异、上述后端返回语义与原恢复路径。未测试、编译、分析、格式化、请求业务接口、提交或推送；动态恢复/不同身份/错误回执仍待联测。

notices_api.dart SHA-256：`296c804a7a43e8d1891781bdc05abd47fdbbb1db34fe7022667c4e7591efc722`。
先前 APP_NOTICE_CONFIRMATION_RECEIPT_BINDING.md 中 API 哈希为该前序步骤的冻结记录，本次累计 API 以此摘要为准，确认页未改。


## 接续完成：/submissions 专用绑定与完整覆盖表

再次在仓库外备份当前累计 API 后，只在 post 顶部新增精确 `/submissions` 分支，先前四项和新版确认分支字节未改。

- JSON 深复制实际发送 body；每个实际提供的 submission 字段逐项对应，不要求原请求提供服务端派生字段。
- 仅允许 INVITATION 的 source_listing_id 在原未提供时由后端新增；原提供时同其他字段严格相等。INVITATION 回执来源必须是合法 ID。后端 context.js:66–78 仅在找到唯一合法公开来源时返回 ID，否则拒绝。
- 校验 SUBMISSION、本人 owner、原接收方、原通告父 ID、IN_REVIEW/版本1、原 rule_id；rule_sha256 仅校验摘要形状，不假设客户端已提供规则摘要。
- review/decision/case_id 保持原创建空值。expires_at 沿 NoticeRecord 原日期形状校验，不用客户端当前时间推算；id 沿原合法 ID 校验，不捏造预知创建 ID。
- 有原 notice_id 时必须有合法对应快照；无原通告则无该快照。仅原 body 含版本/摘要时校验原 notice_version/notice_sha256，不注入页面最新值，不要求所有旧请求提供这两个可选字段。
- 原 body/key/version 的共享恢复与消费时机不改；错误关联回执经 uncertain 路径保留原 pending。没有执行新的业务请求。

| 实际 App POST 入口 | 当前回执关联覆盖 |
| --- | --- |
| /announcements | 本人创建、NOTICE/IN_REVIEW/v1、原 rule_id/notice |
| /qualifications | 本人创建、QUALIFICATION/IN_REVIEW/v1、原资格字段 |
| /submissions | 本人创建、SUBMISSION/IN_REVIEW/v1、原 body、接收方/父通告、允许的派生来源与原可选快照摘要 |
| /submissions/:id/decision | 原 id、本人接收方、原 version+1、decision/结果状态/case_id关系 |
| /records/:id/close | 原 id、本人所有者、原 version+1、WITHDRAWN/原 reason |
| /submissions/:id/notice-confirmation | 原 id、本人所有者、原 version+1、原 notice_version/notice_sha256 |
| /announcements/:id/revisions | 页面专用 _RevisionApi 与通用 restoreOperation 已关联原 notice ID、owner、base版本、原 notice/reason、IN_REVIEW；本轮未修改 |
| history/catalog/records 等只读入口 | 非 POST，不消费写回执 |

以上是当前实际入口覆盖，不为未知 future suffix 宣称已覆盖，也不把新建回执关联等同服务端回显原幂等键。两个正文完全一致的新建请求仍不能凭不存在的回显键区分。

接续静态 diff 仅新增 42 行的 /submissions 分支；未测试、编译、分析、格式化、提交或推送。前文摘要保留为前序冻结记录，当前累计 notices_api.dart SHA-256：`23dc842709bc5338a9ea884b955ddced69b2de98948ebda7cfa29c7914cebcb2`。
