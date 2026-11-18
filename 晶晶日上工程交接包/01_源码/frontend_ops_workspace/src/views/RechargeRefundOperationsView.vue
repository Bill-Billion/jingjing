<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {useSessionStore} from '@/stores/session'
import {useBusiness} from '@/composables/useBusiness'
import {ApiError,asApiError} from '@/api/client'
import {yuanInput} from '@/api/modules/trade'
import {uuid} from '@/business/model'
import {refundBase,refundStates,refundRecord,refundPage,refundActionAllowed,refundMoney,type RechargeRefund} from '@/business/rechargeRefund'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import '@/styles/supply.css'
import '@/styles/trade.css'
const session=useSessionStore(),route=useRoute()
const ui=useBusiness(()=>({token:session.token,accountId:session.account?.id||'',partyId:session.selectedId,sessionTag:session.expiresAt||'',domain:'recharge-refund-operations'}))
const record=ref<RechargeRefund|null>(null),items=ref<RechargeRefund[]>([]),cursor=ref('')
const action=ref(''),decision=ref('REJECT'),amount=ref(''),reason=ref(''),agreed=ref(false)
const checks=ref({identity_verified:false,source_verified:false,refund_basis_verified:false,relationship_verified:false})
const readEvidence=ref<string[]>([]),fileUrl=ref(''),fileId=ref('')
let generation=0
const locked=computed(()=>ui.busy.value||!!ui.pending.value)
const dirty=computed(()=>!!action.value&&(!!reason.value||!!amount.value||agreed.value||Object.values(checks.value).some(Boolean)))
const currentId=()=>typeof route.params.recordId==='string'?route.params.recordId:''
function resetForm(){action.value='';decision.value='REJECT';amount.value='';reason.value='';agreed.value=false;checks.value={identity_verified:false,source_verified:false,refund_basis_verified:false,relationship_verified:false}}
function clearFiles(){ui.revoke();readEvidence.value=[];fileUrl.value=fileId.value=''}
function acceptDetail(data:Parameters<typeof refundRecord>[0],id:string){const r=refundRecord(data,true);if(r.id!==id)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'返回的退款不是当前原记录。'});record.value=r;return r}
async function load(next=''){
 if(ui.busy.value)return
 const g=++generation,s=session.capture(),id=currentId();record.value=null;items.value=[];resetForm();clearFiles()
 try{
  if(id&&!uuid(id))throw new ApiError({status:400,code:'INVALID_REFERENCE',message:'退款记录编号不正确。'})
  const data=await ui.load(id?`${refundBase}/${id}`:`${refundBase}?limit=20${next?`&cursor=${encodeURIComponent(next)}`:''}`,'none')
  if(!data||g!==generation||!session.current(s,true)||id!==currentId())return
  if(id)acceptDetail(data,id)
  else{const page=refundPage(data,next);items.value=page.items;cursor.value=page.next||''}
 }catch(e){if(g===generation&&session.current(s,true)){record.value=null;items.value=[];ui.error.value=asApiError(e)}}
}
watch(()=>[route.fullPath,session.account?.id,session.selectedId,session.expiresAt],()=>{generation++;record.value=null;items.value=[];cursor.value='';resetForm();clearFiles();void load()},{immediate:true})
watch(ui.securityRevision,()=>{record.value=null;items.value=[];resetForm();clearFiles()},{flush:'sync'})
// A same-party authority refresh invalidates displayed evidence and consent,
// but must not erase the original unknown command in useBusiness storage.
watch(()=>session.revision,()=>{generation++;record.value=null;items.value=[];cursor.value='';resetForm();clearFiles();ui.notice.value='办理权限已刷新，请重新读取原记录核对；结果未知的原请求仍保留。'},{flush:'sync'})
watch([action,decision,amount,reason,checks],()=>{agreed.value=false},{deep:true,flush:'sync'})
async function page(){if(locked.value||!cursor.value)return;const next=cursor.value;await load(next)}
async function refresh(){if(locked.value)return;if(dirty.value&&!window.confirm('刷新会清除本页未提交表单，是否重新读取？'))return;await load()}
function leave(){if(ui.busy.value||ui.pending.value){ui.notice.value='请先核对并恢复当前原请求，再离开本页。';return false}return !dirty.value||window.confirm('当前填写尚未提交，确认离开？')}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave)
async function evidence(id:string){
 const r=record.value;if(!r||locked.value||!r.evidence_asset_ids?.includes(id))return
 const s=session.capture(),g=generation,version=r.object_version;fileUrl.value=fileId.value=''
 const file=await ui.file(`${refundBase}/${r.id}/evidence/${id}`,'none','application/octet-stream')
 if(!file||g!==generation||!session.current(s,true)||record.value?.id!==r.id||record.value.object_version!==version)return
 fileUrl.value=file.url;fileId.value=id;if(!readEvidence.value.includes(id))readEvidence.value.push(id)
}
function formError(message:string):never{throw new ApiError({status:400,code:'RECHARGE_REFUND_FORM_INVALID',message})}
function formBody(){
 const r=record.value;if(!r||!refundActionAllowed(r,action.value))formError('请读取当前可办理的原退款记录。')
 if(action.value==='scheduling')return {}
 if(!reason.value.trim()||reason.value.trim().length>2000)formError('请填写本次办理理由（最多2000字）。')
 if(action.value==='retry')return {reason:reason.value.trim()}
 const value=yuanInput(amount.value,0)
 if(value===null||!Number.isSafeInteger(value)||value<0||value>r.requested_minor||decision.value==='REJECT'&&value!==0||decision.value==='APPROVE'&&value<1)formError('核定金额不得超过申请金额；退回填0，通过须大于0。')
 if(decision.value==='APPROVE'&&(!checks.value.identity_verified||!checks.value.source_verified||!checks.value.refund_basis_verified||r.applicant_kind==='GUARDIAN'&&!checks.value.relationship_verified||!r.evidence_asset_ids?.every(id=>readEvidence.value.includes(id))))formError('通过前须读取全部本版依据，并逐项人工核实；监护申请还须核实关系。')
 return {decision:decision.value,amount_minor:value,reason:reason.value.trim(),checks:{...checks.value}}
}
async function submit(){
 const r=record.value;if(!r||locked.value||!agreed.value)return
 try{
  const body=formBody(),key=action.value,id=r.id,s=session.capture(),g=generation
  if(ui.conflict.value)ui.confirmed.value=true // Explicit confirmation of the newly read version.
  const result=await ui.execute({path:`${refundBase}/${id}/${key}`,body,party:'none',method:'POST',version:r.object_version,label:key==='review'?'充值退款核验':key==='scheduling'?'登记原退款任务':'授权原任务重试',readPath:`${refundBase}/${id}`,readParty:'none'},data=>{const parsed=refundRecord(data,true);if(parsed.id!==id)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'办理结果记录不一致，须恢复原请求。'})})
  if(!session.current(s,true)||g!==generation)return
  if(result){acceptDetail(result,id);resetForm();clearFiles()}
  else if(ui.error.value?.status===412){record.value=null;agreed.value=false;checks.value={identity_verified:false,source_verified:false,refund_basis_verified:false,relationship_verified:false};clearFiles()}
 }catch(e){ui.error.value=asApiError(e)}
}
async function checkOriginal(){
 const p=ui.pending.value;if(!p||ui.busy.value)return
 const match=new RegExp(`^${refundBase}/([a-f0-9-]{36})/(review|scheduling|retry)$`).exec(p.path)
 if(!match||!uuid(match[1])||p.party!=='none'||p.method!=='POST'||p.readPath!==`${refundBase}/${match[1]}`){ui.notice.value='无法确认原请求范围，请保留记录交工作人员核对。';return}
 const g=generation,s=session.capture();record.value=null;resetForm();clearFiles()
 const data=await ui.check(`${refundBase}/${match[1]}`,'none')
 if(!data||g!==generation||!session.current(s,true))return
 try{acceptDetail(data,match[1]!)}catch(e){if(ui.pending.value)ui.pending.value={...ui.pending.value,checked:false};ui.error.value=asApiError(e)}
}
async function recover(){
 const p=ui.pending.value,r=record.value;if(!p?.checked||!r||ui.busy.value||p.readPath!==`${refundBase}/${r.id}`)return
 const g=generation,s=session.capture(),id=r.id
 const data=await ui.execute(undefined,d=>{const result=refundRecord(d,true);if(result.id!==id)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'恢复结果记录不一致。'})})
 if(data&&g===generation&&session.current(s,true)){acceptDetail(data,id);resetForm();clearFiles()}
}
</script>

