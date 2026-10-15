# 原图与本批页面对应

暖白铜色App、浅色深绿管理网页，沿用既有卡片、控件及统一导航。原图示例的人名、金额、批准和默认值不作为业务条件。准确UUID/hash可展开，表单明确填写金额、规则及来源；没有全局钱包或自动出款。

|App最终原图|实际入口|浏览器实拍|
|---|---|---|
|APP-29-01|`/finance`、`/finance/agreement?agreementId=`|[本人结算](evidence/screenshots/pr19-app-overview-mobile.png)|
|APP-30-01|`/finance/record?recordId=`|[确认结算](evidence/screenshots/pr19-app-settlement-confirm-mobile.png)|
|APP-30-02-v2|`/finance/payout/new?agreementId=`|[申请付款](evidence/screenshots/pr19-app-payout-new-mobile.png)|
|APP-30-03|`/finance/record?recordId=`|[申请状态](evidence/screenshots/pr19-app-payout-requested-mobile.png)|
|APP-31-01|原交易 `/trade/refund?paymentId=`|[真实退款](evidence/screenshots/pr19-app-refund-mobile.png)|
|APP-31-02-v2|`/finance/dispute/new?recordId=`|[发起异议](evidence/screenshots/pr19-app-dispute-new-mobile.png)|
|APP-31-03-v2|`/finance/record?recordId=`|[异议历史](evidence/screenshots/pr19-app-dispute-history-mobile.png)|

管理网页20张原图全部实际操作并实拍：

|Web最终原图|实际入口|实拍|
|---|---|---|
|WEB-27-01|`/finance/agreements/new`|[实拍](evidence/screenshots/pr19-web-agreement-new-desktop.png)|
|WEB-27-02-v2|`/finance/reviews/agreements/:id`|[实拍](evidence/screenshots/pr19-web-review-agreement-desktop.png)|
|WEB-27-03-v3|`/finance/agreements/:id/confirm`|[实拍](evidence/screenshots/pr19-web-confirm-agreement-payer-desktop.png)|
|WEB-28-01-v4|`/finance/agreements/:id`|[实拍](evidence/screenshots/pr19-web-recipient-balances-desktop.png)|
|WEB-28-02-v2|`/finance/agreements/:id/settlements/new`|[实拍](evidence/screenshots/pr19-web-settlement-new-desktop.png)|
|WEB-28-03-v2|`/finance/reviews/settlements/:id`|[实拍](evidence/screenshots/pr19-web-review-settlement-desktop.png)|
|WEB-28-04-v2|`/finance/settlements/:id/confirm`|[实拍](evidence/screenshots/pr19-web-confirm-settlement-payer-desktop.png)|
|WEB-29-01-v2|`/finance/agreements/:id/payouts/new`|[实拍](evidence/screenshots/pr19-web-payout-new-desktop.png)|
|WEB-29-02-v2|`/finance/reviews/payouts/:id`|[实拍](evidence/screenshots/pr19-web-review-payout-desktop.png)|
|WEB-29-03-v2|`/finance/payouts/:id/evidence`|[实拍](evidence/screenshots/pr19-web-payment-paid-form-desktop.png)|
|WEB-29-04-v2|`/finance/reviews/payout-evidence/:id`|[实拍](evidence/screenshots/pr19-web-review-paidEvidence-desktop.png)|
|WEB-30-01-v2|`/finance/agreements/:id/statements/new`|[实拍](evidence/screenshots/pr19-web-statement-new-desktop.png)|
|WEB-30-02-v2|`/finance/statements/:id/receipts/new`|[实拍](evidence/screenshots/pr19-web-receipt-new-desktop.png)|
|WEB-30-03|`/finance/reviews/revenue/:id`|[实拍](evidence/screenshots/pr19-web-review-statement-desktop.png)|
|WEB-30-04-v2|`/finance/agreements/:id/reconciliations/new`|[实拍](evidence/screenshots/pr19-web-reconciliation-new-desktop.png)|
|WEB-31-01-v2|`/finance/records/:id/disputes/new ; /finance/disputes/:id/respond`|[实拍](evidence/screenshots/pr19-web-dispute-new-desktop.png)|
|WEB-31-02-v2|`/finance/reviews/disputes/:id`|[实拍](evidence/screenshots/pr19-web-dispute-action-required-desktop.png)|
|WEB-31-03|`/finance/agreements/:id/adjustments/new`|[实拍](evidence/screenshots/pr19-web-adjustment-new-desktop.png)|
|WEB-31-04-v2|`/finance/reviews/adjustments/:id`|[实拍](evidence/screenshots/pr19-web-review-adjustment-desktop.png)|
|WEB-35-01-v2|`/finance/agreements/:id/readiness`|[实拍](evidence/screenshots/pr19-web-readiness-desktop.png)|

最终原图、需求和文件摘要由[映射表](gallery-map.json)固定。子页用返回，顶层五tab保持；已失权不能显示此前私有资料。窄屏[实拍](evidence/screenshots/pr19-app-settlement-320-mobile.png)已实际打开核对。
