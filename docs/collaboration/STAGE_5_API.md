# 第五阶段：页面怎样办理选本、许可和项目使用

本侧交付服务器接口；队友开发App及网页。本说明是候选0.5.0-rc.1，须交叉审阅。完整字段以contracts/openapi.yaml为准，不读取数据库字段推导页面格式。

## 调用入口和顺序

接口统一以`/api/v1/licensing`开头。使用第二阶段真实会话Bearer令牌。业务方选择其本人或机构负责人身份，传`X-Acting-Party`；审核接口使用明确授予LICENSE_REVIEW的账号，不从客户端接收管理员角色。所有写入带`Idempotency-Key`，变更已有记录还带`If-Match: "1"`等原版本。

|用户要做什么|方法和路径|谁调用|
|---|---|---|
|创建新的许可商品/价格版本|POST /products|已审核作品的供给负责人|
|审核商品、外部证据或阅稿依据|POST /records/{record_id}/reviews|独立核验人员|
|下架商品、取消预留、撤销阅稿|POST /records/{record_id}/closures|对应记录的负责人|
|预留权利并保存当时合同|POST /reservations|买方负责人|
|提交外部签署及付款材料|POST /evidence|买卖任一方负责人|
|条件齐备后发放许可|POST /reservations/{record_id}/activation|独立核验人员|
|有权利争议时暂停后续使用|POST /grants/{record_id}/suspensions|独立核验人员|
|建立项目的用途记录|POST /projects|买方负责人|
|分配许可的项目额度|POST /grants/{record_id}/bindings|许可接受方负责人|
|申请指定人、有期限的阅稿|POST /readings|供给负责人|
|查看商品目录或己方记录|GET /records?kind=PRODUCT&catalog=true|已登录并选定身份；其他类型按己方/审核权限查询|
|查看单份记录与历史合同|GET /records/{record_id}|买卖双方或获准核验人员|
|受控阅读|GET /readings/{record_id}/content|授权中指定的账号及身份|
|读取本记录关联的审核材料|GET /evidence/{record_id}/assets/{asset_id}/content|核验人员|

`kind`还可选RESERVATION、EVIDENCE、GRANT、PROJECT、BINDING、READING。列表带limit和下一页cursor；当前数据和审核流程应以重新读取的返回为准。400是字段不完整或格式错误，403/404表示没有权限，409表示条件冲突或未满足，412表示版本过旧，428表示未传版本，503表示存储或数据库等暂不可用。失败不能在页面上显示成功。

## 商品与合同如何填写

商品引用第四阶段已完成权属和内容双审的原作版本、已经生效的规则版本。填写标题、经过人工核验的短试读、明确定价、取得许可前应付金额和预留时长。字段price.amount_minor及payment_due_minor均是整数最小币种单位；后者必须在0与总价之间。没有默认首款比例。

terms必须完整提供：exclusive；rights；purposes；territories；languages；valid_from、development_until、valid_until；project_limit、episode_limit；terms_text。权利分别包括改稿ADAPT、制作PRODUCE、发行DISTRIBUTE、宣传PROMOTE、续集SEQUEL、AI处理AI_PROCESS、训练AI_TRAIN，不互相推导。用途PRIVATE、PUBLIC_SHARE、COMMERCIAL、RELEASE分别处理。地区使用双方核验的两位国家代码或WORLD，语言使用两位代码或ALL；不支持自动解释省市范围、模糊语言或自由文本法律条件，复杂情况须先人工整理成可表达且有依据的条款。

两项许可在同一作品、权利类型、用途、地区、语言及期间重合，且任一项独家时，系统拒绝冲突预留。作品换版本不换权利来源。人工审批不能绕过明确冲突；系统也不会根据“独家”自行增加发行权。商品新版本用previous_product_id关联旧版本；下架不改写已有许可。

预留由服务器按商品的reservation_minutes计算截止时刻，客户端不能延长。到期不占新预留；迟到的生效请求转人工补救状态，不直接重新抢占已经售出的范围。涉及退款/重签的后续处理归交易与争议流程，不能把补救状态显示为已取得许可。

## 外部材料怎样才算核验通过

预留会保存不可变合同、规则和价格。合同中的SEALED/NOT_SIGNED只表示保存文本。买卖双方将真实外部签署、身份核验及约定付款材料作为第四阶段私有证据上传，再提交与contract_sha256匹配的材料引用。审核人员可读取仅本记录关联的文件。

批准EVIDENCE时必须填写verification：signed_contract_sha256、identity_verified、seller_signature_verified、buyer_signature_verified、currency、received_minor、payee_party_id、receipt_ref。核验人员应逐项核对真实签署方与约定用途、收款方、金额、币种和凭证编号，未核对不得填true。付款条件为零时允许付款附件/凭证为空，但签约和身份依据仍须核验。实收不能少于约定生效金额或超过本商品总价。同一收款方、币种、凭证编号只能用于一份许可；不能更换凭证编号重复使用同一笔实际收款。

系统记录EXTERNAL_MANUAL_REVIEW及NOT_REPORTED：这是外部事实的人工核验，不是自动支付成功或电子签供应商验签。权限只能通过已有受控维护工具授予；没有给真实账号自动授权。所有证据、审核、发放和操作记录保留，关键写入失败全部回滚。

## 阅读、项目与改稿

受控阅读的申请指定真实账号、所代表身份、截止时间以及NDA/评估授权文件，独立人员批准后才开放。当前只渲染UTF-8纯文本，按段嵌入读者账号、授权记录和读取时刻；其他格式明确不支持，不跳过水印返回原文件。每次重新核验权限并留下访问记录，禁止缓存。不承诺阻止截屏或人工复制；前端必须把返回正文作为纯文本展示，不能作为HTML执行。

阅读不授予生成、训练或发行。数字人形象/声音同意仍独立管理，剧本许可齐全不等于数字人能生成。

项目记录明确title、purpose、territory、language、episodes；与许可用途和开发期限核对后分配一个项目额度。项目用途不可原地改写；本阶段不开放释放额度后再次使用，避免绕过使用次数。绑定成功后，第四阶段`POST /api/v1/supply/work-versions`可提交PROJECT_ADAPTATION；其source_version_id、project_id、所选身份必须与有效绑定一致且包含ADAPT。未绑定、已暂停或已过开发期时拒绝。

current_status是已记录的业务状态，日期决定当前能否使用；例如ACTIVE不能覆盖valid_until及development_until检查，HELD不能覆盖expires_at。服务器在每次实际使用时重新判断；页面须展示截止时间，不能只凭状态字样显示永久可用。完整制作订单、真实支付、退款、供应商生成、发行与结算在后续阶段继续建设。
