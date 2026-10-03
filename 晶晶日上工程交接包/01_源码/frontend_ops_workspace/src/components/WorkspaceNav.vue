<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { CircleCheck, Collection, Document, FolderOpened, OfficeBuilding, Reading, Tickets, User, View } from '@element-plus/icons-vue'

const route = useRoute()
const links = [
  { to: '/workspace', label: '账号与机构', icon: User },
  { to: '/contracts', label: '合同与规则', icon: Document },
  { to: '/supply/profiles', label: '供给申请', icon: FolderOpened },
  { to: '/supply/works', label: '我的作品', icon: Collection },
  { to: '/licensing/catalog', label: '选剧本', icon: Reading },
  { to: '/licensing/products', label: '许可商品', icon: Tickets },
  { to: '/licensing/reservations', label: '许可办理', icon: Document },
  { to: '/licensing/projects', label: '项目与绑定', icon: OfficeBuilding },
  { to: '/licensing/readings', label: '受控阅稿', icon: View },
  { to: '/trade/specifications', label: '商品规格', icon: Collection },
  { to: '/trade/quotes', label: '报价订单', icon: Document },
  { to: '/gigs/catalogue', label: '商单需求与提案', icon: Collection },
  { to: '/gigs/relations', label: '直接 MCN 合作', icon: OfficeBuilding },
  { to: '/gigs/commissions', label: '佣金计提', icon: Tickets },
  { to: '/gigs/rankings', label: '商单榜单', icon: View },
  { to: '/trade/payments', label: '付款退款', icon: Tickets },
  { to: '/production/projects', label: '制作项目', icon: FolderOpened },
  { to: '/projects/projects', label: '项目选角', icon: User },
  { to: '/projects/plans', label: '项目会签', icon: Document },
  { to: '/projects/releases', label: '项目发行', icon: Collection },
  { to: '/projects/channels', label: '渠道档案', icon: OfficeBuilding },
]
const reviews = [
  { to: '/gigs/reviews/requests', label: '商单与提案核验' },
  { to: '/gigs/reviews/rules', label: '商单规则核验' },
  { to: '/supply/reviews/profile', label: '供给审核' },
  { to: '/supply/reviews/rights', label: '作品审核' },
  { to: '/licensing/reviews/products', label: '许可核验' },
  { to: '/trade/reviews/specifications', label: '规格审核' },
  { to: '/trade/reviews/quotes', label: '报价审核' },
  { to: '/trade/reviews/refunds', label: '退款与旧单核对' },
  { to: '/production/reviews/projects', label: '制作独立核验' },
  { to: '/projects/reviews/plans', label: '项目独立核验' },
]
function active(target: string) {
  if (target === '/gigs/catalogue') return /^\/gigs\/(catalogue|requests|offers)(\/|$)/.test(route.path)
  if (target === '/gigs/reviews/requests') return /^\/gigs\/reviews\/(requests|offers)(\/|$)/.test(route.path)
  if (target === '/gigs/reviews/rules') return /^\/gigs\/(rules|reviews\/rules)(\/|$)/.test(route.path)
  if (target === '/trade/quotes' && route.path.startsWith('/trade/offers/')) return true
  if (target === '/projects/reviews/plans') return route.path.startsWith('/projects/reviews/')
  if (target === '/projects/plans') return /^\/projects\/(?:plans|projects\/[^/]+\/(?:plans|readiness))(\/|$)/.test(route.path)
  if (target === '/projects/releases') return /^\/projects\/(?:releases|editions|projects\/[^/]+\/(?:editions|releases))(\/|$)/.test(route.path)
  if (target === '/projects/channels') return route.path.startsWith('/projects/channels')
  if (target === '/projects/projects') return route.path.startsWith('/projects/')&&!/^\/projects\/(?:reviews|plans|releases|editions|channels|projects\/[^/]+\/(?:plans|readiness|editions|releases))(\/|$)/.test(route.path)

  if (target === '/production/projects') return /^\/production\/(projects|orders|versions)(\/|$)/.test(route.path)
  if (target === '/production/reviews/projects') return route.path.startsWith('/production/reviews/')
  if (target === '/trade/quotes') return /^\/trade\/(quotes|orders)(\/|$)/.test(route.path)
  if (target === '/trade/payments') return /^\/trade\/(payments|refunds|legacy)(\/|$)/.test(route.path)
  if (target === '/trade/reviews/refunds') return /^\/trade\/reviews\/(refunds|legacy)(\/|$)/.test(route.path)
  if (target === '/supply/works' && route.path.startsWith('/supply/adaptations/')) return true
  if (target === '/licensing/reviews/products') return route.path.startsWith('/licensing/reviews/')
  if (target === '/licensing/reservations') return ['reservations', 'evidence', 'grants'].some(section => route.path === `/licensing/${section}` || route.path.startsWith(`/licensing/${section}/`))
  if (target === '/licensing/projects' && route.path.startsWith('/licensing/bindings')) return true
  if (target === '/supply/reviews/rights') {
    return ['/supply/reviews/rights', '/supply/reviews/content']
      .some(path => route.path === path || route.path.startsWith(path + '/'))
  }
  return route.path === target || route.path.startsWith(target + '/')
}
</script>

<template>
  <nav class="workspace-nav" aria-label="工作区导航">
    <RouterLink v-for="item in links" :key="item.to" :to="item.to"
      :class="{ active: active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined">
      <component :is="item.icon" aria-hidden="true" />{{ item.label }}
    </RouterLink>
    <p class="nav-caption">独立审核</p>
    <RouterLink v-for="item in reviews" :key="item.to" :to="item.to"
      :class="{ active: active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined">
      <CircleCheck aria-hidden="true" />{{ item.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.workspace-nav{display:grid;gap:6px}
.workspace-nav a{min-height:44px;display:flex;align-items:center;gap:12px;padding:10px 12px;color:var(--ops-text-2);text-decoration:none;border-radius:10px;font-size:14px}
.workspace-nav a.active{color:var(--ops-ink);background:var(--ops-accent-soft);font-weight:600}
.workspace-nav svg{width:20px;height:20px;flex:none}
.nav-caption{margin:24px 12px 8px;font-size:12px;color:var(--ops-text-2)}
@media(max-width:760px){.workspace-nav{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace-nav a{gap:8px;padding:10px 8px}.nav-caption{grid-column:1/-1;margin:12px 8px 4px}}
</style>
