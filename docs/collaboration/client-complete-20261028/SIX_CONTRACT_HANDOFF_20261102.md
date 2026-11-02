# 六项合同补齐：前端要接什么、怎样验收

2026-11-02。后端负责人 **chengcongcong222**，前端负责人 **Bill-Billion**。接口候选 **0.31.22-rc.1**，数据库迁移 **0201**；沿用PR39，准确提交和上传事实见[本轮记录](../../tasks/records/CORE-six-contract-tasks-20261102.md)。不要从旧integration单独运行这些页面。

用户已经确认转发此前版权/商用任务；不代表前端已认领。本文件是本轮新增交接，是否转发、认领和交付要另记。无需重做已交付的恢复、付款、认证免费及商单分成页面。

## 页面任务与分工

|事项与原业务组|用户需要办成什么|前端现在需要接什么|怎样算通过|
|---|---|---|---|
|机构7日交接；2/10/11|解除关系后知道哪些旧订单还要交接，双方能确认；不能再接新单|关系详情展示交接截止、旧单清单、双方确认、逾期；旧单会话显示到期、撤权和已交接的拒绝原因|本人和机构分别确认；无权机构不能读；撤销本人授权或满7日后不能继续沟通；旧收入不变|
|现货/试镜48小时；1/11|看清具体何时开始、何时截止，不把下单、付款和交付混为一谈|显示服务器的acceptance_started_at/deadline_at和原单规则；新规则明确CONTRACT_20261029，旧单继续原规则|新现货从下单计48小时，但未付款/文件不可用/争议不自动结算；试镜从交付审核通过计48小时；重开页面不能重置时钟|
|直推10–15%；11/15|知道这笔推荐使用哪一版比例，旧收入不被改写|配置及审核界面显示四类直推费率和版本；新版本限制1000–1500基点；旧5%记录照旧展示|0/5/16%新规则拒绝，10/15%通过；不允许用旧规则发新合同推荐；服务额度不叠加规则沿用|
|监护工具及退款；2/4/13|监护人申请关联、孩子确认、独立审核后管理时长/消费/内容，申请信息处理和未成年退款|新增监护管理、孩子确认、独立审核、时长/休息提示、一键关闭、已审核内容预览、单笔消费同意、隐私请求和退款进度|其他家庭不可见；未审核/到期/撤销不可代办；孩子不能关限制；未经审核的公共内容及真实付费仍不能进入；申请已提交不显示已退款或已删除|
|核验后注销期限；4/13|区分“收到申请后答复”与“核验通过后执行”；看得到延期原因和实际完成|个人页展示两个期限；运营核验提案、独立复核、延期及完成核对；运营逾期/待审列表|核验前不假倒计时；15工作日日历冻结；延期保留原期限；无真实执行结果不能显示完成|
|侵权通知/反通知；9/10|投诉双方分别提交材料、看获准送达内容和处理结果|投诉发起、补件、反通知、送达已读；运营冻结、送达脱敏材料、提出处理、独立复核；受限内容提示|未送达的对方原件不可读；内部意见不泄露；两个冻结依据只解除一个仍不可下载；撤回投诉不能直接恢复内容|

## 接入顺序

1. 保持当前版权/商用两批的实际开发顺序；先确认各自认领，不把已转发当已完成。
2. 本轮先接交接期、48小时、直推、注销期限四项。这些可复用现有关系、订单、规则和隐私页面。
3. 再接监护与侵权两个完整流程。每条流程同时交个人/机构实际需要的页面与运营处理页，不能仅交一个入口。
4. 一批提交后，由后端负责人合并同版做完整办理；记录同一账号/身份/订单/文件编号、预期、实际、失败重试和刷新恢复。

前端这六项沿此前估算51–90人时排队，非工期承诺，不含版权/商用原待办、所有整链和真实SDK；认领后可依据页面复用程度重估。后端不等前端完成才核财务或准备模拟资料。

## 接口和权限

完整请求与响应以[OpenAPI](../../../contracts/openapi.yaml)为准，以下是寻找入口的说明。所有写操作保留原Idempotency-Key；需要版本的操作发送If-Match为当前object_version，不能刷新后自动换键重做。个人监护、隐私和运营操作不带X-Acting-Party；交接及侵权当事人接口必须带当前获准身份。运营不是任选一个机构身份。

