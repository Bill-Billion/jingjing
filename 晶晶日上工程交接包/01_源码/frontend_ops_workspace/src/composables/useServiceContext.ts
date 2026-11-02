import { computed,onUnmounted,ref,watch } from 'vue'
import { onBeforeRouteLeave,onBeforeRouteUpdate,useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { ApiError,asApiError,newIdempotencyKey,outcomeUnknown,type RequestOptions } from '@/api/client'
import { serviceRequest } from '@/api/modules/clientServices'
import type { SupplyIdentity } from '@/api/modules/supply'
import { saveWrite,savedWrite,removeWrite,type SavedWrite } from '@/api/pendingWrites'
export interface WriteRecovery<T> {
 namespace:string
 accepts:(command:SavedWrite)=>boolean
 guard:(value:unknown,command:SavedWrite)=>value is T
 apply:(value:T,command:SavedWrite)=>void|Promise<void>
 restored?:(command:SavedWrite)=>void
 lookup?:(identity:SupplyIdentity,command:SavedWrite,signal:AbortSignal)=>Promise<{status:'RECORDED'|'NOT_RECORDED'|'PROCESSING';value?:T}>
 denied?:()=>void
}
export function useServiceContext(party:()=>string|null,dirty:()=>boolean=()=>false,externalLock:()=>boolean=()=>false) {
 const session=useSessionStore(),route=useRoute(),error=ref<ApiError|null>(null),notice=ref(''),busy=ref(false),revision=ref(0)
 const pending=ref<{label:string;run:()=>Promise<unknown>;savedKey?:string;command?:SavedWrite}|null>(null)
 const signature=computed(()=>JSON.stringify([session.token,session.account?.id,session.selectedId,session.revision,party(),route.fullPath]))
 const commandScope=computed(()=>JSON.stringify([session.token,session.account?.id,session.selectedId,session.revision,party()]))
 let generation=0,controller=new AbortController(),disposed=false,readSequence=0
 let pendingScope=''
 let recovery:WriteRecovery<unknown>|null=null
 function clear(){generation++;controller.abort();controller=new AbortController();error.value=null;notice.value='';busy.value=false;pending.value=null;readSequence++;revision.value++}
 watch(signature,()=>{
  // Preserve hidden commands through session expiry; explicit logout clears
  // storage in the session store. A live identity/permission change invalidates it.
  if(pending.value?.savedKey&&session.token&&session.account&&pendingScope!==commandScope.value){try{removeWrite(pending.value.savedKey)}catch{/* Restore remains fail-closed. */}}
  clear()
 },{flush:'sync'})
 const ready=computed(()=>!!session.token&&!!session.account&&(!party()||!!session.selected&&session.selected.membership.current_status==='ACTIVE'&&!['SUSPENDED','CLOSED'].includes(session.selected.party.current_status)))
 const identity=():SupplyIdentity=>({token:session.token!,accountId:session.account!.id,partyId:party()})
 async function read<T>(path:string,guard:(v:unknown)=>v is T):Promise<T|null>{if(!ready.value)return null;const g=generation,readId=++readSequence;try{const data=await serviceRequest(identity(),path,guard,{signal:controller.signal});return !disposed&&g===generation&&readId===readSequence?data:null}catch(e){if(!disposed&&g===generation&&readId===readSequence)error.value=asApiError(e);return null}}
 function recoveryFailure(){error.value=new ApiError({status:409,code:'CLIENT_RECOVERY_UNAVAILABLE',message:'无法核对已保存的原请求，未发送新操作。请恢复原请求，或退出本机后重新核对原业务记录。'})}
 function enableRecovery<T>(handler:WriteRecovery<T>){recovery={...handler,guard:(v,c):v is unknown=>handler.guard(v,c),apply:(v,c)=>handler.apply(v as T,c)}}
 function prepare<T>(command:SavedWrite,guard:(v:unknown)=>v is T,apply:(data:T)=>void|Promise<void>,options:RequestOptions={},persisted=false){
  const g=generation,i=identity()
  const run=async()=>{
   if(g!==generation||disposed||!ready.value)return
   busy.value=true;error.value=null
   try{
    const data=await serviceRequest(i,command.path,guard,{...options,body:command.body,method:command.method,ifMatch:command.ifMatch,idempotencyKey:command.key,signal:controller.signal})
    if(g!==generation||disposed)return
    if(persisted)removeWrite(command.key)
    pending.value=null;busy.value=false;await apply(data)
   }catch(e){
    if(g!==generation||disposed)return
    error.value=asApiError(e)
    if(!outcomeUnknown(e)){if(persisted)removeWrite(command.key);pending.value=null}
    if(error.value.status===412)notice.value='记录已在其他页面变化。请刷新当前记录、核对新状态后重新确认；原操作不会自动补发。'
   }finally{if(g===generation)busy.value=false}
  }
  pendingScope=commandScope.value
  pending.value={label:'原操作结果待确认',run,...persisted?{savedKey:command.key,command}:{}}
  return run
 }
 function restoreWrite():boolean{
  if(!recovery||!ready.value||pending.value)return false
  try{
   const command=savedWrite(recovery.namespace,session.account!.id,party(),route.fullPath)
   if(!command)return false
   if(command.selectedId!==session.selectedId||command.authority!==session.authority||!recovery.accepts(command)){
    removeWrite(command.key);notice.value='原请求的身份、权限或页面已变化，请先核对原业务记录。';return false
   }
   const handler=recovery
   prepare(command,(v):v is unknown=>handler.guard(v,command),v=>handler.apply(v,command),{},true)
   handler.restored?.(command)
   notice.value='已恢复原请求，请核对后继续。不会自动重复提交。'
   if(recovery.lookup)void inspect()
   return true
  }catch{recoveryFailure();return false}
 }
 async function write<T>(path:string,body:unknown,guard:(v:unknown)=>v is T,apply:(data:T)=>void|Promise<void>,options:RequestOptions={}){
  if(!ready.value||busy.value||pending.value)return
  const method=options.method||'POST'
  if(method==='GET')return
  const command:SavedWrite={namespace:recovery?.namespace||'',accountId:session.account!.id,selectedId:session.selectedId,partyId:party(),authority:session.authority,route:route.fullPath,path,method,key:newIdempotencyKey(),body:body===undefined?undefined:JSON.parse(JSON.stringify(body)),...(options.ifMatch===undefined?{}:{ifMatch:Number(options.ifMatch)})}
  if(recovery){try{if(options.rawBody||!recovery.accepts(command))throw Error('UNSUPPORTED_RECOVERY');saveWrite(command)}catch{recoveryFailure();return}}
  await prepare(command,guard,apply,options,!!recovery)()
 }
 async function inspect():Promise<'NOT_RECORDED'|null>{
  const command=pending.value?.command,handler=recovery,g=generation
  if(!command||!handler?.lookup||!ready.value||busy.value)return null
  busy.value=true;error.value=null
  try{
   const result=await handler.lookup(identity(),command,controller.signal)
   if(g!==generation||disposed)return null
   if(result.status==='RECORDED'){
    if(!handler.guard(result.value,command))throw new ApiError({status:503,code:'INVALID_RECOVERY_RESPONSE',message:'原操作回执无法核对，请稍后重查。'})
    removeWrite(command.key);pending.value=null;busy.value=false;await handler.apply(result.value,command)
    notice.value='已核对原操作记录，当前申请状态已更新。'
   }else if(result.status==='NOT_RECORDED'){
    notice.value='本次查询尚未发现原操作记录。请保留原内容，确认后可用原请求继续；不会自动重发。';return 'NOT_RECORDED'
   }else notice.value='原操作仍在处理中，请稍后再次核对。'
  }catch(e){if(g===generation&&!disposed){error.value=asApiError(e);if([403,404].includes(error.value.status)){removeWrite(command.key);pending.value=null;handler.denied?.()}}}
  finally{if(g===generation)busy.value=false}
  return null
 }
 async function retry(){if(pending.value&&!busy.value){if(recovery?.lookup&&pending.value.command&&await inspect()!=='NOT_RECORDED')return;if(pending.value&&!busy.value)await pending.value.run()}}
 function cancelReads(){readSequence++}
 function fail(message:string){error.value=new ApiError({status:400,code:'CLIENT_INPUT_REQUIRED',message})}
 const leave=()=>{if(pending.value||busy.value||externalLock()){notice.value='请先恢复原请求并核对结果，再离开当前页面。';return false}return !dirty()||window.confirm('本页有尚未提交的内容。离开会丢弃这些输入，确认离开？')}
 const unload=(e:BeforeUnloadEvent)=>{if(pending.value||busy.value||externalLock()||dirty()){e.preventDefault();e.returnValue=''}}
 onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave);if(typeof window!=='undefined')window.addEventListener('beforeunload',unload)
 onUnmounted(()=>{disposed=true;clear();if(typeof window!=='undefined')window.removeEventListener('beforeunload',unload)})
 return{session,error,notice,busy,pending,revision,ready,identity,read,write,retry,fail,clear,cancelReads,signature,enableRecovery,restoreWrite}
}
