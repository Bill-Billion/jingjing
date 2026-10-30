import type {RouteRecordRaw} from 'vue-router'
export const clientServiceRoutes:RouteRecordRaw[]=[
 {path:'/discovery',name:'discovery',component:()=>import('@/views/DiscoveryView.vue'),meta:{title:'查找公开内容'}},
 {path:'/directory/organizations/:partyId?',name:'directory-organizations',component:()=>import('@/views/DirectoryView.vue'),meta:{title:'公开机构',directoryView:'organizations'}},
 {path:'/directory/featured',name:'directory-featured',component:()=>import('@/views/DirectoryView.vue'),meta:{title:'精选艺人',directoryView:'featured'}},
 {path:'/directory/featured/new',name:'directory-feature-new',component:()=>import('@/views/DirectoryManageView.vue'),meta:{title:'提出精选艺人',directoryView:'feature-new',directoryOperator:true}},
 {path:'/directory/manage/new',name:'directory-profile-new',component:()=>import('@/views/DirectoryManageView.vue'),meta:{title:'提交机构公开资料',directoryView:'profile-new'}},
 {path:'/directory/manage/:recordId?',name:'directory-manage',component:()=>import('@/views/DirectoryManageView.vue'),meta:{title:'本机构公开资料'}},
 {path:'/directory/reviews/:kind(ORGANIZATION|FEATURED_ARTIST)/:recordId?',name:'directory-review',component:()=>import('@/views/DirectoryManageView.vue'),meta:{title:'目录独立审核',directoryOperator:true}},
 {path:'/me/collections/:section(favorites|history)',name:'collections',component:()=>import('@/views/CollectionsView.vue'),meta:{title:'我的收藏与浏览记录'}},
 {path:'/support/new',name:'support-new',component:()=>import('@/views/SupportView.vue'),meta:{title:'提交反馈或举报',supportView:'new'}},
 {path:'/support/operations/:ticketId?',name:'support-operations',component:()=>import('@/views/SupportView.vue'),meta:{title:'客服处理',supportOperator:true}},
 {path:'/support/tickets/:ticketId?',name:'support-tickets',component:()=>import('@/views/SupportView.vue'),meta:{title:'我的反馈与举报'}},
]
