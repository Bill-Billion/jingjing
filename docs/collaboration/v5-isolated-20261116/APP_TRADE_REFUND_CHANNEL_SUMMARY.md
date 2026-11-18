# 原退款渠道与回执摘要

基线：9b1e4af1。仅 Trade 退款详情局部展示，不新增请求聚合、不改变退款/核对/恢复动作或权限。修改前已在仓库外备份。

## 真实字段与边界
- trade_pages.dart 的 refundView 增加局部渠道摘要，provider/environment 已由 TradeRecord 解析校验。
- 后端 trade/repository.js applyRefund 仅保存规定字段的结构化 proof。摘要仅在当前退款和 proof 均 SUCCEEDED，且 refund_id/payment_id/amount_minor/currency/provider/environment 与原记录一致时显示匹配事实。
- proof 缺少或不匹配只影响摘要说明，不阻断原退款详情、状态、审核及原付款/订单入口。
- 不展示 app_id、merchant_id、内部渠道绑定、完整原始 proof；不将原付款 transaction_id 称为退款流水号。
- SANDBOX 明示测试成功不代表真实到账。接口未提供渠道终态发生时间/到账时间，不用更新时间或试镜汇总时间代替。
- 不生成凭证文件、不伪造下载按钮。既有试镜 refund_id 跳转保持原样。
- Apple 从付款证明生成的退款 proof 可能不具有 refund_id/payment_id 形态；不强行套用直接退款证明，本次摘要会明确不能完整核对，原成功状态与入口仍保留。

## 静态范围
仅修改 frontend_jingjingshangri_app/lib/trade/trade_pages.dart，新增本交接。未改 auditions、API、模型、后端或矩阵。未测试、编译、格式化、提交、推送。

## 后续集中联测
核真实/测试渠道、成功回执匹配、缺失/异常摘要、Apple 证明形态、身份切换与原详情动作。此说明不代表已运行通过。

## 源码冻结摘要
修改前 SHA256：6544fd0e014a13acc81812aae33da12910d4c32b1ff02acf13e36affdef5beb5
修改后 SHA256：a12b009b65df32b5561fd200b803fa6452043c723c7431eb5062768bbb0ee892
