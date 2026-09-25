# 第六阶段：队友怎样接报价、付款和退款页面

本侧负责服务器、数据库和支付结果核验；队友负责App及网页。以下16项新增接口已有实现和隔离测试，候选格式0.6.0-rc.1。真实支付尚未开通，不能展示成功收款。对方尚未审阅或联调。

## 从报价到付款

1. 商家提交商品规格：价格用整数分，服务档位、样片/成片时长、修改次数、交付内容、条款和版本必须明确。换价新建版本，不能覆盖旧版本。
2. 独立审核人员审核商品。商家按已发布商品生成报价，明确买方、每项数量、付款节点、币种、交易模式和采用的规则。
3. 独立审核人员审核报价；买方读取该报价，将返回的content_sha256原样提交确认，不能本地改价。服务器保存完整报价与合同内容；这表示内容封存，不表示已经签署。订单合同从本订单返回的data.contract读取，本阶段没有把它登记到独立合同查询接口。
4. 买方创建指定节点的支付尝试。支付宝返回App支付字符串；Apple返回商品编号及本次付款的appAccountToken。页面用对应SDK完成支付后，调用核对接口；SDK弹窗成功不等于服务器已经确认到账。
5. 页面读取订单financial和状态。UNKNOWN表示结果待核实，不显示失败后立即重付；PAYMENT_REVIEW_REQUIRED表示收到款项但存在过期或重复扣款等异常，应等待人工处理。
6. 退款按付款明细申请，独立审核后执行，再查真实结果。Apple执行仅表示等待用户通过StoreKit申请退款；没有伪造服务端批准退款。Apple现阶段只接完整退款；分摊退款、退款撤销等异常进入人工核对。

## 接口入口

统一前缀/api/v1/trade。除两种支付通知外，必须Bearer登录；普通写入必须Idempotency-Key。下面“本人/机构”指X-Acting-Party，当前仅其OWNER能操作。审核和退款执行用后台账号权限，不传机构身份。完整请求、返回和错误格式见[OpenAPI](../../contracts/openapi.yaml)。

|要做什么|方法与后缀|谁调用、关键条件|
|---|---|---|
|提交商品版本|POST /specifications|商家；明确规格，无默认价格|
|生成报价|POST /quotes|商家；指定买方与全部付款分配|
|审核商品、报价、退款或旧单|POST /records/{record_id}/reviews|独立审核；If-Match为当前版本带双引号|
|确认报价形成订单|POST /quotes/{record_id}/acceptance|买方；quote_sha256和If-Match|
|取消未付款订单|POST /orders/{record_id}/cancellation|买卖方；有付款结果未知时拒绝取消|
|创建付款|POST /payments|买方；order_id和installment_key|
|核对付款|POST /payments/{record_id}/reconciliation|买方；支付宝transaction_id=null，Apple为指定交易编号|
|申请退款|POST /refunds|买卖方；payment_id、明细金额和原因|
|执行已审退款|POST /refunds/{record_id}/execution|独立TRADE_REFUND权限；空JSON对象|
|核对退款|POST /refunds/{record_id}/reconciliation|买卖方；空JSON对象|
|登记旧单原始依据|POST /legacy-orders|TRADE_REVIEW；保留原金额与材料|
|列记录|GET /records?kind=ORDER&limit=20|买卖方各看自己的；审核账号可查全部|
|看一条记录|GET /records/{record_id}|每次重新检查权限；不使用缓存|
|读取旧单附件|GET /legacy-orders/{record_id}/evidence/{asset_id}/content|审核账号；仅本单关联附件，返回文件字节|
|支付宝通知|POST /notifications/alipay|支付平台表单；必须真实RSA2签名；成功返回纯文本success|
|Apple通知|POST /notifications/apple|支付平台signedPayload；校验JWS；成功返回accepted=true|

所有金额都是人民币分；暂不支持其他币种及兑换。报价的DIRECT_SUPPLIER表示商家本人供给，PLATFORM_PRINCIPAL表示平台作为交易主体；都必须明确审核，不能因此认定具备代收、分账资格。本阶段不执行自动资金划转。每个渠道只接当前配置的一个收款主体；其他主体配置不匹配时拒绝创建付款。

## 页面状态要说清楚

|服务器结果|页面应怎样说明|
|---|---|
|OPEN / PARTIALLY_PAID / PAID|待付款 / 已收到部分款 / 约定款项已收齐；收齐不等于制作完成|
|CREATED / SUBMITTING / PENDING|准备付款 / 正在提交或核实 / 等待支付结果|
|UNKNOWN|付款或退款结果待核实，先查原记录，不自动重新扣款|
|AWAITING_APPLE_REQUEST|等待用户在Apple流程中申请退款；不表示已退款|
|PARTIALLY_REFUNDED / REFUNDED|已核实部分退款 / 已核实全部退款|
|PAYMENT_REVIEW_REQUIRED / REVIEW_REQUIRED|金额已记录，但有异常待人工核对，不能直接继续交付|
|NEEDS_REVIEW / VERIFIED_REFERENCE_ONLY|旧单材料待审 / 已核对历史材料，仍不代表支付平台确认到账|
|503|服务未开通或暂不可用；保留当前记录并提示稍后核对，不显示成功|

同一Idempotency-Key重复提交会返回该请求所创建记录的**当前状态**；不能指望一直返回最初状态。相同键换内容会拒绝。付款和退款提交前先持久记录，服务器中断后不会盲目再发；SUBMITTING长期未变也必须先核对。

许可订单按许可费明细检查是否达到原许可条款约定的生效付款金额，不擅自改为全款，退款后阻止继续绑定/改稿。付款不替代签署、身份、权利范围核验；第五阶段证据审核仍须做。第七阶段未交付前，SAMPLE_ACCEPTED和FINAL_ACCEPTED付款节点保持不可用，页面不能自己声明验收完成。旧单只做保留和核对，不重新启用/api/pay或旧收据入口。

## 获取和自查

获取core/stage-6-orders-payments即可拿到本阶段及必要前置代码；不要逐个挑提交。先审第11→12→13→14份，再审本阶段；差异可用git diff ce576af...core/stage-6-orders-payments查看。本分支依赖未合入的第五阶段，不能误认为integration已经包含它。

在backend_server目录运行node scripts/test-mysql.js trade可独立验证订单模块；需按现有本机运行说明设置一次性MySQL测试环境。许可衔接另跑node scripts/test-mysql.js licensing。测试替换外部支付传输，不会扣费。接口格式运行虚拟环境Python scripts/validate_contract.py；实际返回另加--runtime-fixtures .local/trade-http-fixtures.json。

队友现在可以制作报价确认、订单金额、支付中/待核实、退款申请及审核页面，必须使用上述返回格式。真实SDK支付、Apple商品配置、联网回调和真实账户联调要等外部条件核验。本侧下一步完成第七阶段制作和验收，不需要队友修改数据库字段或调用服务器内部函数。
