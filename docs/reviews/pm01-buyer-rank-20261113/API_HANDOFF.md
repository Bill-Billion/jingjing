# 买家榜后端接续

0.31.69-rc.1，迁移0221不变，无本轮前端认领。新增三操作：

- POST /api/v1/engagement/buyer-rankings，body为city、rule_id，账号须ENGAGEMENT_REVIEW权限，带Idempotency-Key，不带X-Acting-Party。规则须已生效且配置buyer_rank，按现行严格模式核版本。生成BUYER_RANK_SNAPSHOT和逐主体BUYER_RANK_ENTRY，事务、审计及命令同成败。
- GET同路径，city必填，limit 1—100默认20、cursor可选；游标按同城id遍历，不是时间降序全量一次返回。
- GET /api/v1/engagement/buyer-rankings/{record_id}，任一已登录账号可读当前允许公开的历史投影；不返回rule_snapshot、订单/实名来源。

既有GET /engagement/buyers?city=优先返回最新已发布快照；没有时保留实时兼容计算并标LIVE_NOT_SAVED。新增可选snapshot_id/snapshot_sha256/as_of/calculation_version/traceability；快照FROZEN_SNAPSHOT，实时ID及摘要为空。数据更新时间看as_of，不冒充每次请求重新排名。运营须主动生成；定时/大批生成尚未补。

个人重新核有效实名、账号及成员；机构复用独审公开档案当前有效身份，未审/失效不入榜。报名选择保留；退出/迁城/失权隐藏历史公开条目，不重算其他人分数。city为声明城市，不是位置认证。消费成长仅有效消费来源，赠分不计；退款/风控改变后续快照，旧规则和旧分数保留。

账号本人PROFILE申请的ENGAGEMENT_RECORDS增加BUYER_RANK_ENTRY：当时排名/指标、权重/归一基数、本人订单/积分/身份/风控来源及摘要。机构/他人条目排除。原records读取及运营queue可读取受权限保护的原快照；不把运营完整记录发给普通用户。

超过500主体/每人5000订单或积分来源，及内容大小上限拒绝RANKING_BATCH_REQUIRED，不静默截断。真实规模、业务排程、页面接入和独立签收另验。当前仅隔离验证，不启用真实服务。
