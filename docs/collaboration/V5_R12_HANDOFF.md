# 第12轮交接：出演谁、怎么付报酬、发行后怎么分收入

2026-10-20。本侧负责服务器、数据库和主要测试；队友负责App与网页，未代其认领。完整分支 `core/v5-r12-participation-release`，目录 `worktrees/full-flow`，起点950be95。前11轮所需订单、真人与形象、制作、权益和财务代码都包含在本分支；共同版本integration仍为28662ab，不能只摘本轮提交放进旧版本运行。上传、检查、审阅及合入以[当前进度](../status/CORE_CURRENT.md)为准。

本批交付参演约定和发行收入的后端，并完成30个工作包、133条原始验收项的缺口登记。第12轮的整体验收仍未结束：[全范围核对](../reviews/v5-r12/FULL_SCOPE_REVIEW.md)。代做样片仍缺代码，剧本供稿关闭限制待核验，页面、真实服务和旧库迁移分别待验；没有删掉这些工作。

## 用户按什么顺序办事

|办什么事|操作顺序|怎样算办成|
|---|---|---|
|确定出演人及形象|出品方选择报名，艺人确认；再填写具体真人、数字人造型及声音版本|报名或试镜成交不等于允许出演；必须有相应本人授权|
|商定出演条件|艺人提交约定及私有合同材料，写明用途、地域、语言、期限、独家性、报酬及未来收入|独立运营审核；相关各方确认同一份内容，不冒充平台已经完成电子签|
|支付当期报酬|出品方按已确认约定生成订单，按合同约定节点付款|开工所需款项到达后才允许开工；其他节点先由出品方确认成果；重复点击只产生一个订单|
|没有固定报酬，只约定未来分红|明确签订分红约定，再进入项目计划|不生成0元付款，不把未来预期收入当已支付|
|制作和会签|项目计划引用参演约定，指定相关确认人；成片前核对当期报酬已付清|角色、造型、声音、合同变化后旧确认不能继续用|
|换角或重做计划|出品方提交原因和私有证据，将项目退回准备|旧计划/成片保留，新计划重新确认；已付款合同不能静默撤掉，须先处理售后或合同变更|
|提交发行|成片会签完成、渠道审核通过，提交内部审核，再登记外部结果与凭证|内部审核只表示可以提交；有独立审核的外部发行凭证，才记已发行|
|分配发行收入|登记渠道账单，再登记实际到账，独立财务审核并由相关方确认|未来分红按已确认参演合同和实际净到账计算，与出演报酬分开；记应分配不等于银行已打款|

独家检查只列出同一形象、地域等结构化条件下的潜在冲突，由人复核合同；不自动给法律结论。当前22%规则用于当期商业报酬，未来发行收入按各方明确约定，不能再套一次报酬分佣，也不能把分红比例乘到制作款上。

重新准备项目时，内部待审或待提交的发行记录退回修改，原始内容与操作历史保留；已送到外部渠道但尚未回结果时阻止重新准备，先核实渠道结果。已经发行的历史状态和财务收入保留，不伪造撤回。向同一渠道重新申请仍须走原有前次申请关联和外部撤回规则。

## 队友可直接接的页面与接口

统一文件 `contracts/openapi.yaml`，版本 `0.25.0-rc.1`。下表均已实现可调用，不是占位接口。合成返回见[接口样例](../testing/evidence/v5-r12/FRONTEND_FIXTURES.json)，示例ID不是可直接登录的账号或生产数据。新增8个操作，其余项目、订单、制作和财务接口复用。

|页面|接口，省略/api/v1|注意事项|
|---|---|---|
|参演约定填写|POST `/projects/candidates/{record_id}/participations`|传cast、terms、财务rule_id和私有evidence_asset_id；0报酬的rule_id为null|
|运营合同核验|POST `/projects/participations/{record_id}/review`|独立审核者；本人/出品方不能审核自己参与的约定；五项核验须分别确认|
|相关方确认|POST `/projects/participations/{record_id}/confirmation`|确认服务器提供的content_sha256；不能沿用旧版本|
|报酬下单|POST `/trade/participation-checkout`|出品方传agreement_id、agreement_sha256和channel；0报酬约定无需下单|
|报酬与节点进度|GET `/projects/participations/{record_id}/progress`；POST `/projects/participations/{record_id}/milestones`|进度接口返回order_id与已确认节点；不要从不变的合同data.order_id判断是否下单|
|撤回待使用约定|POST `/projects/participations/{record_id}/withdrawal`|已有计划或未结清订单时拒绝；新约定必须重新审核确认|
|重新准备项目|POST `/projects/projects/{record_id}/revision`|原因与私有证据必填；旧确认不能用于新计划|
|约定列表与详情|沿用项目records列表，kind=PARTICIPATION，以及记录详情接口|按当前身份权限读取；合同材料不提供公开链接|
|发行与收入|沿用项目plans/editions/releases/external-events与finance接口|分开展示内部审核、外部提交、已发行、应收、已到账、应分配、已支付|

本人业务请求传 `X-Acting-Party`；运营独立审核不传此头。写请求沿用 `Idempotency-Key`；已有记录变更沿用 `If-Match`。返回仍是meta+data，项目记录的业务内容在data.data。错误继续使用统一ErrorResponse。

新建项目明确传 `business_version: V5`；设置既有 `TRADE_REQUIRE_V5_PRODUCTS=true` 时服务器强制V5。历史未标V5且没有参演约定的项目继续旧逻辑，不批量改写历史合同。新增参演后的项目计划包含participation，报价出现COMMERCIAL规格结构；前端需扩展对应类型，原请求字段没有被移除。

遇到 `PARTICIPATION_MILESTONE_REQUIRED` 显示“先确认这一阶段成果”；`PROJECT_RELEASE_RESULT_PENDING` 显示“先核对已提交渠道的处理结果”；`PARTICIPATION_AMENDMENT_REVIEW_REQUIRED` 显示“先处理现有合同及付款，不能直接撤回”。不得反复自动重试，也不能把拒绝状态显示成成功。

## 双方验收及剩余工作

本侧：测试参演确认、独立审核、重复和并发下单、分期门槛、本人授权撤回、失权、私有材料、事务回滚、制作→会签→发行凭据→实际到账→分配；测试支付和文件均为合成，不调用真实收费服务。完整结果见[测试记录](../testing/evidence/v5-r12/RESULTS.json)。

队友：按同一完整分支，接合同填写与确认、报酬节点、计划重做、发行结果、收入页面，并用双方相同版本逐条操作。当前尚未确认接手或完成；PR24本轮核对仍为第一轮故事页面草稿申请，不能据此断言后续页面已做完。本侧处理接口和测试数据问题；不要求页面读取服务器内部表。

```text
# 启动隔离MySQL并配置JX_MYSQL_TEST_ENV_FILE后
node scripts/backend-check.cjs participation
node scripts/backend-check.cjs projects
node scripts/backend-check.cjs finance
python scripts/validate_contract.py --runtime-fixtures .local/participation-http-fixtures.json
python scripts/collaboration_check.py
```

未通过全部验收项，不称“全部交付候选通过”。本侧下一步先补代做样片独立50%/50%付款和艺人所有权，再核验V5剧本自助供稿关闭限制；这些不用等甲方开通OSS。之后按缺口清单与队友完成同版本页面联调，独立审阅后再按阶段合入。甲方提供的真实服务、合同税票及发行材料单列，不能把代码缺口转交甲方。
