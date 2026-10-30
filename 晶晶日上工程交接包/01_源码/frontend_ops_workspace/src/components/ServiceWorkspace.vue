<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {useRouter} from 'vue-router'
import {useSessionStore} from '@/stores/session'
import {asApiError,type ApiError} from '@/api/client'
import WorkspaceNav from './WorkspaceNav.vue'
import ApiErrorAlert from './ApiErrorAlert.vue'
import '@/styles/supply.css'
import '@/styles/trade.css'
import '@/styles/client-services.css'
const props=defineProps<{title:string;intro:string;accountOnly?:boolean;locked?:boolean;dirty?:boolean;error?:ApiError|null;errorTestid?:string;notice?:string}>()
const emit=defineEmits<{ready:[]}>(),session=useSessionStore(),router=useRouter(),initialError=ref<ApiError|null>(null),loading=ref(true)
async function initialize(){loading.value=true;initialError.value=null;try{await Promise.all([session.loadAccount(),session.loadParties()]);emit('ready')}catch(e){initialError.value=asApiError(e)}finally{loading.value=false}}
function chooseIdentity(event:Event){const element=event.target as HTMLSelectElement;if(props.locked||loading.value){element.value=session.selectedId;return}if(props.dirty&&!window.confirm('切换身份会丢弃本页尚未提交的输入，确认切换？')){element.value=session.selectedId;return}session.selectParty(element.value)}
async function logout(){if(props.locked||loading.value)return;if(props.dirty&&!window.confirm('退出会丢弃本页尚未提交的输入，确认退出？'))return;await session.logout();await router.push('/login')}
onMounted(initialize)
</script>
<template><div class="editorial-workspace supply-workspace trade-workspace client-services"><header class="supply-header"><RouterLink to="/workspace" class="supply-brand">晶晶日上</RouterLink><span>运营与合作方工作台</span><div class="account-actions"><span class="account-name">{{session.account?.display_name||'当前账号'}}</span><button :disabled="locked" @click="logout">退出</button></div></header><div class="supply-layout"><aside class="supply-sidebar"><WorkspaceNav/><div class="supply-identity"><label>当前办理身份<select data-testid="ops-party" :value="session.selectedId" :disabled="locked||loading" @change="chooseIdentity"><option v-for="p in session.parties" :key="p.party.id" :value="p.party.id">{{p.party.display_name}}</option></select></label><button v-if="session.nextCursor" class="outline" :disabled="locked" @click="session.loadMoreParties">读取更多身份</button><p class="muted">{{accountOnly?'此页以当前登录账号查询，不代表机构私人资产或授予运营权限。':'以当前身份办理；访问和操作权限由服务器核验。'}}</p></div></aside><main class="supply-main"><div class="supply-heading"><div><p class="eyebrow">晶晶日上 / 办理与记录</p><h1>{{title}}</h1><p class="muted">{{intro}}</p></div><slot name="heading"/></div><ApiErrorAlert :error="error||initialError" :testid="errorTestid"/><p v-if="notice" role="status" class="supply-notice">{{notice}}</p><p v-if="loading" role="status">正在读取账号和办理身份…</p><button v-if="initialError&&!loading" class="outline" @click="initialize">重新读取账号和身份</button><slot v-if="!loading&&!initialError"/></main></div></div></template>
