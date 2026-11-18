<script setup lang="ts">
import {computed,onUnmounted,ref,watch} from 'vue'
import {useSessionStore} from '@/stores/session'
import {readBusiness,type BusinessData} from '@/api/modules/business'
import {asApiError} from '@/api/client'
import {uuid} from '@/business/model'
import BusinessDetails from './BusinessDetails.vue'
const props=defineProps<{notice:BusinessData;disabled?:boolean}>()
const session=useSessionStore()
const rows=ref<BusinessData[]>([]),currentSnapshot=ref<BusinessData|null>(null)
const cursor=ref<string|null>(null),busy=ref(false),loaded=ref(false),error=ref('')
const seen=new Set<string>()
let generation=0
const object=(v:unknown):v is BusinessData=>!!v&&typeof v==='object'&&!Array.isArray(v)
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0
const locked=computed(()=>!!props.disabled||busy.value||!session.token)
const scope=computed(()=>JSON.stringify([session.token,session.account?.id,session.revision,session.selectedId,props.notice.id,props.notice.object_version]))
function clear(){generation++;rows.value=[];currentSnapshot.value=null;cursor.value=null;seen.clear();loaded.value=false;busy.value=false;error.value=''}
watch(scope,clear,{flush:'sync'})
function snapshot(v:unknown,id:string):v is BusinessData {
 return object(v)&&v.notice_id===id&&version(v.object_version)&&hash(v.notice_sha256)&&
  (v.revision_id===null||uuid(v.revision_id))&&object(v.notice)
}
function sameSnapshot(a:BusinessData,b:BusinessData){
 return a.notice_id===b.notice_id&&a.object_version===b.object_version&&
  a.notice_sha256===b.notice_sha256&&a.revision_id===b.revision_id
}
async function load(more=false){
 if(locked.value||!uuid(props.notice.id)||props.notice.kind!=='NOTICE'||props.notice.parent_id!=null||more&&!cursor.value)return
 const id=props.notice.id,before=more?cursor.value:null,identity=session.capture(),g=++generation
 const active=()=>g===generation&&session.current(identity,true)&&props.notice.id===id
 busy.value=true;error.value=''
 if(!more){rows.value=[];currentSnapshot.value=null;cursor.value=null;seen.clear();loaded.value=false}
 try{
  // Account-level NOTICE_REVIEW access: never send X-Acting-Party.
  const result=await readBusiness('/notices/announcements/'+id+'/history?limit=20'+(before?'&cursor='+encodeURIComponent(before):''),
   {token:identity.token!,accountId:session.account!.id})
  if(!active())return
  const d=result.data,n=d.next_cursor
  if(d.notice_id!==id||!snapshot(d.current,id)||!Array.isArray(d.items)||
   !(n===null||uuid(n)&&n!==before&&!seen.has(n)))throw new Error('历史返回与原通告或游标不一致。')
  if(more&&currentSnapshot.value&&!sameSnapshot(currentSnapshot.value,d.current)){
   rows.value=[];currentSnapshot.value=null;cursor.value=null;seen.clear();loaded.value=false
   throw new Error('原通告已更新，已清除旧分页；请重新读取修订历史。')
  }
  const page=d.items as unknown[],ids=new Set<string>()
  for(const row of page){
   if(!object(row)||!uuid(row.id)||ids.has(row.id)||row.kind!=='NOTICE_REVISION'||
    row.parent_id!==id||!version(row.object_version)||!hash(row.content_sha256)||
    !['IN_REVIEW','APPROVED','REJECTED','WITHDRAWN'].includes(String(row.current_status))||
    !object(row.data)||!snapshot(row.data.base_snapshot,id)||!object(row.data.notice)||
    typeof row.data.reason!=='string')throw new Error('修订记录无法与原通告完整核对。')
   ids.add(row.id)
  }
  if(more&&rows.value.some(r=>ids.has(String(r.id))))throw new Error('修订分页重复，请重新读取。')
  rows.value=more?[...rows.value,...page as BusinessData[]]:page as BusinessData[]
  currentSnapshot.value=d.current;cursor.value=n as string|null
  if(n)seen.add(String(n))
  loaded.value=true
 }catch(e){
  if(active()){
   const a=asApiError(e)
   // Do not retain previously readable private revisions after any failed refresh.
   rows.value=[];currentSnapshot.value=null;cursor.value=null;seen.clear();loaded.value=false
   error.value=[401,403,404].includes(a.status)?'当前无权读取本通告修订，旧内容已清除。请核对审核岗位与原记录。':
    (e instanceof Error?e.message:a.message)||'读取失败；这不是没有修改申请。'
  }
 }finally{if(g===generation)busy.value=false}
}
onUnmounted(()=>{generation++})
</script>
<template>
<section class="supply-card" data-testid="notice-revision-history">
 <h2>原通告修订历史与待审修改</h2>
 <p>按当前原通告读取。仅有 NOTICE_REVIEW 岗位权限才可取得完整历史；此处不是全局待审队列。</p>
 <button class="outline" :disabled="locked" @click="load(false)">读取或刷新本通告修订</button>
 <p v-if="busy" role="status">正在核对权限与原通告……</p>
 <p v-if="error" role="alert">{{error}}</p>
 <template v-if="currentSnapshot">
  <p>本轮原通告版本 {{currentSnapshot.object_version}}。审核时仍核对修订及原通告的最新状态。</p>
  <details><summary>核对原通告当前快照</summary><BusinessDetails :value="currentSnapshot"/></details>
 </template>
 <p v-if="loaded&&!rows.length">此页没有修订记录{{cursor?'，仍有下一页待读取。':'。'}}</p>
 <article v-for="row in rows" :key="String(row.id)" class="business-action-option">
  <h3>修改申请 {{String(row.id).slice(0,8)}} · {{row.current_status}} · 版本 {{row.object_version}}</h3>
  <details><summary>核对原版、修改内容与申请理由</summary><BusinessDetails :value="row"/></details>
  <RouterLink v-if="row.current_status==='IN_REVIEW'&&!locked" class="button-link outline" :to="'/notices/reviews/'+row.id">进入本修订独立审核</RouterLink>
  <p v-else-if="row.current_status==='IN_REVIEW'">请先完成当前读取或原办理，再进入审核。</p>
 </article>
 <button v-if="cursor" class="outline" :disabled="locked" @click="load(true)">继续读取修订历史</button>
 <p>历史阅读不代表审核通过。审核页使用修订自身版本、原请求编号和明确核验；原通告发生变化时不得自动覆盖旧版。</p>
</section>
</template>
