# 新合同冠军规则

0.31.68-rc.1，迁移0221不变；既有POST /api/v1/engagement/competitions及其/{record_id}/review，无新增字段和端侧工作。

榜单冻结规则标明CONTRACT_20261029时，创建及批准必须vote_cost=100、daily_cap=10、official_bps=6000、ranking_bps=2000、vote_bps=2000，错误返回409 CHAMPIONSHIP_CONTRACT_RATE_MISMATCH。既有RANKING_CONTRACT_POLICY=CONTRACT_20261029模式还要求来源榜单属于该版本，旧榜单新建或旧待审批准返回RANKING_CONTRACT_POLICY_REQUIRED。批准前查榜单仍PUBLISHED，再校验、预留奖励，均在同一事务。

旧已发布活动不重定价，已成功原请求回放仍返回原结果。只新增门禁，不切换部署模式。前端已有参数/数据结构保持，无本轮端侧认领；独立签收/真实活动另验。
