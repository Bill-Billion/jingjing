<script setup lang="ts">
import { computed,onMounted,onUnmounted,reactive,ref,watch } from 'vue'
import { onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useArtists } from '@/composables/useArtists'
import { ApiError,asApiError } from '@/api/client'
import { artistKinds,artistStatuses,reviewKinds,artistMediaTypes,type ArtistKind,type ArtistCommand,type ArtistAssetPurpose } from '@/api/modules/artists'
import { validSupplyId,type MediaType } from '@/api/modules/supply'
import { money,artistServiceKinds } from '@/api/modules/trade'
import CollectionActions from '@/components/CollectionActions.vue'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import ArtistForm,{type ArtistFormAction} from '@/components/artists/ArtistForm.vue'
import ArtistRecordPanel from '@/components/artists/ArtistRecordPanel.vue'
import ArtistPreview from '@/components/artists/ArtistPreview.vue'
import ArtistPublicMedia from '@/components/artists/ArtistPublicMedia.vue'
import DirectoryCityControl from '@/components/business/DirectoryCityControl.vue'
import { directoryCity,setDirectoryCity } from '@/business/directoryCity'
import { clearBusinessLists,rememberBusinessList,restoreBusinessList } from '@/business/navigation'
import '@/styles/supply.css'
import '@/styles/trade.css'
import '@/styles/artists.css'

