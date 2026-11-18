# 后端入口与待接续边界

0.31.72-rc.1/0221，GET /api/v1/discovery/recommended-matches。参数沿matches的kind/city/q及按种类适用的明确条件；本人账号，无X-Acting-Party。personalized说明是否使用本人同意的活动依据，filters是硬条件；reasons分别列匹配条件及活动原因。algorithm_version=EXPLICIT_FILTERS_CITY_ACTIVITY_V1，price_personalized=false、requires_business_validation=true。关闭仍按硬条件筛。

最多扫描500公共候选，catalog_truncated=true须说明范围，不声称全目录无结果。游标800字符上限，绑定账号/条件/偏好/候选/版本；409 RECOMMENDATION_CHANGED重开，400 INVALID_CURSOR拒绝错误游标。旧matches及recommendations游标不可串用；现货购买/试镜预约/邀请投稿继续使用原具体操作及当前权利、价格校验。

本批新增后端，不是新页面交付。Bill-Billion仅既有UI，未代认领；本侧不开发修补或运行前端。原W07已交付页面不重复列未开发；本新入口接入另待安排。首版交易依据限现货，原因是城市关联，不展示虚构AI适配率或职业结论。
