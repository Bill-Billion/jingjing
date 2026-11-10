# 本人副本字段核对：底册、已补缺口与下一步

依据[28号第一节](../sources/contracts-20261029/extracted/28.md)：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”本清单是实施核对，不是原文要求导出全部数据库或所有第三方资料。

从当前0211迁移在空白隔离MySQL建立179张表、1207列，没有读取业务数据。**已逐列核对9个表范围，另确认3个关联历史缺口；其他字段明确未核查。** `project_records`仅核参演协议，JSON动态内容未因此全部覆盖。数据表/字段数不是需求数或完成率。

[全部1207列及逐列状态](PERSONAL_COPY_FIELD_AUDIT_20261110.json)；[原始结构](../reviews/privacy-fields-participation-20261110/schema.json)。

|本轮范围|核查结果|下一步|
|---|---|---|
|账号与个人身份|账号基础已提供；本轮补个人身份档案，组织资料不混入|前端副本展示新增个人身份；认证内部关联不导出|
|艺人档案|本轮补创建时间；实名结果另有分类；实名指纹排除|继续其他形象/模型JSON字段核对|
|登录会话与换号|保留会话状态/时间及换号掩码摘要已提供|换号事件动作/时间为本轮查实缺口；验证码、哈希不直接复制|
|隐私偏好|当前规范化设置已提供，摘要验证|动态JSON未使用字段继续审，不编造历史|
|参演合同变更|本轮补本人订单、变更生效历史和本人原订单保留/应退约定；原合同摘要保留|本人会签和阶段确认历史是两个明确缺口；新艺人不得读旧艺人订单|

下一批按三个确定缺口先补：换号动作历史、本人参演会签、本人阶段确认。各项先界定本人/机构和他人资料边界，再补原分类或兼容分类、权限反例和前端接法。随后扩展交易/素材等尚未核过的表与JSON，不能把剩余未核查列直接报成待开发。

## 本轮逐字段核对

|表/字段|状态|返回范围或排除理由|
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
|auth_phone_change_events.change_id|统一副本缺项|统一副本待补；换号每步动作/时间尚未纳入统一副本，既有换号摘要不能代替|
|auth_phone_change_events.object_version|统一副本缺项|统一副本待补；换号每步动作/时间尚未纳入统一副本，既有换号摘要不能代替|
|auth_phone_change_events.action_code|统一副本缺项|统一副本待补；换号每步动作/时间尚未纳入统一副本，既有换号摘要不能代替|
|auth_phone_change_events.created_at|统一副本缺项|统一副本待补；换号每步动作/时间尚未纳入统一副本，既有换号摘要不能代替|
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
|project_confirmations.record_id|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_confirmations.party_id|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_confirmations.account_id|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_confirmations.content_sha256|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_confirmations.decision|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_confirmations.reason|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_confirmations.created_at|统一副本缺项|统一副本待补；本人会签决定/理由/时间尚未逐行提供，不能直接导出所有签署人底稿|
|project_participation_amendments.previous_agreement_id|已提供|PARTICIPATION_AGREEMENTS.amendment_activations；由该分类返回，限定本人/当事人范围|
|project_participation_amendments.replacement_agreement_id|已提供|PARTICIPATION_AGREEMENTS.amendment_activations；由该分类返回，限定本人/当事人范围|
|project_participation_amendments.activated_by|内部/安全信息不直接提供|PARTICIPATION_AGREEMENTS.amendment_activations；内部操作人，不暴露审核身份|
|project_participation_amendments.activated_at|已提供|PARTICIPATION_AGREEMENTS.amendment_activations；由该分类返回，限定本人/当事人范围|
|project_participation_milestones.agreement_id|统一副本缺项|统一副本待补；本人阶段确认/理由及证据关联尚未提供，证据原件需另行核权|
|project_participation_milestones.installment_key|统一副本缺项|统一副本待补；本人阶段确认/理由及证据关联尚未提供，证据原件需另行核权|
|project_participation_milestones.account_id|统一副本缺项|统一副本待补；本人阶段确认/理由及证据关联尚未提供，证据原件需另行核权|
|project_participation_milestones.evidence_asset_id|统一副本缺项|统一副本待补；本人阶段确认/理由及证据关联尚未提供，证据原件需另行核权|
|project_participation_milestones.reason|统一副本缺项|统一副本待补；本人阶段确认/理由及证据关联尚未提供，证据原件需另行核权|
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
