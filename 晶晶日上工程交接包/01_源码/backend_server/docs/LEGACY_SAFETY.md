# 旧付款、实名和查询：当前怎么处理

本轮先修复三类可以直接伪造业务事实或读取他人数据的问题。它们仍是旧SQLite路由的安全修复，不是把旧业务迁入MySQL，也不是完成真实支付或实名接入。正式数据库方案仍为MySQL8，旧应用生产启动限制不变。

## 页面会看到什么

|入口|新的行为|为什么|
|---|---|---|
|样片意向金、制作款按钮|自己的订单返回503及PAYMENT_NOT_READY，不改付款标记或步骤；别人订单404，未登录401|客户端点击不能成为已付款证据|
|旧通用付款、支付宝下单、Apple票据入口|返回503、未启用，不返回演示付款成功|旧接入未绑定新的验证记录，填写密钥也不等于能启用|
|旧微信/支付宝付款通知|返回503及fail，不记成功、不推进订单|未完成新通道准入、验签和业务对应的验收|
|旧通用退款和付款确认服务|默认在修改业务数据前拒绝；没有自动模拟通道|测试用的成功不能写进业务运行环境|
|个人实名提交|返回503、pending、verified=false、submitted=false；本次不保存证件或调用供应商|未启用时不批准，也不把未受理说成已提交|
|企业/MCN资料提交|仍可保存为待人工审核，明确verified=false|提交材料不等于核验通过，后续审批权限另做|
|旧实名状态、钱包实名标记|不再报告已核验，旧approved在响应中为pending；recordedStatus保留历史含义|旧表没有保存核验来源与证据，无法区分自动放行和真实结果|
|旧绑定收款账户、提现、人脸核身|明确未启用，不用旧的已实名布尔值放行|这些动作依赖可信实名，不能绕过上述限制|
|旧付款查询|只能查自己的对应业务单；其它用户或泛化admin角色不能绕过，统一404；支付宝查询逐条按buyer_id过滤|避免查到他人流水或同号订单的其它付款|

付款查询不再顺带请求供应商或更新订单。对于旧付款数据，响应status为unverified，paid/paymentVerified为false，recordedStatus保存原状态；这表示尚未核实，不是断言历史上没有付款。金额单位沿用旧接口：通用流水amount为元，支付宝amountFen为分。新正式接口的金额规则另按已约定格式执行，不借本轮改掉旧接口单位。

## 历史记录与启用条件

没有批量删除、改写或重新认定任何旧记录。旧表中的已付、已批、已退款不自动升级为真实业务事实；后续需结合原始凭证和明确提供的脱敏样本，逐笔/逐人分类。其它旧业务页面可能仍显示历史状态，不能据此恢复交易或认为整套旧业务已验收。

真实服务接入要在新的MySQL业务模块中完成：权限、业务与支付单绑定、服务环境验证、幂等、金额/回调核对、身份结果与证据保存、失败恢复一起检验。不能只删掉本轮拦截中间件或打开旧环境开关；不能把本轮关闭的入口视为永久取消产品范围。支付宝旧参考逻辑仍保留在被拦截的处理函数中，供迁移时查阅，当前不可达。

旧退款算法保留用于隔离核算测试。`createPaymentService`可由可信代码显式注入测试用供应商；应用使用的默认实例没有供应商，任何环境都拒绝。没有HTTP参数、环境开关或自动回退可选中测试替身。当前只有测试文件显式注入替身，不能称为真实退款已经验证。

个人证件未启用时仍不保存；第二批已修加密配置和失败处理，旧密文实际迁移仍待后续任务。新运营权限、MCN邀请确认、完整财务、已签合同与证据都仍须按各任务建设。

## 验证方法

在服务器目录执行`npm run test:legacy-safety`，使用真实HTTP路由、JWT和一次性SQLite测试数据；供应商是显式测试替身，外部网络被拦截。覆盖两阶段付款、重复点击、无登录/跨用户、历史订单类型、同号冲突、未知类型、孤立流水、管理员角色绕过、混合付款归属、只读查询、不受理证件、保留历史、依赖实名的入口及默认支付/退款拒绝。

原有退款全退/部分退/重复请求等核算测试继续保留，但供应商成功由测试文件明确注入，不再由运行环境自动选择Mock。完整`npm run test:ci`同时运行MySQL、后台任务、外部服务基础、新专项和原有回归。

