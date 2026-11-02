# 前端接法：分类认证资料、10元审核与免费数字人服务

后端负责人 **chengcongcong222**；前端负责人 **Bill-Billion**。本批接口 **0.31.18-rc.1**、数据库仍 **0192**，沿原PR39交付。没有改页面或运行中的甲方网站。新任务准备供用户转发，尚未认领；上一批现货资格提示已由用户转发，但未收到认领确认。此前四项恢复、新付款及5工作日页面已交付复测，不重复安排。

## 对应哪项需求

[00号协议第三条](../../sources/contracts-20261029/extracted/00.md)：“数字人创建（含基础形象与声音）、数字人资产/云托管均永久免费”。[19号合同第五条](../../sources/contracts-20261029/extracted/19.md)明确模卡、生活照、全身照、个人简介和10元/次人工审核；[10号协议](../../sources/contracts-20261029/extracted/10.md)还明确简历。完整摘录和实施补全在[本批记录](../../tasks/records/CORE-artist-contract-20261102.md)。这是原第1组准入前置、第5组艺人资料的合同增量，第16/17组负责资料和整链；不另增总体阶段。

## 页面要让用户办成什么

1. 本人进入认证：分开上传模卡、生活照、全身照，填写简介和文字简历；只接受自己的私有材料。支付10元只是购买一次人工审核，不能显示“已认证”。审核费用不退的说明放在确认付款前；旧订单依原快照展示。
2. 运营要求补件：在原申请内补充/替换材料并重提，保留旧资料和审核意见，不重新购买一次审核。撤回新申请保留记录和费用事实，不视为认证通过；重新申请须新的审核服务。
3. 新版免费创建：选择本人具体数字形象后提交，显示“等待人工处理”；交付后才能显示基础档案已交付。免费托管显示“永久免费，无需续费”，不出现29元/月、自动续费或扣晶钻。不能显示“云服务已上线”或“长期模型已生成”。
4. 历史收费服务、原合同和退款处理继续可查，不重写价格，不把历史订单列表替换成“全部免费”。同一形象已有旧创建单待履行时，先引导处理原单。

## 接口与数据

- `GET /api/v1/artists/services` 不带身份头，返回 `offers.contract_policy` 和 `offers.free_services`。当 `CONTRACT_20261029` 时，免费创建/托管在 `free_services`，人工审核商品在 `items`。不能把免费项当带 `spec_id` 的收费商品；平台主体未配置时不显示可办理。
- 免费申请：`POST /api/v1/artists/people/{person_id}/free-services`，登录并带本人 `X-Acting-Party`、`Idempotency-Key`；请求 `{avatar_id,kind,rule_version:"CONTRACT_20261029"}`，kind为 `AVATAR_CREATION` 或 `AVATAR_HOSTING`。不传价格，不走收银台。
- 免费返回沿用服务记录，但 `data.spec_id=null`、`price_minor=0`、`payment_requirement=NONE`，详情 `order=null`。创建先为READY（待人工交付），失败为FAILED，不应提示“退款中”；托管DELIVERED只表示免费权益，`hosting_period.valid_until=null`、`perpetual=true`。原收费服务仍按原结构读取，不假设所有spec_id和到期日都非空。
- 新版人工审核商品仍走原报价、确认和付款入口；规格 `service.rule_version=CONTRACT_20261029`、`failure_policy=REVIEW_FEE_NON_REFUNDABLE`、价格1000分。只能独立人工审核通过，当前L3尚缺审核指标，不可售卖。
- 申请认证原接口 `/people/{person_id}/halos` 新增 `certification_materials`；字段：`model_card_asset_id`、`lifestyle_asset_ids`、`full_body_asset_ids`、`personal_introduction`、`resume`。模卡为PNG/JPEG或PDF；生活照和全身照为PNG/JPEG。各照片数组1—10项，简介最多2000字，简历最多8000字。文件用现有私有上传接口，purpose=REVIEW_EVIDENCE；其他授权证据仍放 `evidence_asset_ids`。全部关联文件去重后上限30。
- 分类资料是新版L2必填。原L1及历史申请不补造字段。新服务必须有有效前级认证和本人肖像/声音同意；材料齐全不等于机器判定合格。
- 原 `/records/{id}/supplements` 可加同样的 `certification_materials` 替换当前分类资料；省略则保持原分类资料，仅增加补件。响应保留 `supplements[].previous_certification_materials` 和当前版本，旧文件仍为受控审核证据。
- 原 `/records/{id}/withdrawals` 新支持待审/待补件的新版HALO，状态WITHDRAWN；服务交付决定为WITHDRAW，费用不退。已批准、已拒绝和旧版申请不通过此入口撤销，避免改变历史认证。
- 恢复、本人查看、运营下载、独立审核继续用已有接口；切身份清空缓存、旧请求禁止回写，不将本批材料存入公开目录。

