<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useSessionStore } from '@/stores/session'
import { agencyOptions, type AgencyRelation, type AgencyEvidence } from '@/api/modules/agency-options'
const props=defineProps<{personId:string;disabled:boolean}>(),emit=defineEmits<{change:[value:{organization_party_id:string;relation_id:string;evidence_asset_ids:string}]}>(),session=useSessionStore()
const relations=ref<AgencyRelation[]>([]),evidence=ref<AgencyEvidence[]>([]),selected=ref(''),assets=ref<string[]>([]),error=ref(''),busy=ref(false)
let ticket=0,disposed=false
const changed=()=>emit('change',{organization_party_id:relations.value.find(r=>r.id===selected.value)?.organization_party_id||'',relation_id:selected.value,evidence_asset_ids:assets.value.join('\n')})
watch([selected,assets],changed,{deep:true})
function clear(){ticket++;relations.value=[];evidence.value=[];selected.value='';assets.value=[];busy.value=false;changed()}
watch(()=>[session.revision,session.selectedId,props.personId],clear,{flush:'sync'})
onUnmounted(()=>{disposed=true;ticket++})
async function load(){clear();const own=++ticket,s=session.capture();busy.value=true;error.value='';try{const i={token:session.token||'',accountId:session.account?.id||'',partyId:session.selectedId},r=await agencyOptions(i,'RELATION',props.personId),e=await agencyOptions(i,'EVIDENCE',props.personId);if(disposed||own!==ticket||!session.current(s,true))return;relations.value=r;evidence.value=e}catch(e){if(!disposed&&own===ticket)error.value=e instanceof Error?e.message:'读取失败，请重试'}finally{if(own===ticket)busy.value=false}}
</script>
<template><section class="supply-card"><button type="button" data-testid="agency-load-options" :disabled="disabled||busy" @click="load">读取已接受的机构及本人证明</button><p v-if="error" role="alert">{{error}}</p><label>已由本人接受的机构<select v-model="selected" data-testid="agency-relation" :disabled="disabled||busy"><option value="">请选择机构</option><option v-for="r in relations" :key="r.id" :value="r.id">{{r.display_name}} · 合作至 {{r.valid_until.slice(0,10)}}</option></select></label><p v-if="!relations.length">尚无可选合作；请先由本人接受机构邀请。</p><fieldset :disabled="disabled||busy"><legend>选择本人已上传的授权证明</legend><label v-for="(e,index) in evidence" :key="e.id"><input v-model="assets" type="checkbox" :value="e.id" :data-testid="'agency-evidence-'+e.id">证明 {{index+1}} · {{e.media_type}} · {{e.byte_size}} 字节 · 校验 {{e.content_sha256.slice(0,8)}}</label><p v-if="!evidence.length">请先在本人材料中上传授权证明，再重新读取。</p></fieldset></section></template>
