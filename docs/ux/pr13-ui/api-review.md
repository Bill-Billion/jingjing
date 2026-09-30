# 作者与作品资料：接口核对

2026-09-29，基线 `ux/pr13-pages` / `1f6edd3`，已合入 PR13 后端 `318f263`；OpenAPI 为 `0.4.0-rc.1`。本批只接作者/机构供给资料、原作与新修订、私有材料及双审，不做数字人、本人同意或许可商品页面。

已逐项对照 `contracts/openapi.yaml`、`backend_server/src/http/supply-routes.js`、`src/modules/works/{repository,assets,version-policy}.js` 和已有供给专项测试。下文后端路径位于 `晶晶日上工程交接包/01_源码/`。这是静态接口核对；本轮实际联调和35项供给专项的验证结果另见 [启动器说明](test-runtime.md)。

## 接口及请求

路径共同前缀 `/api/v1/supply`；全部需要当前 PR11 Bearer 会话。成功均为 HTTP 200。JSON 封装 `{meta,data}`，`meta` 为 `request_id`、`actor:{account_id}`、`acting_party`；失败为 `{meta,error:{code,message,retryable,details}}`。下载例外，返回文件字节。

|动作|方法及路径|必要输入|
|---|---|---|
|上传私有材料|`POST /assets?purpose=…&media_type=…`|原始二进制，HTTP Content-Type 必须 `application/octet-stream`，1–8388608 字节；当前批次用途 `RIGHTS_EVIDENCE` 或 `WORK_CONTENT`|
|文件信息|`GET /assets/{asset_id}`|无 query|
|取回私有文件|`GET /assets/{asset_id}/content`|无 query；下载前后重验权限及字节 SHA-256|
|资料/版本列表|`GET /records?kind=…&limit=…&cursor=…`|本批 kind 为 `PROFILE` 或 `WORK_VERSION`；limit 默认20，1–100；cursor 是上次返回的 `next_cursor` UUID，不是账号接口的签名游标|
|单份记录|`GET /records/{record_id}`|无 query|
|新供给申请/补正|`POST /profiles`|`display_name` 非空≤120、`description` 非空≤2000、`evidence_asset_ids`、`previous_profile_id`|
|供给审核|`POST /profiles/{record_id}/reviews`|`decision`、`reason`|
|新原作/新稿|`POST /work-versions`|`work_id`、`previous_version_id`、`title`、`kind`、`source_version_id`、`project_id`、`content_asset_id`、`evidence_ids`、`credits`，九字段全部发送|
|作品送审/撤回|`POST /work-versions/{record_id}/actions`|`action:SUBMIT/WITHDRAW`、`reason`；送审可传 null，撤回必须非空≤1000|
|作品双审|`POST /work-versions/{record_id}/reviews`|`channel:RIGHTS/CONTENT`、`decision`、`reason`|

审核决定均为 `APPROVED/CHANGES_REQUESTED/REJECTED`，理由必须非空≤1000。JSON 请求上限64KiB。额外 query 或 body 键会被拒绝。ID 为小写 UUID。三种写入分类：

- 每个 POST 都带 `Idempotency-Key`；上传同样要带。
- 对已有记录做 actions/reviews 还须 `If-Match: "<object_version>"`，双引号不可漏。没有返回 ETag，使用响应体 `object_version`。
- 建新申请、新作品、新修订和上传不需要 If-Match。没有 PATCH；补正始终产生新记录。

允许的 media_type：`application/pdf`、`text/plain`、`image/jpeg`、`image/png`、`audio/wav`、`audio/mpeg`、`video/mp4`、`application/octet-stream`。它只是声明；下载统一为 `application/octet-stream`、attachment 文件名为 asset ID、`nosniff`，不返回公开链接。不要把文件当图片/HTML 内联执行，不假造服务器未保存的原文件名。

## 身份与审核权限

