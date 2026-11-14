<script setup lang="ts">
import {ref,watch,onUnmounted} from 'vue'
import {useSessionStore} from '@/stores/session'
import {readBusiness,type BusinessData} from '@/api/modules/business'
import {validateExplanation,boardNames} from '@/business/rankingExplanation'
import {asApiError} from '@/api/client'
const props=defineProps<{id:string}>(),session=useSessionStore(),data=ref<BusinessData|null>(null),error=ref(''),busy=ref(false)
let generation=0
watch(()=>[props.id,session.token,session.revision],()=>{generation++;data.value=null;error.value='';busy.value=false},{flush:'sync'})
async function load(){if(busy.value||!session.token)return;const g=generation,s=session.capture();busy.value=true;error.value='';data.value=null
 try{const d=(await readBusiness('/engagement/rankings/'+props.id+'/explanation',{token:session.token,accountId:session.account!.id})).data;if(g!==generation||!session.current(s,true))return;validateExplanation(d,props.id);data.value=d}catch(e){if(g===generation)error.value=asApiError(e).message}finally{if(g===generation)busy.value=false}}
onUnmounted(()=>generation++)
</script>
<template><section class="supply-card"><h2>本期榜单依据与说明</h2><button :disabled="busy" @click="load">读取本期实际规则与公式说明</button><p v-if="error" role="alert">{{error}}</p><template v-if="data"><p>本期规则：{{data.rule_version}}</p><p class="supply-warning">{{data.formula_scope==='RECORDED_VERSION'?'本期记录了计算版本，下方说明对应已记录版本。':'历史榜未记录计算版本。下方仅为当前公式参考，不能证明旧榜当时使用了这些公式。'}}</p><dl><template v-for="(formula,key) in (data.formulas as Record<string,string>)" :key="key"><dt>{{boardNames[key]||key}}</dt><dd>{{formula}}</dd></template></dl></template><p>关闭个性化推荐仍可普通搜索；退出公开榜单需另行修改本人的参榜选择。历史名次保留原快照，显示时重新核对当前公开授权。</p><RouterLink to="/privacy/preferences">调整个性化推荐</RouterLink> · <RouterLink to="/engagement/growth">本人参榜选择</RouterLink></section></template>
