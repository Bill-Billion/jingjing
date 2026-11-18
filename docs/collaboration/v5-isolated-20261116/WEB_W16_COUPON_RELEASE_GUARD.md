# W16 Web 原占用取消门禁

基线 3f0db7c2。仅修改 frontend_ops_workspace/src/business/availability.ts；未改变共享恢复、后端接口、App、其他角色操作或总矩阵。

## 已修正的具体问题
- business/redemption.ts:19 将取消占用放在 grants 区，目标路径为 /redemption/holds/:record_id/release。
- BusinessView.vue:125、331、343 用当前记录的编号和版本；原来选择普通 GRANT 也可进入提交，不能将 GRANT 编号/版本冒充 COUPON_HOLD。
- 现对新发起 release 增加真实类型、当前主体 OWNER、所属主体一致、HELD 且 data.order_id 为 null 的门禁。普通 GRANT、其他主体、非 OWNER、已 RELEASED 或已绑定订单均不能重新发起取消。
- 后端依据：modules/redemption/checkout.js:33–38。服务端以 COUPON_HOLD 加载，核 A.owner、占用 owner、原版本、HELD、无订单，并重新核关联 GRANT 为 HELD 且 checkout_hold_id 一致。前端未拥有的关联 GRANT 最新状态仍由服务器最终核验。

## 保留的原有能力与边界
- holdCoupon 返回本次 COUPON_HOLD；BusinessView.vue:347、352–356 保留该回执并重新绑定其编号和版本，因此成功占用后当前页立即取消仍沿原 HOLD，不改成 GRANT。
- 不增加 expires_at 判断。后端 releaseCoupon 没有“已过期不可取消”的限制。
- 新门禁只影响普通提交的 actionAvailability。BusinessView.vue:358–363 recover 直接 ui.execute(undefined)，共享 useBusiness.ts 原 pending/path/body/version/key 不变；即使原操作实际已 RELEASED，恢复仍可使用原 key 核对，不能用新发起门禁阻断原请求。
- 后端 redemption-routes.js:23 仅有 grants/:id（限定 GRANT），没有本人 GET holds/:id。未新造 HOLD 读取接口，也未声称离页后所有已成功占用回执均能重新取回。仅凭 grant.data.checkout_hold_id 无法取得占用版本，不猜测或挪用 GRANT 版本。

## 静态核对与待测
已静态阅读上述调用与后端条件；未做功能测试、编译、接口请求、提交或推送。交同事固定前后端版本待验：普通 GRANT 禁止错误取消；同主体 OWNER 的 HELD/无订单回执允许原取消；其他身份、已释放和绑定订单禁止新取消；原未知取消即使后端已释放仍按原 key 恢复；已过期但尚未绑定订单不被前端新增截止门禁拦截。以上均为待测项，不是通过记录。
