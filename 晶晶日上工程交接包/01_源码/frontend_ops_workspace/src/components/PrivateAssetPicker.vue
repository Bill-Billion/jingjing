<script setup lang="ts">
import {computed,onUnmounted,ref,watch} from 'vue'
import {useSessionStore} from '@/stores/session'
import {ApiError,asApiError,newIdempotencyKey,outcomeUnknown,requestUpload} from '@/api/client'
import {isSupplyAsset,mediaTypes,type SupplyAsset,type MediaType} from '@/api/modules/supply'
import ApiErrorAlert from './ApiErrorAlert.vue'
const props=withDefaults(defineProps<{modelValue:SupplyAsset[];purpose?:'RIGHTS_EVIDENCE'|'WORK_CONTENT';disabled?:boolean;max?:number}>(),{purpose:'RIGHTS_EVIDENCE',max:10})
const emit=defineEmits<{'update:modelValue':[SupplyAsset[]];lock:[boolean]}>(),session=useSessionStore()
const file=ref<File|null>(null),type=ref(''),busy=ref(false),progress=ref(0),error=ref<ApiError|null>(null),pending=ref<{key:string;file:File;media:MediaType}|null>(null)
let generation=0,controller=new AbortController()
const locked=computed(()=>busy.value||!!pending.value)
watch(locked,v=>emit('lock',v))
watch(()=>[session.token,session.selectedId,session.revision],()=>{generation++;controller.abort();controller=new AbortController();file.value=null;type.value='';pending.value=null;busy.value=false;error.value=null;emit('update:modelValue',[])},{flush:'sync'})
function choose(e:Event){file.value=(e.target as HTMLInputElement).files?.[0]||null;type.value=file.value&&Object.hasOwn(mediaTypes,file.value.type)?file.value.type:'';error.value=null}
async function upload(){
 if(busy.value||!session.token||!session.account||!session.selectedId)return
 if(!pending.value){if(!file.value||file.value.size<1||file.value.size>8388608||!Object.hasOwn(mediaTypes,type.value)||props.purpose==='WORK_CONTENT'&&!['image/jpeg','image/png'].includes(type.value))return;pending.value={key:newIdempotencyKey(),file:file.value,media:type.value as MediaType}}
 const p=pending.value,g=generation,account=session.account.id,party=session.selectedId;busy.value=true;progress.value=0;error.value=null
 try{const r=await requestUpload<SupplyAsset>('/supply/assets?'+new URLSearchParams({purpose:props.purpose,media_type:p.media}),p.file,{token:session.token,actingParty:party,idempotencyKey:p.key,signal:controller.signal},(loaded,total)=>{if(g===generation)progress.value=Math.round(loaded/total*100)})
 if(g!==generation)return
 if(r.meta.actor?.account_id!==account||r.meta.acting_party!==party||!isSupplyAsset(r.data)||r.data.owner_party_id!==party||r.data.purpose!==props.purpose||r.data.media_type!==p.media||r.data.byte_size!==p.file.size)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'上传回执尚未核实，请恢复原请求。'})
 const digest=await crypto.subtle.digest('SHA-256',await p.file.arrayBuffer());if(g!==generation)return
 if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==r.data.content_sha256)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'上传文件校验不一致，请恢复原请求。'})
 emit('update:modelValue',[...props.modelValue.filter(a=>a.id!==r.data.id),r.data]);pending.value=null;file.value=null;type.value=''
 }catch(e){if(g===generation){error.value=asApiError(e);if(!outcomeUnknown(e))pending.value=null}}finally{if(g===generation)busy.value=false}
}
onUnmounted(()=>{generation++;controller.abort();emit('lock',false)})
</script>
<template><div class="service-assets"><p class="service-muted">{{purpose==='WORK_CONTENT'?'机构主图，仅 JPEG / PNG':'本人私有证明'}}，每份不超过 8 MB。上传成功后还需明确提交表单。</p><ApiErrorAlert :error="error"/><ul><li v-for="asset in modelValue" :key="asset.id"><span>{{asset.media_type}} · {{Math.ceil(asset.byte_size/1024)}} KB</span> <span class="service-id">{{asset.id}}</span> <button type="button" class="outline" :disabled="disabled||locked" @click="emit('update:modelValue',modelValue.filter(x=>x.id!==asset.id))">从本次提交移除</button></li></ul><div v-if="modelValue.length<max"><label class="service-field">选择真实文件<input :key="modelValue.length" type="file" :disabled="disabled||locked" :accept="purpose==='WORK_CONTENT'?'image/jpeg,image/png':'image/jpeg,image/png,video/mp4,audio/mpeg,audio/wav,application/pdf,text/plain'" @change="choose"></label><label v-if="file&&!pending" class="service-field">文件格式<select v-model="type" :disabled="disabled||locked"><option value="">请选择真实格式</option><option v-for="(label,value) in mediaTypes" v-show="purpose!=='WORK_CONTENT'||['image/jpeg','image/png'].includes(value)" :key="value" :value="value">{{label}}</option></select></label><p v-if="file">{{file.name}}</p><p v-if="busy" role="status">文件传输 {{progress}}%{{progress===100?'，正在确认保存结果':''}}</p><button type="button" class="outline" :disabled="disabled||busy||(!pending&&(!file||!type||file.size>8388608))" @click="upload">{{pending?'恢复原上传':'上传所选文件'}}</button></div><p v-if="pending&&!busy" role="status">本次文件与请求已保留，请恢复原上传后继续。</p></div></template>
