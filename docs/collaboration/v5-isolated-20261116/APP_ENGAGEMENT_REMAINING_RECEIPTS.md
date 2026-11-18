# Engagement 本页剩余五项回执收口

## 本批实现
仅 engagement_pages.dart 扩充原请求冻结 validator，五个首次调用接 actBound，恢复继续从原 recovery body/suffix/version 捕获。未修改请求内容、幂等 key、API、共享恢复或 savePrivate。修改前已库外备份包含上一批四动作的当前文件。

## 全部实际写调用覆盖
| 原路径 | 首次 | 恢复 | 核心关联 |
|---|---|---|---|
| candidates | 原专用 validateNomination 保留 | 原专用校验保留 | CANDIDATE、身份、活动、profile/person |
| votes | 上批 actBound 保留 | 上批冻结 validator | VOTE、身份、活动、候选、原 VALID 快照/hold |
| appeals | 上批 actBound 保留 | 上批冻结 validator | APPEAL、身份、活动、原原因/OPEN |
| mcn/staff | 上批 actBound 保留 | 上批冻结 validator | STAFF_GRANT、身份、合法人员/权限集合与等价期限 |
| mcn/staff/{id}/revoke | 上批 actBound 保留 | 上批冻结 validator | 原记录、身份、原版本+1、原因/REVOKED |
| profiles | 本批 actBound | 本批冻结 validator | RANK_PROFILE、身份、null parent、原person/city/district/category/opt_in；ACTIVE或EXCLUDED |
| reviews | 本批迁入共享本页 validator | 同一完整校验 | ORDER_REVIEW、身份、原订单、PUBLISHED、原body全部字段摘要、奖励0 |
| referrals/sync | 本批 actBound | 本批冻结 validator | REFERRAL_COMMISSION、原订单、推荐方owner、请求身份属于原归属三方、多种真实同步状态 |
| mcn/assignments | 本批 actBound | 本批冻结 validator | ASSIGNMENT、身份、null parent、ASSIGNED、原account_id、恰一原booking/order |
| buyer-city-profile | 本批 actBound | 本批冻结 validator | BUYER_PROFILE、身份、null parent、ACTIVE、原city/opt_in |

评价原全字段摘要比较及 free_points_awarded==0 完整保留并增加身份/状态校验；reload:false 保留，展示结果逻辑不变。
推荐佣金 owner 始终是 attribution.referrer_party_id，不能强制为调用者。请求身份核对 buyer/supplier/referrer 三方，保留 PENDING/REVERSED/RULE_REVIEW_REQUIRED/SIMULATION_EXCLUDED/PLATFORM_BUDGET_REVIEW_REQUIRED/ACCRUED；不强制增版、应计、金额增长或到账。

## 后端依据
engagement/rankings.js:6/7/15；referrals.js:23、33–40；mcn.js:34–47；context.js:37–41。幂等返回保存的历史操作快照，不按当前榜单/员工/订单状态重新解释。人员派生字段不拿当前列表硬比。

## 静态核对及边界
阅读完整本批 diff；将上批四个 validator 分支与本批前副本逐字比较，确认未改变。全页实际 act/actBound 调用已盘点为上述十类。既有候选报名校验保留，本批未扩其他域。
未测试、编译、analyzer、格式化、浏览器或推送；不声明运行通过。待同事验证首次和历史重放、错owner/原字段/关联ID的回执保留 pending；重点买家/商家代同步推荐佣金、EXCLUDED档案、评价完整媒体字段、改派历史快照。

冻结 engagement_pages.dart SHA-256：`af1ef1abdf4b7e8420a5f46c22e497d4f27d6db2ccb43098ad79cdc13915e87a`。
