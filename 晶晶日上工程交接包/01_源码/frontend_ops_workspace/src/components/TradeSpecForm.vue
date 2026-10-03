<script setup lang="ts">
import { computed, reactive } from 'vue'
import { amountInput, lineKinds, type SpecData } from '@/api/modules/trade'
import { validSupplyId } from '@/api/modules/supply'
const props=defineProps<{disabled:boolean;previous?:string}>(),emit=defineEmits<{submit:[body:Omit<SpecData,'review'>&{previous_spec_id:string|null}]}>()
const f=reactive({title:'',provider:'',kind:'',price:'',tier:'',version:'',sample:'',final:'',revisions:'',deliverables:'',terms:'',previous:props.previous||''})
const body=computed(()=>{const unit=amountInput(f.price),sample=amountInput(f.sample,0,100000),final=amountInput(f.final,0,100000),revisions=amountInput(f.revisions,0,100000),deliverables=f.deliverables.split('\n').map(s=>s.trim()).filter(Boolean);if(!f.title.trim()||!validSupplyId(f.provider)||!Object.hasOwn(lineKinds,f.kind)||unit===null||sample===null||final===null||revisions===null||!f.tier.trim()||!f.version.trim()||!f.terms.trim()||!deliverables.length||deliverables.length>30||new Set(deliverables).size!==deliverables.length||deliverables.some(s=>s.length>500)||f.previous&&!validSupplyId(f.previous))return null;return {title:f.title.trim(),provider_party_id:f.provider,line_kind:f.kind as keyof typeof lineKinds,unit_minor:unit,currency:'CNY' as const,specification:{version:f.version.trim(),service_tier:f.tier.trim(),sample_seconds:sample,final_seconds:final,revision_limit:revisions,deliverables,terms:f.terms.trim()},previous_spec_id:f.previous||null}})
</script>
<template>
 <form class="trade-form" @submit.prevent="body && emit('submit',body)"><fieldset :disabled="disabled">
 <section class="supply-card"><h2>商品信息</h2><div class="trade-fields two"><label>商品名称 *<input v-model="f.title" maxlength="200" required placeholder="待填写"></label><label>实际提供方主体编号 *<input v-model="f.provider" required placeholder="完整主体编号"></label></div></section>
 <section class="supply-card"><h2>服务与计价</h2><div class="trade-fields four"><label>服务明细类型 *<select v-model="f.kind" required><option value="">待选择</option><option v-for="(name,key) in lineKinds" :key="key" :value="key">{{name}}</option></select></label><label>服务单价（人民币分） *<input v-model="f.price" inputmode="numeric" required placeholder="整数分"></label><label>币种<input value="人民币 CNY" disabled></label><label>服务档位 *<input v-model="f.tier" maxlength="100" required placeholder="待填写"></label></div></section>
 <section class="supply-card"><h2>规格参数</h2><div class="trade-fields four"><label>规格版本 *<input v-model="f.version" maxlength="128" required placeholder="待填写"></label><label>样片时长（秒） *<input v-model="f.sample" inputmode="numeric" required placeholder="明确填写，含 0"></label><label>成片时长（秒） *<input v-model="f.final" inputmode="numeric" required placeholder="明确填写，含 0"></label><label>可修改次数 *<input v-model="f.revisions" inputmode="numeric" required placeholder="明确填写，含 0"></label></div></section>
 <section class="supply-card"><h2>交付与条款</h2><div class="trade-fields two"><label>约定交付内容 *<textarea v-model="f.deliverables" required placeholder="每行一项，最多 30 项"></textarea></label><label>完整条款 *<textarea v-model="f.terms" maxlength="8000" required placeholder="待填写"></textarea></label></div></section>
 <section class="supply-card"><h2>历史版本关联</h2><label class="trade-inline">上一商品版本<input v-model="f.previous" placeholder="首次创建留空；新版本填写原记录编号"></label><p class="muted">新版本独立审核；价格、规格和条款不会改写历史订单。</p></section>
 <div class="trade-footer"><RouterLink to="/trade/specifications" class="button-link outline">返回商品</RouterLink><button class="primary" :disabled="disabled || !body">提交规格审核</button></div>
 </fieldset></form>
</template>