四个历史自测脚本仍期待自动批准或演示付款，本轮已让它们在加载服务前明确退出：aliyun_compliance_selftest、volc_compliance_selftest、verify_pay_skeleton、pay_sandbox_joint_test。不要据旧脚本要求恢复不安全行为；它们的源文件保留，当前验收以新测试为准。

本轮没有修改客户端。App/网页需把503显示为“未启用/未受理”，把unverified显示为“历史记录待核验”，不得自动切换演示成功。接口输入输出的共同影响须由队友检查，见本轮共同修改说明。

## 第二批：样片、加密、剧本摘要与交付

2026-09-22新增SQLite迁移006，只补sample_library.video_url与scripts.digest_kind两列，允许历史空值，不重写旧迁移或历史摘要。样片库查询无视频链接时返回video_url=null。正式业务仍以MySQL8为目标。

FIELD_ENC_KEY必须是正好32个UTF-8字节，不设默认、不截断。生产应用启动缺配置即失败，开发环境显式填写的错误配置也在启动时拒绝；开发未使用敏感字段可无配置，但加解密操作始终要求有效密钥。密钥按进程固定，更换需重启与明确迁移方案。兼容原iv:tag:ciphertext的有效AES-256-GCM格式；格式错返回FIELD_CIPHERTEXT_INVALID，认证失败返回FIELD_DECRYPTION_FAILED，不吞为空值。错误不含原密钥或密文。历史长密钥曾被截断，须人工核对其实际字节后再制定换钥，不默认替用户截断或重加密。

剧本上传和自己的投稿列表不再返回可被误认为第三方证据的evidenceHash（改为null）。新上传返回submissionDigest、digestScope=submission_metadata、evidenceStatus=not_verified和trustedTimestamp=false。摘要只覆盖固定JSON字段title/synopsis/fileUrl，不覆盖文件字节，不是版权证明或可信时间戳。存入旧evidence_hash字段同时记digest_kind=submission_metadata_v1；历史值原样保留。自己的列表用recordedDigest显示原记录，新记录另有submissionDigest；历史digestScope=legacy_unclassified、submissionDigest=null，即便有旧交易号也不能据此报已验证。

GET /scripts/browse登录后返回503 SCRIPT_READING_NOT_READY，不返回他人剧本。POST /samples/:id/deliver、/videos/deliver/:orderNo、/endorsement/deliver/:orderNo登录后返回503 WATERMARK_NOT_IMPLEMENTED、status=not_enabled、delivered=false；未登录仍401。这是统一暂停入口，不读订单，所以不会泄露是否存在该订单。保留原交付函数供后续迁移参考，目前不可达。

embedBlindWatermark始终success=false、watermarkId=null；verifyBlindWatermark始终verified=false且明确未启用，不能把它理解为“已验证该文件没有水印”。环境配置无法开启占位逻辑。AI生成任务的成功或审核通过仅表示相应生成记录，不能作为真实标识处理或订单交付证据；历史交付状态没有批量改写。后续需完成真实文件处理、权限、证据和验收，才能恢复交付。

## 第三批：MCN合作和历史结算

机构申请只保存pending材料，不写个人身份、不附带免费期承诺。旧添加/移除艺人、名单/收益/导出/排名暂返回503 MCN_CONSENT_NOT_READY；机构概况仅本人可读，历史状态以recordedStatus保留，verified=false，talents=[]且cooperationStatus=not_enabled。空列表不代表没有历史关系。

批量出款返回503 MCN_PAYOUT_NOT_READY、submitted=false，无假编号或到账承诺；粉丝画像返回503 MCN_ANALYTICS_NOT_READY，无编造统计。祝福视频与代言视频旧验收返回503 LEGACY_SETTLEMENT_NOT_READY、settled=false；内部旧结算调用也失败，避免历史未核验关系继续分佣。未登录均由原登录校验拒绝。

历史身份、关系、订单和钱包没有批量改动，旧代码保留在Git历史。本轮不建新表，完整邀请本人确认和权限模型在下一项MySQL工作中实现。不得只删除拦截恢复旧授权；新成员身份也不能自动授予作品许可、读取全部历史收入或代收款权。待另一方实际检查身份、数据访问及结算变化，尚未批准合入。
