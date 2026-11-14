# 共创权益与会员：已实现能力和剩余组合

2026-11-13只读核对，避免把已有能力再次派成新开发。正式登记仍以本轮最终完整运行的具体用例为依据。

共创20人权益并非只有显示清单：src/modules/redemption/service-credit.js已提供claimServiceCredit、来源重核和消费联动，HTTP为/redemption/service-credits。redemption-checkout.integration.test.cjs的“co-creation credit binds original benefit once, preserves expiry, excludes referral and rechecks cancelled source”实际检查本人领取、唯一绑定、原有效期、同券取消后释放、再次消费、取消原房间后制作拒绝。但该用例直接插入ROOM/BENEFIT夹具，不能与另一个20人房间的用例拼成同房间整链。后续真正缺的是成团产生的同一权益接兑现及到期/退出组合，不是重写兑换功能。

钱包也已有充值退款后会员重算：recharge-refunds.integration.test.cjs实际提交原充值可信合成退款回执，核余额和冻结款、会员失效且成长不增。wallet-policy.test.cjs覆盖独立期间首次/续年/到期恢复，但跨期间规则函数与当前时点原充值HTTP证据仍需区分。后续补同账户跨期组合，不把原路退款入口再写成未开发。真实托管和长期时间经过仍未验证。

以上是后端实现与既有测试源码核对，不代表前端、真实服务、独立审核或整条验收通过。
