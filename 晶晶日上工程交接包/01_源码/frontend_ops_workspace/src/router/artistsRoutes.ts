import type { RouteRecordRaw } from 'vue-router'
const component = () => import('@/views/ArtistsView.vue')
const route = (path:string,name:string,artistsView:string,title:string):RouteRecordRaw => ({path,name,component,meta:{artistsView,title}})
export const artistsRoutes:RouteRecordRaw[] = [
 route('/artists/people','artists-people','people','真人与数字人'),
 route('/artists/people/new','artists-new-person','person-new','建立本人档案'),
 route('/artists/catalog','artists-catalog','catalog','已批准艺人目录'),
 route('/artists/services','artists-services','services','创建与托管服务'),
 route('/artists/people/:personId/:action(avatars|identity|consents|delegations|variants|halos|listings|services)/new','artists-new-record','new','办理真人与数字人事项'),
 route('/artists/people/:personId/records/:recordId','artists-record','record','艺人资料详情'),
 route('/artists/people/:personId','artists-person','person','真人与数字人档案'),
 route('/artists/reviews/:kind(CONSENT|HALO|APPEAL|LISTING|SERVICE)','artists-reviews','reviews','艺人资料核验'),
 route('/artists/reviews/:kind(CONSENT|HALO|APPEAL|LISTING|SERVICE)/people/:personId/records/:recordId','artists-review-record','review-record','独立核验艺人资料'),
]
