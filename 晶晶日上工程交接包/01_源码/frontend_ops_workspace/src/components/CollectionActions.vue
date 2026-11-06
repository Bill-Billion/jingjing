<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import {useServiceContext} from '@/composables/useServiceContext'
import {newIdempotencyKey} from '@/api/client'
import {isApplied,isPreferences,isTargetState,serviceRequest,type CollectionKind,type TargetState} from '@/api/modules/clientServices'
import ApiErrorAlert from './ApiErrorAlert.vue'
const props=defineProps<{kind:CollectionKind;targetId:string}>(),ui=useServiceContext(()=>null),{error,notice,busy,pending}=ui,state=ref<TargetState|null>(null),loading=ref(false)
const emit=defineEmits<{lock:[value:boolean]}>()
const locked=computed(()=>busy.value||!!pending.value||loading.value)
watch(()=>busy.value||!!pending.value,value=>emit('lock',value),{flush:'sync'})
onUnmounted(()=>emit('lock',false))
let visitGeneration=0
async function load(recordVisit=true){error.value=null;const n=++visitGeneration;state.value=null;loading.value=true;const kind=props.kind,target=props.targetId,signature=ui.signature.value,r=await ui.read(`/me/collections/targets/${kind}/${target}`,isTargetState);if(n!==visitGeneration)return;state.value=r;loading.value=false;if(!r||!recordVisit)return;const p=await ui.read('/me/collections/preferences',isPreferences);if(!p?.history_enabled||n!==visitGeneration||signature!==ui.signature.value)return;try{await serviceRequest(ui.identity(),'/me/collections/history',isApplied,{method:'POST',body:{kind,target_id:target},ifMatch:p.object_version,idempotencyKey:newIdempotencyKey()})}catch{if(n===visitGeneration&&signature===ui.signature.value)notice.value='本次浏览未能记录；不会自动补发，可在“浏览记录”中核对当前开关。'}}
async function toggle(){if(!state.value||locked.value)return;await ui.write('/me/collections/favorites',{kind:props.kind,target_id:props.targetId,saved:!state.value.saved},isApplied,()=>load(false))}
watch(()=>[props.kind,props.targetId,ui.revision.value],()=>{state.value=null;if(ui.ready.value)void load()},{flush:'sync'})
onMounted(()=>{if(ui.ready.value)void load()})
</script>
<template><div class="service-actions collection-actions"><button class="outline" :disabled="locked||!state" @click="toggle">{{state?.saved?'取消收藏':'收藏'}}</button><RouterLink to="/me/collections/favorites" class="button-link outline">我的收藏</RouterLink><RouterLink :to="{path:'/support/new',query:{domain:kind+'_PUBLIC',record:targetId}}" class="button-link outline">反馈或举报</RouterLink><button v-if="pending" class="outline" :disabled="busy" @click="ui.retry">恢复原收藏操作</button><button v-if="error&&!pending" class="outline" :disabled="locked" @click="load(false)">重新读取收藏状态</button><p v-if="notice" role="status">{{notice}}</p><ApiErrorAlert :error="error"/></div></template>
