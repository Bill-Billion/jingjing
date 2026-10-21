import type { RouteRecordRaw } from 'vue-router'
const component=()=>import('@/views/ProjectsView.vue')
const page=(path:string,name:string,view:string,title:string):RouteRecordRaw=>({path,name,component,meta:{projectView:view,title}})
export const projectsRoutes:RouteRecordRaw[]=[
 page('/projects/catalogue','projects-catalogue','catalogue','公开角色与渠道摘要'),
 page('/projects/projects/new','projects-new','new','建立项目与招募角色'),
 page('/projects/projects/:recordId/roles','projects-roles','roles','建立项目与招募角色'),
 page('/projects/projects/:recordId/plans/new','projects-plan','plan','提交项目方案与权利依据'),
 page('/projects/projects/:recordId/readiness','projects-readiness','readiness','项目开工条件与启动'),
 page('/projects/projects/:recordId/editions/new','projects-edition','edition','提交项目成片版本'),
 page('/projects/projects/:recordId/releases/new','projects-release','release','登记发行申请'),
 page('/projects/projects/:recordId?','projects-list','list','项目与角色招募管理'),
 page('/projects/roles/:recordId/apply','projects-apply','apply','角色申请与本人主体确认'),
 page('/projects/candidates/:recordId/select','projects-select','select','候选筛选与入选决定'),
 page('/projects/candidates/:recordId/respond','projects-respond','respond','角色申请与本人主体确认'),
 page('/projects/plans/:recordId/confirm','projects-plan-confirm','confirm-plan','项目方案按顺序确认'),
 page('/projects/editions/:recordId/confirm','projects-edition-confirm','confirm-edition','项目成片与材料会签'),
 page('/projects/plans','projects-plans','plans','项目方案与会签'),
 page('/projects/releases','projects-releases','releases','项目发行记录'),
 page('/projects/channels/new','projects-channel-new','channel','登记发行渠道档案'),
 page('/projects/channels/:recordId?','projects-channel','channel-detail','发行渠道档案'),
 page('/projects/releases/:recordId/external','projects-external','external','记录真实外部发行结果'),
 page('/projects/records/:recordId','projects-record','record','项目业务记录'),
 page('/projects/reviews/:section(plans|editions|channels|releases|external-events)/:recordId?','projects-review','review','独立项目与发行核验'),
]
