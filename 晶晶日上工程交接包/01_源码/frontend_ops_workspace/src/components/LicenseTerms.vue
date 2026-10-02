<script setup lang="ts">
import { rights, purposes, territoryText, languageText, type Terms } from '@/api/modules/licensing'
defineProps<{ terms: Terms; omitSummary?: boolean; bindingCount?: number }>()
const date = (s: string) => new Date(s).toLocaleString('zh-CN',{hour12:false})
</script>
<template>
  <div class="license-terms-grid">
    <section v-if="!omitSummary" class="license-term-group"><h3>获准权利与独家约定</h3><dl class="supply-facts"><div><dt>逐项获准权利</dt><dd>{{ terms.rights.map(r => rights[r]).join('、') }}</dd></div><div><dt>独家约定</dt><dd>{{ terms.exclusive ? '独家，仅限约定范围' : '非独家' }}</dd></div></dl></section>
    <section class="license-term-group"><h3>权利用途、地域与语言</h3><dl class="supply-facts"><div><dt>允许用途</dt><dd>{{ terms.purposes.map(p => purposes[p]).join('、') }}</dd></div><div><dt>使用地域</dt><dd>{{ terms.territories.map(territoryText).join('、') }}</dd></div><div><dt>使用语言</dt><dd>{{ terms.languages.map(languageText).join('、') }}</dd></div></dl></section>
    <section class="license-term-group"><h3>开发和许可期限</h3><dl class="supply-facts"><div><dt>许可开始</dt><dd class="license-deadline">{{ date(terms.valid_from) }}</dd></div><div><dt>开发截止</dt><dd class="license-deadline">{{ date(terms.development_until) }}</dd></div><div><dt>许可有效截止</dt><dd class="license-deadline">{{ date(terms.valid_until) }}</dd></div></dl><p class="muted">日期与时间按本地时间显示。</p></section>
    <section class="license-term-group"><h3>项目额度与已绑定记录</h3><dl class="supply-facts"><div><dt>项目额度</dt><dd>{{ terms.project_limit }} 个项目</dd></div><div><dt>每项目集数</dt><dd>最多 {{ terms.episode_limit }} 集</dd></div><div v-if="bindingCount !== undefined"><dt>本次读取的绑定</dt><dd>{{ bindingCount }} 条项目绑定</dd></div></dl></section>
  </div>
  <div class="license-terms-copy"><h3>完整约定条款</h3><p class="long-text terms-copy">{{ terms.terms_text }}</p><p class="muted">独家不会自动增加发行权。剧本许可与数字人形象、声音同意分别办理。</p></div>
</template>
<style scoped>.license-terms-copy{padding-top:20px;margin-top:20px;border-top:1px solid var(--ops-border)}.terms-copy{margin:0;line-height:1.9}.license-term-group .muted{margin:12px 0 0}</style>
