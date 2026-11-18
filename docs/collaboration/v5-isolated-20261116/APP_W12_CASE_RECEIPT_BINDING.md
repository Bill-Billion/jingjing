# W12 制作问题回执内容绑定

## 变更范围
仅 production/fulfillment_api.dart 与本文；修改前 API 已保存于库外 本轮改前库外副本。

- cases 写请求深拷贝实际 body，冻结版本、账号及主体，原 ProductionFulfillment 模型校验仍先执行。
- 成功回执必须包含 created_by 为原账号、opened_by_party_id 为原主体，kind、reason、evidence_asset_ids 与实际 command body 一致的问题。
- 恢复前冻结 pending body/version/key，读取当前 fulfillment 后再次检查原身份及 pending 未变化/消失。通过后送原 body/version；AccountApi 按原 fingerprint 复用原 key，不传入新的 key，也不以新视图版本替换原版。
- 不匹配使用 productionRequire 的 INVALID_PRODUCTION_RESPONSE（503、uncertain=true）；在 write validator 内失败会走 AccountApi 未知分支，保留原 pending，而非让页面清空输入报成功。读取后发现 pending 被替换则停止，不覆盖它。
- 非 cases 动作保持原请求内容与恢复语义，仅按文末续批增加回执版本下界；未修改共享 AccountApi 或后端。

## 后端静态依据与边界
- modules/production/customization-policy.js:20：证据数组去重校验但不排序。
- modules/production/customization-workflow.js:35–38：原 kind/reason/evidence_asset_ids 直接存入问题 data JSON，created_by 使用 actor.id、opened_by_party_id 使用原 party；读取 cases 原样解码。因此证据采用原顺序精确比较，不改为集合，不调整请求指纹。
- 同文件 :8–10：幂等 command 之后返回当前 project/flow/cases view，而非原操作的历史响应。
- 同文件 resolveCustomizationCase 保留 c.data 原内容并增加 resolution；因此回执不要求问题仍 OPEN、flow 仍 PAUSED，也不要求 exact version == 原版+1。已被处理的问题仍可核对原内容。
- 问题没有返回 operation key；存在同账号、同主体、完全相同历史内容时，本补丁不能据此唯一认证具体操作。这里只做现有契约可提供的内容绑定，不宣称 operation-key 回执证明。
- production_models.dart:29–32 与 account/account_api.dart:322–347：校验先于 pending 清除；uncertain 校验失败保留原请求。

## 核对范围
静态查看源码与局部 diff，git diff --check 无输出。未运行测试、编译、格式化、业务请求、浏览器或推送。真实错误回执、已解决问题的幂等恢复、身份切换和原 key 复用待同事验证，不列为已验收。

## 互审追加：版本下界
- cases 回执额外要求 result.version > 原 commandVersion，拒绝原版本或更旧视图；仍不要求 exact version 或特定当前状态。
- 后端 production/repository.js:33–35：match 校验原 expected_version；save 将 project.object_version 加 1；command 仅在事务内 fn 成功后保存 result_id，重放读取当前记录。customization-workflow.js:10–11,35–38：新增问题必经 changed → save，返回当前 view。故成功新增及其后续幂等恢复均必须大于原版本。
- 这是原请求版本下界与内容绑定，不消除完全相同历史内容的歧义，不宣称唯一 operation key 证明。仅静态核对，未运行测试。

## 续批：其他 fulfillment 动作版本下界
- 在既有模型校验之后，delivery-receipt/refund-sync 要求回执版本 >= 原 commandVersion；start/reissue 要求 > 原 commandVersion。保留 cases 内容绑定、严格下界及原 pending 冻结不变。
- customization-workflow.js:54,55–71 的退款同步及收讫可在已完成时合法不增版；:34,73 的开工和重发必经 save 增版。所有动作仍按 :10 返回当前 view，而不是固定历史响应。
- 不绑定当前 status、receipt、version_id、notified_at 或退款金额；后续问题/重发/自动验收可清空或替换 receipt，实际退款可继续变化。仅拒绝不满足原命令版本下界的回执，不声称唯一操作证明。
- manual sample 没有改动：customization/repository.js:65–78 返回保存的 result_json 历史响应，所以其已存在的原版本 +1 校验仍合理。
- 没有新建 start/reissue App 角色入口，保留既有网页分工。未改共享恢复层或后端。
- 静态局部 diff 核对及 git diff --check 无输出，未测试、编译、格式化或推送。
