import { domains } from '@/business'
import type { RouteRecordRaw } from 'vue-router'
export const businessRoutes:RouteRecordRaw[]=Object.values(domains).flatMap(d=>[
 {path:`/${d.key}`,redirect:`/${d.key}/${d.sections[0]!.key}`},
 {path:`/${d.key}/:section(${d.sections.map(s=>s.key).join('|')})/:recordId?`,name:`business-${d.key}`,component:()=>import('@/views/BusinessView.vue'),meta:{domain:d.key,title:d.title}},
])
