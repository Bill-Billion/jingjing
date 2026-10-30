import { computed,onUnmounted,ref,watch } from 'vue'
import { onBeforeRouteLeave,onBeforeRouteUpdate,useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { ApiError,asApiError,newIdempotencyKey,outcomeUnknown,type RequestOptions } from '@/api/client'
import { serviceRequest } from '@/api/modules/clientServices'
import type { SupplyIdentity } from '@/api/modules/supply'
export function useServiceContext(party:()=>string|null,dirty:()=>boolean=()=>false,externalLock:()=>boolean=()=>false) {
 const session=useSessionStore(),route=useRoute(),error=ref<ApiError|null>(null),notice=ref(''),busy=ref(false),revision=ref(0)
 const pending=ref<{label:string;run:()=>Promise<unknown>}|null>(null)
 const signature=computed(()=>JSON.stringify([session.token,session.account?.id,session.selectedId,session.revision,party(),route.fullPath]))
 let generation=0,controller=new AbortController(),disposed=false,readSequence=0
 function clear(){generation++;controller.abort();controller=new AbortController();error.value=null;notice.value='';busy.value=false;pending.value=null;readSequence++;revision.value++}
 watch(signature,clear,{flush:'sync'})
 const ready=computed(()=>!!session.token&&!!session.account&&(!party()||!!session.selected))
 const identity=():SupplyIdentity=>({token:session.token!,accountId:session.account!.id,partyId:party()})
 async function read<T>(path:string,guard:(v:unknown)=>v is T):Promise<T|null>{if(!ready.value)return null;const g=generation,readId=++readSequence;try{const data=await serviceRequest(identity(),path,guard,{signal:controller.signal});return !disposed&&g===generation&&readId===readSequence?data:null}catch(e){if(!disposed&&g===generation&&readId===readSequence)error.value=asApiError(e);return null}}
 async function write<T>(path:string,body:unknown,guard:(v:unknown)=>v is T,apply:(data:T)=>void|Promise<void>,options:RequestOptions={}){
 if(!ready.value||busy.value||pending.value)return
 const g=generation,i=identity(),payload=body===undefined?undefined:JSON.parse(JSON.stringify(body)),key=newIdempotencyKey()
 const run=async()=>{if(g!==generation||disposed)return;busy.value=true;error.value=null;try{const data=await serviceRequest(i,path,guard,{...options,body:payload,method:options.method||'POST',idempotencyKey:key,signal:controller.signal});if(g!==generation||disposed)return;pending.value=null;busy.value=false;await apply(data)}catch(e){if(g!==generation||disposed)return;error.value=asApiError(e);if(!outcomeUnknown(e))pending.value=null;if(error.value.status===412)notice.value='记录已在其他页面变化。请刷新当前记录、核对新状态后重新确认；原操作不会自动补发。'}finally{if(g===generation)busy.value=false}}
 pending.value={label:'原操作结果待确认',run};await run()
 }
 async function retry(){if(pending.value&&!busy.value)await pending.value.run()}
 function cancelReads(){readSequence++}
 function fail(message:string){error.value=new ApiError({status:400,code:'CLIENT_INPUT_REQUIRED',message})}
 const leave=()=>{if(pending.value||busy.value||externalLock()){notice.value='请先恢复原请求并核对结果，再离开当前页面。';return false}return !dirty()||window.confirm('本页有尚未提交的内容。离开会丢弃这些输入，确认离开？')}
 const unload=(e:BeforeUnloadEvent)=>{if(pending.value||busy.value||externalLock()||dirty()){e.preventDefault();e.returnValue=''}}
 onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave);if(typeof window!=='undefined')window.addEventListener('beforeunload',unload)
 onUnmounted(()=>{disposed=true;clear();if(typeof window!=='undefined')window.removeEventListener('beforeunload',unload)})
 return{session,error,notice,busy,pending,revision,ready,identity,read,write,retry,fail,clear,cancelReads,signature}
}
