import { computed,onScopeDispose,ref,shallowRef,watch } from 'vue'
import { asApiError,type ApiError } from '@/api/client'
import { uuid } from '@/business/model'
import { getStockEligibility,type StockEligibility } from '@/api/modules/stockEligibility'
interface Context {token:string|null;accountId:string;partyId:string;revision:number;enabled:boolean;people:string[]}
export function useStockEligibility(context:()=>Context) {
  const entries=shallowRef<Record<string,StockEligibility>>({}),errors=shallowRef<Record<string,ApiError>>({}),busy=ref(false)
  let generation=0,controller:AbortController|null=null,disposed=false
  const signature=()=>JSON.stringify(context())
  const ready=computed(()=>{const c=context();return c.enabled&&!!c.people.length&&c.people.every(p=>uuid(p)&&entries.value[p]?.eligible)&&!busy.value})
  function clear(){generation++;controller?.abort();controller=null;entries.value={};errors.value={};busy.value=false}
  async function load() {
    if(busy.value||disposed)return false
    clear();const c=context(),key=signature(),ticket=generation,abort=new AbortController();controller=abort
    if(!c.enabled||!c.token||!uuid(c.accountId)||!uuid(c.partyId)||!c.people.length||c.people.some(p=>!uuid(p)))return false
    const current=()=>!disposed&&!abort.signal.aborted&&generation===ticket&&key===signature()
    busy.value=true
    // Bound concurrency; one result per selected person, including the seller.
    for(const person of [...new Set(c.people)]) {
      try {
        const row=await getStockEligibility(person,{token:c.token,accountId:c.accountId,actingParty:c.partyId,signal:abort.signal})
        if(!current())return false
        entries.value={...entries.value,[person]:row}
      } catch(e) {if(!current())return false;errors.value={...errors.value,[person]:asApiError(e)}}
    }
    if(!current())return false
    busy.value=false;controller=null;return ready.value
  }
  // Changes invalidate immediately. Reads are explicit, so rapid selection never loops.
  watch(signature,clear,{flush:'sync'})
  onScopeDispose(()=>{disposed=true;clear()})
  return {entries,errors,busy,ready,load,clear}
}
