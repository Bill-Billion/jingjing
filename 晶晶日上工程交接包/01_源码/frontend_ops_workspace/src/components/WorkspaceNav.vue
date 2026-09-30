<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { CircleCheck, Document, OfficeBuilding, Reading } from '@element-plus/icons-vue'

const route = useRoute()
const links = [
  { to: '/workspace', label: '账号与机构', icon: OfficeBuilding },
  { to: '/contracts', label: '合同与规则', icon: Document },
  { to: '/supply/profiles', label: '供给申请', icon: Document },
  { to: '/supply/works', label: '我的作品', icon: Reading },
]
const reviews = [
  { to: '/supply/reviews/profile', label: '供给审核' },
  { to: '/supply/reviews/rights', label: '作品审核' },
]
function active(target: string) {
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
.workspace-nav svg{width:18px;height:18px;flex:none}
.nav-caption{margin:24px 12px 8px;font-size:12px;color:var(--ops-text-2)}
@media(max-width:760px){.workspace-nav{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace-nav a{gap:8px;padding:10px 8px}.nav-caption{grid-column:1/-1;margin:12px 8px 4px}}
</style>
