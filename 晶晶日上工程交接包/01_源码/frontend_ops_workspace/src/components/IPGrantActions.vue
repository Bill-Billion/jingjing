<script setup lang="ts">
import {computed,reactive} from 'vue'
import {isRoyaltyInput,signedMinorInput} from '@/api/modules/procurement'
import {validSupplyId,type MediaType} from '@/api/modules/supply'
import type {LicenseRecord,LicenseWrite} from '@/api/modules/licensing'
import SupplyUpload from './SupplyUpload.vue'
const props=defineProps<{record:Extract<LicenseRecord,{kind:'GRANT'}>;partyId:string;bindings:LicenseRecord[];disabled:boolean;assets:Record<string,string[]>}>(),emit=defineEmits<{submit:[LicenseWrite];upload:[File,MediaType,string];remove:[string,string]}>()
const f=reactive({kind:'',project:'',at:'',from:'',until:'',income:'',platform:'',tax:'',distribution:'',production:'',external:'',note:'',confirmed:false})
const projects=computed(()=>props.bindings.filter(r=>r.kind==='BINDING').map(r=>r.data.project_id))
const iso=(s:string)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():''
const withdrawal=computed(()=>props.record.counterparty_id===props.partyId&&props.record.data.procurement?.mode==='REVENUE_SHARE'&&props.record.data.terms.development_until!==null&&Date.parse(props.record.data.terms.development_until)<=Date.now())
const command=computed<LicenseWrite|null>(()=>{
 if(!f.confirmed||!f.kind||!f.external.trim()||!f.note.trim()||!(props.assets.ip_event?.length)||props.record.current_status!=='ACTIVE')return null
 const id=props.record.id,proof=props.assets.ip_event,common={version:props.record.object_version,targetId:id}
 if(f.kind==='ROYALTY_STATEMENT'){
  const statement={period_from:iso(f.from),period_until:iso(f.until),income_minor:signedMinorInput(f.income),platform_minor:signedMinorInput(f.platform),tax_minor:signedMinorInput(f.tax),distribution_minor:signedMinorInput(f.distribution),production_minor:signedMinorInput(f.production),evidence_asset_ids:proof,external_reference:f.external.trim(),note:f.note.trim()}
  if(!validSupplyId(f.project)||!projects.value.includes(f.project)||!isRoyaltyInput(statement)||Date.parse(statement.period_until)>Date.now())return null
  return {...common,path:`/licensing/grants/${id}/royalty-statements`,body:{project_id:f.project,statement},resultKind:'ROYALTY_STATEMENT',label:'提交分红账单独立核验'}
 }
 const at=iso(f.at)
 if(!at||Date.parse(at)>Date.now()||(f.kind==='WITHDRAWAL_REQUEST'?!withdrawal.value:!projects.value.includes(f.project)))return null
 return {...common,path:`/licensing/grants/${id}/procurement-events`,body:{project_id:f.kind==='WITHDRAWAL_REQUEST'?null:f.project,event:f.kind,occurred_at:at,evidence_asset_ids:proof,external_reference:f.external.trim(),note:f.note.trim()},resultKind:'PROCUREMENT_EVENT',label:'提交采购事实独立核验'}
})
</script>
<template><section class="supply-card" data-testid="ip-grant-actions"><h2>原采购许可的开发、上线和收益</h2><p>项目绑定不等于已经开发或上线。提交后等待独立审核，撤回申请不代表已收回版权，账单不代表转账。</p><form @submit.prevent="command&&emit('submit',command)"><fieldset :disabled="disabled||record.current_status!=='ACTIVE'"><label>本次办理 *<select v-model="f.kind" required><option value="">请选择实际事项</option><option value="DEVELOPMENT">提交实际开发依据</option><option value="PUBLICATION">提交实际上线依据</option><option v-if="record.data.procurement?.mode==='REVENUE_SHARE'" value="ROYALTY_STATEMENT">提交分红账单</option><option v-if="withdrawal" value="WITHDRAWAL_REQUEST">作者申请核验两年未开发并撤回</option></select></label><label v-if="f.kind!=='WITHDRAWAL_REQUEST'">本许可已绑定项目 *<select v-model="f.project" required><option value="">请选择原项目</option><option v-for="id in projects" :key="id" :value="id">{{id}}</option></select></label><template v-if="f.kind==='ROYALTY_STATEMENT'"><label>账期开始 *<input v-model="f.from" type="datetime-local" required></label><label>账期结束（不得晚于当前时间） *<input v-model="f.until" type="datetime-local" required></label><label>全部发行及衍生收入（整数分） *<input v-model="f.income" inputmode="numeric" required></label><label>平台佣金（整数分） *<input v-model="f.platform" inputmode="numeric" required></label><label>税费（整数分） *<input v-model="f.tax" inputmode="numeric" required></label><label>发行成本（整数分） *<input v-model="f.distribution" inputmode="numeric" required></label><label>制作成本（整数分） *<input v-model="f.production" inputmode="numeric" required></label><p>有依据的更正可填负数；按累计净收益计算，不自动扣款或转账。重复编号及重叠账期会被拒绝。</p></template><label v-else>事实发生时间（本地时间） *<input v-model="f.at" type="datetime-local" required></label><SupplyUpload label="本次实际依据（受控材料）" :ids="assets.ip_event||[]" :disabled="disabled" @remove="id=>emit('remove','ip_event',id)" @upload="(file,media)=>emit('upload',file,media,'ip_event')"/><p>{{(assets.ip_event||[]).join('、')||'尚未上传依据'}}</p><label>外部凭证或账单编号 *<input v-model="f.external" maxlength="128" required></label><label>说明与核验依据 *<textarea v-model="f.note" maxlength="2000" required></textarea></label><label><input v-model="f.confirmed" type="checkbox">我确认本次记录及材料与原许可一致；尚待独立核验。</label><button class="primary" :disabled="disabled||!command">提交独立核验</button></fieldset></form></section></template>