| 返回原因 | 页面引导 |
| --- | --- |
| ARTIST_CONTRACT_NOT_ENABLED | 新版尚未统一启用，稍后再试；不降级到旧收费购买 |
| ARTIST_SERVICE_IS_FREE | 当前服务免费，刷新目录并转免费申请 |
| ARTIST_CONTRACT_SPEC_REQUIRED | 旧人工审核规格不可用于新版申请，刷新已审核新规格 |
| HALO_CLASSIFIED_MATERIALS_REQUIRED | 补齐分类资料 |
| HALO_MATERIAL_MEDIA_TYPE_INVALID | 检查模卡/照片格式 |
| PRIVATE_MATERIAL_NOT_READY | 文件不可用或非本人资料，重新核对上传记录 |
| HALO_REVIEW_FEE_NON_REFUNDABLE | 该笔新版人工审核费不支持常规退款申请，仍可通过客服反馈 |
| ARTIST_EXISTING_SERVICE_REQUIRES_RESOLUTION | 有待履行的历史创建服务，先查看并处理原单 |
| FREE_HOSTING_RENEWAL_NOT_REQUIRED | 永久免费托管，无需续费提醒 |
| FREE_ARCHIVE_FACE_VOICE_REQUIRED / FREE_ARCHIVE_MEDIA_TYPE_REQUIRED | 运营补齐形象图片和声音文件，不能标记交付 |

## 前端现在可做、完成标准

Bill-Billion可独立完成App/本人网页/运营网页的数据类型、分类表单、补件版本、免费服务页和新状态提示。后端接口已提供，不需要修改数据库；请按本批接口编写客户端，不导入服务器内部模块。

完成时交回提交版本和同一组人物、形象、审核服务、申请记录：免费申请→重复恢复→人工档案交付；审核付款→资料提交→补件换资料→独立通过/拒绝/撤回。覆盖旧付费单、他人材料、切身份、未成年人拦截和模型未启用。仅单元测试通过不能代替整链通过；后端主测组合版本。

## 联调资料

仅本机隔离MySQL：设置 `JX_MYSQL_TEST_ENV_FILE`，并设 `JX_ARTIST_CONTRACT_POLICY=CONTRACT_20261029` 后运行 `node scripts/artists-sandbox.cjs`。工具生成随机数据库、成年人/机构/运营/陌生人/受限未成年人账号、免费托管、待交付基础档案、10元合成已付审核及分类材料；临时访问资料只在被忽略的 `.local`，不要上传Git。形象为1像素图、声音为合成静音，不声称是真人材料或模型成果。

可自动复验并清理：`node scripts/artists-contract-sandbox-smoke.cjs`。记录明确是HTTP流程，不是已完成页面验收。正常停止删除本次库和凭据；不要设置持久化选项去覆盖甲方正在使用的资料。

发布仍要先确认同版页面。正式切换见[操作说明](../../operations/CONTRACT_20261029_ROLLOUT.md)。昆山API尚未交付；OSS按用户决定上线前最后购买实测，两者不阻塞本批合成检查。
