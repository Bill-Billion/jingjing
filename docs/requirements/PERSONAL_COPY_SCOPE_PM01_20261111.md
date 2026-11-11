# 本人资料类别与交付范围（W04）

2026-11-11，后端负责人 chengcongcong222。依据[28号第一节](../sources/contracts-20261029/extracted/28.md)：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”PM01 [W04](../sources/pm01-20261111/03_本轮施工任务与验收.md)要求：“建立类别—资料来源—本人权限—保留依据—提供方式清单”。下表按业务类别归并，沿用[现有分类底册](../collaboration/client-complete-20261028/PERSONAL_DATA_COVERAGE_20261109.md)，不以物理列数作为未开发数量。

保留依据共用边界：系统只提供尚持有且获准读取的资料，已清理内容不恢复；具体保留政策/期限由甲方审定，当前仍缺正式分类依据，见[已登记外部条件](../operations/EXTERNAL_READINESS.md)。不能因缺政策无限期拒绝整份申请，也不自行填写年限。合同/订单保留原快照是版本一致性要求，不等于自动获准永久留存。下表“待依据”均承接这一缺项。

|类别|来源与本人权限|保留依据与提供方式|已提供、待补及不适用|
|---|---|---|---|
|账户、偏好、艺人档案、实名结果|identity_accounts/artist_people/IDENTITY；申请人个人身份|待依据；account-data脱敏分页|已有本人字段；不提供凭据、密码、会话令牌。实名原始人脸/证件供应商材料待具体产品核验|
|登录、换号历史|auth_sessions/phone_changes/events；本人账号|只取仍保留记录；account-data|已有会话和换号动作；已清理不恢复，机构员工动作不混作本人|
|本人素材、作品、数字人记录|supply_assets/artist_asset_links/production_records；本人归属与当前访问权|待依据；data记录与受控原件分别提供|已有元数据/部分原件；删除中/已删除仅保留状态，长期模型源文件未取得，不能以元数据代交付|
|私人故事与历史|customization_requests及版本附件；本人直接主体|待依据；stories/{id}/data及原受控文件|已有历史/草稿/附件；机构代办故事不自动成为本人资料|
|订单、付款、退款、流水|trade_records/journal；本人买卖方，不能借机构成员身份|原快照只读；transaction-data六分区；正式留存依据待补|已有金额/分期/状态/时间；本批来源报价补齐；未知时间不伪造|
|商品特定约定|订单冻结合同commitments.quote；本人为买卖方|CONTRACT脱敏副本有独立摘要；原合同摘要另保留|下表逐类型定位；不可换成现行规格。封存不等于电子签署完成|
|钱包、清分、成长、星光、佣金及兑换|wallet/finance/engagement；本人关联记录|待依据；account-data分类|已有历史与状态；应收/计提不当到账，运营底稿及其他收益人私密资料不整批提供|
|许可、参演、经纪、会签、阶段确认|agreement/participation副本；本人直接当事人|待依据；account-data脱敏约定与原受控文件|已有约定/本人确认；未知旧时间明示；真实签署原件另核|
|客服、投诉、发票|support/invoice；本人申请与当前可见附件|待依据；account-data及既有附件下载|已有历史/已签发或替换文件；待审/他人证明不自动提供；模拟票据不称真实发票|
|收藏、浏览、通知、提醒|personal collections/notification/usage；本人账号|按实际留存；account-data；原内容再核权|已有记录及当前提醒状态；不是全量行为轨迹，不新增跟踪；旧受限内容不随记录泄露|
|监护关系、设置、案件、用量|guardian_records/usage/sessions；本人及有效关系|待依据；account-data；证明人工核权|已有合法范围记录；失效关系不继续出详情，不自动导出其他儿童资料|
|活动、排名、评价、投票、推广|engagement；本人行为和结果|待依据；account-data|已有本人记录；公开榜公式与算法版本另说明，不提供全局评审底稿/设备哈希|
|商单、试镜消息|gig/audition工作稿；申请人是直接个人参与者，运营原会话权限仍在|待依据；运营选取并人工脱敏→原答复独审|已验选定本人消息文件；第三方正文/附件逐件核，不能整稿自动发布|
|隐私申请、答复和处理记录|privacy_requests/responses/events/actions/executions；本人申请|待依据；account-data及已审历史文件|已有申请/执行状态与历史下载；申请未覆盖完整保持FOLLOW_UP；内部载荷不直接提供|
|供应商凭据与原件|支付proof/渠道引用、实名回执、签署原件、模型/审核/短信/推送/存储回执|本人与业务关联核实后逐申请脱敏、上传、独审；保留政策待产品资料|当前有结构化状态/部分渠道回执，不能一概称没有，也不能把内部JSON当正式原件。未取得的原件列缺项；见九项服务清单|

## 来源报价及商品约定

流程补全/实施建议：为让申请人追溯“这张订单根据哪份报价成立”，ORDERS/SUMMARY增加source_quote_id。验证父关联与冻结合同一致，不读取后改报价覆盖历史；不一致拒绝提供可信副本。无来源关联为null，页面显示“未记录来源报价”，不要推断没有合同。原申请范围、独审、文件摘要及途中失权检查保留。

|商品范围|冻结内容位置（CONTRACT.terms.commitments.quote下）|提供/限制|
|---|---|---|
|通用报价规格、数量、金额、分期|lines/specification/product_profile、installments、rule_id|已有副本；已知review字段脱敏，原摘要与copy_sha256分开|
|人工定制、改价、样片、共创|customization、customization_change、manual_sample、customization_copyright、cocreation；各line.specification|已有适用订单快照，不创造缺省约定；样片人格授权、成片版权和购买许可分别核|
|艺人服务、商单及分账约定|artist_service、artist_rule_snapshot、commercial、marketplace_finance、customization_finance|已有适用订单快照；内部业务或其他人原件仍须逐申请复核，不能凭字段存在认定已交付全部|
|现货、试镜、非标参演等直接购买|所属商品写入的冻结quote及contract.commitments；具体许可/参演协议按原入口|没有QUOTE父记录的订单不伪造source_quote_id；具体授权文件复用协议/原件入口|
|折扣、推广、权益|订单已记录的quote快照|只读当时约定；实际支付/退款状态从原交易分区核对，不能以优惠或计提冒充到账|

**覆盖限制**：本表解释已定位业务类别，既有分类细项继续原底册；不是“全库字段已审完”。未收供应商文件、正式保留依据、未审第三方原件以及W05页面整链仍未关闭。来源报价与同一申请文件本批复验结果见[报告](../reviews/pm01-w04-w09-20261111/REPORT.md)。
