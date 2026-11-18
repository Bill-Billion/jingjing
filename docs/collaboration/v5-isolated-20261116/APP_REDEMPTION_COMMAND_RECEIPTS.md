# Redemption 原动作回执统一绑定

## 幂等语义已静态核实
backend_server/src/modules/redemption/context.js:37–41 的 C.command 将首次fn结果JSON保存到redemption_commands.result_json并存摘要；重复key校fingerprint及摘要后直接JSON.parse旧result_json，不重读当前业务记录。http/redemption-routes.js 的POST reply直接输出repo结果，无当前view替换。因此本次confirmation/release/bind状态约束针对历史动作回执，不要求当前记录永远保持该状态。服务端权限前置及其他拒绝保持原样。

## 实施
仅redemption_pages.dart新增commandAct：首次提交前JSON深拷贝原suffix/body，沿原act/version/reload，validate中统一绑定；恢复validateResult仍读取原recoverySuffix/body，不读新表单。保留既有checkout/draw形状、摘要及关联校验。

统一映射与后端依据：
- exchanges：GRANT.parent_id=stock_id，data.template_sha256=原hash；repository.js:8,54–60。
- service-credits：GRANT.parent_id=stock_id，data.cocreation_benefit_id=benefit_id；service-credit.js:20–24。此动作可能返回同源已存在权益，不强制AVAILABLE。
- grants/id/bind：同id GRANT/BOUND，binding person/avatar/profile及cast内容摘要等于原body；fulfillment.js:27–37。
- grants/id/confirmation：同id GRANT；accepted=true历史回执CONFIRMED且有confirmed_at，false为BOUND且delivery=null；fulfillment.js:63–69。
- grants/id/remedies：新REMEDY.parent_id=原grant，data.reason=原reason，不能按原grant id要求；fulfillment.js:83–92。
- holds/id/release：同id COUPON_HOLD/RELEASED；checkout.js:34–38。

不新增请求字段、不改原key/If-Match/pending、不补HOLD读取、不扩运营排期入口。communityRequire仍以503 uncertain失败；account_api先validate后消费pending，错误回执继续保留原请求。未修改后台权限。

## 交接
已库外备份，保留本轮前批源码与布局增量。仅源码和diff静态复核，未测试、编译、分析器、格式化、浏览器、推送。待同事整批验证每类正常首次/历史回执重试、合法形状但错关联回执及pending保留；本文不是运行验证。

源码SHA256：`5f3b6bebe2a2a7718e64841891a2435e47abe00110c17c9b3d429644373f0be2`

## 互审补充：原所属身份绑定
所有本页写动作回执统一核owner_party_id。首次commandAct在等待前捕获api.party(false)；恢复由原pending fingerprint[1]核等当前有效acting party，再传校验。CommunityApi.write在validate前后核原epoch/party，AccountApi请求范围包含token/party，不从表单取owner。

契约：repository.issue以传入party为GRANT.owner；exchange传i.party_id；service-credit先核benefit.owner等于i.party_id，issue同party，已存在grant源也是此benefit；lottery.draw以i.party_id建DRAW；checkout以i.party_id建HOLD且release核h.owner；fulfillment own明确r.owner等于party，bind/confirmation保存原owner，REMEDY继承r.owner。context.save保留owner。

这是客户端错误回执防御，不是已证实服务端越权漏洞。未改变服务端授权、原body/key/If-Match或pending恢复，不增加测试结论。
