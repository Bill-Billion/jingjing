<script setup lang="ts">
import { computed,nextTick,onMounted,onUnmounted,ref,watch } from 'vue'
import { onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useBusiness } from '@/composables/useBusiness'
import { mcnDashboardView } from '@/business/presentation'
import { sourceFor,referenceOptions,readReferences,type ReferenceOption,type ReferenceSource } from '@/business/references'
import { creationIssue,validateCreatedRoom,type CreationIssue } from '@/business/cocreationCreation'
import BusinessOverview from '@/components/business/BusinessOverview.vue'
import { domains } from '@/business'
import { BusinessFormError,encode,initial,pathFor,routeIds,uuid,type Field,type FileAction,type Operation } from '@/business/model'
import { readBusiness,recordId,rowData,rowsOf,versionOf,type BusinessData } from '@/api/modules/business'
import { businessPrerequisite } from '@/business/prerequisites'
import { actionAvailability } from '@/business/availability'
import { clearBusinessLists,draftFingerprint,rememberBusinessList,restoreBusinessList } from '@/business/navigation'
import { directoryCity,setDirectoryCity } from '@/business/directoryCity'
import DirectoryCityControl from '@/components/business/DirectoryCityControl.vue'
import { labels,display } from '@/business/labels'
import { ApiError,asApiError } from '@/api/client'
import StateValue from '@/components/StateValue.vue'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import BusinessFields from '@/components/business/BusinessFields.vue'
import BusinessDetails from '@/components/business/BusinessDetails.vue'
import '@/styles/supply.css'
import '@/styles/trade.css'
import '@/styles/business.css'
const session=useSessionStore(),route=useRoute(),router=useRouter()
const domain=computed(()=>domains[String(route.meta.domain)]!),section=computed(()=>domain.value.sections.find(s=>s.key===route.params.section)||domain.value.sections[0]!)
const ui=useBusiness(()=>({token:session.token,accountId:session.account?.id||'',partyId:session.selectedId,sessionTag:session.expiresAt||'',domain:domain.value.key}))
const chosenReferences=ref<BusinessData[]>([])
const reference=ref<Record<string,unknown>>({}),filters=ref<Record<string,unknown>>({}),draft=ref<Record<string,unknown>>({}),operationKey=ref(''),agreed=ref(false),loading=ref(true),selected=ref<BusinessData|null>(null),cursor=ref(''),fileUrl=ref(''),fileType=ref(''),fileText=ref(''),filePlayed=ref(false),fileSource=ref(''),notifyRead=ref(false),assetId=ref(''),timer=ref(0),now=ref(Date.now()),uploadFile=ref<File|null>(null),uploadPurpose=ref('RIGHTS_EVIDENCE'),uploaded=ref<BusinessData|null>(null)
let referenceRequest=0,listRequest=0,syncingCity=false
const invitationContext=ref<BusinessData|null>(null)
const creationVerifiedRequest=ref(''),creationProblem=ref<CreationIssue|null>(null)
const previousCursors=ref<string[]>([]),draftBaseline=ref('{}'),fieldErrors=ref<Record<string,string>>({}),errorField=ref('')
const dirty=computed(()=>!!operationKey.value&&(agreed.value||draftFingerprint(draft.value)!==draftBaseline.value))
const cityField=computed(()=>!route.params.recordId?section.value.query?.find(field=>field.key==='city'):undefined)
const localCity=ref(false),appliedDefaultCity=ref(directoryCity.value),lastReadCity=ref('')
const listKey=()=>JSON.stringify([session.account?.id,session.selectedId,session.expiresAt,domain.value.key,section.value.key])
function rememberList(){if(!route.params.recordId){const sameCity=!cityField.value||lastReadCity.value===String(filters.value.city||'');rememberBusinessList(listKey(),{filters:filters.value,cursor:sameCity?cursor.value:'',previous:sameCity?previousCursors.value:[],...cityField.value?{city:{local:localCity.value,defaultValue:appliedDefaultCity.value}}:{}})}}
function cleanDraft(){draftBaseline.value=draftFingerprint(draft.value);fieldErrors.value={};errorField.value=''}
const actions=computed(()=>domain.value.operations.filter(o=>{
 if(o.sections&&!o.sections.includes(section.value.key))return false
 const record=selected.value||ui.data.value,kind=record?.kind,status=record?.current_status
 if(domain.value.key==='stock'&&o.key==='revision'&&(!record?.id||!['REJECTED','UNLISTED','LISTED'].includes(String(status))||rowData(record).rights_hold||rowData(record).revision_id||rowData(record).replaced_by_listing_id))return false
 if(domain.value.key==='conversations'&&record?.status&&record.status!=='OPEN'&&['message','contact'].includes(o.key))return false
 if(domain.value.key==='engagement'&&['staff','revoke','assign'].includes(o.key)&&!session.selected?.membership.roles.includes('OWNER'))return false
 if(domain.value.key==='participation'&&section.value.key==='reviews'&&record?.id){if(!['IN_REVIEW','INTERNAL_PENDING'].includes(String(status)))return false;return o.key===(kind==='INCOME_AGREEMENT'?'income-review':'review')}
 if(domain.value.key==='auditions'&&section.value.key==='reviews'&&kind){if(o.key==='review-offer')return kind==='OFFER';if(o.key==='review-supplement'||o.key==='supplement-refund')return kind==='SUPPLEMENT';return kind==='BOOKING'}
 return true
}))
const action=computed(()=>domain.value.operations.find(o=>o.key===operationKey.value&&(!o.sections||o.sections.includes(section.value.key))))
const isRoomCreation=computed(()=>domain.value.key==='cocreation'&&action.value?.key==='room')
const availability=(operation:Operation)=>actionAvailability(domain.value.key,operation,selected.value||ui.data.value,{accountId:session.account?.id||'',partyId:session.selectedId,membershipActive:session.selected?.membership.current_status==='ACTIVE',owner:!!session.selected?.membership.roles.includes('OWNER')})
const prerequisite=computed(()=>action.value?businessPrerequisite(domain.value.key,action.value.key):null)
const actionUnavailable=computed(()=>!!action.value&&(!actions.value.some(o=>o.key===action.value?.key)||availability(action.value).blocked))
const needsMaterials=(fields:Field[]):boolean=>fields.some(f=>/(?:asset_ids?|evidence_ids|file_ids?|photos|videos)$/.test(f.key)||!!f.fields&&needsMaterials(f.fields))
const materialPreparation=computed(()=>section.value.party!=='none'||domain.value.key==='media'&&section.value.key==='tasks'||!!action.value&&needsMaterials(action.value.fields))
const details=computed(()=>{const record=selected.value||(versionOf(ui.data.value)!==null||!rowsOf(ui.data.value).length?ui.data.value:null);return record&&domain.value.key==='engagement'&&section.value.key==='dashboard'?mcnDashboardView(record,session.account?.id||'',!!session.selected?.membership.roles.includes('OWNER')):record})
const refOptions=ref<Record<string,ReferenceOption[]>>({}),refCursor=ref<Record<string,string>>({}),referenceSources=ref<Record<string,string>>({}),refBusy=ref(false),referenceNotice=ref('')
const selectedCreationRule=computed(()=>isRoomCreation.value?refOptions.value['room-rule_id']?.find(o=>o.value===draft.value.rule_id)?.record:null)
const creationReady=computed(()=>isRoomCreation.value&&uuid(draft.value.request_id)&&creationVerifiedRequest.value===draft.value.request_id&&refOptions.value['room-producer_party_id']?.some(o=>o.value===draft.value.producer_party_id)&&refOptions.value['room-rule_id']?.some(o=>o.value===draft.value.rule_id))
const currentId=computed(()=>details.value?recordId(details.value):'')
const currentVersion=computed(()=>versionOf(details.value))
const locked=computed(()=>ui.busy.value||!!ui.pending.value||now.value<ui.retryAt.value||ui.conflict.value&&!ui.confirmed.value)
const fieldLabels=computed(()=>{const result:Record<string,string>={};const visit=(fs:Field[])=>fs.forEach(f=>{result[f.key]=f.label;if(f.fields)visit(f.fields)});domain.value.operations.forEach(o=>visit(o.fields));return result})
const actionFields=computed(()=>{const fs=action.value?.fields||[];if(domain.value.key!=='notices'||action.value?.key!=='submission')return fs;return fs.map(f=>f.key!=='submission'?f:{...f,fields:f.fields?.map(x=>x.key==='kind'?{...x,choices:x.choices?.filter(c=>(typeof c==='string'?c:c[0])!=='INVITATION')}:uuid((draft.value.submission as BusinessData|undefined)?.notice_id)&&['target_party_id','avatar_id'].includes(x.key)?{...x,readonly:true,hint:'读取本通告当前获准投稿授权后自动带入。'}:x)})})
function bindReferences(r:BusinessData){const id=recordId(r),d=rowData(r);reference.value={...reference.value,record_id:id,...uuid(r.request_id)?{request_id:r.request_id}:domain.value.key==='privacy'&&section.value.key!=='files'||section.value.key.startsWith('manual-')?{request_id:id}:{},...uuid(r.order_id)?{order_id:r.order_id}:r.kind==='ORDER'?{order_id:id}:{},...uuid(r.project_id)?{project_id:r.project_id}:r.kind==='PROJECT'&&domain.value.key==='participation'?{project_id:id}:{},...r.action&&r.request_id?{execution_id:id}:{}}}
const referenceFields=computed(()=>[...new Set([...domain.value.key==='media'&&draft.value.source_kind==='PRODUCTION_VERSION'?['project_id']:[],...routeIds(section.value.path),...routeIds(action.value?.path||''),...(details.value?section.value.files||[]:[]).flatMap(f=>routeIds(f.path))])].filter(k=>!(domain.value.key==='media'&&action.value?.key==='task'&&k==='record_id')&&!['asset_id','message_id'].includes(k)&&!(['record_id','request_id','order_id','execution_id'].includes(k)&&details.value&&uuid(reference.value[k]))).map(key=>({key,label:key==='execution_id'?'已独立审核的执行记录':key==='project_id'?'原出品项目':key==='order_id'?'原成交订单':'本次办理的原记录',type:'id'} as Field)))
const attachmentIds=computed(()=>{if(domain.value.key==='conversations')return rows.value.filter(r=>rowData(r).kind==='MEDIA').map(recordId);const found=new Set<string>();if(domain.value.key==='privacy'&&section.value.key==='files'&&details.value&&uuid(recordId(details.value)))found.add(recordId(details.value));const visit=(v:unknown,key='')=>{if(typeof v==='string'&&uuid(v)&&/(?:asset|file|photos|videos|materials)/.test(key))found.add(v);else if(Array.isArray(v))v.forEach(x=>visit(x,key));else if(v&&typeof v==='object')Object.entries(v).forEach(([k,x])=>visit(x,k))};visit(details.value);return [...found]})
const hasList=computed(()=>!!ui.data.value&&Array.isArray(ui.data.value.items))
const rows=computed(()=>rowsOf(ui.data.value))
const title=(r:BusinessData)=>String(r.title||rowData(r).title||(r.notice as BusinessData|undefined)?.title||(rowData(r).notice as BusinessData|undefined)?.title||(rowData(r).template as BusinessData|undefined)?.title||labels[String(r.kind)]||section.value.label)
function clearFile(){ui.revoke();fileUrl.value=fileText.value=fileType.value=fileSource.value='';filePlayed.value=notifyRead.value=false}
function reset(){creationVerifiedRequest.value='';creationProblem.value=null;listRequest++;syncingCity=true;referenceRequest++;refBusy.value=false;invitationContext.value=null;previousCursors.value=[];fieldErrors.value={};errorField.value='';draftBaseline.value='{}';ui.data.value=null;ui.result.value=null;chosenReferences.value=[];refOptions.value={};refCursor.value={};referenceSources.value={};referenceNotice.value='';selected.value=null;reference.value={record_id:uuid(route.params.recordId)?route.params.recordId:'',request_id:uuid(route.params.recordId)?route.params.recordId:'',...section.value.path.includes(':order_id')?{order_id:route.params.recordId||''}:{},...section.value.path.includes(':project_id')?{project_id:route.params.recordId||''}:{}};filters.value=initial(section.value.query||[]);draft.value={};operationKey.value='';agreed.value=false;cursor.value='';assetId.value='';uploaded.value=null;uploadFile.value=null;clearFile();const position=restoreBusinessList(listKey(),cityField.value?directoryCity.value:undefined);if(position){filters.value=position.filters;cursor.value=position.cursor;previousCursors.value=position.previous}localCity.value=position?.city?.local||false;appliedDefaultCity.value=directoryCity.value;if(cityField.value&&!localCity.value)filters.value.city=directoryCity.value;lastReadCity.value=String(filters.value.city||'');syncingCity=false}
watch(ui.securityRevision,()=>{if(ui.error.value)clearBusinessLists();reset()},{flush:'sync'})
watch(()=>[session.account?.id,session.selectedId,session.expiresAt],clearBusinessLists,{flush:'sync'})
function routeAction(){const key=typeof route.query.action==='string'?route.query.action:'';if(actions.value.some(item=>item.key===key))operationKey.value=key;if(isRoomCreation.value&&uuid(route.query.requestId)){draft.value.request_id=route.query.requestId;cleanDraft()}if(domain.value.key==='notices'&&key==='invitation'&&uuid(route.query.sourceListing)){const sub=draft.value.submission as BusinessData|undefined;if(sub)sub.source_listing_id=route.query.sourceListing;cleanDraft()}}
watch(()=>[route.fullPath,session.selectedId,session.revision],()=>{reset();routeAction();if(!loading.value)void load()})
watch(operationKey,()=>{creationVerifiedRequest.value='';creationProblem.value=null;clearReferenceFields('room-',['request_id','producer_party_id','rule_id']);referenceRequest++;refBusy.value=false;invitationContext.value=null;draft.value=initial(action.value?.fields||[]);agreed.value=false;prefill();cleanDraft()},{flush:'sync'})
watch(()=>filters.value.city,(next,previous)=>{if(cityField.value&&!syncingCity&&next!==previous)localCity.value=true},{flush:'sync'})
watch(directoryCity,()=>{if(!loading.value)void syncDefaultCity()})
async function syncDefaultCity(force=false){
 if(!cityField.value||!force&&(localCity.value||appliedDefaultCity.value===directoryCity.value))return
 if(ui.pending.value||dirty.value){ui.notice.value='目录默认城市已更新。当前未完成事项仍保留，处理后可选择“使用默认城市”。';return}
 syncingCity=true;filters.value.city=directoryCity.value;syncingCity=false
 localCity.value=false;appliedDefaultCity.value=directoryCity.value;cursor.value='';previousCursors.value=[];operationKey.value='';ui.data.value=null
 await load()
}
async function changeDefaultCity(value:string){
 if(value.trim()===directoryCity.value)return
 if(!allowDiscard('更改目录默认城市'))return
 try{
  if(cityField.value)encode([{...cityField.value,optional:true}],{city:value.trim()})
  setDirectoryCity(value)
  if(!localCity.value)operationKey.value=''
  await syncDefaultCity()
 }catch(e){showFormError(e,'filter')}
}
async function useDefaultCity(){if(!allowDiscard('恢复目录默认城市'))return;operationKey.value='';await syncDefaultCity(true)}

