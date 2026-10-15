import type { RouteRecordRaw } from 'vue-router'
export const gigsRoutes:RouteRecordRaw[]=[
 {path:'/gigs/:section(requests|offers|relations|rules)/new',name:'gigs-new',component:()=>import('@/views/GigsView.vue'),meta:{title:'登记商业合作资料'}},
 {path:'/gigs/reviews/:section(requests|offers|rules)/:recordId?',name:'gigs-review',component:()=>import('@/views/GigsView.vue'),meta:{title:'商单独立核验'}},
 {path:'/gigs/:section(catalogue|requests|offers|relations|commissions|rules|rankings)/:recordId?',name:'gigs',component:()=>import('@/views/GigsView.vue'),meta:{title:'商单与商业合作'}},
]
