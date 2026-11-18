<script setup lang="ts">
import {onMounted,onUnmounted,ref,watch} from 'vue'
import {useSessionStore} from '@/stores/session'
import {ApiError,requestBytes} from '@/api/client'
import type {Organization} from '@/api/modules/clientServices'
const props=defineProps<{organization:Organization}>(),emit=defineEmits<{invalid:[]}>(),session=useSessionStore(),url=ref(''),failed=ref(false),busy=ref(false)
let generation=0,controller=new AbortController()
function clear(){generation++;controller.abort();controller=new AbortController();if(url.value)URL.revokeObjectURL(url.value);url.value='';busy.value=false;failed.value=false}
async function load(){clear();const cover=props.organization.cover;if(!cover||!session.token)return;const g=generation;busy.value=true;try{const bytes=await requestBytes(`/directory/organizations/${props.organization.party_id}/cover`,{token:session.token,signal:controller.signal},cover.media_type);if(g!==generation)return;if(bytes.size!==cover.byte_size)throw Error('size');const hash=await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer());if(g!==generation)return;if([...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')!==cover.content_sha256)throw Error('hash');url.value=URL.createObjectURL(bytes)}catch(e){if(g===generation){failed.value=true;url.value='';if(e instanceof ApiError&&[403,404,409].includes(e.status))emit('invalid')}}finally{if(g===generation)busy.value=false}}
watch(()=>[props.organization.record_id,props.organization.object_version,props.organization.cover?.content_sha256,session.token,session.selectedId,session.revision],load,{flush:'sync'})
function broken(event:Event){if((event.target as HTMLImageElement).currentSrc!==url.value)return;if(url.value)URL.revokeObjectURL(url.value);url.value='';failed.value=true}
function visibility(){if(document.visibilityState==='hidden')clear();else void load()}
onMounted(()=>{document.addEventListener('visibilitychange',visibility);void load()})
onUnmounted(()=>{clear();document.removeEventListener('visibilitychange',visibility)})
</script>
<template><div v-if="organization.cover"><img v-if="url" :key="url" :src="url" :alt="organization.display_name+'的获准主图'" class="service-cover" @error="broken"><p v-if="busy" role="status">正在读取获准主图…</p><p v-if="failed" role="status">主图暂不可读取，已清除旧图。<button type="button" class="outline" @click="load">重新读取主图</button></p></div></template>
