import type {RouteRecordRaw} from 'vue-router'
const component=()=>import('@/views/OperationsView.vue')
const page=(path:string,name:string,view:string,title:string,operator=false):RouteRecordRaw=>({path,name,component,meta:{operationsView:view,title,operationsOperator:operator}})
export const operationsRoutes:RouteRecordRaw[]=[
 page('/operations/notifications/:eventId(\\d+)?','ops-notifications','notifications','我的业务通知'),
 page('/operations/objects/:domain(TRADE|PRODUCTION|PROJECTS)/:recordId/comments','ops-comments','comments','订单或项目纯文本留言'),
 page('/operations/operator/objects/:domain(TRADE|PRODUCTION|PROJECTS)/:recordId/comments','ops-operator-comments','comments','订单或项目纯文本留言',true),
 page('/operations/moderation','ops-moderation','moderation','业务留言独立管理',true),
 page('/operations/moderation/:domain(TRADE|PRODUCTION|PROJECTS)/:recordId/:commentId?','ops-moderation-object','moderation','业务留言独立管理',true),
 page('/operations/audit','ops-audit','audit','获授权操作历史',true),
 page('/operations/audit/:domain(TRADE|PRODUCTION|PROJECTS|FINANCE|SUPPLY|LICENSE|GIGS)/:recordId','ops-object-audit','audit','获授权操作历史',true),
 page('/operations/reports/new','ops-report-new','report-new','申请可追溯报表'),
 page('/operations/reports/:recordId?','ops-reports','reports','报表任务与可追溯结果'),
 page('/operations/operator/reports/new','ops-operator-report-new','report-new','申请可追溯报表',true),
 page('/operations/operator/reports/:recordId?','ops-operator-reports','reports','报表任务与可追溯结果',true),
]