function clearReferenceFields(prefix:string|undefined,fields:string[]){
 const related=(key:string)=>fields.some(field=>prefix?key===prefix+field:key.endsWith('-'+field))
 refOptions.value=Object.fromEntries(Object.entries(refOptions.value).filter(([key])=>!related(key)))
 refCursor.value=Object.fromEntries(Object.entries(refCursor.value).filter(([key])=>!related(key)))
 referenceSources.value=Object.fromEntries(Object.entries(referenceSources.value).filter(([key])=>!related(key)))
}
function registerBoundReferences(prefix:string,record:BusinessData,captions:Record<string,string>,source='verified-context'){
 for(const [field,label]of Object.entries(captions)){
  const value=record[field];if(!uuid(value))continue
  const key=prefix+field,options=refOptions.value[key]||[]
  if(options.some(option=>option.value===value))continue
  refOptions.value={...refOptions.value,[key]:[...options,{value,label,record}]};refCursor.value[key]='';referenceSources.value[key]=source
 }
}
function clearCreationChoices(clearSelection=true){
 creationVerifiedRequest.value='';creationProblem.value=null;agreed.value=false
 clearReferenceFields('room-',['producer_party_id','rule_id'])
 if(clearSelection&&isRoomCreation.value){draft.value.producer_party_id='';draft.value.rule_id=''}
}
watch(()=>isRoomCreation.value?draftFingerprint(draft.value):'',()=>{if(isRoomCreation.value)agreed.value=false},{flush:'sync'})
watch(()=>isRoomCreation.value?draft.value.request_id:'',()=>{
 referenceRequest++;refBusy.value=false;clearCreationChoices()
},{flush:'sync'})
async function creationChoices(source:ReferenceSource,field:string,current:()=>boolean){
 const options:ReferenceOption[]=[],seen=new Set<string>(),ids=new Set<string>();let cursor:string|undefined,unavailable:string|null=null
 do{
  const result=await readReferences(source,{token:session.token!,accountId:session.account?.id||'',partyId:session.selectedId},cursor)
  if(!current())return null
  for(const option of referenceOptions(result.items,field)){
   if(ids.has(option.value))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'建房选项分页返回重复记录，请重新读取。',requestMethod:'GET'})
   ids.add(option.value);options.push(option)
  }
  unavailable=typeof result.data.unavailable_reason==='string'?result.data.unavailable_reason:unavailable
  cursor=typeof result.data.next_cursor==='string'?result.data.next_cursor:undefined
  if(cursor){if(seen.has(cursor))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'建房选项分页没有前进，请重新读取。',requestMethod:'GET'});seen.add(cursor)}
 }while(cursor)
 return{options,unavailable}
}
async function readCreationStories(){
 if(!isRoomCreation.value||locked.value||refBusy.value||!session.token)return
 const snapshot=session.capture(),ticket=++referenceRequest,current=()=>ticket===referenceRequest&&session.current(snapshot,true)&&isRoomCreation.value
 const source=sourceFor('request_id',{},'cocreation',session.selectedId)!
 refBusy.value=true;referenceNotice.value='';creationProblem.value=null
 let readContext=false
 try{
  const result=await creationChoices(source,'request_id',current);if(!result||!current())return
  refOptions.value={...refOptions.value,'room-request_id':result.options};referenceSources.value['room-request_id']=source.path;refCursor.value['room-request_id']=''
  if(uuid(draft.value.request_id)){
   if(result.options.some(o=>o.value===draft.value.request_id))readContext=true
   else{draft.value.request_id='';creationProblem.value=creationIssue('CLIENT_COCREATION_STORY_REQUIRED','')}
  }
  if(!result.options.length)creationProblem.value=creationIssue('CLIENT_COCREATION_STORY_REQUIRED',draft.value.request_id)
  referenceNotice.value=result.options.length?'已读取本人的已提交与受理中故事。选择故事后核对当前承制方和规则。':'当前没有本人已正式提交的故事，可以先完成私人故事。'
 }catch(e){if(current()){refOptions.value['room-request_id']=[];clearCreationChoices();creationProblem.value=creationIssue(asApiError(e).code,draft.value.request_id);referenceNotice.value=asApiError(e).message}}
 finally{if(ticket===referenceRequest)refBusy.value=false}
 if(readContext&&current())await readCreationContext()
}
async function readCreationContext(){
 if(!isRoomCreation.value||locked.value||refBusy.value||!session.token)return
 const requestId=draft.value.request_id
 if(!uuid(requestId)){creationProblem.value=creationIssue('CLIENT_COCREATION_STORY_REQUIRED',requestId);return}
 const snapshot=session.capture(),ticket=++referenceRequest,current=()=>ticket===referenceRequest&&session.current(snapshot,true)&&isRoomCreation.value&&draft.value.request_id===requestId
 const producer=sourceFor('producer_party_id',{request_id:requestId},'cocreation',session.selectedId)!,rule=sourceFor('rule_id',{request_id:requestId},'cocreation',session.selectedId)!
 clearCreationChoices(false);refBusy.value=true;referenceNotice.value='';ui.error.value=null
 try{
  const [producers,rules]=await Promise.all([creationChoices(producer,'producer_party_id',current),creationChoices(rule,'rule_id',current)])
  if(!current()||!producers||!rules)return
  refOptions.value={...refOptions.value,'room-producer_party_id':producers.options,'room-rule_id':rules.options}
  referenceSources.value={...referenceSources.value,'room-producer_party_id':producer.path,'room-rule_id':rule.path}
  refCursor.value['room-producer_party_id']=refCursor.value['room-rule_id']=''
  if(!producers.options.some(o=>o.value===draft.value.producer_party_id))draft.value.producer_party_id=''
  if(!rules.options.some(o=>o.value===draft.value.rule_id))draft.value.rule_id=''
  creationVerifiedRequest.value=requestId
  const reason=producers.unavailable||(!producers.options.length?'CLIENT_COCREATION_PRODUCER_UNAVAILABLE':!rules.options.length?'CLIENT_COCREATION_RULE_UNAVAILABLE':'')
  creationProblem.value=reason?creationIssue(reason,requestId):null
  referenceNotice.value=reason?'':'本故事当前可建房，承制方与参加规则已读取。请明确选择并核对参加约定，提交时服务器会再次复核。'
 }catch(e){if(current()){
  const error=asApiError(e);clearCreationChoices()
  if([401,403,404].includes(error.status)&&error.code!=='CUSTOMIZATION_MERCHANT_FORBIDDEN'){clearReferenceFields('room-',['request_id']);chosenReferences.value=[];draft.value.request_id=''}
  creationProblem.value=creationIssue(error.code,requestId);referenceNotice.value=''
 }}
 finally{if(ticket===referenceRequest)refBusy.value=false}
}
function clearInvitationBinding(){
 invitationContext.value=null;const fields=['target_party_id','person_id','avatar_id','consent_id'],sub=draft.value.submission as BusinessData|undefined
 if(sub)for(const key of fields)sub[key]=''
 clearReferenceFields('invitation-submission-',fields)
}
watch(()=>{const sub=draft.value.submission as BusinessData|undefined;return JSON.stringify([sub?.person_id,sub?.notice_id])},()=>{if(action.value?.key!=='submission')return;clearReferenceFields('submission-submission-',['avatar_id','consent_id','target_party_id']);const sub=draft.value.submission as BusinessData|undefined;const ruleSource=referenceSources.value['submission-rule_id'];if(ruleSource?.startsWith('notice:')&&ruleSource!=='notice:'+sub?.notice_id){clearReferenceFields('submission-',['rule_id']);draft.value.rule_id=''}if(sub){sub.avatar_id='';sub.consent_id='';sub.target_party_id='';agreed.value=false}},{flush:'sync'})
function invitationSource(){const sub=draft.value.submission as BusinessData|undefined;return JSON.stringify([draft.value.rule_id,sub?.source_listing_id])}
watch(invitationSource,()=>{if(action.value?.key!=='invitation')return;referenceRequest++;refBusy.value=false;clearInvitationBinding();agreed.value=false},{flush:'sync'})
async function readInvitationContext(){
 if(locked.value||refBusy.value||action.value?.key!=='invitation')return
 const sub=draft.value.submission as BusinessData,rule=draft.value.rule_id,listing=sub.source_listing_id
 if(!uuid(rule)||!uuid(listing)){referenceNotice.value='先选择生效邀约规则与当前公开艺人。';return}
 const snapshot=session.capture(),source=invitationSource(),ticket=++referenceRequest;clearInvitationBinding();refBusy.value=true;ui.error.value=null
 try{const result=await readBusiness(`/notices/invitation-context?${new URLSearchParams({rule_id:rule,listing_id:listing})}`,{token:session.token,accountId:session.account?.id||'',actingParty:session.selectedId});if(ticket!==referenceRequest||!session.current(snapshot,true)||source!==invitationSource()||action.value?.key!=='invitation')return;const context=result.data;if(context.rule_id!==rule||context.listing_id!==listing||!['person_id','avatar_id','consent_id','target_party_id'].every(key=>uuid(context[key])))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'无法确认本次艺人邀约资格，请重新读取。',requestMethod:'GET'});invitationContext.value=context;const currentSub=draft.value.submission as BusinessData;Object.assign(currentSub,{person_id:context.person_id,avatar_id:context.avatar_id,consent_id:context.consent_id,target_party_id:context.target_party_id});registerBoundReferences('invitation-submission-',context,{person_id:String(context.display_name||'本艺人')+' · 本次邀约真人',avatar_id:'本次公开展示对应的数字人',consent_id:'本次已核对的公开展示授权',target_party_id:'本次邀约的艺人接收方'});registerBoundReferences('invitation-submission-',{...context,source_listing_id:context.listing_id},{source_listing_id:String(context.display_name||'当前公开艺人')+' · 本次公开来源'});referenceNotice.value=`已核对${String(context.display_name||'本艺人')}的当前邀约来源；提交时会再次核验。`}
 catch(e){if(ticket===referenceRequest&&session.current(snapshot,true)&&source===invitationSource()){ui.error.value=asApiError(e);clearInvitationBinding()}}finally{if(ticket===referenceRequest)refBusy.value=false}
}
function prefill(){if(!details.value||!action.value||isRoomCreation.value)return;const wasDirty=dirty.value;if(domain.value.key==='stock'&&action.value.key==='revision'){const d=rowData(details.value);draft.value={...draft.value,...structuredClone(d),rights_evidence_ids:Array.isArray(d.rights_evidence_ids)?d.rights_evidence_ids.join(', '):''};}const r=details.value,d=rowData(r),source={...d,...r};const id=currentId.value;const values:Record<string,unknown>={listing_id:domain.value.key==='stock'&&section.value.key==='catalog'?id:source.listing_id,offer_id:domain.value.key==='auditions'&&section.value.key==='catalog'?id:source.offer_id,booking_id:domain.value.key==='auditions'&&r.kind==='BOOKING'?id:source.booking_id,pool_id:section.value.key==='pools'?id:source.pool_id,stock_id:section.value.key==='catalog'&&domain.value.key==='redemption'?id:source.stock_id,content_sha256:r.content_sha256,proposal_sha256:source.proposal_sha256,result_sha256:source.result_sha256,source_sha256:(source.files as BusinessData|undefined)?.full_sha256,offer_sha256:source.offer_sha256||r.content_sha256,booking_sha256:r.content_sha256,rules_sha256:source.rules_sha256,template_sha256:source.template_sha256||r.content_sha256,rule_id:source.rule_id||(section.value.key==='rules'?id:undefined),rule_sha256:r.content_sha256,agreement_id:r.kind==='PARTICIPATION'?id:source.agreement_id,agreement_sha256:r.content_sha256,supplement_id:r.kind==='SUPPLEMENT'?id:source.supplement_id,supplement_sha256:r.content_sha256,event_id:domain.value.key==='engagement'&&section.value.key==='competitions'?id:source.event_id,case_id:source.current_case_id,participation_sha256:source.participation_sha256};if(domain.value.key==='stock'&&action.value.key==='listing'||domain.value.key==='auditions'&&action.value.key==='offer')values.rule_id=undefined;const fill=(fields:Field[],target:Record<string,unknown>)=>{for(const f of fields){if(target[f.key]===''&&values[f.key]!==undefined)target[f.key]=values[f.key];if(f.type==='group'&&target[f.key]&&typeof target[f.key]==='object')fill(f.fields||[],target[f.key] as Record<string,unknown>)}};fill(action.value.fields,draft.value);if(domain.value.key==='notices'&&action.value.key==='submission'&&r.owner_party_id){const v=draft.value.submission as BusinessData;v.notice_id=id;v.target_party_id=r.owner_party_id}if(!wasDirty)cleanDraft()}
async function loadChoices(input:{field:Field;context:Record<string,unknown>;key:string}){if(refBusy.value||locked.value||!session.token)return;if(isRoomCreation.value&&['request_id','producer_party_id','rule_id'].includes(input.field.key)){if(input.field.key==='request_id')await readCreationStories();else await readCreationContext();return}const ctx={...reference.value,...draft.value,...input.context,stock_publication:domain.value.key==='stock'&&action.value?.key==='publish-sales'};const embedded:ReferenceOption[]=[];const own=session.parties.filter(p=>p.membership.current_status==='ACTIVE');if(/party_id$/.test(input.field.key))embedded.push(...own.map(p=>({value:p.party.id,label:p.party.display_name,record:p.party as unknown as BusinessData})));if(input.field.key==='target_id'&&['PROFILE_CORRECTION','ACCOUNT_CLOSURE'].includes(String(draft.value.action))&&session.account)embedded.push({value:session.account.id,label:session.account.display_name+' · 本人账号',record:session.account as unknown as BusinessData});const known=[...chosenReferences.value,...rows.value,...details.value?[details.value]:[],...uploaded.value?[uploaded.value]:[]];for(const r of known){const d=rowData(r);if(/party_id$/.test(input.field.key)){const collect=(value:unknown,depth=0)=>{if(depth>8||!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(v=>collect(v,depth+1));return}const o=value as BusinessData;for(const [key,v]of Object.entries(o)){if(/(?:^party_id|_party_id)$/.test(key)&&uuid(v))embedded.push({value:v,label:String(o.display_name||o.name||title(r))+' · '+(labels[key]||'本原记录关联主体'),record:r});else if(v&&typeof v==='object')collect(v,depth+1)}};collect(r)}if(input.field.key==='project_id'&&Array.isArray(r.projects))for(const p of r.projects as BusinessData[])if(uuid(p.id))embedded.push({value:p.id,label:'本原委托的实际制作项目',record:p});if(input.field.key==='candidate_id'&&Array.isArray(r.candidates))for(const [i,candidate]of (r.candidates as BusinessData[]).entries())if(uuid(candidate.id))embedded.push({value:candidate.id,label:'本期已审候选人 '+(i+1),record:candidate});if(input.field.key==='member_id'&&Array.isArray(r.members))for(const [i,member]of(r.members as BusinessData[]).entries())if(uuid(member.member_id))embedded.push({value:member.member_id,label:'本房间实际参与人 '+(i+1),record:member});const direct=r[input.field.key]??d[input.field.key];if(Array.isArray(direct))for(const value of direct)if(uuid(value))embedded.push({value,label:input.field.label+' · 原获准资料',record:r});if(uuid(direct))embedded.push({value:direct,label:fieldLabels.value[input.field.key]||input.field.label,record:r});if(input.field.key==='message_id'&&String(r.kind).includes('MESSAGE')&&uuid(recordId(r)))embedded.push({value:recordId(r),label:'本单消息 · '+String(d.body||d.kind||'已发送内容').slice(0,40),record:r});if((input.field.key==='record_id'||input.field.key==='execution_id'||input.field.key==='request_id'&&domain.value.key==='privacy')&&uuid(recordId(r)))embedded.push({value:recordId(r),label:title(r),record:r});if(uploaded.value===r&&/(?:file_id|evidence_asset_ids?|material_asset_ids|source_id|asset_id|photos|videos)$/.test(input.field.key)&&uuid(recordId(r)))embedded.push({value:recordId(r),label:'本次刚上传的私有材料',record:r})}const authorityOnly=domain.value.key==='notices'&&input.field.key==='consent_id'||domain.value.key==='stock'&&['spec_id','rule_id','avatar_id','consent_id'].includes(input.field.key)||domain.value.key==='auditions'&&['rule_id','avatar_id','public_consent_id'].includes(input.field.key);if(authorityOnly)embedded.length=0;const source=sourceFor(input.field.key,ctx,domain.value.key,session.selectedId),snapshot=session.capture();const sourceKey=source?.path||'';if(referenceSources.value[input.key]!==sourceKey){refOptions.value={...refOptions.value,[input.key]:[]};if(referenceSources.value[input.key]!==sourceKey)refCursor.value[input.key]='';referenceSources.value[input.key]=sourceKey}if(authorityOnly)embedded.length=0;if(embedded.length)refOptions.value={...refOptions.value,[input.key]:[...new Map(embedded.map(x=>[x.value,x])).values()]};if(!source){if(embedded.length){referenceNotice.value='已列出当前原记录中的实际关联资料。';return}referenceNotice.value='当前接口未提供此项可公开选择的引用，请从本人的原记录办理，或由运营核对原交接资料。';return}if(authorityOnly){refOptions.value[input.key]=[];refCursor.value[input.key]=''}const ticket=++referenceRequest;refBusy.value=true;referenceNotice.value='';try{const r=await readReferences(source,{token:session.token,accountId:session.account?.id||'',partyId:session.selectedId},refCursor.value[input.key]);if(ticket!==referenceRequest||!session.current(snapshot,true)||referenceSources.value[input.key]!==sourceKey)return;const options=referenceOptions(r.items,input.field.key);if(['stock','auditions'].includes(domain.value.key)){let more=typeof r.data.next_cursor==='string'?r.data.next_cursor:'';const seen=new Set<string>();while(more){if(seen.has(more))throw new Error('重复分页');seen.add(more);const next=await readReferences(source,{token:session.token,accountId:session.account?.id||'',partyId:session.selectedId},more);if(ticket!==referenceRequest||!session.current(snapshot,true)||referenceSources.value[input.key]!==sourceKey)return;options.push(...referenceOptions(next.items,input.field.key));more=typeof next.data.next_cursor==='string'?next.data.next_cursor:''}r.data.next_cursor=null}refOptions.value={...refOptions.value,[input.key]:[...new Map([...(refOptions.value[input.key]||[]),...options].map(x=>[x.value,x])).values()]};refCursor.value[input.key]=typeof r.data.next_cursor==='string'?r.data.next_cursor:'';referenceNotice.value=options.length?'已读取当前身份获准选择的实际资料。':'当前没有获准选择的记录。'}catch(e){if(ticket===referenceRequest&&session.current(snapshot,true)&&referenceSources.value[input.key]===sourceKey)referenceNotice.value=asApiError(e).message}finally{if(ticket===referenceRequest)refBusy.value=false}}
function selectedReference({field,record,key}:{field:Field;record:BusinessData;key?:string}){
 chosenReferences.value=[...chosenReferences.value.filter(item=>recordId(item)!==recordId(record)),record]
 if(isRoomCreation.value&&['request_id','producer_party_id','rule_id'].includes(field.key)){agreed.value=false;if(field.key==='request_id')void readCreationContext();return}
 const data=rowData(record),source={...data,...record}
 for(const [name,target]of Object.entries({rule_id:'rule_sha256',offer_id:'offer_sha256',listing_id:'offer_sha256',booking_id:'booking_sha256',stock_id:'template_sha256',pool_id:'rules_sha256',agreement_id:'agreement_sha256'})){
  if(field.key===name){const value=source[target]||source.content_sha256;if(typeof value==='string')draft.value={...draft.value,[target]:value}}
 }
 if(field.key==='person_id'||field.key==='seller_person_id')clearReferenceFields(key?.slice(0,-field.key.length),['avatar_id','consent_id','public_consent_id','artist_consent_ids','look_version_id','voice_version_id','previous_version_id'])
 if(domain.value.key==='stock'&&field.key==='spec_id'){clearReferenceFields(undefined,['rule_id']);draft.value={...draft.value,rule_id:'',...(action.value?.key==='publish-sales'&&uuid(source.seller_party_id)?{seller_party_id:source.seller_party_id}:{})}}
 if(domain.value.key==='auditions'&&field.key==='person_id'){clearReferenceFields(undefined,['rule_id']);draft.value.rule_id=''}
 if(domain.value.key==='notices'&&field.key==='consent_id'){
  const sub=draft.value.submission as BusinessData|undefined
  if(sub&&sub.person_id===record.person_id){
   if(uuid(record.notice_id)&&sub.notice_id===record.notice_id){
    draft.value={...draft.value,rule_id:record.rule_id,submission:{...sub,avatar_id:record.avatar_id,target_party_id:record.target_party_id,consent_id:record.consent_id}}
    registerBoundReferences('submission-submission-',record,{avatar_id:'本次获准投稿的数字人',target_party_id:'本通告接收方（本次授权已核对）'})
    registerBoundReferences('submission-',record,{rule_id:'本通告生效投稿规则（来自本次授权）'},'notice:'+record.notice_id)
   }else if(!uuid(sub.notice_id)&&!uuid(record.notice_id)&&uuid(record.avatar_id)&&uuid(data.grantee_party_id)){
    draft.value={...draft.value,submission:{...sub,avatar_id:record.avatar_id,target_party_id:data.grantee_party_id,consent_id:recordId(record)}}
    registerBoundReferences('submission-submission-',{...record,target_party_id:data.grantee_party_id},{avatar_id:'本次已审合作投稿授权关联的数字人',target_party_id:'本次已审合作投稿授权的接收方'})
   }
  }
 }
 if(['listing_id','offer_id','pool_id','stock_id'].includes(field.key)){selected.value=record;bindReferences(record)}
}
function readPath(){const s=section.value,values={...reference.value};if(uuid(route.params.recordId))return pathFor(s.detail||s.path,{...values,record_id:route.params.recordId,request_id:route.params.recordId});let path=pathFor(s.path,values);const query=new URLSearchParams(s.fixedQuery);for(const f of s.query||[]){if(filters.value[f.key]===undefined||filters.value[f.key]===null||filters.value[f.key]==='')continue;const v=encode([{...f,optional:true}],filters.value)[f.key];if(v!==undefined)query.set(f.key,String(v))}if(cursor.value&&(!s.query||!s.query.some(f=>f.key==='cursor')))query.set('cursor',cursor.value);return path+(query.size?'?'+query:'')}
async function load(){const request=++listRequest;lastReadCity.value=String(filters.value.city||'');rememberList();const snapshot=session.capture(),scopePath=route.fullPath,current=()=>request===listRequest&&session.current(snapshot,true)&&route.fullPath===scopePath;agreed.value=false;selected.value=null;clearFile();try{if(!uuid(route.params.recordId)&&section.value.query?.some(f=>!f.optional&&(filters.value[f.key]===undefined||filters.value[f.key]===null||filters.value[f.key]==='')))return null;if(routeIds(section.value.path).some(k=>!uuid(reference.value[k]))&&!uuid(route.params.recordId))return null;let r=await ui.load(readPath(),section.value.party);if(!current()){if(r&&ui.data.value===r)ui.data.value=null;return null}if(r&&domain.value.key==='conversations'&&section.value.key==='contacts'){
 const contacts=r,order=String(reference.value.order_id||'');const thread=await ui.load(`/gigs/orders/${order}/conversation/messages`,section.value.party);if(!current()||!thread)return null;
 if(thread.order_id!==order||versionOf(thread)===null){ui.clear();ui.error.value=new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'无法确认本联系卡对应的当前会话版本，请刷新核对。'});return null}
 if(thread.status!=='OPEN'){ui.clear();ui.error.value=new ApiError({status:409,code:'COMMERCIAL_CONVERSATION_'+String(thread.status),message:'会话状态已变化，联系卡暂不可查看，请刷新当前记录。'});return null}
 r={...contacts,object_version:thread.object_version,status:thread.status};ui.data.value=r
 }if(r&&uuid(route.params.recordId)){selected.value=r;bindReferences(r);prefill()}if(r&&isRoomCreation.value&&uuid(route.query.requestId)&&!creationVerifiedRequest.value)await readCreationStories();return r}catch(e){if(current())showFormError(e,'filter');return null}}
