<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ code: string; label?: string }>()
const known = computed(() => !!props.label && props.label !== props.code)
</script>

<template>
  <span class="state-value" :data-known="known">
    <span>{{ known ? label : code ? '未识别状态' : '未提供状态' }}</span>
    <small v-if="code" class="state-code">{{ code }}</small>
  </span>
</template>

<style scoped>
.state-value{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0;max-width:100%;overflow-wrap:anywhere}
.state-code{font-size:11px;color:var(--ops-text-2);overflow-wrap:anywhere}
</style>
