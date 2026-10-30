<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
import type { Component } from 'vue'
import { CircleCheck, Collection, Document, FolderOpened, OfficeBuilding, Reading, Tickets, User, View, Setting, Film, Briefcase, EditPen, VideoCamera, DataAnalysis } from '@element-plus/icons-vue'
import { domains } from '@/business'

const route = useRoute()
const query = ref('')
const links = [
  { to: '/workspace', label: '账号与机构', icon: User },
  { to: '/discovery', label: '查找公开内容', icon: View },
  { to: '/directory/organizations', label: '公开机构', icon: OfficeBuilding },
  { to: '/directory/featured', label: '精选艺人', icon: User },
  { to: '/directory/manage', label: '本机构公开资料', icon: Document },
  { to: '/me/collections/favorites', label: '我的收藏', icon: Collection },
  { to: '/me/collections/history', label: '浏览记录', icon: Reading },
  { to: '/support/tickets', label: '我的反馈与举报', icon: Document },
  { to: '/support/operations', label: '客服处理', icon: CircleCheck },
  { to: '/directory/reviews/ORGANIZATION', label: '机构资料与精选审核', icon: CircleCheck },
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
  if (target === '/support/tickets') return route.path.startsWith('/support/')&&!route.path.startsWith('/support/operations')
  if (target === '/directory/featured') return route.path==='/directory/featured'
  if (target === '/directory/reviews/ORGANIZATION') return route.path.startsWith('/directory/reviews/')||route.path==='/directory/featured/new'
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
interface Entry { to:string; label:string; icon:Component; domain?:string }
const entries:Entry[] = [
  ...links,
  ...reviews.map(item => ({...item,icon:CircleCheck})),
  ...Object.values(domains).map(d => ({to:`/${d.key}/${d.sections[0]!.key}`,label:d.title,icon:Collection,domain:d.key})),
]
const categories = [
  {id:'account',icon:Setting,label:'账号与个人服务',roots:['workspace','contracts','wallet','redemption','engagement','privacy','me/collections','support/tickets','support/new']},
  {id:'people',icon:User,label:'人物与作品',roots:['artists','supply','media','participation','discovery','directory/organizations','directory/featured','directory/manage']},
  {id:'trade',icon:Film,label:'影片与许可交易',roots:['stock','licensing','trade']},
  {id:'gigs',icon:Briefcase,label:'商单与通告',roots:['gigs','notices']},
  {id:'creation',icon:EditPen,label:'故事与共创',roots:['operations/customization','cocreation','auditions','conversations']},
  {id:'production',icon:VideoCamera,label:'制作与发行',roots:['production','projects']},
  {id:'finance',icon:DataAnalysis,label:'财务与运营',roots:['finance','operations','support/operations','directory/reviews']},
]
const categoryFor = (entry:Entry) => categories.find(group => group.roots.some(root => entry.to === `/${root}` || entry.to.startsWith(`/${root}/`)))!
const groups = categories.map(group => ({...group,entries:entries.filter(entry => categoryFor(entry).id === group.id)}))
const isActive = (entry:Entry) => entry.domain ? route.path.startsWith(`/${entry.domain}/`) : active(entry.to)
const currentLabel = computed(() => typeof route.meta.title === 'string' ? route.meta.title : entries.find(isActive)?.label || '当前业务')
const expanded = ref<string[]>([]), searchCollapsed = ref<string[]>([])
watch(query, () => { searchCollapsed.value = [] }, {flush:'sync'})
const matches = (value:string) => value.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
const visibleGroups = computed(() => groups.map(group => ({...group,entries:group.entries.filter(entry => matches(group.label) || matches(`${entry.label} ${entry.to}`))})).filter(group => group.entries.length))
const resultCount = computed(() => visibleGroups.value.reduce((count,group) => count + group.entries.length,0))
const isExpanded = (id:string) => query.value.trim() ? !searchCollapsed.value.includes(id) : expanded.value.includes(id)
function toggleGroup(id:string) {
  if (query.value.trim()) searchCollapsed.value = searchCollapsed.value.includes(id) ? searchCollapsed.value.filter(value => value !== id) : [...searchCollapsed.value,id]
  else expanded.value = expanded.value.includes(id) ? expanded.value.filter(value => value !== id) : [...expanded.value,id]
}
function collapseAll() { query.value = ''; expanded.value = [] }
watch(() => route.fullPath, () => {
  query.value = ''
  const current = groups.find(group => group.entries.some(isActive))
  if (current && !expanded.value.includes(current.id)) expanded.value = [...expanded.value,current.id]
}, {immediate:true})

</script>

<template>
  <section class="workspace-navigation" aria-label="工作区入口">
    <div class="workspace-nav-heading"><h2>工作区入口</h2><button type="button" class="outline" @click="collapseAll">全部收起</button></div>
    <p class="workspace-nav-current"><span>当前位置</span><strong>{{ currentLabel }}</strong></p>
    <div class="workspace-nav-search"><label for="workspace-nav-query">查找工作区入口</label><input id="workspace-nav-query" v-model="query" type="search" autocomplete="off" placeholder="名称或分类" aria-controls="workspace-nav-results"><p v-if="query.trim()" role="status">找到 {{resultCount}} 个入口<button type="button" class="outline" @click="query=''">清除筛选</button></p></div>
    <nav id="workspace-nav-results" class="workspace-nav" aria-label="工作区导航">
      <div v-for="group in visibleGroups" :key="group.id" class="workspace-nav-group">
        <button type="button" class="workspace-nav-parent" :class="{'has-current':group.entries.some(isActive)}" :aria-expanded="isExpanded(group.id)" :aria-controls="`workspace-group-${group.id}`" @click="toggleGroup(group.id)">
          <svg class="workspace-nav-chevron" :class="{expanded:isExpanded(group.id)}" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg><component :is="group.icon" aria-hidden="true"/><span>{{group.label}}</span><span class="workspace-nav-count" aria-hidden="true">{{group.entries.length}}</span>
        </button>
        <ul :id="`workspace-group-${group.id}`" v-show="isExpanded(group.id)" class="workspace-nav-children">
          <li v-for="item in group.entries" :key="item.to"><RouterLink :to="item.to" :class="{active:isActive(item)}" :aria-current="isActive(item)?'page':undefined"><component :is="item.icon" aria-hidden="true"/><span>{{item.label}}</span></RouterLink></li>
        </ul>
      </div>
      <p v-if="!resultCount" class="nav-empty" role="status">没有匹配入口，请更换名称或清除筛选。</p>
    </nav>
  </section>
</template>

<style scoped>
.workspace-nav-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.workspace-nav-heading h2{margin:0;font-size:16px;line-height:1.5}.workspace-nav-heading button{min-height:36px;padding:4px 7px;font-size:11px;white-space:nowrap}
.workspace-nav-current{display:grid;gap:4px;margin:12px 0 16px;line-height:1.5;overflow-wrap:anywhere}.workspace-nav-current>span{font-size:11px;color:var(--ops-text-2)}.workspace-nav-current strong{font-size:13px;font-weight:600}
.workspace-nav-search{display:grid;gap:7px;margin-bottom:12px;font-size:12px}.workspace-nav-search input{box-sizing:border-box;width:100%;min-width:0;min-height:40px}.workspace-nav-search p{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0}.workspace-nav-search button{min-height:32px;padding:4px 7px;font-size:11px}
.workspace-nav{max-height:55dvh;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.workspace-nav-group{border-top:1px solid var(--ops-border)}
.workspace-nav-parent{display:flex;align-items:center;gap:5px;width:100%;min-height:44px;padding:8px 2px;border:0;background:transparent;color:var(--ops-text);text-align:left;font-size:13px;line-height:1.5}.workspace-nav-parent>span:not(.workspace-nav-count){flex:1}.workspace-nav-parent.has-current{color:var(--ops-ink)}.workspace-nav-parent.has-current .workspace-nav-count{color:var(--editorial-accent,#aa352a)}.workspace-nav-count{font-size:10px;color:var(--ops-text-2);font-weight:400}.workspace-nav-parent svg{width:16px;height:16px;flex:none}.workspace-nav-parent .workspace-nav-chevron{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.5}.workspace-nav-chevron.expanded{transform:rotate(90deg)}
.workspace-nav-children{margin:0 0 8px 9px;padding:0 0 0 9px;border-left:1px solid var(--ops-border-strong);list-style:none}.workspace-nav a{display:flex;align-items:center;gap:7px;min-height:40px;padding:8px 7px;color:var(--ops-text-2);text-decoration:none;font-size:12px;line-height:1.5}.workspace-nav a svg{width:16px;height:16px;flex:none}.workspace-nav a span{min-width:0;overflow-wrap:anywhere}.workspace-nav a.active{color:var(--ops-bg);background:var(--ops-ink);font-weight:600}.workspace-nav a.active svg{color:var(--editorial-accent,#aa352a)}.workspace-nav-parent:hover,.workspace-nav a:not(.active):hover{background:var(--ops-accent-soft)}.nav-empty{font-size:13px;line-height:1.7}
@media(max-width:760px){.workspace-nav{max-height:320px}.workspace-nav-current{display:flex;align-items:baseline;gap:10px;margin:8px 0 12px}.workspace-nav-parent{font-size:14px;padding:8px 6px}.workspace-nav a{font-size:13px;min-height:44px}.workspace-nav-heading h2{font-size:16px}}
</style>