<template>
 <main class="refund-workspace"><WorkspaceNav/><section>
  <p>资金运营 / 原路充值退款</p><h1>充值退款核验与任务</h1>
  <p>以登录账号岗位办理，不发送办事主体。每次读取、核验和文件下载均由服务器检查岗位与回避关系；当前页面不代表已取得审核权限。</p>
  <p class="supply-warning">核定、登记任务、任务重试和实际到账是不同状态。本页不填写支付回执，不直接触发供应商付款或伪造到账。</p>
  <ApiErrorAlert v-if="ui.error.value" :error="ui.error.value"/><p v-if="ui.notice.value" role="status">{{ui.notice.value}}</p><p v-if="ui.busy.value" role="status">正在核对原记录…</p>
  <section v-if="ui.pending.value" class="supply-card"><h2>原请求结果待核对</h2><p>{{ui.pending.value.label}}。原内容、版本及请求标识保持不变，不取当前表单替换。</p><button :disabled="ui.busy.value" @click="checkOriginal">读取原记录</button><button :disabled="ui.busy.value||!ui.pending.value.checked||!record" @click="recover">按原请求恢复</button></section>
  <button :disabled="locked" @click="refresh">刷新当前记录</button><RouterLink v-if="currentId()" to="/wallet-refunds/operations" class="button-link outline">返回退款清单</RouterLink>
  <section v-if="!currentId()&&!record" class="supply-card"><h2>获准查看的退款申请</h2>
   <article v-for="r in items" :key="r.id" class="refund-item"><strong>{{refundStates[r.current_status]}}</strong><p>{{r.applicant_kind==='GUARDIAN'?'监护人申请':'本人申请'}} · 申请 {{refundMoney(r.requested_minor)}} · 核定 {{refundMoney(r.amount_minor)}}</p><p class="identifier">{{r.id}}</p><RouterLink :to="`/wallet-refunds/operations/${r.id}`">读取本项详情与证据</RouterLink></article>
   <p v-if="!items.length&&!ui.busy.value&&!ui.error.value">本页没有获准记录；不据此推断全库为空。</p><button v-if="cursor" :disabled="locked" @click="page">继续读取</button>
  </section>
  <template v-if="record"><section class="supply-card"><h2>{{refundStates[record.current_status]}}</h2><p class="identifier">退款 {{record.id}} · 版本 {{record.object_version}}</p><p class="identifier">原充值 {{record.recharge_id}}</p><p>申请 {{refundMoney(record.requested_minor)}} · 已核定 {{refundMoney(record.amount_minor)}}</p><p>{{record.reason}}</p><p>{{record.applicant_kind==='GUARDIAN'?'监护人申请，须核真实有效关系':'本人申请'}}</p><p>申请时间 {{record.created_at}}</p><p>提交原退款时间 {{record.submitted_at||'未提供'}}</p><p>结算/关闭时间 {{record.settled_at||'未提供'}}；只有状态“退款已核实成功”表示成功。</p><p>原任务 {{record.task_scheduled?'已登记':'尚未登记'}}，不代表已执行或到账。</p></section>
   <section class="supply-card"><h2>本版私有核验依据</h2><p>逐份取得原文件后实际查看，再人工确认，不自动勾选核实结论。当前接口不返回文件hash，页面不声称完成hash比对。</p><div v-for="id in record.evidence_asset_ids" :key="id" class="refund-item"><span class="identifier">{{id}}</span><button :disabled="locked" @click="evidence(id)">{{readEvidence.includes(id)?'重新取得原文件':'取得本项依据'}}</button></div><a v-if="fileUrl" :href="fileUrl" :download="`refund-evidence-${fileId}`">保存刚取得的私有依据</a></section>
   <form v-if="!ui.pending.value" class="supply-card" @submit.prevent="submit"><fieldset :disabled="ui.busy.value"><h2>办理本项原退款</h2><label>操作<select v-model="action"><option value="">请选择</option><option v-if="refundActionAllowed(record,'review')" value="review">独立核验</option><option v-if="refundActionAllowed(record,'scheduling')" value="scheduling">登记或查询原退款任务</option><option v-if="refundActionAllowed(record,'retry')" value="retry">授权原任务人工重试</option></select></label>
    <template v-if="action==='review'"><label>结论<select v-model="decision"><option value="REJECT">退回</option><option value="APPROVE">通过</option></select></label><label>核定金额（元，退回填0）<input v-model="amount" inputmode="decimal"></label><label><input type="checkbox" v-model="checks.identity_verified">已实际核验申请人身份</label><label><input type="checkbox" v-model="checks.source_verified">已核验原充值来源</label><label><input type="checkbox" v-model="checks.refund_basis_verified">已核验退款依据</label><label v-if="record.applicant_kind==='GUARDIAN'"><input type="checkbox" v-model="checks.relationship_verified">已核验真实有效监护关系</label></template>
    <label v-if="action&&action!=='scheduling'">本次理由<textarea v-model="reason" maxlength="2000" rows="4"/></label><p v-if="action==='retry'">仅授权重试已有任务，不新建退款；已终态记录的重试不代表再次退款，实际由原任务条件处理。</p><label v-if="action"><input type="checkbox" v-model="agreed">已核对本记录版本与上述操作，明确提交。</label><button type="submit" :disabled="!action||!agreed||!refundActionAllowed(record,action)">提交本次办理</button>
   </fieldset></form>
  </template>
 </section></main>
</template>
<style scoped>
.refund-workspace{display:grid;grid-template-columns:minmax(210px,260px) minmax(0,1fr);gap:28px;padding:24px;max-width:1250px;margin:auto}.refund-workspace section{min-width:0}.refund-workspace p{line-height:1.7;overflow-wrap:anywhere}.refund-item{padding:14px 0;border-bottom:1px solid var(--ops-border)}.identifier{font-size:12px;overflow-wrap:anywhere}.refund-workspace fieldset{border:0;padding:0}.refund-workspace label{display:block;margin:14px 0}.refund-workspace input:not([type=checkbox]),.refund-workspace select,.refund-workspace textarea{display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:7px}.refund-workspace button{margin:6px;min-height:40px}@media(max-width:760px){.refund-workspace{display:block;padding:16px}}
</style>
