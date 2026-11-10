# 本人副本字段核对：已定位历史缺口已补，剩余范围继续核查

依据[28号第一节](../sources/contracts-20261029/extracted/28.md)：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”本清单是实施核对，不能理解为必须导出所有数据库或第三方资料。

0211迁移空白隔离MySQL的底册含179表1207列。本轮核对范围由9表65列扩至12表81列，前批查实的3类历史缺口、涉及16列已处理；剩余1126列未做语义核查，其中含内部工程字段，不能报成1126个缺功能。project_records仅核参演类型，JSON动态内容尚未全部覆盖。

[全部字段及状态](PERSONAL_COPY_FIELD_AUDIT_20261110.json)；[原始结构](../reviews/privacy-fields-participation-20261110/schema.json)；[本轮代码和测试](../reviews/privacy-related-history-20261110/REPORT.md)。接口0.31.52-rc.1，迁移未变。

|核查范围|现在提供什么|还需要做什么|
|---|---|---|
|账号、个人身份与艺人|基础资料、个人身份档案和创建时间|前端展示；其他形象/模型JSON按用途核查|
|登录与换号|保留会话、换号摘要、本轮每步动作和时间|不恢复清理历史，不导出凭据；前端新增动作分类|
|参演协议和变更|本人订单、变更生效、本人约定保留/应退、本人会签及阶段确认|同版页面验收；证据原件仍独立核权，约定不是到账|
|会签与阶段确认时间|会签时间来自原记录；旧阶段确认时间未存，明确返回未知|不得拿订单创建时间或导出时间补写；不是新增采集需求|
|个人与机构边界|个人副本排除机构员工行为及别人的确认；内部账号用于过滤|机构材料继续原业务权限，不能以经办身份批量索取|

下一批先核supply_assets及artist_asset_links持有的本人素材字段与原件，再核trade_records中订单/付款/退款JSON已提供与遗漏字段；按原文、已有实现、个人/机构/他人边界形成逐项结果，有确定缺项才补。继续后端六路线和前端同版页面，不把未核查当未开发。

## 已核范围逐字段结果

