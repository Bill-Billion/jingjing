import type { RouteRecordRaw } from 'vue-router'

export const customizationRoutes: RouteRecordRaw[] = [
  { path:'/operations/customization/mine', name:'customization-own', component:() => import('@/views/CustomizationOwnView.vue'), meta:{title:'我的私人故事'} },
  { path:'/operations/customization/mine/new', name:'customization-own-new', component:() => import('@/views/CustomizationOwnView.vue'), meta:{title:'写下本人的故事'} },
  { path:'/operations/customization/mine/:requestId', name:'customization-own-detail', component:() => import('@/views/CustomizationOwnView.vue'), meta:{title:'我的故事与补件'} },
  { path:'/operations/customization', name:'customization-intake', component:() => import('@/views/CustomizationIntakeView.vue'), meta:{title:'故事收件与受理'} },
  { path:'/operations/customization/:requestId', name:'customization-intake-detail', component:() => import('@/views/CustomizationIntakeView.vue'), meta:{title:'故事提交详情'} },
]