- 作者/机构模式：上传、申请、建稿、送审、撤回以及 records/assets 读取均使用 `X-Acting-Party`；必须是该身份的有效 **OWNER**。普通 MEMBER 不能因此阅读私有资料或稿件，通常返回403 `SUPPLY_PARTY_FORBIDDEN`。这与 PR12“成员+独立合同授权”不同。
- 账号停用、身份停用/关闭均拒绝；身份 `PENDING_REVIEW` 本身不等于停用。申请人的 AUTHOR 等业务 capability 不代替供给审核通过。
- 审核模式：列表、详情、下载省略 `X-Acting-Party`，按 `SUPPLY_REVIEW_PROFILE`、`SUPPLY_REVIEW_RIGHTS`、`SUPPLY_REVIEW_CONTENT` 授权读取。作品有任一对应审核权限即可看已提交记录，但只能提交自身获授通道的审核。
- 审核 POST 是账号级操作，不应发送身份头。路由没有使用该头决定权限；不能用伪造角色或请求字段提权。
- 审核员不可为原提交人，也不能是供给身份的当前有效成员。权属和内容通道相互独立；后端未要求两通道一定是不同审核账号，不能擅自加此门槛。
- 审核队列看不到 `DRAFT/WITHDRAWN`。不要假设只返回待审：已批准、补正或拒绝记录也可能在队列中，需要按状态/通道已有结论控制操作。
- 审核员不能凭猜到 asset ID 读取任意文件；文件须已关联其有权查看的记录。一个文件若同时关联其他可审记录，其可见性由那些实际关联决定，不能仅凭当前页面是草稿断言全局不可读。

## 创建原作及新修订

首次申请 `previous_profile_id:null`；以后填写该身份最新供给记录 ID。最新版供给资料必须 `APPROVED` 才能创建或送审作品；创建新的待审资料版本，会暂时使该身份不满足投稿条件，旧批准不能替代最新状态。

首次原作 `work_id:null,previous_version_id:null`；修订使用原 `stream_ref` 作为稳定 work_id，以及该作品**最新**版本 ID。不能因列表按 UUID 排序就取第一项为最新；需比较同一 stream 的 revision，并正确处理分页。

`kind:ORIGINAL` 的 `source_version_id/project_id` 必须显式为 null。`PROJECT_ADAPTATION` 虽在枚举中，但当前后端默认未接真实项目许可绑定，返回 `PROJECT_LICENSE_NOT_READY`；本批不提供可提交的改编入口。

标题非空≤200。正文文件必须当前 OWNER 身份的 READY / WORK_CONTENT 文件；创建请求 `SupplyWorkRequest.evidence_ids` 必须1–100项去重的同身份 READY / RIGHTS_EVIDENCE 文件，表单与写入必须非空。不可引用其他身份的私有文件。

`credits` 为1–30行，每行均有 `party_id`、`role`、`evidence_asset_ids`；角色为 AUTHOR/RIGHTS_HOLDER/AGENT，至少一名 RIGHTS_HOLDER。同一 party+role 不能重复；每行证据1–100项、去重、属于当前供给身份且为 RIGHTS_EVIDENCE，涉及的 party 必须存在。作者和权利人可以相同或不同，不强制冒充当前上传者。应让用户明确填写，不能从“登录成功”推定权利。

新修订不能改稳定作品的 owner、kind 或 project_id；有新 ID 和 revision，审核数组重新为空，旧版本原文和结论保留。

## 响应字段与状态

`SupplyAsset`：`id/owner_party_id/purpose/media_type/byte_size/content_sha256/current_status`，全部必有；成功状态固定 READY。不含 object_key、URL、文件名、已公证或存证结果。

`SupplyRecord`：`id/kind/stream_ref/revision/owner_party_id/created_by/current_status/object_version/data`，全部必有；没有 allowed_actions、created_at、显示名目录或商业许可结论。列表为 `{items,next_cursor}`。

|记录类型|data 形状|外层 current_status|
|---|---|---|
|PROFILE|`display_name,description,evidence_asset_ids,review`；review 初始 null，之后为 `decision,reason,reviewer_account_id,recorded_at`|PENDING_REVIEW / APPROVED / CHANGES_REQUESTED / REJECTED|
|WORK_VERSION|`version,credits`|DRAFT / AWAITING_REVIEW / REVIEWS_COMPLETE / CHANGES_REQUESTED / REJECTED / WITHDRAWN|