|表/字段|状态|提供范围或排除理由|
|---|---|---|
|artist_people.id|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.owner_party_id|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.created_by|内部/安全信息不直接提供|ARTISTS；仅本人；内部创建操作人|
|artist_people.display_name|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.current_status|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.identity_status|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.age_band|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.identity_key|内部/安全信息不直接提供|ARTISTS；仅本人；实名去重指纹，不导出身份匹配材料|
|artist_people.identity_valid_until|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.identity_record_id|用于归属/关联|ARTISTS；仅本人；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|artist_people.object_version|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|artist_people.created_at|已提供|ARTISTS；仅本人；由该分类返回，限定本人/当事人范围|
|auth_phone_change_events.change_id|已提供|PHONE_CHANGE_EVENTS；仅本人保留换号动作；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|auth_phone_change_events.object_version|已提供|PHONE_CHANGE_EVENTS；仅本人保留换号动作；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|auth_phone_change_events.action_code|已提供|PHONE_CHANGE_EVENTS；仅本人保留换号动作；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|auth_phone_change_events.created_at|已提供|PHONE_CHANGE_EVENTS；仅本人保留换号动作；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|auth_phone_changes.id|已提供|PHONE_CHANGES；仅本人；由该分类返回，限定本人/当事人范围|
|auth_phone_changes.account_id|用于归属/关联|PHONE_CHANGES；仅本人；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|auth_phone_changes.session_hash|内部/安全信息不直接提供|PHONE_CHANGES；仅本人；登录/验证/去重材料不直接导出；本人手机号仅提供已有掩码，原始信息另按申请核查|
|auth_phone_changes.old_hash|内部/安全信息不直接提供|PHONE_CHANGES；仅本人；登录/验证/去重材料不直接导出；本人手机号仅提供已有掩码，原始信息另按申请核查|
|auth_phone_changes.new_hash|内部/安全信息不直接提供|PHONE_CHANGES；仅本人；登录/验证/去重材料不直接导出；本人手机号仅提供已有掩码，原始信息另按申请核查|
|auth_phone_changes.encrypted_phones|内部/安全信息不直接提供|PHONE_CHANGES；仅本人；登录/验证/去重材料不直接导出；本人手机号仅提供已有掩码，原始信息另按申请核查|
|auth_phone_changes.old_mask|转换后提供|PHONE_CHANGES；仅本人；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|auth_phone_changes.new_mask|转换后提供|PHONE_CHANGES；仅本人；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|auth_phone_changes.current_status|已提供|PHONE_CHANGES；仅本人；由该分类返回，限定本人/当事人范围|
|auth_phone_changes.object_version|已提供|PHONE_CHANGES；仅本人；由该分类返回，限定本人/当事人范围|
|auth_phone_changes.active_account_id|用于归属/关联|PHONE_CHANGES；仅本人；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|auth_phone_changes.expires_ms|转换后提供|PHONE_CHANGES；仅本人；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|auth_phone_changes.created_at|已提供|PHONE_CHANGES；仅本人；由该分类返回，限定本人/当事人范围|
|auth_phone_changes.updated_at|已提供|PHONE_CHANGES；仅本人；由该分类返回，限定本人/当事人范围|
|auth_sessions.token_hash|内部/安全信息不直接提供|SESSION_RECORDS；仅保留会话；凭据摘要不导出；另提供域隔离copy_ref|
|auth_sessions.account_id|用于归属/关联|SESSION_RECORDS；仅保留会话；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|auth_sessions.expires_ms|转换后提供|SESSION_RECORDS；仅保留会话；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|auth_sessions.revoked|转换后提供|SESSION_RECORDS；仅保留会话；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|auth_sessions.authenticated_ms|转换后提供|SESSION_RECORDS；仅保留会话；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|identity_accounts.id|已提供|ACCOUNT；由该分类返回，限定本人/当事人范围|
|identity_accounts.subject_ref|内部/安全信息不直接提供|ACCOUNT；内部认证主体关联，不能作为凭据导出|
|identity_accounts.display_name|已提供|ACCOUNT；由该分类返回，限定本人/当事人范围|
|identity_accounts.current_status|已提供|ACCOUNT；由该分类返回，限定本人/当事人范围|
|identity_accounts.object_version|已提供|ACCOUNT；由该分类返回，限定本人/当事人范围|
|identity_accounts.created_at|已提供|ACCOUNT；由该分类返回，限定本人/当事人范围|
|parties.id|已提供|ACCOUNT.personal_party；仅PERSON本人；由该分类返回，限定本人/当事人范围|
|parties.kind|已提供|ACCOUNT.personal_party；仅PERSON本人；由该分类返回，限定本人/当事人范围|
|parties.display_name|已提供|ACCOUNT.personal_party；仅PERSON本人；由该分类返回，限定本人/当事人范围|
|parties.personal_account_id|用于归属/关联|ACCOUNT.personal_party；仅PERSON本人；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|parties.created_by|内部/安全信息不直接提供|ACCOUNT.personal_party；仅PERSON本人；创建操作人不等于本人资料；组织资料另按权限处理|
|parties.current_status|已提供|ACCOUNT.personal_party；仅PERSON本人；由该分类返回，限定本人/当事人范围|
|parties.object_version|已提供|ACCOUNT.personal_party；仅PERSON本人；由该分类返回，限定本人/当事人范围|
|parties.created_at|已提供|ACCOUNT.personal_party；仅PERSON本人；由该分类返回，限定本人/当事人范围|
|privacy_preferences.account_id|用于归属/关联|PREFERENCES；仅本人；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|privacy_preferences.object_version|已提供|PREFERENCES；仅本人；由该分类返回，限定本人/当事人范围|
|privacy_preferences.data_json|JSON仅部分核对|PREFERENCES；仅本人；仅审过现有白名单，JSON全部动态字段尚未核清；不能按一个列算完整|
|privacy_preferences.data_sha256|内部/安全信息不直接提供|PREFERENCES；仅本人；内部完整性摘要，读时校验|
|project_confirmations.record_id|已提供|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_confirmations.party_id|已提供|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_confirmations.account_id|用于归属/关联|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；用于限定本人操作，不直接输出内部账号字段|
|project_confirmations.content_sha256|已提供|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_confirmations.decision|已提供|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_confirmations.reason|已提供|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_confirmations.created_at|已提供|PARTICIPATION_CONFIRMATIONS；仅本人个人身份会签；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_participation_amendments.previous_agreement_id|已提供|PARTICIPATION_AGREEMENTS.amendment_activations；由该分类返回，限定本人/当事人范围|
|project_participation_amendments.replacement_agreement_id|已提供|PARTICIPATION_AGREEMENTS.amendment_activations；由该分类返回，限定本人/当事人范围|
|project_participation_amendments.activated_by|内部/安全信息不直接提供|PARTICIPATION_AGREEMENTS.amendment_activations；内部操作人，不暴露审核身份|
|project_participation_amendments.activated_at|已提供|PARTICIPATION_AGREEMENTS.amendment_activations；由该分类返回，限定本人/当事人范围|
|project_participation_milestones.agreement_id|已提供|PARTICIPATION_MILESTONES；仅本人个人项目阶段确认；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_participation_milestones.installment_key|已提供|PARTICIPATION_MILESTONES；仅本人个人项目阶段确认；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_participation_milestones.account_id|用于归属/关联|PARTICIPATION_MILESTONES；仅本人个人项目阶段确认；用于限定本人操作，不直接输出内部账号字段|
|project_participation_milestones.evidence_asset_id|已提供|PARTICIPATION_MILESTONES；仅本人个人项目阶段确认；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_participation_milestones.reason|已提供|PARTICIPATION_MILESTONES；仅本人个人项目阶段确认；按本人记录独立分页提供；不含其他签署人或机构员工行为，证据编号不授予下载权|
|project_participation_orders.agreement_id|用于归属/关联|PARTICIPATION_AGREEMENTS.own_order_id；本人是实际买卖方；用于本人筛选或关联到另一个已提供记录，不直接输出内部关联|
|project_participation_orders.order_id|已提供|PARTICIPATION_AGREEMENTS.own_order_id；本人是实际买卖方；由该分类返回，限定本人/当事人范围|
|project_records.id|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
|project_records.kind|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
|project_records.project_id|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
|project_records.owner_party_id|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
|project_records.created_by|内部/安全信息不直接提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；内部操作人；不能混入本人副本|
|project_records.current_status|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
|project_records.object_version|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
|project_records.data_json|JSON仅部分核对|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；仅审过现有白名单，JSON全部动态字段尚未核清；不能按一个列算完整|
|project_records.data_sha256|转换后提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；以时间、状态、掩码或来源摘要提供，不输出原始安全字段|
|project_records.created_at|已提供|PARTICIPATION_AGREEMENTS；仅PARTICIPATION，其他kind未在本批核清；由该分类返回，限定本人/当事人范围|
