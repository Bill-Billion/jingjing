# 后端行为修正与接续

接口0.31.69-rc.2，迁移0221不变，无新路由或字段，无前端认领。

- 人工定制当前使用的LOOK/VOICE版本，除原有人物/数字人/文件校验外，还核其consent_id所指归档许可：当前APPROVED、同本人/数字人、授权给本人、PRIVATE_ARCHIVE用途、相应FACE/VOICE特征及有效期间。不满足返回409 CUSTOMIZATION_VARIANT_CONSENT_REQUIRED；原始素材可访问不等于原归档许可仍有效。
- 定制实际选择造型/声音必须包含在供给许可特征中，否则409 CUSTOMIZATION_FEATURE_CONSENT_REQUIRED。参演同规则返回409 PARTICIPATION_FEATURE_CONSENT_REQUIRED。归档VOICE与PROJECT_PRODUCTION/NEW_GENERATION、供给PRIVATE/RELEASE分层许可不合并。
- 只有归档许可不授予制作。合法声音制作及供给授权后正常；撤销后新使用拒绝。已支付钱账、原角色快照和原剧本不重写，不自动退款或改原费用。
- 许可拦截发生在现有办理校验顺序中；未开始、暂停或失去主体权限可能优先返回其原有错误，不要求所有拒绝都以许可错误码表示。

具体许诺用途及禁用条款仍由独审核实；测试不是自动解释自由文本，不能把它推断成全部关系图隐私/营销已验。页面、真实服务与独立签收另验，当前禁止前端开发修补。
