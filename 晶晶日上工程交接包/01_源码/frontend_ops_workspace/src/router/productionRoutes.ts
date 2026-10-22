import type { RouteRecordRaw } from 'vue-router'
const component=()=>import('@/views/ProductionView.vue')
export const productionRoutes:RouteRecordRaw[]=[
 {path:'/production/orders/:orderId/fulfillment-new',name:'delivery-new',component:()=>import('@/views/DeliveryView.vue'),meta:{title:'从原订单建立定制项目'}},
 {path:'/production/projects/:recordId/fulfillment',name:'delivery-project',component:()=>import('@/views/DeliveryView.vue'),meta:{title:'定制制作与交付'}},
 {path:'/production/reviews/fulfillment/:recordId',name:'delivery-review',component:()=>import('@/views/DeliveryView.vue'),meta:{title:'定制工单独立处理'}},
 {path:'/production/orders/:orderId/new',name:'production-new-order',component,meta:{title:'为原订单新建制作项目'}},
 {path:'/production/projects/new',name:'production-new',component,meta:{title:'新建制作项目'}},
 {path:'/production/projects/:recordId/:operation(assignment|generation|versions)',name:'production-operation',component,meta:{title:'制作项目办理'}},
 {path:'/production/projects/:recordId?',name:'production-projects',component,meta:{title:'制作项目与素材'}},
 {path:'/production/versions/:recordId?',name:'production-feedback',component,meta:{title:'版本反馈与验收'}},
 {path:'/production/reviews/:section(projects|versions|generations)/:recordId?',name:'production-review',component,meta:{title:'独立制作核验'}},
]
