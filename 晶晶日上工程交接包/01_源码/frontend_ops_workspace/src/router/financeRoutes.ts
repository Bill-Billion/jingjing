import type {RouteRecordRaw} from 'vue-router'
const component=()=>import('@/views/FinanceView.vue')
const page=(path:string,name:string,view:string,title:string):RouteRecordRaw=>({path,name,component,meta:{financeView:view,title}})
export const financeRoutes:RouteRecordRaw[]=[
 page('/finance/agreements/new','finance-new','new','建立结算约定版本'),
 page('/finance/agreements/:recordId/confirm','finance-agreement-confirm','confirm-agreement','结算约定各方确认'),
 page('/finance/agreements/:recordId/settlements/new','finance-settlement','settlement','生成期间结算单'),
 page('/finance/agreements/:recordId/payouts/new','finance-payout','payout','提交付款申请'),
 page('/finance/agreements/:recordId/statements/new','finance-statement','statement','登记渠道收入账单'),
 page('/finance/agreements/:recordId/adjustments/new','finance-adjustment','adjustment','登记账务调整'),
 page('/finance/agreements/:recordId/reconciliations/new','finance-reconcile','reconcile','支付渠道对账'),
 page('/finance/agreements/:recordId/readiness','finance-readiness','readiness','本次付款的外部服务状态'),
 page('/finance/agreements/:recordId','finance-agreement','agreement','结算约定与本方余额'),
 page('/finance/settlements/:recordId/confirm','finance-settlement-confirm','confirm-settlement','结算单本方确认'),
 page('/finance/payouts/:recordId/evidence','finance-evidence','evidence','登记真实付款结果'),
 page('/finance/statements/:recordId/receipts/new','finance-receipt','receipt','登记渠道实际到账'),
 page('/finance/records/:recordId/disputes/new','finance-dispute','dispute','发起争议与补充说明'),
 page('/finance/disputes/:recordId/respond','finance-response','respond','发起争议与补充说明'),
 page('/finance/records/:recordId','finance-record','record','财务业务记录'),
 {...page('/finance/:section(agreements|settlements|payouts|income|disputes)','finance-list','list','结算约定与本方余额')},
 page('/finance/reviews/:section(agreements|settlements|payouts|payout-evidence|revenue|adjustments|disputes)/:recordId?','finance-review','review','独立财务核验'),
]
