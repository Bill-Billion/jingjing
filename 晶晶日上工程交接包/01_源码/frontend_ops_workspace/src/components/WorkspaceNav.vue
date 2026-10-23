<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { CircleCheck, Collection, Document, FolderOpened, OfficeBuilding, Reading, Tickets, User, View } from '@element-plus/icons-vue'
import { domains } from '@/business'

const route = useRoute()
const query = ref('')
const matches = (label: string, path: string) => `${label} ${path}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
const visibleLinks = computed(() => links.filter(item => matches(item.label, item.to)))
const visibleReviews = computed(() => reviews.filter(item => matches(item.label, item.to)))
const visibleDomains = computed(() => Object.values(domains).filter(d => matches(d.title, `/${d.key}/`)))
const resultCount = computed(() => visibleLinks.value.length + visibleReviews.value.length + visibleDomains.value.length)
watch(() => route.path, () => { query.value = '' })
const links = [
  { to: '/workspace', label: '账号与机构', icon: User },
  { to: '/contracts', label: '合同与规则', icon: Document },
  { to: '/supply/profiles', label: '供给申请', icon: FolderOpened },
  { to: '/supply/works', label: '我的作品', icon: Collection },
  { to: '/artists/people', label: '真人与数字人', icon: User },
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
  { to: '/finance/agreements', label: '结算约定与余额', icon: Document },
  { to: '/finance/payouts', label: '财务付款', icon: Tickets },
  { to: '/finance/income', label: '渠道收入与对账', icon: Collection },
  { to: '/finance/disputes', label: '争议与账务调整', icon: Reading },
  { to: '/operations/notifications', label: '业务通知与留言', icon: Document },
  { to: '/operations/reports', label: '经营报表', icon: Collection },
  { to: '/operations/customization', label: '故事收件与受理', icon: Document },
]
const reviews = [
  { to: '/artists/reviews/CONSENT', label: '艺人资料核验' },
  { to: '/operations/moderation', label: '留言独立管理' },
  { to: '/operations/audit', label: '操作审计' },
  { to: '/finance/reviews/agreements', label: '独立财务核验' },
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
  if (target === '/artists/people') return route.path.startsWith('/artists/') && !route.path.startsWith('/artists/reviews/')
  if (target === '/artists/reviews/CONSENT') return route.path.startsWith('/artists/reviews/')
  if (target === '/operations/notifications') return /^\/operations\/(?:notifications|(?:operator\/)?objects)(\/|$)/.test(route.path)
  if (target === '/operations/reports') return /^\/operations\/(?:operator\/)?reports(\/|$)/.test(route.path)

  if (target === '/finance/reviews/agreements') return route.path.startsWith('/finance/reviews/')
  const financeGroup = /(?:\/payouts(?:\/|$)|\/readiness$)/.test(route.path) ? '/finance/payouts' : /(?:\/income$|\/statements(?:\/|$)|\/reconciliations\/)/.test(route.path) ? '/finance/income' : /(?:\/disputes(?:\/|$)|\/adjustments\/)/.test(route.path) ? '/finance/disputes' : '/finance/agreements'
  if (target.startsWith('/finance/') && !target.includes('/reviews/')) return route.path.startsWith('/finance/')&&!route.path.startsWith('/finance/reviews/')&&financeGroup===target
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
  <div class="workspace-nav-search"><label for="workspace-nav-query">查找工作区入口</label><input id="workspace-nav-query" v-model="query" type="search" autocomplete="off" placeholder="按业务名称查找" aria-controls="workspace-nav-results"><p v-if="query.trim()" role="status">找到 {{resultCount}} 个入口<button type="button" class="outline" @click="query=''">清除筛选</button></p></div>
  <div id="workspace-nav-results" class="workspace-nav-results" role="region" tabindex="0" aria-label="工作区入口列表">
  <nav v-if="route.meta.domain&&visibleDomains.length" class="workspace-business-nav" aria-label="V5业务办理"><p class="nav-caption">影片与合作</p><RouterLink v-for="d in visibleDomains" :key="d.key" :to="`/${d.key}/${d.sections[0]!.key}`" :class="{active:route.path.startsWith(`/${d.key}/`)}" :aria-current="route.path.startsWith(`/${d.key}/`)?'page':undefined"><Collection aria-hidden="true"/>{{d.title}}</RouterLink></nav>
  <nav class="workspace-nav" aria-label="工作区导航">
    <RouterLink v-for="item in visibleLinks" :key="item.to" :to="item.to"
      :class="{ active: active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined">
      <component :is="item.icon" aria-hidden="true" />{{ item.label }}
    </RouterLink>
    <p v-if="visibleReviews.length" class="nav-caption">独立审核</p>
    <RouterLink v-for="item in visibleReviews" :key="item.to" :to="item.to"
      :class="{ active: active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined">
      <CircleCheck aria-hidden="true" />{{ item.label }}
    </RouterLink>
  </nav>

  <nav v-if="!route.meta.domain&&visibleDomains.length" class="workspace-business-nav" aria-label="V5业务办理"><p class="nav-caption">影片与合作</p><RouterLink v-for="d in visibleDomains" :key="d.key" :to="`/${d.key}/${d.sections[0]!.key}`" :class="{active:route.path.startsWith(`/${d.key}/`)}" :aria-current="route.path.startsWith(`/${d.key}/`)?'page':undefined"><Collection aria-hidden="true"/>{{d.title}}</RouterLink></nav>
  <p v-if="!resultCount" class="nav-empty" role="status">没有匹配入口，请更换名称或清除筛选。菜单显示不授予业务权限。</p>
  </div>
</template>

<style scoped>
.workspace-nav{display:grid;gap:6px}
.workspace-nav-search{display:grid;gap:8px;margin:0 0 12px;font-size:13px}.workspace-nav-search input{width:100%;min-width:0;min-height:44px}.workspace-nav-search p{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0}.workspace-nav-search button{min-height:36px;font-size:12px}.workspace-nav-results:focus-visible{outline:2px solid var(--ops-ink);outline-offset:2px}.nav-empty{font-size:13px;line-height:1.7}
.workspace-nav a{min-height:44px;display:flex;align-items:center;gap:12px;padding:10px 12px;color:var(--ops-text-2);text-decoration:none;border-radius:var(--ops-radius-sm);font-size:14px}
.workspace-nav a.active{color:var(--ops-ink);background:var(--ops-accent-soft);font-weight:600}
.workspace-nav svg{width:20px;height:20px;flex:none}
.nav-caption{margin:24px 12px 8px;font-size:12px;color:var(--ops-text-2)}
.workspace-business-nav{display:grid;gap:2px}.workspace-business-nav a{min-height:44px;display:flex;align-items:center;gap:12px;padding:10px 12px;color:var(--ops-text-2);text-decoration:none;font-size:14px}.workspace-business-nav a.active{background:var(--ops-ink);color:var(--ops-bg);font-weight:600}.workspace-business-nav svg{width:20px;height:20px;flex:none}
@media(max-width:760px){.workspace-nav-results{max-height:50dvh;overflow-y:auto;overscroll-behavior-y:contain;padding-bottom:8px;border-bottom:1px solid var(--ops-border-strong)}.workspace-nav{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace-nav a{gap:8px;padding:10px 8px}.nav-caption{grid-column:1/-1;margin:12px 8px 4px}}
</style>
