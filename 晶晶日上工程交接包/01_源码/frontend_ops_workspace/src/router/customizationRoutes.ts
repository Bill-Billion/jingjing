import type { RouteRecordRaw } from 'vue-router'

export const customizationRoutes: RouteRecordRaw[] = [
  { path:'/operations/customization', name:'customization-intake', component:() => import('@/views/CustomizationIntakeView.vue'), meta:{title:'故事收件与受理'} },
  { path:'/operations/customization/:requestId', name:'customization-intake-detail', component:() => import('@/views/CustomizationIntakeView.vue'), meta:{title:'故事提交详情'} },
]