const session=useSessionStore(),route=useRoute(),router=useRouter()
const mode=computed(()=>String(route.meta.artistsView||'people')),personId=computed(()=>String(route.params.personId||'')),recordId=computed(()=>String(route.params.recordId||'')),reviewKind=computed(()=>String(route.params.kind||'CONSENT') as keyof typeof reviewKinds)
const reviewer=computed(()=>mode.value==='reviews'||mode.value==='review-record'),accountMode=computed(()=>reviewer.value||['catalog','services'].includes(mode.value))
const ui=useArtists(()=>({token:session.token,accountId:session.account?.id||'',partyId:accountMode.value?null:session.selectedId||null,revision:session.revision,scope:route.fullPath}))
const {people,peopleCursor,person,records,recordsCursor,record,service,services,reviews,reviewsCursor,catalog,catalogCursor,publicListing,publicMedia,publicPortrait,assets,error,notice,pending,busy,writing,locked:artistLocked,securityRevision,conflicted,reconfirmed,preview,evidenceRead}=ui
const collectionLocked=ref(false),locked=computed(()=>artistLocked.value||collectionLocked.value)
const initializing=ref(true),kind=ref<ArtistKind>('LOOK'),inlineAction=ref<ArtistFormAction|null>(null),selectedAvatar=ref(''),file=ref<File|null>(null),fileType=ref(''),assetPurpose=ref<ArtistAssetPurpose>('AVATAR_MATERIAL'),assetReference=ref(''),cancelReason=ref('')
const filters=reactive({city:directoryCity.value,tag:'',audition:''})
const localCity=ref(false),appliedDefaultCity=ref(directoryCity.value),catalogPages=ref(1),catalogReadQuery=ref('')
let syncingCity=false,catalogRequest=0,catalogRestored=false
const catalogKey=()=>JSON.stringify([session.account?.id,session.selectedId,session.expiresAt,'artists','catalog'])
function rememberCatalog(){if(mode.value!=='catalog')return;rememberBusinessList(catalogKey(),{filters:{...filters},cursor:catalogCursor.value||'',previous:[],loadedPages:JSON.stringify(filters)===catalogReadQuery.value?catalogPages.value:1,city:{local:localCity.value,defaultValue:appliedDefaultCity.value}})}
function restoreCatalog(){
 const position=restoreBusinessList(catalogKey(),directoryCity.value)
 syncingCity=true;localCity.value=position?.city?.local||false;appliedDefaultCity.value=directoryCity.value
 filters.city=localCity.value?String(position?.filters.city||''):directoryCity.value;filters.tag=String(position?.filters.tag||'');filters.audition=String(position?.filters.audition||'');syncingCity=false
 catalogPages.value=position?.loadedPages||1;catalogRestored=true
}
async function searchCatalog(more=false){
 if(pending.value||writing.value){notice.value='本次结果尚未确认，请先恢复原操作。';return false}
 const query=JSON.stringify(filters),snapshot={...filters},request=++catalogRequest
 if(more&&query!==catalogReadQuery.value)more=false
 const result=await ui.loadCatalog(snapshot,more)
 if(!result||disposed||request!==catalogRequest||query!==JSON.stringify(filters))return false
 catalogReadQuery.value=query;catalogPages.value=more?catalogPages.value+1:1;rememberCatalog();return true
}
async function readCatalogPosition(){
 if(!catalogRestored)restoreCatalog()
 const pages=catalogPages.value,query=JSON.stringify(filters),scope=route.fullPath,revision=session.revision
 if(!await searchCatalog())return
 for(let page=1;page<pages&&catalogCursor.value;page++){
  if(disposed||scope!==route.fullPath||revision!==session.revision||query!==JSON.stringify(filters)||!await searchCatalog(true))break
 }
}
async function useDefaultCity(){
 if(pending.value||writing.value){notice.value='本次结果尚未确认，请先恢复原操作。';return}
 syncingCity=true;filters.city=directoryCity.value;syncingCity=false;localCity.value=false;appliedDefaultCity.value=directoryCity.value
 await searchCatalog()
}
async function changeDefaultCity(value:string){
 if(value.trim()===directoryCity.value)return
 if(pending.value||writing.value){notice.value='本次结果尚未确认，请先恢复原操作。';return}
 try{setDirectoryCity(value);if(!localCity.value)await useDefaultCity()}catch(e){error.value=asApiError(e)}
}
watch(()=>filters.city,(next,previous)=>{if(!syncingCity&&next!==previous)localCity.value=true},{flush:'sync'})
watch(directoryCity,()=>{if(mode.value==='catalog'&&!initializing.value&&!localCity.value&&appliedDefaultCity.value!==directoryCity.value)void useDefaultCity()})
watch(()=>[session.token,session.account?.id,session.selectedId,session.expiresAt],()=>{clearBusinessLists();catalogRestored=false;catalogRequest++;restoreCatalog()},{flush:'sync'})
let disposed=false
const actions:Record<string,ArtistFormAction>={avatars:'AVATAR',identity:'IDENTITY',consents:'CONSENT',delegations:'DELEGATION',variants:'VARIANT',halos:'HALO',listings:'LISTING',services:'SERVICE'}
const action=computed<ArtistFormAction|null>(()=>mode.value==='person-new'?'PERSON':mode.value==='new'?actions[String(route.params.action)]||null:inlineAction.value)
const ownerActive=computed(()=>!!session.selected&&!['SUSPENDED','CLOSED'].includes(session.selected.party.current_status)&&session.selected.membership.current_status==='ACTIVE'&&session.selected.membership.roles.includes('OWNER'))
const personal=computed(()=>session.selected?.party.kind==='PERSON'),self=computed(()=>personal.value&&person.value?.person.owner_party_id===session.selectedId)
const canManageMaterials=computed(()=>self.value||records.value.some(r=>r.kind==='DELEGATION'&&r.current_status==='ACTIVE'&&r.data.organization_party_id===session.selectedId&&Date.parse(r.data.valid_from)<=Date.now()&&Date.now()<Date.parse(r.data.valid_until)&&r.data.actions.includes('MANAGE_MATERIALS')))
const adult=computed(()=>person.value?.person.identity_status==='VERIFIED'&&person.value.person.age_band==='ADULT'&&!!person.value.person.identity_valid_until&&Date.parse(person.value.person.identity_valid_until)>Date.now())
const canWrite=computed(()=>{
 const a=action.value;if(!a)return false
 if(reviewer.value)return !!record.value&&(a==='REVIEW'&&record.value.current_status==='SUBMITTED'||a==='RESULT'&&record.value.kind==='SERVICE'&&record.value.data.kind==='AVATAR_CREATION'&&record.value.current_status==='READY')
 if(!ownerActive.value)return false
 if(a==='PERSON')return personal.value
 if(!person.value||person.value.person.current_status!=='ACTIVE')return false
 if(a==='IDENTITY')return self.value&&services.value?.identity.current_status==='SERVICE_READY'&&!records.value.some(r=>r.kind==='IDENTITY'&&['PENDING','UNKNOWN'].includes(r.current_status))
 if(['WITHDRAW','APPEAL'].includes(a))return self.value
 if(!adult.value)return false
 return self.value||['AVATAR','VARIANT','LISTING'].includes(a)
})
const title=computed(()=>reviewer.value?'艺人资料核验':mode.value==='catalog'?'已批准艺人目录':mode.value==='services'?'创建与托管服务':mode.value==='person-new'?'建立本人真人档案':person.value?.person.display_name||'真人与数字人')
const recordLabel=(r:{kind:ArtistKind;data?:unknown})=>{const d=r.data as {display_name?:string;kind?:keyof typeof artistServiceKinds}|undefined;return d?.display_name||r.kind==='SERVICE'&&d?.kind&&artistServiceKinds[d.kind]||artistKinds[r.kind]}
const kinds=computed(()=>Object.entries(artistKinds).filter(([k])=>self.value||['LOOK','VOICE','LISTING','DELEGATION'].includes(k)) as [ArtistKind,string][])
const link=(a:string)=>`/artists/people/${personId.value}/${a}/new`
const recordLink=(p:string,r:string)=>reviewer.value?`/artists/reviews/${reviewKind.value}/people/${p}/records/${r}`:`/artists/people/${p}/records/${r}`
const date=(v:string|null)=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'尚未核实'
function resetInputs(){inlineAction.value=null;selectedAvatar.value='';file.value=null;fileType.value='';assetReference.value='';cancelReason.value='';assetPurpose.value='AVATAR_MATERIAL'}
async function loadPage(){
 if(!session.token||!session.account?.id)return
 const scope=route.fullPath,revision=session.revision,current=()=>!disposed&&scope===route.fullPath&&revision===session.revision
 if(mode.value==='services'){await ui.loadServices();return}
 if(mode.value==='catalog'){if(validSupplyId(route.params.listingId))await ui.loadPublicListing(String(route.params.listingId));else await readCatalogPosition();return}
 if(mode.value==='reviews'){await ui.loadReviews(reviewKind.value);return}
 if(mode.value==='review-record'){const r=await ui.loadRecord(personId.value,recordId.value,true);if(r&&current()&&r.kind!==reviewKind.value){ui.clear();error.value=new ApiError({status:404,code:'ARTIST_NOT_FOUND',message:'申请不属于当前审核岗位，请从相应待办进入。'})}return}
 if(!ownerActive.value){ui.clear();return}
 if(mode.value==='people'){await ui.loadPeople();return}
 if(mode.value==='person-new')return
 const p=await ui.loadPerson(personId.value);if(!p||!current())return
 selectedAvatar.value=p.avatars[0]?.id||''
 if(mode.value==='person'){
  if(!self.value&&!['LOOK','VOICE','LISTING','DELEGATION'].includes(kind.value))kind.value='LOOK'
  await ui.loadRecords(personId.value,kind.value)
 }else if(mode.value==='record'){
  const r=await ui.loadRecord(personId.value,recordId.value);if(r&&current()&&r.kind==='SERVICE'&&self.value)await ui.loadService(personId.value,recordId.value)
 }else if(mode.value==='new'&&action.value==='LISTING'&&!self.value){
  await ui.loadRecords(personId.value,'DELEGATION')
  while(current()&&!error.value&&recordsCursor.value)await ui.loadRecords(personId.value,'DELEGATION',true)
 }else if(mode.value==='new'&&['SERVICE','IDENTITY'].includes(action.value||'')){if(action.value==='IDENTITY'&&self.value)await ui.loadRecords(personId.value,'IDENTITY');if(current()&&!error.value)await ui.loadServices()}
}
async function selectKind(){if(!pending.value){inlineAction.value=null;await ui.loadRecords(personId.value,kind.value)}}
function leave(){if(pending.value||writing.value){notice.value='本次结果尚未确认，请先核对当前记录并恢复同一份原操作。';return false}rememberCatalog();ui.revoke();return true}
function beforeUnload(e:BeforeUnloadEvent){if(pending.value||writing.value){e.preventDefault();e.returnValue=''}}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave)
watch(()=>route.fullPath,()=>{catalogRequest++;catalogRestored=false;resetInputs();if(!initializing.value)void loadPage()})
watch(()=>[session.token,session.account?.id,session.selectedId,session.revision],()=>{resetInputs();if(!initializing.value)void loadPage()})
watch(securityRevision,resetInputs)
onMounted(async()=>{window.addEventListener('beforeunload',beforeUnload);const c=session.capture();try{await session.loadAccount();if(disposed||!session.current(c))return;await session.loadParties();if(disposed||!session.current(c))return;initializing.value=false;await loadPage()}catch(e){if(!disposed&&session.current(c))error.value=asApiError(e)}finally{if(!disposed)initializing.value=false}})
onUnmounted(()=>{disposed=true;window.removeEventListener('beforeunload',beforeUnload)})
function commandFor(a:ArtistFormAction,body:unknown):ArtistCommand{
 const base='/artists/people/'+personId.value,common={personId:personId.value,ownerPartyId:person.value?.person.owner_party_id,body},r=record.value
 if(a==='PERSON')return {path:'/artists/people',label:'本人真人档案',resultKind:'PERSON',body}
 const create:Partial<Record<ArtistFormAction,[string,ArtistKind|'AVATAR']>>={AVATAR:['avatars','AVATAR'],IDENTITY:['identity','IDENTITY'],CONSENT:['consents','CONSENT'],DELEGATION:['delegations','DELEGATION'],VARIANT:['variants',(body as {kind:'LOOK'|'VOICE'}).kind],HALO:['halos','HALO'],LISTING:['listings','LISTING'],SERVICE:['services','SERVICE']}
 const c=create[a];if(c)return {...common,path:base+'/'+c[0],label:c[1]==='AVATAR'?'数字人档案':artistKinds[c[1]],resultKind:c[1]}
 if(!r)throw new ApiError({status:400,code:'ARTIST_NOT_FOUND',message:'请先读取原申请。'})
 const tail={SUPPLEMENT:'supplements',APPEAL:'appeals',WITHDRAW:'withdrawals',REVIEW:'reviews',RESULT:'results'}[a as 'SUPPLEMENT'|'APPEAL'|'WITHDRAW'|'REVIEW'|'RESULT']
 return {...common,path:a==='RESULT'?`${base}/services/${r.id}/results`:`${base}/records/${r.id}/${tail}`,targetId:r.id,version:a==='APPEAL'?undefined:r.object_version,label:a==='APPEAL'?'本次审核异议':a==='REVIEW'?'独立审核决定':a==='RESULT'?'实际服务结果':a==='WITHDRAW'?'本次撤回':'原申请补件',resultKind:a==='APPEAL'?'APPEAL':r.kind}
}
async function afterWrite(a:ArtistFormAction|null){
 if(pending.value||error.value)return
 if(a==='PERSON'&&people.value[0])await router.push('/artists/people/'+people.value[0].id)
 else if(a==='AVATAR')await router.push('/artists/people/'+personId.value)
 else if(mode.value==='new'&&record.value)await router.push(recordLink(personId.value,record.value.id))
 else if(a==='APPEAL'&&record.value)await router.push(`/artists/people/${personId.value}/records/${record.value.id}`)
 else {inlineAction.value=null;if(record.value?.kind==='SERVICE'&&self.value)await ui.loadService(personId.value,record.value.id)}
}
async function submit(body:unknown){const a=action.value;if(!a||!canWrite.value)return;try{await ui.write(commandFor(a,body));await afterWrite(a)}catch(e){error.value=asApiError(e)}}
async function recover(retry=false){const a=action.value,upload=pending.value?.command.resultKind==='ASSET';if(retry)await ui.retry();else await ui.checkPending();if(!upload)await afterWrite(a);else if(!pending.value&&!error.value){file.value=null;fileType.value=''}}
async function upload(){
 if(!person.value||!file.value||!Object.hasOwn(artistMediaTypes,fileType.value)||!ownerActive.value||!adult.value)return
 if(!self.value&&assetPurpose.value!=='AVATAR_MATERIAL')return
 const q=new URLSearchParams({purpose:assetPurpose.value,media_type:fileType.value})
 await ui.write({path:`/artists/people/${personId.value}/assets?${q}`,personId:personId.value,ownerPartyId:person.value.person.owner_party_id,label:'本次私有材料',resultKind:'ASSET',blob:file.value,purpose:assetPurpose.value,mediaType:fileType.value as MediaType})
 if(!pending.value&&!error.value){file.value=null;fileType.value=''}
}
function selectFile(e:Event){file.value=(e.target as HTMLInputElement).files?.[0]||null;fileType.value=file.value&&Object.hasOwn(artistMediaTypes,file.value.type)?file.value.type:''}
async function readEvidence(assetId:string){if(reviewer.value)await ui.previewReview(personId.value,recordId.value,assetId);else {const a=await ui.loadAsset(assetId);if(a)await ui.previewAsset(a)}}
async function readPortraits(ids:string[]){if(locked.value||!canWrite.value||!canManageMaterials.value)return;const revision=session.revision,scope=route.fullPath;for(const id of ids){if(disposed||scope!==route.fullPath||revision!==session.revision||!await ui.loadAsset(id))break}}
async function copy(text:string){try{await navigator.clipboard.writeText(text);notice.value='已复制。'}catch{notice.value='当前浏览器未能复制，请选择并复制对应编号。'}}
async function serviceAction(kind:'sync'|'reminder'|'cancel'){
 const r=record.value;if(!self.value||!ownerActive.value||r?.kind!=='SERVICE')return
 await ui.write({path:`/artists/people/${personId.value}/services/${r.id}/${kind}`,label:kind==='sync'?'原订单状态核对':kind==='reminder'?'续托管提醒设置':'取消服务申请',personId:personId.value,ownerPartyId:person.value?.person.owner_party_id,targetId:r.id,resultKind:'SERVICE',version:kind==='sync'?undefined:r.object_version,body:kind==='sync'?{}:kind==='reminder'?{enabled:!r.data.renewal_reminder}:{reason:cancelReason.value.trim()}})
 if(!pending.value&&!error.value)await ui.loadService(personId.value,r.id)
}
</script>

