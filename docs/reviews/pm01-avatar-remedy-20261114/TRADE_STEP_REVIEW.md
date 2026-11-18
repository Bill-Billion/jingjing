# W11—W13指定代码与断言核查

这是本轮静态核查，未重新运行这三条交易链。只证明列明位置已有相应实现/断言，不能用目录或测试名认定原步骤整体满足。来源及内容摘要见PM01_STEP_REVIEW.json；所需页面/真实服务/独立复验仍需。

|原步骤|本轮实际核查与限制|代码及断言入口|
|---|---|---|
|W11.1 由页面创建新订单，付款核验后取得许可与文件|核现货上架权属、未付款拒下载、受信付款发权与一次到账；本轮未验页面下单，也未重跑此文件|`src/modules/stock/context.js`；`test/stock.integration.test.cjs`|
|W11.2 同一订单走取消、部分/全部退款、会话到期和失权|逐案金额与KEEP/REVOKE、待回款暂停、退款幂等和会话恢复已有指定断言；本轮未重跑整笔现货|`src/modules/stock/refund-policy.js`；`test/stock.integration.test.cjs`|
|W11.3 核商用范围、历史48小时规则、积分与佣金冲回|商用范围与按快照48小时门禁可定位；七天推荐分页已有第74轮证据，不能据此替代所有退款积分/佣金逆向复验|`src/modules/stock/policy.js`；`src/modules/trade/acceptance-policy.js`；`test/stock-policy.test.cjs`；`test/referral-window.integration.test.cjs`|
|W12.1 从故事草稿、补件、报价到合同与30/40/30付款|已读30/40/30及旧30/60/10不追改、报价切换断言；故事草稿/补件全步骤本轮未复核|`src/modules/customization/quote-policy.js`；`test/customization-contract-cutover.integration.test.cjs`|
|W12.2 用页面完成派单、正式交稿、独审、反馈及最终下载|已读本人实际读取/通知、撤权、重发、四阶段尾款下载断言；页面派单/独审全程本轮未运行|`src/modules/production/payment-gate.js`；`test/customization-handoff.integration.test.cjs`|
|W12.3 演练中款前缺确认、返修、暂停和付款未知恢复|已读中款缺确认拒绝、暂停与晚到付款转退款义务断言；返修加价全分支本轮未复核|`src/modules/production/payment-gate.js`；`test/customization-delivery.integration.test.cjs`|
|W13.1 预约、接拒单、样本交付、审核、确认用同一记录|已有付费后接单、交样文件与当前授权复核及实际读取断言；本轮未重跑完整试镜记录|`src/modules/auditions/context.js`；`test/auditions.integration.test.cjs`|
|W13.2 分别演练出发前取消、拒绝接单、安全争议和退款|已读同已接单试镜出发前取消、关闭会话、实际退款回执及重复不重记账断言；其余安全分支需结合已有证据继续复核|`src/modules/auditions/context.js`；`test/auditions.integration.test.cjs`|
|W13.3 核一口价含交通、22%抽成及T+1状态|rule要求平台2200bps；financeGate要求履约后86400000毫秒且无争议/付款待审；不等于真实T+1出款已接通|`src/modules/auditions/context.js`；`test/auditions.integration.test.cjs`|

48小时按订单冻结的acceptance_policy与条款判断，当前CONTRACT_20261029明确48小时；旧测试存在72小时或其他历史冻结值。PM01的“历史48小时规则”不作为追改所有旧订单的授权，新旧各按实际快照核对。
