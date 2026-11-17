import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {useSessionStore} from '@/stores/session'
import {readBusiness,type BusinessData} from '@/api/modules/business'
import {ApiError,asApiError} from '@/api/client'
import {uuid} from '@/business/model'
import type {BusinessCommand} from './useBusiness'
const object=(v:unknown):v is BusinessData=>!!v&&typeof v==='object'&&!Array.isArray(v)
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const positive=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0
const invalid=()=>new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'通告、规则或投稿回执与本次原请求不一致，请保留原请求核对。'})
export function validateNoticeSubmission(record:BusinessData,command:BusinessCommand,party:string){
 const b=command.body
 if(command.path!=='/notices/submissions'||!object(b)||b.notice_version===undefined)return
 const s=b.submission,d=record.data
 if(!object(s)||!object(d)||!object(d.submission)||!object(d.notice_snapshot)||record.kind!=='SUBMISSION'||!uuid(record.id)||record.owner_party_id!==party||record.counterparty_id!==s.target_party_id||record.parent_id!==s.notice_id||d.rule_id!==b.rule_id||!positive(record.object_version))throw invalid()
 const snapshot=d.notice_snapshot
 if(snapshot.notice_id!==s.notice_id||snapshot.object_version!==b.notice_version||snapshot.notice_sha256!==b.notice_sha256)throw invalid()
 for(const k of ['kind','notice_id','target_party_id','person_id','avatar_id','consent_id','purpose','content','role'])if(d.submission[k]!==s[k])throw invalid()
 if(JSON.stringify(d.submission.material_asset_ids)!==JSON.stringify(s.material_asset_ids))throw invalid()
}
export function useNoticeSubmissionContext(input:()=>{enabled:boolean;draft:BusinessData;scope:string}){
 const session=useSessionStore(),notice=shallowRef<BusinessData|null>(null),rule=shallowRef<BusinessData|null>(null)
 const busy=ref(false),confirmed=ref(false),error=ref('')
 let ticket=0,disposed=false
 const scope=()=>JSON.stringify([session.token,session.account?.id,session.selectedId,session.revision,input()])
 function clear(){ticket++;notice.value=rule.value=null;confirmed.value=false;busy.value=false;error.value=''}
 watch(scope,clear,{flush:'sync'})
 const ready=computed(()=>input().enabled&&!!notice.value&&!!rule.value&&confirmed.value&&!busy.value)
 async function fetchContext(){
  const i=input(),sub=i.draft.submission
  if(!i.enabled||!object(sub)||!uuid(sub.notice_id)||!uuid(i.draft.rule_id)||!uuid(sub.target_party_id))throw new ApiError({status:400,code:'NOTICE_CONTEXT_REQUIRED',message:'先选择通告、人物及本通告获准投稿授权，再读取正文与规则。'})
  const token=session.token,accountId=session.account?.id
  if(!token||!accountId)throw new ApiError({status:401,code:'SESSION_REQUIRED',message:'请重新登录。'})
  // Both sources are public: never send X-Acting-Party.
  const opts={token,accountId},n=(await readBusiness(`/notices/catalog/${sub.notice_id}`,opts)).data
  if(n.id!==sub.notice_id||n.owner_party_id!==sub.target_party_id||n.rule_id!==i.draft.rule_id||!positive(n.object_version)||!hash(n.notice_sha256)||!object(n.notice))throw invalid()
  let cursor='',r:BusinessData|null=null
  const seen=new Set<string>()
  do{
   const page=(await readBusiness('/notices/rules?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''),opts)).data
   if(!Array.isArray(page.items)||!(page.next_cursor===null||uuid(page.next_cursor)&&!seen.has(page.next_cursor)))throw invalid()
   for(const value of page.items){if(!object(value)||!uuid(value.id)||!hash(value.content_sha256)||!object(value.rule))throw invalid();if(value.id===n.rule_id)r=value}
   if(r)break
   cursor=page.next_cursor as string||'';if(cursor)seen.add(cursor)
  }while(cursor)
  if(!r)throw new ApiError({status:409,code:'NOTICE_RULE_UNAVAILABLE',message:'本通告规则不在当前生效目录中，请重新核对；未提交投稿。'})
  return {notice:n,rule:r}
 }
 async function read(){
  if(busy.value)return
  clear();const t=++ticket,s=scope();busy.value=true
  try{const value=await fetchContext();if(disposed||t!==ticket||s!==scope())return;notice.value=value.notice;rule.value=value.rule}
  catch(e){if(!disposed&&t===ticket&&s===scope())error.value=asApiError(e).message}
  finally{if(t===ticket)busy.value=false}
 }
 async function prepare():Promise<{notice_version:number;notice_sha256:string}|null>{
  if(!ready.value){error.value='请先读取本通告完整正文与生效规则，并明确勾选本版确认。';return null}
  const original=notice.value!,originalRule=rule.value!,s=scope(),t=++ticket;busy.value=true
  try{
   const latest=await fetchContext();if(disposed||t!==ticket||s!==scope())return null
   if(latest.notice.object_version!==original.object_version||latest.notice.notice_sha256!==original.notice_sha256||latest.notice.rule_id!==original.rule_id||latest.notice.owner_party_id!==original.owner_party_id||latest.rule.content_sha256!==originalRule.content_sha256){
    notice.value=latest.notice;rule.value=latest.rule;confirmed.value=false;error.value='通告或规则已变化。请阅读更新内容并重新确认；本次未提交。';return null
   }
   return {notice_version:original.object_version as number,notice_sha256:original.notice_sha256 as string}
  }catch(e){if(!disposed&&t===ticket&&s===scope()){confirmed.value=false;error.value=asApiError(e).message}return null}
  finally{if(t===ticket)busy.value=false}
 }
 onScopeDispose(()=>{disposed=true;clear()})
 return {notice,rule,busy,confirmed,error,ready,read,prepare,clear}
}