`data.version` 必有 `content,object_version,current_status,submitted_at,reviews,withdrawal`。**内层状态仅 DRAFT/SUBMITTED/WITHDRAWN**；外层 AWAITING_REVIEW 等是根据审核记录计算的页面进度，不可混用。

`content` 必有 `id,work_id,revision,kind,source_version_id,project_id,owner_party_id,title,content_asset_id,content_sha256,evidence_ids`。响应 `SupplyWorkContent.evidence_ids` 的正式声明为0–100项去重 UUID；与创建请求的1–100项约束不同，读 DTO 应允许空数组，不能因当前公开写入必须非空而收紧响应协议。`reviews` 最多两条，各有 `channel,decision,reviewer_account_id,evidence_ref,reason,recorded_at,version_id`。`evidence_ref` 是服务器生成的 `record:<版本ID>`，不是可供前端下载的 asset ID。`withdrawal` 为 null 或 `{reason,recorded_at}`。日期按服务器毫秒 UTC 字符串读取。

|操作|状态条件与结果|
|---|---|
|供给资料审核|仅 PENDING_REVIEW 可审一次；补正/拒绝后创建新资料版本，不能在原记录改结论|
|建作品|DRAFT，object_version=1，submitted_at=null、reviews=[]、withdrawal=null|
|送审|只能从内层 DRAFT 到 SUBMITTED，外层 AWAITING_REVIEW，版本递增|
|通道审核|内层须 SUBMITTED，每个 channel 只记一次；第二通道用第一通道返回后的新 object_version|
|双审完成|两通道均 APPROVED 后外层 REVIEWS_COMPLETE；只表示材料双审完成，不表示已授权、已售、已上架或已发行|
|补正/拒绝|有任何 REJECTED 则外层 REJECTED，否则有 CHANGES_REQUESTED 则显示补正；另一尚未审核通道仍可能记录独立结果。补正建新稿，不覆盖旧结论|
|撤回|任何未撤回版本可撤回，理由必填；已撤回不可再次撤回/送审/审核。历史其他版本不跟随撤回|

## 幂等、版本冲突和错误

同一操作重试保持原键、账号、身份、原文件字节/请求内容、原 If-Match。结果不明时不要新建键；修改输入不能冒充原请求。成功重放返回当时保存的结果，可能比当前记录旧，收到成功后应按当前上下文 GET 重新读取。不要把一次晚到的旧响应覆盖另一账号、身份、记录或新一轮请求。

|状态/错误|页面处理重点|
|---|---|
|400 INVALID_INPUT / INVALID_ID / MATERIALS_REQUIRED / RIGHTS_HOLDER_REQUIRED 等|检查字段、材料、版权参与方；按必填和真实类型提示|
|401 AUTHENTICATION_REQUIRED|当前会话失效；旧会话迟到的401不影响新账号|
|403 ACCOUNT_NOT_ACTIVE / PARTY_NOT_ACTIVE / SUPPLY_PARTY_FORBIDDEN|隐藏私有数据，不用其他身份自动重试|
|403 SUPPLY_REVIEW_FORBIDDEN / SELF_REVIEW_FORBIDDEN|审核权限不足或禁止自审；不显示审核成功|
|404 SUPPLY_NOT_FOUND / RIGHTS_PARTY_NOT_FOUND|对象不可见或权利参与方不存在；不泄漏别人的资料|
|409 SUPPLIER_NOT_APPROVED / PRIVATE_MATERIAL_NOT_READY / PREVIOUS_VERSION_MISMATCH|需要最新批准资料、当前身份可用材料或最新修订，不能沿用旧状态硬提交|
|409 IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS|原请求冲突/仍处理中；保持正确的原请求上下文|
|409 UPLOAD_RECONCILIATION_REQUIRED|上次上传不为 READY，不能换键盲目循环上传；提示核对状态|
|409 REVIEW_ALREADY_RECORDED / REVIEW_NOT_PENDING / WORK_NOT_DRAFT / WORK_NOT_SUBMITTED / WORK_ALREADY_WITHDRAWN|刷新当前状态，不能重开原记录的已完成操作|
|412 VERSION_CONFLICT / 428 EXPECTED_VERSION_REQUIRED|重新读取后由用户核对；不要自动将旧审核改用新版本再次提交|
|413 BODY_TOO_LARGE|JSON64KiB或原始文件8MiB限制；不是商品规格|
|503 SERVICE_UNAVAILABLE|实际存储、字节校验或服务失败；不得转公开链接或假 READY|