<template>
 <div class="supply-workspace editorial-workspace artists-workspace" data-testid="artists-workspace" data-design="V5-R03-film-editorial-adaptation">
  <header class="supply-header"><RouterLink to="/workspace" class="supply-brand">晶晶日上</RouterLink><span>运营与合作方工作台</span><div class="account-actions"><span class="account-name">{{session.account?.display_name||'当前账号'}}</span><button :disabled="locked" @click="session.logout().then(()=>router.push('/login'))">退出</button></div></header>
  <div class="supply-layout"><aside class="supply-sidebar"><WorkspaceNav/><div class="supply-identity"><template v-if="accountMode"><p>{{reviewer?'按当前账号的独立岗位核权':'当前登录账号'}}</p><p class="muted">页面入口不授予审核、查看私人材料或代办权限。</p></template><template v-else><label>当前办理身份<select :value="session.selectedId" data-testid="artists-party" :disabled="!!pending||busy||initializing" @change="session.selectParty(($event.target as HTMLSelectElement).value)"><option v-for="p in session.parties" :key="p.party.id" :value="p.party.id">{{p.party.display_name}}</option></select></label><button v-if="session.nextCursor" class="outline" :disabled="!!pending||busy||initializing" @click="session.loadMoreParties">读取更多身份</button><p class="muted">本人办理或按本人的逐项有效委托代办。</p></template></div></aside>
  <main class="supply-main">
   <nav class="loaded-tabs artist-tabs" aria-label="艺人业务"><RouterLink to="/artists/people" :class="{active:!accountMode}">本人及获托档案</RouterLink><RouterLink to="/artists/catalog">已批准公开目录</RouterLink><RouterLink to="/artists/services">服务与启用状态</RouterLink><RouterLink to="/artists/reviews/CONSENT" :class="{active:reviewer}">独立核验</RouterLink></nav>
   <RouterLink v-if="personId&&!reviewer" :to="mode==='person'?'/artists/people':'/artists/people/'+personId" class="customization-back">← {{mode==='person'?'返回本人及获托名单':'返回当前真人档案'}}</RouterLink><RouterLink v-if="mode==='review-record'" :to="'/artists/reviews/'+reviewKind" class="customization-back">← 返回本岗位待办</RouterLink>
   <div class="supply-heading"><div><p class="eyebrow">真人 · 数字人 · 明确用途</p><h1>{{title}}</h1><p class="muted">本人授权、资料版本、机构代办与公开展示分别核对。</p></div><button class="outline" data-testid="artists-refresh" :disabled="locked||initializing" @click="loadPage">重新读取</button></div>
   <ApiErrorAlert :error="error" testid="artists-error"/><p v-if="notice" class="supply-notice" role="status">{{notice}}</p><p v-if="initializing||busy" class="muted" role="status">{{writing?'正在保存本次原操作…':'正在读取当前获准的资料…'}}</p>
   <section v-if="pending&&!writing" class="supply-card" data-testid="artists-pending"><h2>原操作结果待确认</h2><p>保留这次内容、文件、版本和请求编号。先核对当前状态，再恢复同一操作。</p><div class="supply-actions"><button class="outline" data-testid="artists-check-pending" :disabled="busy" @click="recover()">核对当前记录</button><button class="primary" data-testid="artists-retry-pending" :disabled="busy||!pending.checked" @click="recover(true)">{{pending.resultId?'继续读取已保存的原结果':'恢复同一份原请求'}}</button></div></section>
   <label v-if="conflicted" class="artist-check supply-warning"><input v-model="reconfirmed" data-testid="artists-reconfirm" type="checkbox">我已核对更新后的记录和版本，保留的输入仍符合本次事实。</label>
   <p v-if="!accountMode&&!ownerActive&&!initializing" class="supply-warning" data-testid="artists-party-required">请在账号与机构中选择本人或获托机构的有效负责人身份。</p>
   <template v-if="mode==='people'&&ownerActive">
    <section class="supply-card"><div class="section-heading"><h2>{{personal?'本人真人档案':'本人有效委托的档案名单'}}</h2><RouterLink v-if="personal" to="/artists/people/new" class="button-link primary" data-testid="artists-new-person">建立本人档案</RouterLink></div><p class="muted">{{personal?'每个个人主体只有一份真人档案，可在其中管理多个数字人。':'名单仅来自本人有效委托。机构不能创建真人、代作本人同意或转移资料所有权。'}}</p><div class="artist-grid"><RouterLink v-for="p in people" :key="p.id" :to="'/artists/people/'+p.id" class="artist-person-link" :data-testid="'artists-person-'+p.id"><h3>{{p.display_name}}</h3><p>{{artistStatuses[p.identity_status]}} · {{artistStatuses[p.current_status]}}</p><span class="table-link">进入获准档案 →</span></RouterLink></div><p v-if="!people.length&&!busy&&!error" class="supply-empty" data-testid="artists-people-empty">当前身份没有可读取的真人档案。</p><button v-if="peopleCursor" class="outline" data-testid="artists-people-more" :disabled="locked" @click="ui.loadPeople(true)">继续读取名单</button></section>
   </template>
   <template v-if="person">
    <section class="supply-card" data-testid="artists-person-summary"><div class="section-heading"><h2>{{person.person.display_name}}</h2><span class="supply-badge">{{self?'本人资料':'本人委托 · 归本人所有'}}</span></div><dl class="supply-facts"><div><dt>实名状态</dt><dd>{{artistStatuses[person.person.identity_status]}}</dd></div><div><dt>已核实有效期</dt><dd>{{date(person.person.identity_valid_until)}}</dd></div><div><dt>本人权属认证</dt><dd>{{person.halo_level?'L'+person.halo_level:'尚未通过'}}</dd></div><div><dt>数字人数量</dt><dd>{{person.avatars.length}}</dd></div></dl><p v-if="!adult" class="supply-warning">尚无当前有效的成年人实名核验，暂不能新增素材、数字人或收费服务。儿童实际处理未开放。</p><details class="ops-technical"><summary>报价所需的本人主体编号与档案定位</summary><p>本人买方主体编号：<span class="identifier">{{person.person.owner_party_id}}</span></p><button type="button" class="outline" @click="copy(person.person.owner_party_id)">复制本人买方主体编号</button><p class="identifier">真人档案：{{person.person.id}} · 版本 {{person.person.object_version}}</p></details></section>
    <section v-if="mode==='person'" class="supply-card"><h2>按本次明确用途办理</h2><div class="supply-actions"><RouterLink v-if="self" :to="link('identity')" class="button-link outline">核对本人实名</RouterLink><RouterLink :to="link('avatars')" class="button-link outline">建立数字人</RouterLink><RouterLink :to="link('variants')" class="button-link outline">保存造型或声音版本</RouterLink><RouterLink :to="link('listings')" class="button-link outline">申请公开展示</RouterLink><template v-if="self"><RouterLink :to="link('consents')" class="button-link outline">本人逐项同意</RouterLink><RouterLink :to="link('delegations')" class="button-link outline">本人委托机构</RouterLink><RouterLink :to="link('halos')" class="button-link outline">申请认证</RouterLink><RouterLink :to="link('services')" class="button-link primary">选择创建或托管服务</RouterLink></template></div><p v-if="!self" class="muted">各项代办仍由服务器按本人所授范围逐次核对；进入此页不代表获准所有操作。</p></section>
    <section v-if="mode==='person'" class="supply-card"><h2>本人名下数字人</h2><div class="artist-grid"><article v-for="a in person.avatars" :key="a.id" class="artist-item" :data-testid="'artists-avatar-'+a.id"><h3>{{a.data.display_name}}</h3><p>{{a.data.archive_status==='DELIVERED'?'内部私人档案已交付':'尚无已交付私人档案'}} · 长期模型未启用</p><details class="ops-technical"><summary>用于版本或展示申请的数字人编号</summary><p class="identifier">{{a.id}}</p><button type="button" class="outline" @click="copy(a.id)">复制数字人编号</button></details></article></div><p v-if="!person.avatars.length" class="supply-empty">本人尚未建立数字人档案。</p></section>
    <section v-if="mode==='person'" class="supply-card"><div class="section-heading"><h2>已保存记录与申请</h2><label>事项<select v-model="kind" data-testid="artists-record-kind" :disabled="locked" @change="selectKind"><option v-for="[key,label] in kinds" :key="key" :value="key">{{label}}</option></select></label></div><div class="artist-list"><RouterLink v-for="r in records" :key="r.id" :to="recordLink(personId,r.id)" class="artist-list-row" :data-testid="'artists-open-'+r.id"><strong>{{recordLabel(r)}}</strong><span class="supply-badge">{{artistStatuses[r.current_status]||r.current_status}}</span><span class="table-link">查看原记录 →</span></RouterLink></div><p v-if="!records.length&&!busy&&!error" class="supply-empty">当前事项没有获准可见的记录。</p><button v-if="recordsCursor" class="outline" data-testid="artists-records-more" :disabled="locked" @click="ui.loadRecords(personId,kind,true)">继续读取记录</button></section>
    <details v-if="['person','new','record'].includes(mode)" class="supply-card artist-materials" data-testid="artists-materials"><summary>私有材料上传与读取</summary><p class="muted">上传不会公开。证明与形象素材用途分别保存，单份不超过8MB；受托机构仅可管理获准的形象素材。</p><form @submit.prevent="upload"><fieldset :disabled="locked||!ownerActive||!adult"><div class="artist-fields"><label>材料用途<select v-model="assetPurpose" data-testid="artists-asset-purpose"><option value="AVATAR_MATERIAL">形象或声音素材</option><option v-if="self" value="CONSENT_EVIDENCE">本人同意证明</option><option v-if="self" value="REVIEW_EVIDENCE">认证或异议证明</option></select></label><label>本次真实文件<input :key="securityRevision+'-'+assets.length" type="file" data-testid="artists-asset-file" accept="image/jpeg,image/png,video/mp4,audio/mpeg,audio/wav,application/pdf,text/plain" @change="selectFile"></label><label>明确文件格式<select v-model="fileType" data-testid="artists-asset-type" required><option value="">请选择真实格式</option><option v-for="(label,value) in artistMediaTypes" :key="value" :value="value">{{label}}</option></select></label></div><p v-if="file">{{file.name}} · {{(file.size/1024).toFixed(1)}} KB</p><button class="primary" data-testid="artists-asset-upload" :disabled="!file||file.size<1||file.size>8*1024*1024||!fileType">上传这份私有材料</button></fieldset></form><div v-for="a in assets" :key="a.id" class="artist-evidence"><span class="identifier">{{a.id}} · {{a.media_type}}</span><button class="outline" type="button" @click="copy(a.id)">复制材料编号</button><button class="outline" type="button" :disabled="locked" @click="ui.previewAsset(a)">重新核权读取</button></div><form class="artist-reference-form" @submit.prevent="ui.loadAsset(assetReference)"><label>读取已保存的材料编号<input v-model="assetReference" data-testid="artists-asset-reference" :disabled="locked"></label><button class="outline" :disabled="locked||!validSupplyId(assetReference)">读取本次获准材料信息</button></form></details>
   </template>
   <template v-if="mode==='services'"><section class="supply-card"><h2>当前服务条件</h2><template v-if="services"><dl class="supply-facts"><div><dt>实名服务</dt><dd>{{services.identity.current_status==='SERVICE_READY'?'当前接口已就绪，仍须实际核验':'尚未启用'}}</dd></div><div><dt>长期模型</dt><dd>{{services.long_lived_model.current_status==='SERVICE_READY'?'当前接口有就绪信息，交付以实际结果为准':'尚未启用'}}</dd></div><div><dt>自动扣款 / L3</dt><dd>均未开放</dd></div></dl><div class="artist-grid"><article v-for="o in services.offers.items" :key="o.spec_id" class="artist-item"><h3>{{o.title}}</h3><p class="trade-amount">{{money(o.price_minor)}}</p><p>{{artistServiceKinds[o.specification.service.kind]}} · {{o.specification.deliverables.join('、')}}</p><p class="long-text">{{o.specification.terms}}</p><p class="muted">失败可重试 {{o.specification.service.retry_limit}} 次；无法交付按原订单办理退款。</p><details class="ops-technical"><summary>已审规格引用</summary><p class="identifier">{{o.spec_id}} · 版本 {{o.specification.version}}</p></details></article></div><p v-if="!services.offers.items.length" class="supply-empty">尚无可申请的已审核服务，不能自行填价申请。</p></template><RouterLink to="/artists/people" class="button-link primary">先选择本人档案，再明确申请服务</RouterLink></section></template>
   <template v-if="mode==='catalog'&&!route.params.listingId"><DirectoryCityControl :city="directoryCity" :disabled="locked" @change="changeDefaultCity"/><p class="muted" role="status">{{localCity?'当前城市仅用于艺人目录，默认城市变化不会覆盖。':'本页城市跟随目录默认城市，手动修改将仅用于本页。'}} <button v-if="localCity||appliedDefaultCity!==directoryCity" class="outline" :disabled="locked" @click="useDefaultCity">使用默认城市{{directoryCity?'：'+directoryCity:'（未设置）'}}</button></p><form class="supply-card" data-testid="artists-catalog-filter" @submit.prevent="searchCatalog()"><h2>查找当前可展示资料</h2><div class="artist-fields"><label>城市<input v-model="filters.city" data-testid="artists-filter-city" maxlength="100" :disabled="locked"></label><label>标签<input v-model="filters.tag" data-testid="artists-filter-tag" maxlength="40" :disabled="locked"></label><label>试镜展示<select v-model="filters.audition" data-testid="artists-filter-audition" :disabled="locked"><option value="">全部当前可展示资料</option><option value="true">已另行开启试镜展示</option></select></label></div><button class="primary" :disabled="locked" data-testid="artists-catalog-search">按当前条件重新查找</button></form><section class="supply-card"><div class="artist-grid"><article v-for="item in catalog" :key="item.listing_id" class="artist-item" :data-testid="'artists-catalog-'+item.listing_id"><h2>{{item.display_name}}</h2><p>{{item.city}} · {{item.tags.join(' / ')}} · L{{item.halo_level}}</p><p class="long-text">{{item.introduction}}</p><p>{{item.audition_public?'已另行开启试镜展示':'未开启试镜展示'}}</p><div class="supply-actions"><button class="outline" :disabled="locked" @click="ui.loadPublicListing(item.listing_id)">读取当前公开详情</button></div></article></div><p v-if="!catalog.length&&!busy&&!error" class="supply-empty" data-testid="artists-catalog-empty">没有符合条件且当前获准公开的资料。</p><button v-if="catalogCursor" class="outline" data-testid="artists-catalog-more" :disabled="locked" @click="searchCatalog(true)">继续读取目录</button></section></template>
   <template v-if="reviewer"><nav class="loaded-tabs artist-tabs" aria-label="独立岗位"><RouterLink v-for="(label,key) in reviewKinds" :key="key" :to="'/artists/reviews/'+key" :class="{active:reviewKind===key}">{{label}}</RouterLink></nav><p class="muted">每个岗位分别核权；本人、参与方或提交人员不能审核自己相关的材料。没有岗位权限时保留真实拒绝结果。</p><section v-if="mode==='reviews'" class="supply-card"><h2>{{reviewKinds[reviewKind]}}</h2><div class="artist-list"><RouterLink v-for="item in reviews" :key="item.id" :to="recordLink(item.person_id,item.id)" class="artist-list-row" :data-testid="'artists-review-'+item.id"><strong>{{artistKinds[item.kind]}}</strong><span class="supply-badge">{{artistStatuses[item.current_status]||item.current_status}}</span><span class="table-link">读取这份申请 →</span></RouterLink></div><p v-if="!reviews.length&&!busy&&!error" class="supply-empty" data-testid="artists-reviews-empty">本岗位当前没有可见待办。</p><button v-if="reviewsCursor" class="outline" data-testid="artists-reviews-more" :disabled="locked" @click="ui.loadReviews(reviewKind,true)">继续读取本岗位待办</button></section></template>
   <template v-if="record"><ArtistRecordPanel :record="record" :service="service" :disabled="locked" :read-evidence="evidenceRead" @evidence="readEvidence" @copy="copy"/>
    <section v-if="reviewer&&record.kind==='SERVICE'&&record.data.kind==='AVATAR_CREATION'" class="supply-card"><h2>核对本次创建所采用的私有材料</h2><p class="muted">填写本人提供的原造型或声音版本材料编号。服务器逐次核对本服务、本人同意及版本来源，输入编号不会授予额外权限。</p><form class="artist-reference-form" @submit.prevent="ui.previewReview(personId,recordId,assetReference)"><label>原版本引用的材料编号<input v-model="assetReference" data-testid="artists-review-asset-reference" :disabled="locked" required></label><button class="outline" data-testid="artists-review-asset-read" :disabled="locked||!validSupplyId(assetReference)">核对并读取这份原材料</button></form></section><section class="supply-card"><h2>按当前原记录继续办理</h2><div class="supply-actions"><template v-if="reviewer"><button v-if="record.current_status==='SUBMITTED'&&['CONSENT','HALO','APPEAL','LISTING'].includes(record.kind)" class="primary" data-testid="artists-review-action" :disabled="locked" @click="inlineAction='REVIEW'">独立审核这份申请</button><button v-if="record.kind==='SERVICE'&&record.data.kind==='AVATAR_CREATION'&&record.current_status==='READY'" class="primary" data-testid="artists-result-action" :disabled="locked" @click="inlineAction='RESULT'">登记创建的实际交付或失败</button></template><template v-else-if="self"><button v-if="record.current_status==='NEEDS_MATERIAL'" class="primary" data-testid="artists-supplement-action" :disabled="locked" @click="inlineAction='SUPPLEMENT'">补充原申请材料</button><button v-if="['HALO','LISTING'].includes(record.kind)&&record.current_status==='REJECTED'" class="outline" data-testid="artists-appeal-action" :disabled="locked" @click="inlineAction='APPEAL'">对原拒绝提出异议</button><button v-if="['CONSENT','DELEGATION','LISTING'].includes(record.kind)&&record.current_status!=='WITHDRAWN'" class="outline" data-testid="artists-withdraw-action" :disabled="locked" @click="inlineAction='WITHDRAW'">本人撤回这份明确约定</button><template v-if="record.kind==='SERVICE'"><button class="outline" data-testid="artists-service-sync" :disabled="locked" @click="serviceAction('sync')">核对原订单实收、退款及权益</button><button v-if="record.data.kind==='AVATAR_HOSTING'" class="outline" data-testid="artists-service-reminder" :disabled="locked" @click="serviceAction('reminder')">{{record.data.renewal_reminder?'关闭':'开启'}}续托管提醒</button></template></template></div><form v-if="self&&record.kind==='SERVICE'&&service&&!['DELIVERED','REFUNDED','CANCELLED'].includes(record.current_status)&&(!service.order||service.order.current_status==='CANCELLED')" class="artist-reference-form" @submit.prevent="serviceAction('cancel')"><label>取消本服务申请的理由<textarea v-model="cancelReason" data-testid="artists-cancel-reason" maxlength="2000" :disabled="locked" required></textarea></label><button class="outline" data-testid="artists-service-cancel" :disabled="locked||!cancelReason.trim()">取消这份可取消的服务申请</button></form></section>
   </template>
   <section v-if="action" class="supply-card artist-action" data-testid="artists-action"><template v-if="action==='IDENTITY'"><p v-if="records.some(r=>['PENDING','UNKNOWN'].includes(r.current_status))" class="supply-warning">本人已有结果待确认的原实名申请，请先读取原结果，不能另建会话。</p><RouterLink v-for="r in records.filter(r=>['PENDING','UNKNOWN'].includes(r.current_status))" :key="r.id" :to="recordLink(personId,r.id)" class="button-link outline">查看原实名核验结果</RouterLink></template><p v-if="!canWrite" class="supply-warning">当前身份、实名结果或服务状态不允许提交此项；请先核对本人档案和实际委托范围。</p><ArtistForm :key="securityRevision+'-'+action+'-'+personId" :action="action" :disabled="locked||initializing||!canWrite" :person="person" :record="record" :services="services" :avatar-id="selectedAvatar" :read-evidence="evidenceRead" :assets="assets" :can-manage-materials="canManageMaterials" @read-portraits="readPortraits" @inspect-portrait="ui.previewAsset" @submit="submit"/></section>
   <section v-if="publicListing&&mode==='catalog'" class="supply-card" data-testid="artists-public-detail"><p class="eyebrow">已重新核对公开范围</p><h2>{{publicListing.display_name}}</h2><CollectionActions :key="publicListing.listing_id" kind="ARTIST" :target-id="publicListing.listing_id" @lock="collectionLocked=$event"/><p>{{publicListing.city}} · {{publicListing.tags.join(' / ')}}</p><p class="long-text">{{publicListing.introduction}}</p><ArtistPublicMedia v-if="publicMedia" :media="publicMedia" :portrait="publicPortrait" :name="publicListing.display_name" :disabled="locked" @preview="ui.previewCatalog(publicListing.listing_id,$event)" @reload="ui.loadPublicListing(publicListing.listing_id)" @portrait-failed="ui.revokePortrait()"/><div class="supply-actions"><RouterLink class="button-link outline" :to="`/notices/submissions?action=invitation&sourceListing=${publicListing.listing_id}`">准备向本艺人发出邀约</RouterLink></div><p class="muted">仅展示当前获准的公开资料。邀约需继续核验当前办理身份与合作规则。</p></section><ArtistPreview v-if="preview" :preview="preview" @close="ui.revokePreview" @failed="ui.revokePreview();notice='材料未能打开，已清除本次预览，请重新读取或核对文件。'"/>
   <p class="artist-limit-note muted">儿童实际素材处理、长期模型、L3和自动扣款尚未启用。现有内部私人档案与托管记录按实际接口及原订单办理。</p>
  </main></div>
 </div>
</template>
