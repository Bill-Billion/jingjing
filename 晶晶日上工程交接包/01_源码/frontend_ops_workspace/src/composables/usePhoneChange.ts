import {computed,onScopeDispose,ref,watch} from 'vue'
import {ApiError,asApiError,newIdempotencyKey,outcomeUnknown} from '@/api/client'
import {readPhoneCurrent,writePhone,type PhoneChange,type PhoneCommand} from '@/api/modules/phoneChange'

interface AccountContext {token:string|null;accountId:string}
interface Pending {command:PhoneCommand;key:string;id?:string;body:Record<string,string>;version?:number;checked:boolean}
/** Phone binding belongs to an account session, never the selected business party. */
export function usePhoneChange(context:()=>AccountContext){
 const request=ref<PhoneChange|null>(null),error=ref<ApiError|null>(null),notice=ref(''),busy=ref(false),loading=ref(false),loaded=ref(false),pending=ref<Pending|null>(null),revision=ref(0),conflict=ref(false),retryAt=ref(0),needsLogin=ref<''|'recent'|'complete'|'uncertain'>('')
 const signature=computed(()=>JSON.stringify([context().token,context().accountId])),ready=computed(()=>!!context().token&&!!context().accountId)
 let generation=0,controller=new AbortController(),disposed=false
 const identity=()=>({token:context().token!,accountId:context().accountId,partyId:null})
 function clear(){const confirmInFlight=pending.value?.command==='confirm';generation++;controller.abort();controller=new AbortController();request.value=null;error.value=null;notice.value='';busy.value=loading.value=loaded.value=false;pending.value=null;conflict.value=false;retryAt.value=0;needsLogin.value=!context().token&&(confirmInFlight||needsLogin.value==='complete'||needsLogin.value==='uncertain')?'uncertain':'';revision.value++}
 watch(signature,clear,{flush:'sync'})
 function accept(result:PhoneChange|null){request.value=result;loaded.value=true;if(result?.current_status==='COMPLETED'&&result.requires_relogin)needsLogin.value='complete';else if(result?.current_status==='COMPLETED')needsLogin.value=''}
 function resolved(p:Pending,r:PhoneChange|null){
  if(!r)return false
  // A masked number or latest challenge cannot prove which request committed.
  if(p.command==='create'||p.command==='send')return false
  if(r.id!==p.id)return false
  if(p.command==='confirm')return r.current_status==='COMPLETED'
  if(p.command==='cancel')return r.current_status==='CANCELLED'
  return r.object_version>(p.version||0)&&(p.body.side==='OLD'?['AWAITING_NEW','READY','COMPLETED'].includes(r.current_status):['READY','COMPLETED'].includes(r.current_status))
 }
 async function load(){
  if(!ready.value||loading.value||busy.value)return
  const g=generation,p=pending.value;loading.value=true;error.value=null
  try{const data=await readPhoneCurrent(identity(),{signal:controller.signal,unauthorizedRecovery:p?.command==='confirm'?'PHONE_CHANGE_CONFIRMATION':undefined});if(g!==generation||disposed)return;accept(data.request)
   if(p&&pending.value===p){
    if(resolved(p,data.request)){pending.value=null;notice.value='已核对原请求的最新结果，请按当前步骤继续。'}
    else if(p.command==='confirm'){p.checked=!!data.request&&data.request.id===p.id&&data.request.current_status==='READY'&&data.request.object_version===p.version&&data.request.can_continue;notice.value=p.checked?'服务器确认本申请仍等待本人确认。请重新核对号码，明确确认后才继续原请求。':'确认结果仍待核对。请勿重复提交；若旧登录已失效，请用新号码登录后查看本页。'}
    else p.checked=true
   }
  }catch(e){if(g!==generation||disposed)return;error.value=asApiError(e);if([403,404].includes(error.value.status)){request.value=null;loaded.value=false}}
  finally{if(g===generation)loading.value=false}
 }
 async function run(p:Pending){
  if(!ready.value||busy.value||loading.value||Date.now()<retryAt.value)return
  const g=generation,i=identity();busy.value=true;error.value=null;p.checked=false
  try{const data=await writePhone(i,p.command,p.id,p.body,p.key,p.version,controller.signal);if(g!==generation||disposed)return;accept(data);pending.value=null;conflict.value=false;notice.value=p.command==='send'?'验证码已发往本步骤的号码，请查看短信。':p.command==='cancel'?'申请已取消，原登录号码保留。':''}
  catch(e){if(g!==generation||disposed)return;const problem=asApiError(e);error.value=problem
   if(problem.retryAfterAt)retryAt.value=Math.max(retryAt.value,problem.retryAfterAt)
   if(!outcomeUnknown(problem)){pending.value=null;if(problem.status===412){conflict.value=true;notice.value='申请状态已变化，请重新读取并明确确认本次操作；原请求不会自动重发。'}if(problem.code==='RECENT_LOGIN_REQUIRED')needsLogin.value='recent'}
   else if(p.command==='confirm')notice.value='换号确认的结果未知。先查当前进度；若旧登录已失效，请用新号码登录后核对，勿再次创建换号申请。'
   else notice.value='原请求结果尚未确认。先读取进度，必要时恢复同一请求。'
   if(problem.status===412||problem.status===429||['INVALID_PHONE_CHANGE_CODE','PHONE_CHANGE_ALREADY_ACTIVE','PHONE_CHANGE_SESSION_MISMATCH','PHONE_CHANGE_CHALLENGE_UNAVAILABLE','PHONE_CHANGE_NOT_ACTIVE','PHONE_CHANGE_SMS_UNAVAILABLE'].includes(problem.code)){busy.value=false;await load();if(g===generation)error.value=problem}
  }finally{if(g===generation)busy.value=false}
 }
 async function execute(command:PhoneCommand,body:Record<string,string>={}){
  if(!ready.value||!loaded.value||busy.value||loading.value||pending.value||Date.now()<retryAt.value)return
  const current=request.value
  if(command==='create'&&current&&['AWAITING_OLD','AWAITING_NEW','READY'].includes(current.current_status))return
  if(command!=='create'&&(!current||!current.can_continue))return
  if(command==='confirm'&&current?.current_status!=='READY')return
  const p:Pending={command,key:newIdempotencyKey(),body:JSON.parse(JSON.stringify(body)),checked:false,...command==='create'?{}:{id:current!.id,version:current!.object_version}}
  pending.value=p;await run(p)
 }
 async function retry(confirmed=false){const p=pending.value;if(!p||!p.checked||p.command==='confirm'&&!confirmed)return;await run(p)}
 onScopeDispose(()=>{disposed=true;clear()})
 return {request,error,notice,busy,loading,loaded,pending,revision,conflict,retryAt,needsLogin,ready,signature,load,execute,retry}
}
