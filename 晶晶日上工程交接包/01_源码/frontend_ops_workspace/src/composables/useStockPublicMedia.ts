import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { ApiError, asApiError } from '@/api/client'
import { getStockCover, getStockPublicMedia, isStockMediaRecord, type StockMediaRecord, type StockPublicMedia } from '@/api/modules/stockMedia'

interface Context {token:string|null;accountId:string;partyId:string;revision:number;scope:string;record:unknown}
// Visible cards share two processing slots; offscreen pages never enqueue media work.
let active=0
const waiting:Array<()=>void>=[]
async function slot(signal:AbortSignal,task:()=>Promise<void>) {
  if(signal.aborted)return
  const acquired=await new Promise<boolean>(resolve=>{
    const start=()=>{signal.removeEventListener('abort',cancel);active++;resolve(true)}
    const cancel=()=>{const index=waiting.indexOf(start);if(index>=0){waiting.splice(index,1);resolve(false)}}
    if(active<2)start();else {waiting.push(start);signal.addEventListener('abort',cancel,{once:true})}
  })
  if(!acquired)return
  try {if(!signal.aborted)await task()} finally {active--;waiting.shift()?.()}
}
export function useStockPublicMedia(context:()=>Context) {
  const media=shallowRef<StockPublicMedia|null>(null),url=ref(''),busy=ref(false),error=shallowRef<ApiError|null>(null),visible=ref(false)
  let generation=0,controller:AbortController|null=null,disposed=false
  const signature=()=>{const c=context(),r=isStockMediaRecord(c.record)?c.record:null;return JSON.stringify([c.token,c.accountId,c.partyId,c.revision,c.scope,r?.id,r?.object_version,r?.offer_sha256])}
  function clear() {generation++;controller?.abort();controller=null;if(url.value)URL.revokeObjectURL(url.value);url.value='';media.value=null;busy.value=false;error.value=null}
  async function load() {
    if(busy.value||!visible.value||disposed)return
    clear();const c=context();if(!c.token||!c.accountId||!isStockMediaRecord(c.record))return
    const record={...c.record} as StockMediaRecord,identity={token:c.token,accountId:c.accountId},version=generation,key=signature(),abort=new AbortController();controller=abort;busy.value=true
    const current=()=>!disposed&&!abort.signal.aborted&&generation===version&&key===signature()&&visible.value
    await slot(abort.signal,async()=>{
      if(!current())return
      try {
        const value=await getStockPublicMedia(identity,record,abort.signal);if(!current())return
        const blob=await getStockCover(identity,value,abort.signal);if(!current())return
        const objectUrl=URL.createObjectURL(blob)
        if(!current()){URL.revokeObjectURL(objectUrl);return}
        media.value=value;url.value=objectUrl
      } catch(cause) {if(current()){const failure=asApiError(cause);clear();error.value=failure}}
    })
    if(current()){busy.value=false;controller=null}
  }
  function setVisible(value:boolean) {if(visible.value===value)return;visible.value=value;if(value)void load();else clear()}
  function imageFailed(source:string) {if(!source||source!==url.value)return;clear();error.value=new ApiError({status:200,code:'STOCK_COVER_DECODE_FAILED',message:'封面无法显示，请重新读取。'})}
  function imageLoaded(source:string,width:number,height:number) {if(source===url.value&&media.value&&(width!==media.value.cover.width||height!==media.value.cover.height))imageFailed(source)}
  watch(signature,()=>{clear();if(visible.value)void load()},{flush:'sync'})
  onScopeDispose(()=>{disposed=true;clear()})
  return {media,url,busy,error,visible,load,clear,setVisible,imageFailed,imageLoaded}
}
