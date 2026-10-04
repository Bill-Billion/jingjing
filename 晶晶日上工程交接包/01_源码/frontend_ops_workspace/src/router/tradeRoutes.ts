import type { RouteRecordRaw } from 'vue-router'
/** These route definitions are shared by the real browser router and route verification. */
export const tradeRoutes:RouteRecordRaw[] = [
 {path:'/trade/offers/:offerId/quote',name:'trade-offer-new',component:()=>import('@/views/TradeView.vue'),meta:{title:'按原商单提案创建报价'}},
 {path:'/trade/:section(specifications|quotes|payments|refunds|legacy)/new',name:'trade-new',component:()=>import('@/views/TradeView.vue'),meta:{title:'填写交易约定'}},
 {path:'/trade/specifications/:recordId/new',name:'trade-version',component:()=>import('@/views/TradeView.vue'),meta:{title:'新的服务规格版本'}},
 {path:'/trade/reviews/:section(specifications|quotes|refunds|legacy)/:recordId?',name:'trade-review',component:()=>import('@/views/TradeView.vue'),meta:{title:'独立交易审核'}},
 {path:'/trade/:section(specifications|quotes|orders|payments|refunds|legacy)/:recordId?',name:'trade',component:()=>import('@/views/TradeView.vue'),meta:{title:'报价、订单与付款退款'}},
]
