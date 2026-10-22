<script setup lang="ts">
import { labels,display } from '@/business/labels'
defineProps<{value:Record<string,unknown>;depth?:number;fieldLabels?:Record<string,string>}>()
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const hidden=new Set(['object_key','access_token','secret','token','signed_url','url','next_cursor'])
const caption=(k:string,custom?:Record<string,string>)=>custom?.[k]||labels[k]||(/_sha256$/.test(k)?'内容校验值':/_minor$/.test(k)?'金额':/_id$/.test(k)?'关联记录':k)
</script>
<template><dl class="business-details" :class="{'business-nested':(depth||0)>0}"><template v-for="(v,k) in value" :key="k"><div v-if="!hidden.has(String(k))" :class="{'business-detail-wide':object(v)||Array.isArray(v),'business-identifier':/(?:^id$|_id$|_sha256$)/.test(String(k))}"><dt>{{caption(String(k),fieldLabels)}}</dt><dd><BusinessDetails v-if="object(v)&&(depth||0)<12" :value="v" :depth="(depth||0)+1" :field-labels="fieldLabels"/><template v-else-if="Array.isArray(v)"><p v-if="!v.length" class="business-muted">暂无记录</p><div v-for="(item,i) in v" :key="i" class="business-detail-item"><BusinessDetails v-if="object(item)&&(depth||0)<12" :value="item" :depth="(depth||0)+1" :field-labels="fieldLabels"/><span v-else>{{display(item,String(k))}}</span></div></template><span v-else>{{display(v,String(k))}}</span></dd></div></template></dl></template>
