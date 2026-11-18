<script setup lang="ts">
import {computed,ref,watch,onMounted,onUnmounted} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {useSessionStore} from '@/stores/session'
import {useOrganizationBatch,type BatchItem} from '@/stores/organizationBatch'
import {useBusiness,type BusinessCommand} from '@/composables/useBusiness'
import {readBusiness,rowsOf,rowData,type BusinessData} from '@/api/modules/business'
import {ApiError,asApiError} from '@/api/client'
import {batchActions,batchStatus,validateBatch,batchResultLink} from '@/business/organizationBatch'
import {matchingFilters} from '@/business/matching'
import {uuid} from '@/business/model'
import BusinessDetails from './BusinessDetails.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
const emit=defineEmits<{lock:[value:boolean]}>()
const session=useSessionStore(),batch=useOrganizationBatch()
const ui=useBusiness(()=>({token:session.token,accountId:session.account?.id||'',partyId:session.selectedId,sessionTag:session.expiresAt||'',domain:'organization-batch'}))
const mode=ref('PRICE_REVISION'),targets=ref<BusinessData[]>([]),target=ref(''),cursor=ref<string|null>(null),detail=ref<BusinessData|null>(null),members=ref<BusinessData[]>([]),account=ref(''),price=ref(''),reason=ref(''),agreed=ref(false),reading=ref(false),receipt=ref<BusinessData|null>(null)
const denied=ref(false),receiptItems=ref<BatchItem[]>([])
const seen=new Set<string>()
let generation=0
const items=computed(()=>denied.value?[]:((ui.pending.value?.body as {items?:BatchItem[]})?.items||(receipt.value?receiptItems.value:batch.items)))
const locked=computed(()=>reading.value||ui.busy.value||!!ui.pending.value||!!receipt.value)
const scope=computed(()=>JSON.stringify([session.token,session.revision,session.selectedId,session.account?.id]))
function reset(){generation++;denied.value=false;receiptItems.value=[];targets.value=[];target.value='';cursor.value=null;detail.value=null;members.value=[];account.value='';price.value='';reason.value='';receipt.value=null;agreed.value=false;seen.clear();reading.value=false}
watch(scope,reset,{flush:'sync'})
watch(()=>[!!ui.pending.value,!!receipt.value],()=>{batch.frozen=!!ui.pending.value||!!receipt.value;emit('lock',!!ui.pending.value||ui.busy.value)},{immediate:true,flush:'sync'})
watch(ui.busy,value=>emit('lock',value||!!ui.pending.value),{flush:'sync'})
watch(ui.securityRevision,()=>{denied.value=true;receiptItems.value=[];targets.value=[];members.value=[];detail.value=null;receipt.value=null;batch.items=[]},{flush:'sync'})
watch(mode,()=>{targets.value=[];target.value='';cursor.value=null;detail.value=null;seen.clear();generation++},{flush:'sync'})
const identity=()=>({token:session.token!,accountId:session.account!.id,actingParty:session.selectedId})
async function read(action:(read:(p:string)=>Promise<BusinessData>)=>Promise<void>){
 if(locked.value||!batch.available)return;const g=generation,snapshot=session.capture();reading.value=true;ui.error.value=null
 try{await action(async p=>{const r=await readBusiness(p,identity());if(g!==generation||!session.current(snapshot,true))throw new Error('办理身份已变化');return r.data})}
 catch(e){if(g===generation&&session.current(snapshot,true)){ui.error.value=asApiError(e);if([401,403,404].includes(ui.error.value.status)){reset();batch.items=[]}}}
 finally{if(g===generation)reading.value=false}
}
async function loadTargets(more=false){await read(async get=>{const path=mode.value==='PRICE_REVISION'?'/stock/listings':'/production/projects',previous=more?cursor.value:null;const d=await get(path+'?limit=20'+(previous?'&cursor='+encodeURIComponent(previous):''));const rows=rowsOf(d),n=d.next_cursor
 if(!Array.isArray(d.items)||rows.some(r=>!uuid(r.id))||!(n===null||typeof n==='string'&&n!==previous&&(!more||!seen.has(n))))throw new Error('记录分页未通过核对')
 if(!more)seen.clear();if(n)seen.add(String(n));targets.value=more?[...targets.value,...rows]:rows;cursor.value=n as string|null
})}
async function selectTarget(){detail.value=null;await read(async get=>{const id=target.value;if(!uuid(id))return;const d=await get((mode.value==='PRICE_REVISION'?'/stock/listings/':'/production/records/')+id);if(d.id!==id||!Number.isSafeInteger(d.object_version))throw new Error('所选记录版本无法核对');detail.value=d})}
async function loadMembers(){await read(async get=>{const rows:BusinessData[]=[];let after:string|null=null;const seenMembers=new Set<string>();do{const d=await get('/parties/'+session.selectedId+'/members?limit=100'+(after?'&cursor='+encodeURIComponent(after):''));rows.push(...rowsOf(d));const n=d.next_cursor;if(n!==null&&(typeof n!=='string'||seenMembers.has(n)))throw new Error('成员分页重复');after=n as string|null;if(after)seenMembers.add(after)}while(after);members.value=rows.filter(r=>r.current_status==='ACTIVE'&&uuid(r.account_id))})}
function add(){
 if(locked.value||!detail.value||!agreed.value)return
 try{const input:BusinessData={record_id:detail.value.id,expected_version:detail.value.object_version}
 if(mode.value==='PRICE_REVISION'){input.unit_minor=matchingFilters('STOCK',{max_price_minor:price.value}).max_price_minor;if(!Number.isSafeInteger(input.unit_minor)||Number(input.unit_minor)<1)throw new Error('请填写大于零的新价格。')}
 else{if(!members.value.some(r=>r.account_id===account.value)||!reason.value.trim())throw new Error('请选择已读取的当前成员，并说明分派原因。');input.assignee_account_id=account.value;input.reason=reason.value.trim()}
 batch.add(mode.value,input);agreed.value=false;ui.notice.value='已加入清单，尚未提交；下方可核对整批。'
 }catch(e){ui.error.value=asApiError(e)}
}
function validate(data:BusinessData,command:BusinessCommand){
 const original=(command.body as {items:BatchItem[]}).items;validateBatch(data,original,session.selectedId)
 denied.value=false;receiptItems.value=original;receipt.value=data;command.readPath='/engagement/mcn/batches/'+data.id;command.readParty='required'
 if((data.items as BusinessData[]).some(r=>['RETRY_REQUIRED','NOT_RUN'].includes(String(r.status))))throw new ApiError({status:503,code:'BATCH_ITEMS_RETRY_REQUIRED',message:'本批有待恢复项，请先读取原批次，再按原内容恢复；已成功项不会重办。'})
}
async function submit(){
 if(locked.value||!batch.available||!batch.items.length||!agreed.value)return
 await ui.execute({path:'/engagement/mcn/batches',body:{items:batch.items},party:'required',method:'POST',label:'本机构逐项批量办理'},validate)
}
async function check(){
 const command=ui.pending.value;if(!command||ui.busy.value||reading.value)return
 const g=generation,snapshot=session.capture();reading.value=true;ui.error.value=null;command.checked=false
 try{const d=(await readBusiness(command.readPath||'/engagement/mcn/batches?operation_key='+encodeURIComponent(command.key),identity())).data
 if(g!==generation||!session.current(snapshot,true))return
 validateBatch(d,(command.body as {items:BatchItem[]}).items,session.selectedId);denied.value=false;receiptItems.value=(command.body as {items:BatchItem[]}).items;receipt.value=d;command.readPath='/engagement/mcn/batches/'+d.id;command.checked=true;ui.notice.value='已查到同一批次，逐项核对后可恢复原请求。'
 }catch(e){if(g===generation&&session.current(snapshot,true)){const a=asApiError(e);if(a.status===404&&a.code==='BATCH_NOT_FOUND'&&!command.readPath){command.checked=true;ui.notice.value='尚未登记此原请求。可以沿原编号、原内容恢复，服务器会防止重复办理。'}else{ui.error.value=a;if([401,403,404].includes(a.status)){denied.value=true;receiptItems.value=[];receipt.value=null;targets.value=[];detail.value=null;members.value=[];batch.items=[]}}}}
 finally{if(g===generation)reading.value=false}
}
async function recover(){if(denied.value||reading.value||!ui.pending.value?.checked)return;await ui.execute(undefined,validate)}
function finish(){if(ui.pending.value||ui.busy.value)return;receipt.value=null;receiptItems.value=[];batch.frozen=false;batch.reset();agreed.value=false}
function leave(){if(ui.pending.value||ui.busy.value||reading.value){ui.notice.value='请先核对原批次并恢复；原内容不能在办理中改变。';return false}return true}
function unload(e:BeforeUnloadEvent){if(ui.pending.value||batch.items.length){e.preventDefault();e.returnValue=''}}
onBeforeRouteLeave(leave);onBeforeRouteUpdate(leave)
onMounted(()=>window.addEventListener('beforeunload',unload))
onUnmounted(()=>{generation++;window.removeEventListener('beforeunload',unload);emit('lock',false)})
</script>
<template><section class="supply-card" data-testid="organization-batch"><h2>机构批量办理</h2><p>最多20项。成功表示已提交，独立审核、公开上架与价格生效分别核对；新价格不改写旧订单。切换账号或机构会清空未提交清单。</p><p v-if="!batch.available">请先在左侧选择当前获准的机构身份。</p><ApiErrorAlert :error="ui.error.value"/><p role="status">{{ui.notice.value}}</p>
<template v-if="batch.available"><div class="supply-actions"><RouterLink to="/artists" class="button-link outline">在艺人原表单加入送审</RouterLink><RouterLink to="/stock/listings" class="button-link outline">在影片原表单加入送审</RouterLink><RouterLink to="/engagement/staff" class="button-link outline">在原分派表单加入经纪分派</RouterLink></div>
<label>准备具体记录<select aria-label="准备具体记录" v-model="mode" :disabled="locked"><option value="PRICE_REVISION">现货调价送审</option><option value="PRODUCTION_ASSIGNMENT">制作负责人分派</option></select></label><button :disabled="locked" @click="loadTargets()">读取当前机构获准记录</button>
<label>选择具体记录<select aria-label="选择具体记录" v-model="target" :disabled="locked" @change="selectTarget"><option value="">请选择</option><option v-for="r in targets" :key="String(r.id)" :value="r.id">{{rowData(r).title||r.title||r.kind||'机构记录'}} · {{String(r.id).slice(0,8)}}</option></select></label><button v-if="cursor" :disabled="locked" @click="loadTargets(true)">继续读取可选记录</button>
<details v-if="detail"><summary>核对所选记录与版本</summary><BusinessDetails :value="detail"/></details>
<label v-if="mode==='PRICE_REVISION'">新价格（元，仅拟定待审规格）<input aria-label="新价格（元，仅拟定待审规格）" v-model="price" inputmode="decimal" :disabled="locked"></label>
<template v-else><button :disabled="locked" @click="loadMembers">读取本机构当前成员</button><label>接手成员<select aria-label="接手成员" v-model="account" :disabled="locked"><option value="">请选择</option><option v-for="m in members" :key="String(m.account_id)" :value="m.account_id">{{m.display_name||'机构成员'}} · {{String(m.account_id).slice(0,8)}}</option></select></label><label>分派原因<textarea aria-label="分派原因" v-model="reason" maxlength="2000" :disabled="locked"/></label></template>
<label><input v-model="agreed" type="checkbox" :disabled="locked">已核对具体对象、版本与本次内容</label><button :disabled="locked||!detail||!agreed" @click="add">加入本批（暂不提交）</button>
</template>
<p v-if="denied">当前权限无法核对原批次，已清除页面中的旧内容。恢复权限后须重新读取同一原批次。</p><h3>本批操作预览 · {{items.length}} 项</h3><article v-for="(item,i) in items" :key="item.key"><h4>{{i+1}}. {{batchActions[item.action]}}</h4><details v-if="!receipt||(receipt.items as BusinessData[])[i]?.status!=='UNAVAILABLE'"><summary>核对本项完整内容与版本</summary><BusinessDetails :value="item.input"/></details><button v-if="!locked" @click="batch.items.splice(i,1)">移除此项</button>
<template v-if="receipt"><p>{{batchStatus[String((receipt.items as BusinessData[])[i]?.status)]}}</p><p v-if="(receipt.items as BusinessData[])[i]?.error_code">原因：{{(receipt.items as BusinessData[])[i]?.error_code}}。保留原记录核对，不把拒绝当未执行成功。</p><RouterLink v-if="batchResultLink(item,(receipt.items as BusinessData[])[i]!)" :to="batchResultLink(item,(receipt.items as BusinessData[])[i]!)!" class="button-link outline">回到本项业务核对</RouterLink></template></article>
<button :disabled="locked||!items.length||!agreed||!batch.available" @click="submit">确认整批逐项提交</button>
<template v-if="ui.pending.value"><p>原请求已保留，不能改内容或换一个编号重发。已成功项在恢复时不会重复办理。</p><button :disabled="ui.busy.value||reading" @click="check">先查同一原批次</button><button :disabled="ui.busy.value||reading||denied||!ui.pending.value.checked" @click="recover">按原编号、原内容恢复</button></template>
<button v-if="receipt&&!ui.pending.value" @click="finish">本批已核对，清空并准备下一批</button>
</section></template>
