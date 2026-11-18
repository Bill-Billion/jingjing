<script setup lang="ts">
import { computed,onMounted,onUnmounted,ref,watch } from 'vue'
import { ApiError,asApiError,newIdempotencyKey,outcomeUnknown } from '@/api/client'
import { readBusiness,writeBusiness } from '@/api/modules/business'
import { listArtistPeople,type ArtistPerson } from '@/api/modules/artists'
import { uuid } from '@/business/model'
import { clearFragment,consumeFragment,isClaim,isCreated,isLink,isPending,parseInvite,tokenDigest,type Link,type Pending } from '@/cocreation/invite'
import { useSessionStore } from '@/stores/session'

const props=defineProps<{mode:'host'|'claim';room?:string;version?:number;allowed?:boolean}>()
const session=useSessionStore()
const busy=ref(false), recoveryBlocked=ref(false), error=ref(''), notice=ref(''), rows=ref<Link[]>([]), people=ref<ArtistPerson[]>([])
const secret=ref(''), pasted=ref(''), person=ref(''), room=ref(''), pending=ref<Pending|null>(null)
let ticket=0, initialized=false
const storageKey='cocreation.invite.pending.v1'
const canUse=computed(()=>!!session.token&&!!session.account?.id&&!!session.selectedId&&session.selected?.membership.current_status==='ACTIVE'&&!['SUSPENDED','CLOSED'].includes(session.selected?.party.current_status||''))
const personal=computed(()=>canUse.value&&session.selected?.party.kind==='PERSON'&&session.selected.membership.roles.includes('OWNER'))
const ownPeople=computed(()=>people.value.filter(p=>p.owner_party_id===session.selectedId&&p.current_status==='ACTIVE'&&p.identity_status==='VERIFIED'&&p.age_band==='ADULT'&&!!p.identity_valid_until&&Date.parse(p.identity_valid_until)>Date.now()))
function save(p:Pending|null):boolean{try{if(p)sessionStorage.setItem(storageKey,JSON.stringify(p));else sessionStorage.removeItem(storageKey);pending.value=p;recoveryBlocked.value=false;return true}catch{recoveryBlocked.value=true;return false}}
function restore(){try{const raw=sessionStorage.getItem(storageKey);if(raw===null){pending.value=null;recoveryBlocked.value=false;return}const v=JSON.parse(raw);if(!isPending(v)){recoveryBlocked.value=true;return}if(v.account===session.account?.id&&v.party===session.selectedId){pending.value=v;recoveryBlocked.value=false}else save(null)}catch{recoveryBlocked.value=true}}
function reset(){ticket++;busy.value=false;rows.value=[];people.value=[];secret.value='';pasted.value='';person.value='';room.value='';error.value='';notice.value='';clearFragment();save(null)}
watch(()=>[session.token,session.account?.id,session.selectedId,session.authority] as const,(n,o)=>{
 if((o[0]&&o[0]!==n[0])||(o[1]&&o[1]!==n[1])||(o[2]&&o[2]!==n[2])||(o[2]&&o[3]!==n[3]&&JSON.parse(o[3])[1])){reset();initialized=false}
 if(canUse.value&&!initialized){initialized=true;restore();if(props.mode==='claim')void loadPeople();else void loadLinks()}
},{flush:'sync'})
watch(()=>[props.room,props.version,props.allowed],(n,o)=>{if(o&&n[0]!==o[0])reset();if(canUse.value&&props.mode==='host')void loadLinks()})
onMounted(()=>{if(props.mode==='claim')pasted.value=consumeFragment()||'';if(canUse.value&&!initialized){initialized=true;restore();if(props.mode==='claim')void loadPeople();else void loadLinks()}})
onUnmounted(()=>{ticket++;secret.value='';pasted.value='';clearFragment()})
function context(){if(!canUse.value||!session.account||!session.token)throw new Error('identity');return {token:session.token,accountId:session.account.id,partyId:session.selectedId}}
function opts(){const i=context();return {token:i.token,accountId:i.accountId,actingParty:i.partyId}}
function failure(e:unknown){const a=asApiError(e);if(a.code==='COCREATION_INVITE_LINK_UNAVAILABLE')return '邀请已失效、到期、撤销或被领取，请联系发起人重新邀请。';if(a.code==='COCREATION_INVITE_LINK_LIMIT')return '本房间已达到邀请数量上限。';if(a.code==='COCREATION_ENROLLMENT_CLOSED')return '房间已停止招募，不能继续邀请或领取。';if(a.status===412)return '记录已变化，请刷新房间或邀请状态并重新确认。';if(a.status===401)return '登录已失效，请重新登录后再次核对。';if([403,404].includes(a.status))return '当前身份无权访问，请重新核对账号与办理身份。';if(a.code==='ARTIST_IDENTITY_REQUIRED'||a.code==='ARTIST_AGE_REQUIRED'||a.code==='MINOR_OPERATION_RESTRICTED')return '请使用本人当前有效的成年人实名档案。';if(outcomeUnknown(a))return '结果尚未确认，请保持当前身份并恢复同一次请求。';return '本次操作未完成，请核对状态后重试。'}
function security(e:unknown){const a=asApiError(e);if([401,403,404].includes(a.status)){secret.value='';pasted.value='';people.value=[];rows.value=[];room.value='';save(null)}}
async function loadLinks(){if(busy.value||!props.allowed||!uuid(props.room)||!canUse.value)return;const t=++ticket,s=session.capture();try{const r=await readBusiness(`/cocreation/rooms/${props.room}/invite-links`,opts());if(t!==ticket||!session.current(s,true))return;const items=r.data.items;if(!Array.isArray(items)||items.length>100||items.some(x=>!isLink(x,props.room!)))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'invalid'});rows.value=items as Link[];error.value=''}catch(e){if(t!==ticket)return;security(e);error.value=failure(e)}}
async function loadPeople(){if(busy.value||!personal.value)return;const t=++ticket,s=session.capture();try{const i=context();let cursor:string|null=null;const seen=new Set<string>(),all:ArtistPerson[]=[];do{const page=await listArtistPeople({token:i.token,accountId:i.accountId,partyId:i.partyId},cursor);if(t!==ticket||!session.current(s,true))return;all.push(...page.items);cursor=page.next_cursor;if(cursor){if(seen.has(cursor))throw new Error('cursor');seen.add(cursor)}}while(cursor);people.value=all;error.value=''}catch(e){if(t!==ticket)return;security(e);error.value=failure(e)}}
async function run(p:Pending,token='',prevalidated=false){
 if(busy.value||recoveryBlocked.value||!canUse.value||p.account!==session.account?.id||p.party!==session.selectedId)return
 const t=++ticket,s=session.capture();busy.value=true;error.value='';notice.value=''
 try{if(p.kind==='claim'&&(!token||!prevalidated&&await tokenDigest(token)!==p.tokenDigest)){error.value='请重新粘贴原邀请，再恢复同一次领取。';return}
  if(t!==ticket||!session.current(s,true))return;if(!save(p)){error.value='无法保存本机恢复记录，尚未发送请求。';return}
  let path:string,body:Record<string,unknown>={},version:number|undefined
  if(p.kind==='create'){path=`/cocreation/rooms/${p.room}/invite-links`;version=p.version}
  else if(p.kind==='revoke'){path=`/cocreation/invite-links/${p.link}/revoke`;version=p.version}
  else{path='/cocreation/invite-links/claim';body={token,person_id:p.person}}
  const result=await writeBusiness(path,{...opts(),method:'POST',body,idempotencyKey:p.key,ifMatch:version})
  if(t!==ticket||!session.current(s,true))return
  if(p.kind==='create'){if(!isCreated(result.data,p.room))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'invalid'});secret.value=result.data.token;notice.value='邀请已生成。请只转给指定的人，误发可在领取前撤销。'}
  else if(p.kind==='revoke'){if(!isLink(result.data,p.room)||result.data.id!==p.link||result.data.current_status!=='REVOKED')throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'invalid'});secret.value='';notice.value='邀请已撤销。'}
  else{if(!isClaim(result.data,p.person))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'invalid'});room.value=result.data.room_id;pasted.value='';notice.value='已领取邀请。请本人进入房间填写参加资料并单独确认授权；领取不代表已参加。'}
  if(!save(null))error.value='本机恢复记录暂时无法更新，请重新核对。'
 }catch(e){if(t!==ticket||!session.current(s,true))return;if(!outcomeUnknown(e))save(null);security(e);error.value=failure(e)}finally{if(t===ticket){busy.value=false;if(props.mode==='host'&&!pending.value)void loadLinks()}}
}
function create(){if(recoveryBlocked.value||!props.allowed||!uuid(props.room)||!Number.isSafeInteger(props.version)||!session.account||pending.value)return;secret.value='';void run({kind:'create',account:session.account.id,party:session.selectedId,key:newIdempotencyKey(),room:props.room,version:props.version!})}
function revoke(link:Link){if(!props.allowed||link.current_status!=='ACTIVE'||!session.account||pending.value)return;void run({kind:'revoke',account:session.account.id,party:session.selectedId,key:newIdempotencyKey(),room:link.room_id,link:link.id,version:link.object_version})}
async function claim(){if(busy.value||recoveryBlocked.value)return;const token=parseInvite(pasted.value,window.location.origin);if(!token||!ownPeople.value.some(p=>p.id===person.value)||!session.account||pending.value){error.value='请粘贴有效邀请并选择本人有效的成年人档案。';return}const s=session.capture(),account=session.account.id,party=session.selectedId,who=person.value;busy.value=true;try{const digest=await tokenDigest(token);if(!session.current(s,true))return;busy.value=false;void run({kind:'claim',account,party,key:newIdempotencyKey(),person:who,tokenDigest:digest},token,true)}finally{if(session.current(s,true)&&!pending.value)busy.value=false}}
function retry(){const p=pending.value;if(!p)return;if(p.kind==='claim'){const token=parseInvite(pasted.value,window.location.origin);if(!token){error.value='请重新粘贴原邀请，再恢复同一次领取。';return}void run(p,token)}else void run(p)}
async function copy(){try{await navigator.clipboard.writeText(`${window.location.origin}/cocreation/invitations#invite=${secret.value}`);notice.value='已复制邀请，请只发送给指定的人。'}catch{notice.value='复制未完成；请在支持复制的安全浏览器中重试。'}}
</script>
<template>
<section class="supply-card" data-testid="cocreation-invite">
 <h2>{{mode==='host'?'邀请家人或朋友':'领取家人或朋友的邀请'}}</h2>
 <p>邀请不绑定手机号，持有者满足条件即可领取一次；请只转给指定的人。领取不等于本人参加或授权。</p>
 <p v-if="recoveryBlocked" role="alert" class="supply-warning">无法核对本机原请求，为避免重复暂不能办理。<button class="outline" @click="restore">重新核对本机记录</button></p><p v-if="error" role="alert" class="supply-warning">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
 <div v-if="pending" class="supply-warning"><p>上次操作结果尚未确认，请保持原身份恢复同一次请求。</p><button class="outline" :disabled="busy||recoveryBlocked||!canUse" @click="retry">恢复同一次请求</button></div>
 <template v-if="mode==='host'">
  <p>邀请最多保留 24 小时，且不会晚于本房间截止时间；未领取前可撤销。</p>
  <button class="primary" :disabled="busy||recoveryBlocked||!!pending||!allowed||!canUse||!version" @click="create">生成一次邀请</button>
  <div v-if="secret"><p>请勿把邀请放入反馈、截图或公开位置。</p><button class="outline" :disabled="busy" @click="copy">复制邀请链接</button></div>
  <button class="outline" :disabled="busy||!allowed||!canUse" @click="loadLinks">刷新邀请状态</button>
  <ul><li v-for="link in rows" :key="link.id" :data-link-id="link.id">{{link.current_status==='ACTIVE'?(Date.parse(link.expires_at)<=Date.now()?'已到期':'待领取'):link.current_status==='CLAIMED'?'已领取':'已撤销'}} · 截止 {{new Date(link.expires_at).toLocaleString()}} <button v-if="link.current_status==='ACTIVE'" class="outline" :disabled="busy||recoveryBlocked||!!pending||!allowed" @click="revoke(link)">撤销未领邀请</button></li></ul>
 </template>
 <template v-else>
  <p>先登录并选择本人个人身份，再选择本人已实名且当前有效的成年人档案。没有档案时请先创建并完成实名核验。</p>
  <RouterLink to="/artists/people/new" class="button-link outline">创建本人档案</RouterLink>
  <label>邀请链接或凭证<input v-model="pasted" type="password" autocomplete="off" :disabled="busy" placeholder="粘贴发起人发送的邀请"></label>
  <label>本人档案<select v-model="person" :disabled="busy||!personal"><option value="">请选择本人档案</option><option v-for="p in ownPeople" :key="p.id" :value="p.id">{{p.display_name}} · {{p.id.slice(-8)}}</option></select></label>
  <button class="outline" :disabled="busy||!personal" @click="loadPeople">刷新本人档案</button>
  <button class="primary" :disabled="busy||recoveryBlocked||!!pending||!personal||!person||!pasted" @click="claim">确认领取邀请</button>
  <RouterLink v-if="room" :to="`/cocreation/rooms/${room}`" class="button-link outline">进入同一房间并填写我的参加资料</RouterLink>
 </template>
</section>
</template>
