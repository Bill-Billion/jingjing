<script setup lang="ts">
import { rights, purposes, type Terms } from '@/api/modules/licensing'
defineProps<{ terms: Terms }>()
const date = (s: string) => new Date(s).toLocaleString('zh-CN',{hour12:false})
</script>
<template>
  <dl class="supply-facts license-terms">
    <div><dt>独家约定</dt><dd>{{ terms.exclusive ? '独家，仅限下列约定范围' : '非独家' }}</dd></div>
    <div><dt>逐项获准权利</dt><dd>{{ terms.rights.map(r => rights[r]).join('、') }}</dd></div>
    <div><dt>允许用途</dt><dd>{{ terms.purposes.map(p => purposes[p]).join('、') }}</dd></div>
    <div><dt>地域 / 语言</dt><dd>{{ terms.territories.join('、') }} / {{ terms.languages.join('、') }}</dd></div>
    <div><dt>许可开始（本地时间）</dt><dd>{{ date(terms.valid_from) }}</dd></div>
    <div><dt>开发截止（本地时间）</dt><dd>{{ date(terms.development_until) }}</dd></div>
    <div><dt>许可有效截止（本地时间）</dt><dd>{{ date(terms.valid_until) }}</dd></div>
    <div><dt>使用额度</dt><dd>{{ terms.project_limit }} 个项目 · 每项目最多 {{ terms.episode_limit }} 集</dd></div>
  </dl>
  <p class="long-text terms-copy">{{ terms.terms_text }}</p>
  <p class="muted">独家不会自动增加发行权。剧本许可与数字人形象、声音同意分别办理。</p>
</template>
<style scoped>.terms-copy{padding-top:20px;margin-top:22px;border-top:1px solid var(--ops-border)}</style>