全部响应 no-store。供给页面不额外持久化私有正文、文件字节、证据清单或令牌，沿用已有会话管理；Vue 账号层已有 sessionStorage 会话存储，不能把这条供给页面要求表述为整个 UI 完全不保存令牌。下载 Blob URL 用后撤销。切换账号/身份/记录、失去权限或注销后清除旧内容。文件获取使用带 Bearer 的受控下载，不用无认证浏览器跳转 URL。测试至少覆盖正反权限、审核不带头、双审版本变化、旧响应丢弃、原请求重试、二进制上传及下载、最新资料未批准阻止投稿、新修订不继承审核、历史版不变。

## 前端接口适配的独立核对

2026-09-29，本轮只读检查已写出的 Flutter `lib/supply/supply_api.dart`、`supply_models.dart` 及其账号请求/会话依赖；Vue `src/api/modules/supply.ts`、共用 `client.ts`、`useSupply.ts`，并只追踪审核调用处的身份和版本参数。未泛扫仍在编写的页面，未重复35项后端专项或1255项协议检查，也未修改前端代码。

已对上的部分：

- 两端读取 `{meta,data}` 内的真实供给记录与文件元数据，使用 `content_sha256/current_status`，不依赖不存在的 URL、文件名、created_at 或 allowed_actions。
- 两端分别校验 WORK_VERSION 外层审核进度与内层 DRAFT/SUBMITTED/WITHDRAWN，并由实际通道结论核对外层状态；双审完成未被转换成商业授权成功。
- Flutter 本批供给 API 是 OWNER 操作，带 Bearer 与当前 X-Acting-Party。Vue 审核调用传 `partyId:null`，共用请求层省略身份头，按审核账号认证；写操作传原幂等键，记录操作的 If-Match 有双引号并取响应体 object_version。
- 上传发送原始字节、octet-stream 和 purpose/media_type query。Flutter 还比对返回文件大小、类型和本地上传 SHA-256；Vue 校验返回 READY 元数据、同身份、用途、大小和类型。非成功状态会抛错误，不会构造 READY 文件。
- 下载先获取有权查看的元数据，再带 Bearer 读取二进制；两端均检查 octet-stream、大小和 SHA-256 后才交付文件。JSON/HTML 或503不会当成正文文件。
- Flutter `all()` 与 Vue `loadAll()` 遍历游标并检测循环，供给最新修订须从完整结果中按 revision 选取；UUID 页序本身不表示时间先后，提交时仍由后端409处理并发新修订。

请求与响应证据列表的区别已重新核对：`SupplyWorkRequest.evidence_ids` 借用 `supplyschema005`，为1–100项；`SupplyWorkContent.evidence_ids` 响应明确为0–100项。两端读 guard 允许0项符合声明，应保留；表单和创建请求必须非空。先前要求收紧读 guard 的反馈已撤回，不属于待修问题。

已通知对应前端负责人修正并补针对性用例的事项（以下为发现时状态，不代表已验收修复）：

1. Vue `useSupply.runPending()` 先把全部409设为 blocked，遮蔽 `IDEMPOTENCY_IN_PROGRESS` 的未确认结果处理。该码必须保留原键和原内容供重试；不能经“结束核对”直接清空后换新键。
2. Flutter `denySupply()` 原实现未推进 session epoch，而二进制 readBytes 不使用 JSON 请求的 supply epoch。并行请求返回403后，旧下载仍可能通过代际检查返回字节；需要使这类旧下载失效，并覆盖“下载在途→收到403→旧字节晚到”的用例。

这是一轮独立接口适配自检，不等于另一位后端负责人的正式协议批准；该正式批准截至本记录尚未发生。修复后的测试和页面验收以对应前端记录为准。