async function choose(r:BusinessData){if(domain.value.key==='cocreation'&&section.value.key==='invitations'&&uuid(rowData(r).room_id)){await router.push(`/cocreation/rooms/${rowData(r).room_id}`);return}const id=recordId(r);if(section.value.detail&&uuid(id)){rememberList();await router.push(`/${domain.value.key}/${section.value.key}/${id}`);return}if(!allowDiscard('查看另一条记录'))return;operationKey.value='';rememberList();if(!uuid(id)){selected.value=r;prefill();return}if(section.value.key==='messages'&&String(r.kind).includes('MESSAGE'))return;if(section.value.detail){await router.push(`/${domain.value.key}/${section.value.key}/${id}`);return}selected.value=r;bindReferences(r);prefill()}
async function readReference(){if(!allowDiscard('读取另一条记录'))return;operationKey.value='';if(!uuid(reference.value.record_id)&&!uuid(reference.value.request_id))return;const id=String(reference.value.record_id||reference.value.request_id);if(section.value.detail){const r=await ui.load(pathFor(section.value.detail,{...reference.value,record_id:id,request_id:id}),section.value.party);if(r){selected.value=r;bindReferences(r);prefill()}}}
function roomCreationCommand(command:{path:string;method:string}|null|undefined){return command?.path==='/cocreation/rooms'&&command.method==='POST'}
async function finishCreatedRoom(record:BusinessData){
 selected.value=record;agreed.value=false;cleanDraft();operationKey.value=''
 await router.push(`/cocreation/rooms/${record.id}`)
}
function failedRoomCreation(body:Record<string,unknown>,originalDraft?:Record<string,unknown>){
 const error=ui.error.value;if(!error||ui.pending.value)return
 // A changed configured producer is a selection failure, not a new identity.
 // The common privacy guard has cleared all old server references already.
 if(error.code==='CUSTOMIZATION_MERCHANT_FORBIDDEN'&&!isRoomCreation.value){
  const deadline=new Date(String(body.deadline)),restored=originalDraft||{...body,...Number.isFinite(deadline.getTime())?{deadline:new Date(deadline.getTime()-deadline.getTimezoneOffset()*60000).toISOString().slice(0,-1)}:{}}
  operationKey.value='room';draft.value={...initial(action.value?.fields||[]),...restored}
 }
 clearCreationChoices();creationProblem.value=creationIssue(error.code,body.request_id)
}
async function submit(){
 if(!action.value||locked.value||!agreed.value||actionUnavailable.value||prerequisite.value)return
 fieldErrors.value={};errorField.value=''
 const a=action.value,creating=isRoomCreation.value,snapshot=session.capture()
 try{
  if(a.key==='invitation'&&!invitationContext.value)throw new ApiError({status:400,code:'CLIENT_INVITATION_CONTEXT_REQUIRED',message:'请先读取并核对本次艺人的当前邀约资格。'})
  if(creating&&!creationReady.value){creationProblem.value=creationIssue('CLIENT_COCREATION_CONTEXT_REQUIRED',draft.value.request_id);return}
  const targetKey=a.path.includes(':execution_id')?'execution_id':a.path.includes(':request_id')?'request_id':a.path.includes(':record_id')?'record_id':'order_id'
  if(a.match&&(!details.value||currentVersion.value===null||currentId.value!==String(reference.value[targetKey])))throw new ApiError({status:400,code:'CURRENT_RECORD_REQUIRED',message:'请先读取本次办理的原记录，核对最新状态与版本。'})
  if(domain.value.key==='stock'&&a.key==='receipt'&&(!filePlayed.value||!notifyRead.value||fileSource.value!==currentId.value))throw new ApiError({status:400,code:'ACTUAL_VIEW_REQUIRED',message:'先实际打开本片、读取本次通知，再明确确认取得文件。'})
  const originalDraft=JSON.parse(JSON.stringify(draft.value)) as Record<string,unknown>,body=encode(actionFields.value,draft.value)
  if(creating&&Date.parse(String(body.deadline))<=Date.now())throw new BusinessFormError({key:'deadline',label:'报名截止时间',hint:'请选择未来时间。'},['deadline'])
  const canReadOrigin=uuid(route.params.recordId)||routeIds(section.value.path).every(k=>uuid(reference.value[k]))
  const r=await ui.execute({path:pathFor(a.path,reference.value),body,party:a.party,method:a.method||'POST',version:a.match?currentVersion.value!:undefined,label:a.label,readPath:creating?'/cocreation/rooms':canReadOrigin?readPath():undefined,readParty:creating?'required':section.value.party},creating?(record,command)=>validateCreatedRoom(record,command.body):undefined)
  if(!session.current(snapshot,true))return
  if(r){
   if(creating){await finishCreatedRoom(r);return}
   selected.value=r;agreed.value=false;cleanDraft();const id=recordId(r);if(uuid(id))bindReferences(r);prefill()
  }else if(creating)failedRoomCreation(body,originalDraft)
  else if(ui.error.value?.status===412){const r=await ui.load(readPath(),section.value.party);if(r)selected.value=r}
 }catch(e){showFormError(e,a.key)}
}
async function recover(){
 const original=ui.pending.value,creating=roomCreationCommand(original),snapshot=session.capture()
 const r=await ui.execute(undefined,creating?(record,command)=>validateCreatedRoom(record,command.body):undefined)
 if(!session.current(snapshot,true))return
 if(r){if(creating){await finishCreatedRoom(r);return}selected.value=r;bindReferences(r);agreed.value=false;prefill();cleanDraft()}
 else if(creating)failedRoomCreation((original?.body||{}) as Record<string,unknown>)
}
async function checkPending(){try{const p=readPath();const r=await ui.check(p,section.value.party);if(r)selected.value=r}catch(e){ui.error.value=asApiError(e)}}
async function openFile(f:FileAction){try{clearFile();const id=currentId.value||reference.value.record_id;const r=await ui.file(pathFor(f.path,{...reference.value,record_id:id,request_id:id,asset_id:assetId.value,message_id:assetId.value}),f.party,f.type||'application/octet-stream');if(!r)return;fileSource.value=String(id);fileUrl.value=r.url;fileType.value=f.type||'application/octet-stream';if(fileType.value==='application/octet-stream'){const head=new Uint8Array(await r.blob.slice(0,32).arrayBuffer());if(new TextDecoder().decode(head.slice(4,8))==='ftyp')fileType.value='video/mp4';else if(head[0]===137&&head[1]===80)fileType.value='image/png';else if(head[0]===255&&head[1]===216)fileType.value='image/jpeg'}if(fileType.value==='text/plain'){fileText.value=await r.blob.text();filePlayed.value=true}if(f.observe){const original=selected.value;await load();selected.value=ui.data.value||original;fileUrl.value=ui.objectUrl(r.blob);fileType.value=f.type||'application/octet-stream';fileSource.value=String(id)}}catch(e){ui.error.value=asApiError(e)}}
async function readNotification(){const n=details.value&&rowData(details.value).notification_event_id;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1||!filePlayed.value)return;const r=await ui.execute({path:`/operations/notifications/${n}/read`,body:{},method:'POST',party:'required',label:'读取本次交付通知',readPath:readPath(),readParty:section.value.party});if(r){const fresh=await ui.load(readPath(),section.value.party,true);if(fresh){selected.value=fresh;notifyRead.value=true}}}
async function upload(){if(!uploadFile.value||locked.value)return;const stockVideo=domain.value.key==='stock'&&uploadPurpose.value==='STOCK_VIDEO',productionFile=uploadPurpose.value==='PRODUCTION_FILE'&&domain.value.key==='cocreation'&&uuid(reference.value.project_id);if(uploadPurpose.value==='PRODUCTION_FILE'&&!productionFile)return;if(stockVideo&&(uploadFile.value.type!=='video/mp4'||uploadFile.value.size>50*1024*1024)){ui.error.value=new ApiError({status:400,code:'INVALID_STOCK_FILE',message:'现货视频须为MP4，且不超过50MiB。'});return}if(productionFile&&(uploadFile.value.type!=='video/mp4'||uploadFile.value.size>50*1024*1024)){ui.error.value=new ApiError({status:400,code:'INVALID_SNIPPET_FILE',message:'本人片段须为MP4，且不超过50MiB。'});return}if(!stockVideo&&!productionFile&&uploadFile.value.size>8*1024*1024){ui.error.value=new ApiError({status:400,code:'ASSET_TOO_LARGE',message:'私有依据当前上限为8MiB。'});return}const type=uploadFile.value.type||'application/octet-stream';const r=await ui.execute({path:productionFile?`/production/projects/${reference.value.project_id}/files?${new URLSearchParams({media_type:type})}`:stockVideo?'/stock/files':`/supply/assets?${new URLSearchParams({purpose:uploadPurpose.value,media_type:type})}`,rawBody:uploadFile.value,method:'POST',party:'required',label:'上传私有材料'});if(r)uploaded.value=r}
function allowDiscard(destination:string){
 if(ui.pending.value){ui.notice.value='原请求正在办理或结果待核对，请先在本页完成核对。';return false}
 if(dirty.value&&typeof window!=='undefined'&&!window.confirm(`当前“${action.value?.label||'办理事项'}”有未提交内容。${destination}可能改变当前办理内容，是否继续？`))return false
 return true
}
function chooseAction(key:string){const operation=actions.value.find(o=>o.key===key);if(!operation||availability(operation).blocked||key===operationKey.value||!allowDiscard('切换办理事项'))return;operationKey.value=key}
async function refresh(){if(!allowDiscard('刷新记录'))return;await load()}
async function applyFilters(){if(!allowDiscard('重新筛选列表'))return;try{encode(section.value.query||[],filters.value);cursor.value='';previousCursors.value=[];operationKey.value='';await load()}catch(e){showFormError(e,'filter')}}
async function page(direction:'next'|'previous'){
 if(!allowDiscard('切换列表页'))return
 if(cityField.value&&lastReadCity.value!==String(filters.value.city||'')){await applyFilters();return}
 const old=cursor.value,history=[...previousCursors.value]
 if(direction==='next'){const next=ui.data.value?.next_cursor;if(typeof next!=='string'||!next||next===cursor.value)return;previousCursors.value.push(cursor.value);cursor.value=next}
 else{if(!previousCursors.value.length)return;cursor.value=previousCursors.value.pop()!}
 operationKey.value='';const request=listRequest+1,result=await load();if(request!==listRequest)return;if(!result){cursor.value=old;previousCursors.value=history}rememberList()
}
async function changeParty(event:Event){const input=event.target as HTMLSelectElement;if(!allowDiscard('切换办理身份')){input.value=session.selectedId;return}clearBusinessLists();session.selectParty(input.value)}
async function logout(){if(!allowDiscard('退出登录'))return;clearBusinessLists();await session.logout();await router.push('/login')}
async function focusError(){await nextTick();if(typeof document==='undefined')return;const node=document.getElementById(errorField.value)||document.getElementById(errorField.value+'-field');node?.scrollIntoView({block:'center',behavior:'smooth'});node?.focus()}
function showFormError(error:unknown,prefix:string){ui.error.value=asApiError(error);if(error instanceof BusinessFormError){errorField.value=[prefix,...error.fieldPath].join('-');fieldErrors.value={[errorField.value]:error.message};void focusError()}}
function leave(){if(!allowDiscard('离开本页'))return false;rememberList();return true}onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave)
function unload(e:BeforeUnloadEvent){if(ui.pending.value||dirty.value){e.preventDefault();e.returnValue=''}}
onMounted(async()=>{window.addEventListener('beforeunload',unload);timer.value=window.setInterval(()=>now.value=Date.now(),1000);try{await Promise.all([session.loadAccount(),session.loadParties()])}catch(e){ui.error.value=asApiError(e)}finally{loading.value=false;reset();routeAction();await load()}})
onUnmounted(()=>{window.removeEventListener('beforeunload',unload);window.clearInterval(timer.value)})
</script>
<template><div class="supply-workspace editorial-workspace business-workspace" :data-gallery="`WEB-V5-${domain.key}`"><header class="supply-header"><RouterLink to="/workspace" class="supply-brand">晶晶日上</RouterLink><span>先锋电影刊物 · {{domain.title}}</span><div class="account-actions"><span class="account-name">{{session.account?.display_name||'当前账号'}}</span><button @click="logout">退出</button></div></header><div class="supply-layout"><aside class="supply-sidebar"><WorkspaceNav/><div class="supply-identity"><label for="business-party">当前办理身份</label><select id="business-party" :value="session.selectedId" :disabled="locked" @change="changeParty"><option v-for="p in session.parties" :key="p.party.id" :value="p.party.id">{{p.party.display_name}}</option></select><p v-if="section.party==='none'">本栏按当前账号权限读取；独立审核以岗位与回避关系核对。</p><button v-if="session.nextCursor" class="outline" :disabled="locked" @click="session.loadMoreParties">更多办理身份</button></div></aside><main class="supply-main"><div class="supply-heading"><div><p class="eyebrow">{{domain.journal}}</p><h1>{{domain.title}}</h1><p>{{domain.intro}}</p></div><button class="outline" :disabled="locked" @click="refresh">刷新当前记录</button></div><nav class="loaded-tabs" aria-label="本业务办理事项"><RouterLink v-for="s in domain.sections" :key="s.key" :to="`/${domain.key}/${s.key}`" :class="{active:section.key===s.key}">{{s.label}}</RouterLink></nav>
<DirectoryCityControl v-if="cityField" :city="directoryCity" :disabled="locked" @change="changeDefaultCity"/><p v-if="cityField" class="business-muted" role="status">{{localCity?'当前城市仅用于本页，默认城市变化不会覆盖。':'本页城市跟随目录默认城市，手动修改将仅用于本页。'}} <button v-if="localCity||appliedDefaultCity!==directoryCity" class="outline" :disabled="locked" @click="useDefaultCity">使用默认城市{{directoryCity?'：'+directoryCity:'（全部）'}}</button></p>
<ApiErrorAlert :error="ui.error.value"/><button v-if="errorField" type="button" class="outline" @click="focusError">定位需要修改的字段</button><p v-if="referenceNotice" class="supply-notice" role="status">{{referenceNotice}}</p><p v-if="ui.notice.value" class="supply-notice" role="status">{{ui.notice.value}}</p><section v-if="ui.pending.value" class="supply-warning"><h2>原请求结果待核对</h2><p>{{ui.pending.value.label}}：保留原内容和原版本，先核对同一记录。</p><button :disabled="ui.busy.value" class="outline" @click="checkPending">核对原记录</button><button :disabled="ui.busy.value||!ui.pending.value.checked" class="primary" @click="recover">恢复同一次请求</button></section><label v-if="ui.conflict.value" class="supply-warning trade-check"><input v-model="ui.confirmed.value" type="checkbox">已刷新并核对最新记录，保留输入重新确认本次办理。</label>
<p v-if="domain.note" class="business-intro">{{domain.note}}</p><p v-if="section.note" class="supply-warning">{{section.note}}</p><section v-if="!route.params.recordId&&section.query?.length||referenceFields.length" class="supply-card business-lookup"><h2>{{section.label}}</h2><form class="business-form" @submit.prevent="applyFilters"><BusinessFields v-if="section.query?.length&&!route.params.recordId" v-model="filters" :fields="section.query" :disabled="locked" prefix="filter" :errors="fieldErrors"/><BusinessFields v-if="referenceFields.length" v-model="reference" :fields="referenceFields" :disabled="locked" prefix="reference" :references="refOptions" :reference-busy="refBusy" @read-reference="loadChoices" @reference-selected="selectedReference"/><div class="supply-actions"><button class="outline" :disabled="locked" type="submit">读取当前列表</button><button v-if="section.detail&&!route.params.recordId" class="outline" :disabled="locked" type="button" @click="readReference">读取原记录</button></div></form></section>
<p v-if="loading||ui.busy.value" class="supply-empty" role="status">正在读取或核对当前获准内容……</p><section v-if="rows.length" class="supply-card"><div class="section-heading"><h2>{{section.label}}</h2><span class="business-muted">本页 {{rows.length}} 项</span></div><div class="business-records"><article v-for="(r,i) in rows" :key="recordId(r)||i"><div><p class="eyebrow">{{String(i+1).padStart(2,'0')}}</p><h3>{{title(r)}}</h3><p v-if="typeof rowData(r).body==='string'" class="long-text">{{rowData(r).body}}</p><p v-if="r.current_status||r.effective_status||r.order_status||rowData(r).status"><StateValue :code="String(r.current_status||r.effective_status||r.order_status||rowData(r).status||'')" :label="display(r.current_status||r.effective_status||r.order_status||rowData(r).status||'')"/></p><p class="identifier">{{recordId(r)}}</p></div><button v-if="!String(r.kind).includes('MESSAGE')" class="outline" :disabled="locked" @click="choose(r)">查看与办理</button></article></div></section><p v-else-if="hasList&&!ui.busy.value" class="supply-empty">当前没有获准展示的记录。</p>
<nav v-if="hasList&&(previousCursors.length||ui.data.value?.next_cursor)" class="business-pagination" aria-label="业务列表分页"><button class="outline" :disabled="locked||!previousCursors.length" @click="page('previous')">上一页</button><span>第 {{previousCursors.length+1}} 页</span><button class="outline" :disabled="locked||!ui.data.value?.next_cursor" @click="page('next')">下一页</button></nav><RouterLink v-if="route.params.recordId" :to="`/${domain.key}/${section.key}`" class="button-link outline">返回{{section.label}}列表</RouterLink>
<section v-if="details" class="supply-card business-current"><div class="section-heading"><h2>{{title(details)}}</h2><span v-if="currentVersion!==null" class="supply-badge">已读取版本 {{currentVersion}}</span></div><p v-if="details.current_status||details.effective_status||details.order_status||rowData(details).status" class="supply-badge"><StateValue :code="String(details.current_status||details.effective_status||details.order_status||rowData(details).status||'')" :label="display(details.current_status||details.effective_status||details.order_status||rowData(details).status||'')"/></p><BusinessOverview :record="details" :domain="domain.key"/><p v-if="domain.key==='stock'&&details.current_status==='REJECTED'" class="supply-warning">本版本已退回，请在下方原约定中核对两项审核的具体原因。可从下方“修改材料并重新提交”补正后重提；新版本仍须独立审核，原版本结论保留。</p><details class="business-source"><summary>核对原约定、权利与办理记录</summary><BusinessDetails :value="details" :field-labels="fieldLabels"/></details><div class="supply-actions"><RouterLink v-if="uuid(details.order_id)||details.kind==='ORDER'&&uuid(details.id)" :to="`/trade/orders/${details.order_id||details.id}`" class="button-link outline">原订单与合同</RouterLink><RouterLink v-if="uuid(details.order_id)||details.kind==='ORDER'&&uuid(details.id)" :to="`/trade/payments/new?orderId=${details.order_id||details.id}`" class="button-link outline">按原订单办理付款</RouterLink><RouterLink v-if="domain.key==='participation'&&uuid(reference.project_id)" :to="`/projects/projects/${reference.project_id}`" class="button-link outline">原出品项目与发行</RouterLink><RouterLink v-if="domain.key==='participation'" to="/finance/agreements" class="button-link outline">收入对账与到账</RouterLink><RouterLink v-if="uuid(rowData(details).quote_id)" :to="`/trade/quotes/${rowData(details).quote_id}`" class="button-link outline">读取正式报价</RouterLink></div></section>
<section v-if="section.files?.length&&(details||domain.key==='conversations'&&rows.length)" class="supply-card"><h2>获准查看的文件</h2><label v-if="section.files.some(f=>/:asset_id|:message_id/.test(f.path))" for="business-asset">本记录列明的私有材料<select id="business-asset" v-model="assetId" :disabled="locked"><option value="">请选择本次实际材料</option><option v-for="id in attachmentIds" :key="id" :value="id">本次材料 · {{id.slice(0,8)}}</option></select></label><div class="supply-actions"><button v-for="f in section.files" :key="f.path" class="outline" :disabled="locked" @click="openFile(f)">{{f.label}}</button></div><video v-if="fileUrl&&fileType==='video/mp4'" :src="fileUrl" controls playsinline preload="metadata" @playing="filePlayed=true" @error="filePlayed=false;ui.notice.value='文件未能播放，尚未完成查看。'"/><img v-else-if="fileUrl&&fileType.startsWith('image/')" :src="fileUrl" alt="本次获准查看的实际私有材料" class="business-private-image" @load="filePlayed=true" @error="filePlayed=false"/><audio v-else-if="fileUrl&&fileType.startsWith('audio/')" :src="fileUrl" controls @playing="filePlayed=true" @error="filePlayed=false"/><p v-else-if="fileText" class="business-private-text">{{fileText}}</p><a v-else-if="fileUrl" :href="fileUrl" download="获准的私有材料" class="button-link outline">保存已取得的私有文件</a><button v-if="domain.key==='stock'&&section.key==='purchases'" :disabled="locked||!filePlayed" class="outline" @click="readNotification">读取本次交付通知</button><p v-if="fileUrl" class="business-muted">文件仅在本次获准会话中保留，切换身份或离开后清除。</p></section>
<section v-if="actions.length||action" class="supply-card"><h2>办理下一步</h2><div class="business-actions"><div v-for="a in actions" :key="a.key" class="business-action-option"><button :class="operationKey===a.key?'primary selected':'outline'" :aria-pressed="operationKey===a.key" :disabled="locked||availability(a).blocked" @click="chooseAction(a.key)">{{a.label}}</button><small v-if="availability(a).blocked">{{availability(a).reason}}</small></div></div><form v-if="action" class="business-form" @submit.prevent="submit"><h3>{{action.label}}</h3><section v-if="prerequisite" class="business-availability"><h4>{{prerequisite.title}}</h4><p>{{prerequisite.message}}</p><ol><li v-for="step in prerequisite.steps" :key="step">{{step}}</li></ol><div class="supply-actions"><RouterLink v-for="link in prerequisite.links" :key="link.to" :to="link.to" class="button-link outline">{{link.label}}</RouterLink></div></section><p class="business-availability">{{availability(action).reason}}</p><p v-if="dirty" class="business-draft-notice" role="status">有未提交内容。切换事项或离页前会再次确认；草稿仅保留在当前页面。</p><p v-if="actionUnavailable" class="supply-warning" role="status">当前记录状态或权限已变化，暂不能提交此项。输入仍保留，请核对原记录。</p><p v-if="action.party==='none'" class="supply-warning">此操作以独立岗位身份提交，服务器核对实际权限及回避关系。</p><p v-if="action.note">{{action.note}}</p><p v-if="domain.key==='notices'&&action.key==='submission'" class="business-muted">面向通告投递时，选择通告和具体人物，再读取本通告匹配授权。本人主动投递可不关联通告，从本人已审合作投稿授权带入接收方与数字人；机构受托人物仍须核对逐人办理范围。</p><section v-if="domain.key==='notices'&&action.key==='invitation'" class="business-availability"><p>选择当前公开艺人与规则后，核对本次邀约资格。合作意向须经独立审核，感兴趣后再进入客服与正式报价。</p><button type="button" class="outline" :disabled="locked||refBusy" @click="readInvitationContext">{{refBusy?'正在核对邀约资格…':'读取本次邀约资格'}}</button><p v-if="invitationContext">已核对：{{invitationContext.display_name}}。继续填写合作用途与内容。</p></section><section v-if="isRoomCreation" class="business-availability" data-testid="cocreation-creation-context"><h4>从本人已提交的故事发起</h4><p>使用本人个人身份选择已提交或受理中的故事，再核对本故事当前承制方与生效参加规则。有补件、报价、订单、人工样片或已有房间时，请沿原事项办理。</p><div class="supply-actions"><RouterLink to="/operations/customization/mine" class="button-link outline">继续本人的私人故事</RouterLink><button type="button" class="outline" :disabled="locked||refBusy||!uuid(draft.request_id)" @click="readCreationContext">{{refBusy?'正在核对建房选项…':'重新读取本故事承制方与规则'}}</button></div><p v-if="uuid(creationVerifiedRequest)&&creationVerifiedRequest===draft.request_id&&!creationProblem" role="status">建房目录已核对。请选择其中的承制方与参加规则，填写名称、用途、地区和未来截止时间。</p><div v-if="creationProblem" class="supply-warning" role="status"><p>{{creationProblem.message}}</p><div class="supply-actions"><RouterLink v-for="link in creationProblem.links" :key="link.to" :to="link.to" class="button-link outline">{{link.label}}</RouterLink></div></div></section><BusinessFields v-model="draft" :fields="actionFields" :disabled="locked" :prefix="action.key" :errors="fieldErrors" :references="refOptions" :reference-busy="refBusy" @read-reference="loadChoices" @reference-selected="selectedReference"/><section v-if="isRoomCreation&&selectedCreationRule" class="business-availability" data-testid="cocreation-selected-rule"><h4>本次参加约定</h4><BusinessDetails :value="selectedCreationRule.rule as BusinessData" :field-labels="fieldLabels"/><p>建房后逐位邀请，每位参与人仍须独立确认人物、授权与本次材料；创建房间不代替参加或付款确认。</p></section><label class="trade-check"><input v-model="agreed" type="checkbox" :disabled="locked">已阅读当前记录与本次约定，明确提交上述办理事项。</label><button type="submit" class="primary" :disabled="locked||!agreed||actionUnavailable||!!prerequisite||isRoomCreation&&!creationReady||action.key==='invitation'&&!invitationContext||action.match&&currentVersion===null" :data-testid="`business-${action.key}`">{{action.label}}</button></form></section>
<details v-if="materialPreparation" class="supply-card business-upload"><summary>准备本次私有材料</summary><p>上传成功后，可在本次表单选择刚上传的实际材料。权利文件、取样及其他用途须与原授权一致。</p><label for="business-purpose">材料用途</label><select id="business-purpose" v-model="uploadPurpose" :disabled="locked"><option value="RIGHTS_EVIDENCE">权利依据</option><option value="REVIEW_EVIDENCE">复核依据</option><option value="CONSENT_EVIDENCE">本人同意依据</option><option value="AVATAR_MATERIAL">本人数字人原始素材</option><option value="WORK_CONTENT">作品内容</option><option v-if="domain.key==='cocreation'&&uuid(reference.project_id)" value="PRODUCTION_FILE">本原制作项目的本人片段MP4（50MiB内）</option><option v-if="domain.key==='stock'" value="STOCK_VIDEO">现货预览或正式MP4（50MiB内）</option></select><label for="business-upload-file">选择本地文件</label><input id="business-upload-file" type="file" :disabled="locked" @change="uploadFile=($event.target as HTMLInputElement).files?.[0]||null"><button class="outline" :disabled="locked||!uploadFile" @click="upload">上传私有材料</button><BusinessDetails v-if="uploaded" :value="uploaded"/></details>
</main></div></div></template>
