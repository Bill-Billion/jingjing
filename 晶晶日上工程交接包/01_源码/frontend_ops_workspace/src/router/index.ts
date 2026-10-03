import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { tradeRoutes } from './tradeRoutes'
import { productionRoutes } from './productionRoutes'
import { projectsRoutes } from './projectsRoutes'

/**
 * 路由表。
 *
 * 页面：
 *   /login       登录（按 PR #11 的账号接口做）
 *   /workspace   账号、身份、机构、邀请与成员管理
 *   /contracts/:snapshotId? 指定合同、采用规则与服务条件读取
 *   /dev/status  开发自检（探针、接口前缀、未实现清单）——**只在开发构建里注册**
 *
 * 运营区 /admin 与合作方区 /partner 的版式与页面还没做，等接口补齐后再加。
 * 路由守卫只判断"有没有令牌"，**不判断权限**——权限一律由服务端判定。
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/workspace',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/workspace',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue'),
      meta: { title: '工作台' },
    },
    {
      path: '/contracts/:snapshotId?',
      name: 'contracts',
      component: () => import('@/views/ContractsView.vue'),
      meta: { title: '合同与规则' },
    },
    { path: '/supply/profiles/:recordId?', name: 'supply-profile', component: () => import('@/views/SupplyView.vue'), meta: { title: '供给申请' } },
    { path: '/supply/works/new', name: 'supply-new', component: () => import('@/views/SupplyView.vue'), meta: { title: '新投稿' } },
    { path: '/supply/adaptations/:bindingId/new', name: 'supply-adaptation', component: () => import('@/views/SupplyView.vue'), meta: { title: '项目改稿' } },
    { path: '/supply/works/:recordId/revision', name: 'supply-revision', component: () => import('@/views/SupplyView.vue'), meta: { title: '新修订' } },
    { path: '/supply/works/:recordId?', name: 'supply-work', component: () => import('@/views/SupplyView.vue'), meta: { title: '我的作品' } },
    { path: '/supply/reviews/:channel(profile|rights|content)/:recordId?', name: 'supply-review', component: () => import('@/views/SupplyView.vue'), meta: { title: '独立审核' } },
    { path: '/licensing/:section(products|projects|readings)/new', name: 'license-new', component: () => import('@/views/LicensingView.vue'), meta: { title: '填写许可与项目资料' } },
    { path: '/licensing/reviews/:section(products|evidence|readings|activation|grants|projects|bindings)/:recordId?', name: 'license-review', component: () => import('@/views/LicensingView.vue'), meta: { title: '独立许可核验' } },
    { path: '/licensing/:section(catalog|products|reservations|evidence|grants|projects|bindings|readings)/:recordId?', name: 'licensing', component: () => import('@/views/LicensingView.vue'), meta: { title: '剧本许可与项目' } },
    ...tradeRoutes,
    ...productionRoutes,
    ...projectsRoutes,
    // 开发自检页：整个路由项在构建时按 import.meta.env.DEV 决定要不要加。
    // 用 import.meta.env.DEV 而不是路由守卫里判断，是为了让生产构建干脆
    // 不产生这条路由、也不打包这个页面，而不是"能访问但被拦下"。
    ...(import.meta.env.DEV
      ? [
          {
            path: '/dev/status',
            name: 'dev-status',
            component: () => import('@/views/DevStatusView.vue'),
            meta: { public: true, title: '开发自检' },
          },
        ]
      : []),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true, title: '页面不存在' },
    },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  // 没有令牌却要进非公开页 → 回登录页，并记住原来想去哪
  if (!to.meta.public && !session.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 已经登录还去登录页 → 直接进工作台
  if (to.name === 'login' && session.isLoggedIn) {
    return { name: 'workspace' }
  }
  return true
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · 晶晶日上工作台` : '晶晶日上工作台'
})

export default router
