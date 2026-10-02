<script setup lang="ts">
import type { TextValue } from '@/api/modules/contracts'
defineProps<{ value: TextValue; label?: string; nested?: boolean; fieldLabels?: Readonly<Record<string, string>> }>()
</script>

<template>
  <div :class="nested ? 'text-node' : 'contract-text'" :tabindex="nested ? undefined : 0" :aria-label="label">
    <ol v-if="Array.isArray(value)" class="text-list"><li v-for="(item, index) in value" :key="index"><ContractText :value="item" :field-labels="fieldLabels" nested /></li></ol>
    <dl v-else-if="value !== null && typeof value === 'object'" class="text-fields"><div v-for="(item, key) in value" :key="key"><dt>{{ fieldLabels?.[String(key)] || key }}</dt><dd><ContractText :value="item" :field-labels="fieldLabels" nested /></dd></div></dl>
    <pre v-else class="text-value">{{ value === null ? 'null' : String(value) }}</pre>
    <span v-if="Array.isArray(value) && value.length === 0" class="empty-value">[]</span>
    <span v-else-if="value !== null && typeof value === 'object' && Object.keys(value).length === 0" class="empty-value">{}</span>
  </div>
</template>

<style scoped>
.contract-text{overflow:auto;max-height:520px;margin:0;padding:20px;background:var(--ops-bg);border:1px solid var(--ops-border);border-radius:10px;color:var(--ops-text);font:14px/1.85 var(--ops-sans);overflow-wrap:anywhere}.text-fields{margin:0}.text-fields>div+div{margin-top:18px}.text-fields dt{font-weight:600;color:var(--ops-text);overflow-wrap:anywhere;margin-bottom:6px}.text-fields dd{margin:0 0 0 12px;padding-left:12px;border-left:1px solid var(--ops-border);min-width:0}.text-list{margin:0;padding-left:24px}.text-list>li+li{margin-top:10px}.text-value{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:inherit}.text-node{min-width:0}.empty-value{font-family:var(--ops-mono)}
@media(max-width:760px){.contract-text{padding:16px}.text-fields dd{margin-left:4px;padding-left:10px}}
</style>