- **交接**：GET/POST /api/v1/gigs/relations/{record_id}/handover。GET可分页，POST为order_id、note；只确认交接，不改付款或结算。双方确认后机构旧单沟通结束；到期仍可补交接记录，但不会恢复权限。原订单人格授权继续独立核验。
- **48小时与直推**：沿现有商品、试镜方案、成长规则及订单接口；新增acceptance_policy、referral_contract_policy。返回的是订单自己的快照，不能按客户端全局常量覆盖。
- **注销**：GET /api/v1/privacy/requests/{request_id}/closure-clock，运营在/operations/requests/...读写。proposals支持VERIFY/EXTEND/COMPLETE，reviews支持APPROVE/REJECT；提议人不能复核。GET /api/v1/privacy/operations/closure-clocks?filter=ALL|OVERDUE|PENDING用于待办提醒。不主动发收费短信。
- **侵权**：/api/v1/infringement/cases及/operations/cases。动作见OpenAPI；补件要求在information_request，内部history不发给对方。送达仅表示内容已进入对方获准记录，ACK_DELIVERY后才有read_at。没有送达回执不显示“对方已读”。联系人默认不转交，证据仅转交运营逐项选择的部分。24小时是可配置运营响应目标，不是法律自动裁决期限。
- **监护**：/api/v1/guardians/links创建关系；/records查看和确认，/operations/records独立审核。链接下controls、usage、sessions、content、information、spending-consents、privacy-requests、refund-requests分别办理。/records/{record_id}/refund把已核实申请送入原单退款流程；actual_refund_status跟随真实钱账状态，不能把REFUND_REQUESTED显示为退款到账。

监护记录data按kind区分：LINK为关系/规则/controls/审核；SPEND为amount_minor、purpose和real_payment_allowed=false；INFORMATION为privacy_request_id、actual_privacy_status、response_due_on；REFUND为payment_id、allocations、审核、refund_id和actual_refund_status。孩子不收到监护证明和原始审核材料。查询只给必要目录，不代读私人故事。

## 新规则发布与真实服务边界

|配置|本轮默认|启用前必须具备|
|---|---|---|
|ACCEPTANCE_CONTRACT_POLICY|LEGACY_COMPATIBLE|已审核新48小时规格/试镜规则及同版页面，切CONTRACT_20261029后拦截旧规则新售；历史订单不改|
|REFERRAL_CONTRACT_POLICY|LEGACY_COMPATIBLE|成长直推规则与订单分账规则均审核且比例一致；切CONTRACT_20261029后发布/新归因受保护|
|PRIVACY_CLOSURE_POLICY|LEGACY_COMPATIBLE|新注销执行方案要求先审核核验起点；已有方案保留原约定|
|GUARDIAN_CONTENT_POOL_ENABLED|false|已审核guardian.protection限制规则及guardian.content-pool适龄预览名单、前端同版验收；本轮仅隔离合成资料开启检查|
|INFRINGEMENT_RESPONSE_TARGET_HOURS|24|运营可调整未来新案目标；旧案已记录的时间不随配置改变|

未满14岁的实际处理仍关闭；未成年人实际人脸/声音采集、建模、经营/充值/抽奖/投票/投流及普通成人内容目录仍禁止。内容池只提供独立审核名单中的预览，不提供付费完整文件。每次访问重新检查关系、时段、权利、冻结和文件字节。消费同意只是监护记录，**不解锁付款**。

## 需求来源与实施补全

原文见[六包差距表](CONTRACT_GAP_AUDIT_20261102.md)和[本轮记录](../../tasks/records/CORE-six-contract-tasks-20261102.md)。一分钟使用时段预留、双方交接确认、独立复核、补件恢复、内容名单、原键重试等是实现补全，不冒称甲方逐字指定。时长、消费额度没有擅自填成正式默认，来自独立审核的版本化规则；测试数值仅为合成资料。

昆山API仍未到，真实联调前向用户索要；OSS上线前最后购买测试。本轮不部署甲方网站，不调用真实短信、支付或模型。

注销结案接法：先完成实际关闭/删除等执行，再提交并独立审核保留依据说明（原回复接口的 RETENTION_EXPLAINED，remaining_actions 为空），最后提出和独立审核 COMPLETE。ACCOUNT_CLOSURE_REQUESTED 是仍有执行事项的申请回复，不能用空待办伪装完成。COMPLETE 另查实际账号已关闭、执行已完成、必要删除和备份处理结果；原回复状态不替代该检查。
