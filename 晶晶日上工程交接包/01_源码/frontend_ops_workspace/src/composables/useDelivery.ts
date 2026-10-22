import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { getFulfillment, postDelivery, type DeliveryWrite, type Fulfillment } from '@/api/modules/customizationDelivery'
import type { SupplyContext } from './useSupply'
import type { SupplyIdentity } from '@/api/modules/supply'
interface Pending {command:DeliveryWrite;key:string;checked:boolean;known:boolean}
export function useDelivery(context:()=>SupplyContext){
 const value=ref<Fulfillment|null>(null),error=ref<ApiError|null>(null),notice=ref(''),pending=shallowRef<Pending|null>(null),busy=ref(false),securityRevision=ref(0),conflictRevision=ref(0),retryAt=ref(0)
 let epoch=0,ticket=0,disposed=false,abort:AbortController|null=null
 const locked=computed(()=>busy.value||!!pending.value)
 const identity=():SupplyIdentity=>{const c=context();if(!c.token||!c.accountId)throw new ApiError({status:401,code:'AUTHENTICATION_REQUIRED',message:'请重新登录。'});return {token:c.token,accountId:c.accountId,partyId:c.partyId}}
 function clear(){epoch++;ticket++;abort?.abort();abort=null;value.value=null;pending.value=null;busy.value=false;error.value=null;notice.value='';retryAt.value=0;securityRevision.value++}
 watch(()=>[context().token,context().accountId,context().partyId,context().revision,context().scope],clear,{flush:'sync'})
 onScopeDispose(()=>{disposed=true;clear()})
 function fail(cause:unknown){const e=asApiError(cause);if([401,403,404].includes(e.status)||['ARTIST_CONSENT_REQUIRED','ARTIST_HOSTING_REQUIRED','CUSTOMIZATION_CAST_SOURCE_CHANGED','PERSONAL_DATA_RESTRICTED','CUSTOMIZATION_CHANGE_PAYMENT_REVERSED'].includes(e.code))clear();error.value=e;retryAt.value=e.retryAfterAt||0}
 async function load(id:string){if(retryAt.value>Date.now())return null;const generation=epoch,t=++ticket;abort?.abort();abort=new AbortController();busy.value=true;error.value=null;try{const r=await getFulfillment(identity(),id,abort.signal);if(disposed||generation!==epoch||t!==ticket)return null;value.value=r;return r}catch(e){if(!disposed&&generation===epoch&&t===ticket)fail(e);return null}finally{if(!disposed&&generation===epoch&&t===ticket)busy.value=false}}
 async function check(){const p=pending.value;if(!p||busy.value)return;const r=await load(p.command.projectId);if(!r||pending.value!==p)return;if(p.known){pending.value=null;notice.value='原操作已保存，已重新读取履约状态。'}else{p.checked=true;notice.value='已读取原项目。若仍不能确认，只能使用原请求编号、内容和版本核对。'}}
 async function send(first=false){const p=pending.value;if(!p||busy.value||retryAt.value>Date.now()||!first&&!p.checked)return;if(p.known){await check();return}const generation=epoch;busy.value=true;error.value=null;p.checked=false;abort=new AbortController();try{const r=await postDelivery(identity(),p.command,p.key,abort.signal);if(disposed||epoch!==generation||pending.value!==p)return;p.known=true;value.value=r;pending.value=null;notice.value=`${p.command.label}已保存；付款和渠道结果另行核对。`}catch(cause){if(disposed||generation!==epoch)return;const e=asApiError(cause);if(e.status===412){pending.value=null;conflictRevision.value++;busy.value=false;await load(p.command.projectId);if(epoch===generation){error.value=e;notice.value='原项目版本已变化。输入仍保留，请核对当前内容后重新确认。'}}else if(outcomeUnknown(e)){error.value=e;notice.value='原操作结果待确认，内容、版本和请求编号已保留。请先核对原项目。'}else{pending.value=null;fail(e)}}finally{if(!disposed&&generation===epoch)busy.value=false}}
 async function write(c:DeliveryWrite){if(locked.value||retryAt.value>Date.now())return;pending.value={command:{...c,body:JSON.parse(JSON.stringify(c.body))},key:newIdempotencyKey(),checked:false,known:false};await send(true)}
 return {value,error,notice,pending,busy,locked,retryAt,securityRevision,conflictRevision,load,write,check,retry:()=>send(),clear}
}
