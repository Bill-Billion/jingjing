<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import {useSessionStore} from '@/stores/session'
import {businessBytes,type BusinessData} from '@/api/modules/business'
import {sha256} from '@/api/modules/artists'
import {asApiError} from '@/api/client'
import {uuid} from '@/business/model'
const props=defineProps<{request:BusinessData;disabled?:boolean}>(),emit=defineEmits<{ready:[value:boolean]}>(),session=useSessionStore()
const files=computed(()=>{const p=props.request.proposal as BusinessData|undefined;return Array.isArray(p?.files)?p.files as BusinessData[]:[]})
const readIds=ref<string[]>([]),text=ref(''),url=ref(''),media=ref(''),error=ref(''),busy=ref(false)
let generation=0
const scope=computed(()=>JSON.stringify([props.request.id,props.request.object_version,props.request.proposal_sha256,session.token,session.revision]))
function revoke(){if(url.value)URL.revokeObjectURL(url.value);url.value='';text.value='';media.value=''}
function clear(){generation++;revoke();readIds.value=[];error.value='';busy.value=false;emit('ready',false)}
watch(scope,clear,{flush:'sync'})
watch(()=>[readIds.value.length,files.value],()=>emit('ready',files.value.length>0&&files.value.every(f=>readIds.value.includes(String(f.id)))),{deep:true,flush:'sync'})
async function read(file:BusinessData){
 if(props.disabled||busy.value||!session.token)return
 const g=generation,s=session.capture();busy.value=true;error.value='';revoke();readIds.value=readIds.value.filter(id=>id!==file.id)
 try{if(!uuid(file.id)||!uuid(props.request.id))throw new Error('文件编号无法核对')
 const blob=await businessBytes('/privacy/operations/requests/'+props.request.id+'/evidence/'+file.id+'/content',{token:session.token})
 const hash=await sha256(blob);if(g!==generation||!session.current(s,true))return
 if(blob.size!==file.byte_size||hash!==file.content_sha256)throw new Error('实际文件与本版提案不一致，不能通过审核。')
 const type=String(file.media_type)
 if(type==='text/plain'||type==='application/json'){const value=await blob.text();if(g!==generation||!session.current(s,true))return;text.value=value}
 else{media.value=type;url.value=URL.createObjectURL(new Blob([blob],{type}))}
 readIds.value=[...readIds.value,String(file.id)]
 }catch(e){if(g===generation){const a=asApiError(e);if([401,403,404].includes(a.status))clear();error.value=a.message}}
 finally{if(g===generation)busy.value=false}
}
onUnmounted(()=>{generation++;revoke();emit('ready',false)})
</script>
<template><section class="supply-card" data-testid="privacy-evidence-review"><h2>独立核对本版实际答复文件</h2><p>逐份读取与提案一致的文件，再核对脱敏和未完成事项。读取成功不自动代表审核通过；更换提案或身份后需重新核对。</p><p v-if="!files.length">本提案没有可核实文件，不能作为资料副本交付通过；请退回补齐。</p><ul><li v-for="f in files" :key="String(f.id)">{{f.media_type}} · {{f.byte_size}} 字节 <button :disabled="disabled||busy" @click="read(f)">{{readIds.includes(String(f.id))?'重新核对本文件':'读取本版实际文件'}}</button></li></ul><p v-if="error" role="alert">{{error}}</p><pre v-if="text" class="business-private-text">{{text}}</pre><img v-if="url&&media.startsWith('image/')" :src="url" alt="本版答复待审文件"><a v-if="url" :href="url" download="待审答复文件">保存已核验文件并查看内容</a><p v-if="files.length&&files.every(f=>readIds.includes(String(f.id)))">本版列明文件均已取得并核对校验值，请继续人工确认内容。</p></section></template>
