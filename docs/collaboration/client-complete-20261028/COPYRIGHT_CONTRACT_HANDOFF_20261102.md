# 前端接入：付款前看懂版权，样片不混同人格权，IP采购二选一

后端负责人 chengcongcong222；前端负责人 Bill-Billion。接口0.31.20-rc.1，迁移0193。仍从PR39取得同版代码，实际上传回执见CURRENT；本说明已准备，尚未确认用户转发/前端认领。本批是原合同收尾第2项中的3个子项，不另加产品线。

## 前端现在需要接的三项

| 工作 | 页面应怎样办理 | 服务端入口与完成标准 |
| --- | --- | --- |
| 定制成片选择版权 | 运营报价时选“客户取得成片版权”或“制作方保留版权、客户按约定使用”；客户确认前同时看到费用、归属和使用范围；订单详情显示原承诺 | 现有规格/报价/审核/接受接口不换；specification.copyright_terms → quote.customization_copyright → 订单合同。不能默认替客户勾选；无选择的新报价返回COPYRIGHT_CHOICE_REQUIRED |
| 样片分开显示两类权利 | 真人本人确认“制作方拥有成片版权，但我的肖像、声音权仍归我”；机构代办显示具体艺人，不能替其确认 | 原manual-sample绑定增加copyright_terms；读版权人copyright_owner_party_id、人格权人personality_rights_owner_party_id。rights_owner_party_id仍是原本人权限字段，绝不能替换成平台ID |
| IP采购办理与收益 | 仅指定平台采购方/供稿方/独立审核人员办理。二选一、权属证明、结算附件、开发上线依据、撤回申请和分红记录；金额不能误写成到账 | 现有licensing产品/预留/证据/审核/生效/项目绑定；新增procurement-events、royalty-statements和受控采购附件下载。普通用户目录不展示其他主体的采购材料 |

## 定制报价字段

copyright_terms必须含version=CONTRACT_20261029、mode、buyout_price_included、license、personality_rights_retained=true、underlying_assets_excluded=true、third_party_licenses_retained=true。

- BUYER_OWNERSHIP：buyout_price_included=true，license=null。成片版权人为客户，不表示取得出镜人的人格权或底层模型/音乐字体版权。
- PRODUCER_OWNERSHIP_LICENSE：buyout_price_included=false；license含scope=PERSONAL_NONCOMMERCIAL或AGREED_SCOPE、purposes、territories、perpetual=true、exclusive=false、transferable=false、sublicensable=false、terms_text。个人范围只能PRIVATE/PUBLIC_SHARE；另约商业/发行必须明确列COMMERCIAL/RELEASE和地域，不能只改说明文字。
- quote.customization_copyright明确buyer_party_id、producer_party_id、copyright_owner_party_id、licensee_party_id、personality_rights_owner_party_id、source_ref和terms。一般定制的personality_rights_owner_party_id可为null，因为出镜人员在后续逐人授权；null不表示没有人格权。
- 样片绑定和规格的copyright_terms必须一致，由艺人本人确认当前内容哈希；机构代办时licensee_party_id仍是艺人。制作流程50/50不改，新定制30/40/30不改。
- COPYRIGHT_CHANGE_REQUIRES_NEW_AGREEMENT表示补价不能顺带换版权；重新协商需形成新约定，不让页面偷偷重发修改后的旧订单。
- 历史单可能无新字段，显示“按原合同约定”，不推算归属；旧ARTIST_RETAINS_OWNERSHIP原值保留，只作为历史表述。新值PRODUCER_COPYRIGHT_PERSONALITY_RETAINED需分别展示两类权利。
- 个人许可进入商业发行会返回CUSTOMIZATION_COPYRIGHT_USE_NOT_ALLOWED。页面提示另需约定授权，不提供反复重试按钮。

## IP采购字段与办理

products新增procurement，完整结构以[OpenAPI](../../../contracts/openapi.yaml)的IPProcurement为准。terms.contract_kind为IP_BUYOUT_20261029或IP_REVENUE_SHARE_20261029。

1. BUYOUT：本份采购合同总价和生效所需付款均5,000,000分，分红0；valid_until/development_until/project_limit/episode_limit均null，永久全球独家；不是所有作品统一售价。
2. REVENUE_SHARE：前置0，royalty_bps=800；valid_until是valid_from后5个日历年、development_until后2年，两个数量限制null；settlement_annex必须有受控附件、cycle、terms_text和指定净收益口径。零前置不等于无偿买断。
3. rights_evidence分rights_chain_ids、ownership_proof_ids、original_creation_ids、has_coauthors及coauthor_consent_ids；共同作者时最后一项必填。署名和允许转许可分别记录；不能用上传成功冒充审核。
4. 现有证据审核的verification新增rights_chain_verified=true，settlement_annex_verified仅分红方案为true。买断仍需全额付款核验和双方签署证据。封存合同不等于电子签服务已启用。
5. POST /api/v1/licensing/grants/{record_id}/procurement-events：project_id、event(DEVELOPMENT/PUBLICATION)、occurred_at、evidence_asset_ids、external_reference、note。沿用Idempotency-Key、If-Match、X-Acting-Party。记录先IN_REVIEW，走原records/{id}/reviews独立审核。显示已提交/已核验，不能把绑定项目当开工。
6. 作者撤回也走该入口，event=WITHDRAWAL_REQUEST、project_id=null，提交当前时间和依据；仅两年期限过后可申请。独立核验没有按时开发才暂停许可；存在按时开发证据返回IP_WITHDRAWAL_NOT_ELIGIBLE，不能显示已收回版权。
7. POST /api/v1/licensing/grants/{record_id}/royalty-statements：project_id及statement。statement逐项收入/平台佣金/税/发行成本/制作成本（分）、起止时间、依据和外部编号。审核后calculation返回项目累计净收益、累计应计、此次调整；payment_state始终NOT_TRANSFERRED。新期间更正可有负数，必须有依据，禁止页面写成自动扣款/到账。
8. GET /api/v1/licensing/procurement/{record_id}/assets/{asset_id}/content：合同双方带当前身份读取，独立审核人无身份头读取；不展示原始存储地址。普通目录不会泄露其他采购附件。
9. 本轮提供的可转许可字段只表明合同允许，并不代替下游新的授权和审核。真实款项与支付平台是否开通分别展示。

## 双方验收同一组记录

定制两种选择各做一单：申请→规格/报价→独立审批→本人核对→付款→制作→交付；查看合同与原单不变，个人许可不能进入商业发行。样片各验本人和机构代办，确认具体艺人、本人授权、合同两类权利及旧单回显。IP各验一份买断/分红：材料缺失阻断、他人不可读、相冲突独家预留、买断未付足不生效、零前置有8%义务、开发/上线复核、重复账单/重叠期间拒绝、作者撤回资格、已上线长期运营与新制作区别。

后端专项模拟数据由测试夹具生成，不把这些账单写入甲方正在使用的数据。页面完成后提供提交、同版构建及用到的记录编号，由后端负责人统一完整办理，再交用户人工验收。
