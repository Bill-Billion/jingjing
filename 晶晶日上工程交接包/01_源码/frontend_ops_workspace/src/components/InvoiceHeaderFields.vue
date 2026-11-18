<script setup lang="ts">
import type {InvoiceHeader} from '@/api/modules/invoices'
const props=defineProps<{modelValue:InvoiceHeader;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[InvoiceHeader]}>()
function kind(value:string){emit('update:modelValue',value==='ORGANIZATION'?{kind:'ORGANIZATION',title:props.modelValue.title,tax_id:''}:{kind:'PERSON',title:props.modelValue.title,tax_id:null})}
</script>
<template><div class="service-form"><label>抬头类型<select :value="modelValue.kind" :disabled="disabled" @change="kind(($event.target as HTMLSelectElement).value)"><option value="PERSON">个人</option><option value="ORGANIZATION">单位</option></select></label><label>抬头名称<input :value="modelValue.title" :disabled="disabled" maxlength="200" required @input="emit('update:modelValue',{...modelValue,title:($event.target as HTMLInputElement).value})"></label><label v-if="modelValue.kind==='ORGANIZATION'">纳税人识别号<input :value="modelValue.tax_id" :disabled="disabled" maxlength="80" required autocomplete="off" @input="emit('update:modelValue',{kind:'ORGANIZATION',title:modelValue.title,tax_id:($event.target as HTMLInputElement).value})"></label></div></template>
