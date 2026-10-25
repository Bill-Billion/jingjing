<script setup lang="ts">
import { computed } from 'vue'
export interface RecordOption { value: string; label: string }
const props = defineProps<{ modelValue: string; options: RecordOption[]; label: string; disabled?: boolean; readonly?: boolean; required?: boolean; placeholder?: string; testid?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const selected = computed(() => props.options.find(row => row.value === props.modelValue))
const shortId = (value: string) => value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value
</script>

<template>
  <span class="record-picker">
    <select v-if="options.length" :aria-label="`从已读取记录选择${label}`" :value="selected?.value || ''" :disabled="disabled || readonly" :data-testid="testid ? `${testid}-choice` : undefined" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <option value="">请选择已读取记录</option>
      <option v-for="row in options" :key="row.value" :value="row.value">{{ row.label }} · {{ shortId(row.value) }}</option>
    </select>
    <input :value="modelValue" :aria-label="`${label}完整编号`" :disabled="disabled" :readonly="readonly" :required="required" :placeholder="placeholder" :data-testid="testid" maxlength="36" autocomplete="off" spellcheck="false" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
    <small v-if="modelValue" class="record-picker-value"><span>{{ selected ? selected.label : '当前填写编号，仍需读取核对' }}</span><code>{{ modelValue }}</code></small>
  </span>
</template>

<style scoped>
.record-picker{display:grid;gap:8px;min-width:0;width:100%}.record-picker-value{display:grid;gap:4px;min-width:0;max-width:100%;font-size:12px;color:var(--ops-text-2);line-height:1.6;overflow-wrap:anywhere}.record-picker-value code{overflow-wrap:anywhere}
</style>
