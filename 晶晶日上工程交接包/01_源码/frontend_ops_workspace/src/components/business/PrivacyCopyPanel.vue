<script setup lang="ts">
import {computed,onUnmounted,ref,watch} from 'vue'
import {useSessionStore} from '@/stores/session'
import {readBusiness,type BusinessData} from '@/api/modules/business'
import {asApiError} from '@/api/client'
import {uuid} from '@/business/model'
import {availableCopySources,copySources,copyPath,checkCopyPage,copyBundle} from '@/business/privacyCopy'
import BusinessDetails from './BusinessDetails.vue'
const props=defineProps<{request:BusinessData;disabled?:boolean}>()
const emit=defineEmits<{prepared:[file:File];invalidated:[];dirty:[value:boolean]}>()
const session=useSessionStore(),sourceKey=ref(''),target=ref(''),pages=ref<BusinessData[]>([]),targets=ref<BusinessData[]>([]),targetCursor=ref<string|null>(null),targetLoaded=ref(false),collected=ref<BusinessData[]>([]),remaining=ref(''),error=ref(''),busy=ref(false),options=ref<BusinessData[]>([])
let generation=0
const targetSeen=new Set<string>()
const requestId=computed(()=>String(props.request.id||''))
const requestBody=computed(()=>props.request.request as BusinessData|undefined)
const sources=computed(()=>availableCopySources(requestBody.value?.scopes))
const source=computed(()=>sources.value.find(s=>s.key===sourceKey.value))
const next=computed(()=>pages.value.length?pages.value[pages.value.length-1]!.next_cursor as string|null:null)
const locked=computed(()=>busy.value||props.disabled||!session.token)
const scope=computed(()=>JSON.stringify([session.token,session.revision,session.account?.id,requestId.value,props.request.object_version,requestBody.value]))
function clear(){generation++;pages.value=[];targets.value=[];targetCursor.value=null;targetLoaded.value=false;targetSeen.clear();collected.value=[];options.value=[];remaining.value='';target.value='';sourceKey.value='';error.value='';busy.value=false;emit('invalidated');emit('dirty',false)}
watch(scope,clear,{flush:'sync'})
watch(()=>[remaining.value,collected.value.length],()=>emit('dirty',!!remaining.value||!!collected.value.length))
function changeSource(){generation++;pages.value=[];targets.value=[];targetCursor.value=null;targetLoaded.value=false;targetSeen.clear();target.value='';error.value=''}
function changeTarget(){generation++;pages.value=[];error.value=''}
async function run(action:(read:(path:string)=>Promise<BusinessData>)=>Promise<void>){
 if(locked.value)return
 const g=generation,snapshot=session.capture();busy.value=true;error.value=''
 const current=()=>g===generation&&session.current(snapshot,true)
 try{await action(async path=>{const response=await readBusiness(path,{token:snapshot.token!,accountId:session.account!.id});if(!current())throw new Error('context changed');return response.data})}
 catch(e){if(current()){const a=asApiError(e);if([401,403,404].includes(a.status)){clear();error.value='当前申请已无法访问，读取内容和待上传整理文件已清除。'}else error.value=a.message||'读取失败，请按原选择重试；此次不计为空记录。'}}
 finally{if(current())busy.value=false}
}
async function loadOptions(){await run(async read=>{const d=await read('/privacy/operations/requests/'+requestId.value+'/copy-options');if(!Array.isArray(d.categories)||d.request_completion!=='NOT_CONFIRMED')throw new Error('分类说明未通过核对');options.value=d.categories as BusinessData[]})}
async function loadTargets(more=false){const s=source.value;if(!s?.target)return
 await run(async read=>{const index=copySources.find(x=>x.key===(s.target==='order'?'trade:ORDERS':'data:PRIVATE_STORY'))!;const cursor=more?targetCursor.value:null;const d=checkCopyPage(await read(copyPath(requestId.value,index,'',cursor,true)),index,'',cursor)
 if(more&&d.next_cursor&&targetSeen.has(String(d.next_cursor)))throw new Error('分页重复，请重新读取');if(!more)targetSeen.clear();if(d.next_cursor)targetSeen.add(String(d.next_cursor));
 targets.value=more?[...targets.value,...d.items as BusinessData[]]:d.items as BusinessData[];targetCursor.value=d.next_cursor as string|null;targetLoaded.value=true})
}
async function loadPage(more=false){const s=source.value;if(!s)return
 await run(async read=>{const cursor=more?next.value:null;const d=checkCopyPage(await read(copyPath(requestId.value,s,target.value,cursor,true)),s,target.value,cursor,more?pages.value.map(p=>String(p.next_cursor||'')):[])
 pages.value=more?[...pages.value,d]:[d]})
}
function collect(){const s=source.value;if(!s||!pages.value.length)return
 try{const b=copyBundle(requestId.value,s,target.value,pages.value,remaining.value);collected.value=[...collected.value.filter(x=>!(x.source===b.source&&x.target_id===b.target_id)),b]}catch{error.value='请说明尚未提供的类别、原件、留存依据及后续处理。'}
}
async function prepare(){
 if(locked.value||!collected.value.length||!remaining.value.trim())return
 await run(async read=>{await read('/privacy/operations/requests/'+requestId.value+'/copy-options');
 const body={request_id:requestId.value,request_completion:'NOT_CONFIRMED',remaining:remaining.value.trim(),copies:collected.value}
 const file=new File([JSON.stringify(body,null,2)],'本人资料-'+requestId.value+'.txt',{type:'text/plain'})
 if(file.size>8*1024*1024){error.value='整理文件超过8MiB，请分批整理并分别上传。';return}
 emit('prepared',file)
 })
}
onUnmounted(()=>{generation++;emit('dirty',false)})
</script>
<template><section class="supply-card" data-testid="privacy-copy-panel"><h2>按当前申请整理本人资料</h2><p>所有读取绑定上方同一份申请。仅整理获准范围；原件、已删除记录、第三方信息及未读完的页须分别说明。未知时间保留为未知。</p>
<button class="outline" :disabled="locked" @click="loadOptions">读取本申请各类范围与未提供原因</button><BusinessDetails v-for="(o,i) in options" :key="i" :value="o"/>
<label>选择本次资料<select aria-label="选择本次资料" v-model="sourceKey" :disabled="locked" @change="changeSource"><option value="">请选择</option><option v-for="s in sources" :key="s.key" :value="s.key">{{s.label}}</option></select></label>
<template v-if="source?.target"><button class="outline" :disabled="locked" @click="loadTargets(false)">读取本申请可选{{source.target==='order'?'订单':'故事'}}</button><label>具体{{source.target==='order'?'订单':'故事'}}<select :aria-label="source.target==='order'?'具体订单':'具体故事'" v-model="target" :disabled="locked" @change="changeTarget"><option value="">请选择已读取记录</option><option v-for="t in targets" :key="String(t.id)" :value="t.id">{{t.title||t.category_title||t.product_type||'本人记录'}} · {{String(t.id).slice(0,8)}}</option></select></label><p v-if="targetLoaded&&!targets.length">本页没有可选记录{{targetCursor?'，仍可继续读取下一页。':'。'}}</p><button v-if="targetCursor" :disabled="locked" @click="loadTargets(true)">继续读取可选记录</button></template>
<button class="outline" :disabled="locked||!source||!!source.target&&!target" @click="loadPage(false)">读取此类第一页</button>
<p v-if="error" role="alert" class="supply-warning">{{error}}</p><p v-if="busy" role="status">正在核对当前申请权限并读取……</p>
<template v-if="pages.length"><p>已读取 {{pages.length}} 页。{{next?'尚有下一页，本类别未读完。':'本次选择的分页已读完；不代表整份申请完成。'}}</p><details v-for="(p,i) in pages" :key="i"><summary>核对第 {{i+1}} 页实际资料</summary><BusinessDetails :value="p"/></details><button v-if="next" :disabled="locked" @click="loadPage(true)">继续读取此类下一页</button></template>
<label>未提供内容、实际留存依据与后续处理<textarea aria-label="未提供内容、实际留存依据与后续处理" v-model="remaining" :disabled="locked" maxlength="12000" rows="4" placeholder="逐项说明未读完、未选择、原件缺失或须人工核权的内容；不能只写全部完成。"/></label>
<button :disabled="locked||!pages.length||!remaining.trim()" @click="collect">加入本次整理文件</button>
<p v-if="collected.length">已加入 {{collected.length}} 项分类或具体记录；重新加入相同选择会更新其分页。</p>
<ul><li v-for="(c,i) in collected" :key="i">{{c.source_label}} · {{c.selected_source_complete?'该选择分页已读完':'该选择尚有下一页'}} <button :disabled="locked" @click="collected.splice(i,1)">移除此项</button></li></ul>
<button :disabled="locked||!collected.length||!remaining.trim()" @click="prepare">生成待核对文件，带入下方上传</button><p>生成后先核对内容并脱敏，再在“准备本次私有材料”上传，选入逐项答复，交另一岗位独立审核。此处不自动发布答复。</p>
</section></template>
