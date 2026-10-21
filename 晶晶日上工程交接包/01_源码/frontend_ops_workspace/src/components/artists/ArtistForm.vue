<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { validSupplyId } from '@/api/modules/supply'
import { features,purposes,delegatedActions,type ArtistDetail,type ArtistServices,type ArtistRecord } from '@/api/modules/artists'
import { money } from '@/api/modules/trade'
export type ArtistFormAction='PERSON'|'AVATAR'|'IDENTITY'|'CONSENT'|'DELEGATION'|'VARIANT'|'HALO'|'LISTING'|'SERVICE'|'SUPPLEMENT'|'APPEAL'|'WITHDRAW'|'REVIEW'|'RESULT'
const props=defineProps<{action:ArtistFormAction;disabled:boolean;person?:ArtistDetail|null;record?:ArtistRecord|null;services?:ArtistServices|null;avatarId?:string;readEvidence?:string[]}>(),emit=defineEmits<{submit:[body:unknown]}>()
const form=reactive<Record<string,string>>({avatar_id:props.avatarId||'',level:'',renewal_reminder:'false',audition_public:'false',ownership_promise:'false'})
const selectedFeatures=ref<string[]>([]),selectedPurposes=ref<string[]>([]),selectedActions=ref<string[]>([])
const titles:Record<ArtistFormAction,string>={PERSON:'建立本人的真人档案',AVATAR:'建立一个数字人档案',IDENTITY:'核对实名服务会话',CONSENT:'本人确认这次用途',DELEGATION:'本人确认机构代办范围',VARIANT:'保存造型或声音新版本',HALO:'提交认证申请',LISTING:'申请公开展示',SERVICE:'选择已审核的服务',SUPPLEMENT:'补充原申请材料',APPEAL:'对原审核提出异议',WITHDRAW:'撤回本次同意、委托或展示',REVIEW:'独立审核这份申请',RESULT:'记录创建服务的实际结果'}
type Field={key:string;label:string;type?:'text'|'textarea'|'datetime-local'|'select'|'ids';required?:boolean;max?:number;options?:Record<string,string>;id?:boolean}
const f=(key:string,label:string,extra:Omit<Field,'key'|'label'>={}):Field=>({key,label,required:true,...extra})
const avatar=()=>f('avatar_id','具体数字人',{type:'select',options:Object.fromEntries((props.person?.avatars||[]).map(a=>[a.id,a.data.display_name]))})
const evidence=()=>f('evidence_asset_ids','已上传证明材料编号（每行一个）',{type:'ids'})
const offer=computed(()=>props.services?.offers.items.find(o=>o.spec_id===form.spec_id))
const fields=computed<Field[]>(()=>{
 switch(props.action){
  case 'PERSON':case 'AVATAR':return [f('display_name',props.action==='PERSON'?'本人艺名或展示名称':'数字人名称',{max:120})]
  case 'IDENTITY':return [f('session_ref','实名服务提供的会话引用',{max:128})]
  case 'CONSENT':return [avatar(),f('grantee_party_id','本次获准使用的主体编号',{id:true}),f('territories','允许使用的地区（每行一个）',{type:'textarea',max:3000}),f('valid_from','生效时间',{type:'datetime-local'}),f('valid_until','结束时间',{type:'datetime-local'}),f('terms','本次明确同意的用途和限制',{type:'textarea',max:8000}),evidence()]
  case 'DELEGATION':return [f('organization_party_id','受托机构主体编号',{id:true}),f('relation_id','已由本人接受的MCN合作关系编号',{id:true}),f('valid_from','代办开始时间',{type:'datetime-local'}),f('valid_until','代办结束时间',{type:'datetime-local'}),f('terms','代办约定及限制',{type:'textarea',max:8000}),evidence()]
  case 'VARIANT':return [avatar(),f('kind','版本类型',{type:'select',options:{LOOK:'造型',VOICE:'声音'}}),f('display_name','本版名称',{max:120}),f('previous_version_id','上一版本编号（首版留空）',{id:true,required:false}),f('consent_id','同一数字人已通过的私人档案同意编号',{id:true}),f('material_asset_ids','已上传形象或声音素材编号（每行一个）',{type:'ids'})]
  case 'HALO':return [f('level','申请级别',{type:'select',options:{'1':'L1 本人权属审核（免费）','2':'L2 认证（须原审核服务已核实付款）'}}),...(form.level==='2'?[f('service_id','原L2审核服务请求编号',{id:true})]:[]),evidence()]
  case 'LISTING':return [avatar(),f('display_name','公开名称',{max:120}),f('city','公开城市',{max:100}),f('introduction','公开简介',{type:'textarea',max:2000}),f('tags','公开标签（每行一个，最多15项）',{type:'textarea',max:600}),f('consent_id','同一数字人的已批准公开展示同意编号',{id:true}),f('look_version_id','已保存的造型版本编号',{id:true}),f('voice_version_id','声音版本编号（不展示声音时留空）',{id:true,required:false}),f('preview_asset_ids','本次指定公开的预览材料编号（每行一个，最多6项）',{type:'ids'})]
  case 'SERVICE':return [f('spec_id','平台当前已审核服务',{type:'select',options:Object.fromEntries((props.services?.offers.items||[]).filter(o=>o.specification.service.halo_level!==3).map(o=>[o.spec_id,o.title+' · '+money(o.price_minor)]))}),...(offer.value&&offer.value.specification.service.kind!=='HALO_REVIEW'?[avatar()]:[])]
  case 'SUPPLEMENT':return [evidence(),f('note','本次补充说明',{type:'textarea',max:2000})]
  case 'APPEAL':return [f('reason','异议事实与理由',{type:'textarea',max:2000}),evidence()]
  case 'WITHDRAW':return [f('reason','撤回理由',{type:'textarea',max:2000})]
  case 'REVIEW':return [f('decision','本次独立决定',{type:'select',options:{APPROVE:'核对通过',REJECT:'拒绝',NEEDS_MATERIAL:'要求补充材料'}}),f('reason','本次核对事实与理由',{type:'textarea',max:2000})]
  case 'RESULT':return [f('outcome','实际创建结果',{type:'select',options:{ARCHIVE_DELIVERED:'私人档案交付已核对',ATTEMPT_FAILED:'本次尝试失败',UNDELIVERABLE:'无法交付，待原订单退款'}}),...(form.outcome==='ARCHIVE_DELIVERED'?[f('archive_asset_id','原造型版本引用的档案材料编号',{id:true})]:[]),f('reason','已核对结果及依据',{type:'textarea',max:2000})]
 }
})
const split=(value='')=>value.split(/[\n,，]/).map(v=>v.trim()).filter(Boolean)
const iso=(value='')=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():''}
const payload=computed(()=>{
 for(const field of fields.value){const value=(form[field.key]||'').trim();if(field.required&&!value||field.max&&Array.from(value).length>field.max||field.id&&value&&!validSupplyId(value)||field.type==='select'&&value&&!Object.hasOwn(field.options||{},value)||field.type==='ids'&&(!split(value).length||split(value).some(v=>!validSupplyId(v))||new Set(split(value)).size!==split(value).length||split(value).length>(field.key==='preview_asset_ids'?6:30))||field.type==='datetime-local'&&!iso(value))return null}
 const ids=(key:string)=>split(form[key]),value=(key:string)=>(form[key]||'').trim()
 switch(props.action){
  case 'PERSON':case 'AVATAR':return {display_name:value('display_name')}
  case 'IDENTITY':return {session_ref:value('session_ref')}
  case 'CONSENT':if(!selectedFeatures.value.length||!selectedPurposes.value.length||ids('territories').length>30||!ids('territories').length||ids('territories').some(v=>Array.from(v).length>100)||iso(form.valid_from)>=iso(form.valid_until))return null;return {avatar_id:value('avatar_id'),consent:{features:[...selectedFeatures.value],purposes:[...selectedPurposes.value],grantee_party_id:value('grantee_party_id'),territories:ids('territories'),valid_from:iso(form.valid_from),valid_until:iso(form.valid_until),terms:value('terms'),evidence_asset_ids:ids('evidence_asset_ids')}}
  case 'DELEGATION':if(!selectedActions.value.length||iso(form.valid_from)>=iso(form.valid_until))return null;return {delegation:{organization_party_id:value('organization_party_id'),relation_id:value('relation_id'),actions:[...selectedActions.value],valid_from:iso(form.valid_from),valid_until:iso(form.valid_until),terms:value('terms'),evidence_asset_ids:ids('evidence_asset_ids')}}
  case 'VARIANT':return {avatar_id:value('avatar_id'),kind:value('kind'),variant:{previous_version_id:value('previous_version_id')||null,display_name:value('display_name'),material_asset_ids:ids('material_asset_ids'),consent_id:value('consent_id')}}
  case 'HALO':if(form.ownership_promise!=='true')return null;return {level:Number(form.level),service_id:form.level==='1'?null:value('service_id'),ownership_promise:true,evidence_asset_ids:ids('evidence_asset_ids')}
  case 'LISTING':if(!ids('tags').length||ids('tags').length>15||ids('tags').some(v=>Array.from(v).length>40))return null;return {avatar_id:value('avatar_id'),listing:{display_name:value('display_name'),city:value('city'),introduction:value('introduction'),tags:ids('tags'),consent_id:value('consent_id'),look_version_id:value('look_version_id'),voice_version_id:value('voice_version_id')||null,audition_public:form.audition_public==='true',preview_asset_ids:ids('preview_asset_ids')}}
  case 'SERVICE':if(!offer.value)return null;return {avatar_id:offer.value.specification.service.kind==='HALO_REVIEW'?null:value('avatar_id'),spec_id:offer.value.spec_id,renewal_reminder:offer.value.specification.service.kind==='AVATAR_HOSTING'&&form.renewal_reminder==='true'}
  case 'SUPPLEMENT':return {evidence_asset_ids:ids('evidence_asset_ids'),note:value('note')}
  case 'APPEAL':return {reason:value('reason'),evidence_asset_ids:ids('evidence_asset_ids')}
  case 'WITHDRAW':return {reason:value('reason')}
  case 'REVIEW':return {decision:value('decision'),reason:value('reason')}
  case 'RESULT':return {outcome:value('outcome'),archive_asset_id:form.outcome==='ARCHIVE_DELIVERED'?value('archive_asset_id'):null,reason:value('reason')}
 }
})
const confirmed=reactive({checked:false})
watch(()=>props.record?.object_version,()=>{confirmed.checked=false})
const needsConfirmation=computed(()=>['CONSENT','DELEGATION','HALO','LISTING','REVIEW','RESULT','WITHDRAW','SERVICE'].includes(props.action))
</script>
<template>
 <form class="artist-form" :data-testid="'artists-form-'+action" @submit.prevent="payload && (!needsConfirmation || confirmed.checked) && emit('submit',payload)">
  <h2>{{ titles[action] }}</h2>
  <p v-if="action==='CONSENT'" class="muted">分别选择形象、声音及这次用途。私人保存、公开展示、重新生成互不替代；机构不能替本人作出同意。</p>
  <p v-if="action==='DELEGATION'" class="muted">先由本人接受MCN合作，再明确本次代办范围和有效期。委托不转移所有权，不允许机构代签或代作本人授权。</p>
  <p v-if="action==='IDENTITY'" class="muted">这里只提交实名服务的会话引用，不能自行填写“核验通过”、年龄或身份结果。服务未启用时不能提交。</p>
  <p v-if="action==='HALO'" class="muted">L1免费；L2采用同一笔已核实的审核服务。补件沿用原申请及原费用，付款不代表审核通过。L3尚未开放。</p>
  <p v-if="action==='SERVICE'" class="muted">以所选商品版本为准。申请服务、确认报价、付款、签署和实际交付分别办理；提醒不构成自动扣款授权。</p>
  <p v-if="action==='RESULT'" class="muted">记录内部私人档案的实际交付或失败。长期模型尚未启用；退款待办不等于已退款。</p>
  <p v-if="action==='APPEAL'" class="muted">异议另建记录，保留原拒绝结果，原申请不会自动改成通过。</p>
  <fieldset :disabled="disabled">
   <div class="artist-fields">
    <label v-for="field in fields" :key="field.key" :class="{'artist-field-wide':field.type==='textarea'||field.type==='ids'}"><span>{{field.label}}<span v-if="field.required" class="required"> *</span></span>
     <select v-if="field.type==='select'" v-model="form[field.key]" :data-testid="'artists-field-'+field.key" :required="field.required"><option value="">请明确选择</option><option v-for="(label,value) in field.options" :key="value" :value="value">{{label}}</option></select>
     <textarea v-else-if="field.type==='textarea'||field.type==='ids'" v-model="form[field.key]" :data-testid="'artists-field-'+field.key" :maxlength="field.max||2000" :required="field.required" :rows="field.type==='ids'?3:4"></textarea>
     <input v-else v-model="form[field.key]" :data-testid="'artists-field-'+field.key" :type="field.type||'text'" :maxlength="field.max||2000" :required="field.required">
    </label>
   </div>
   <template v-if="action==='CONSENT'">
    <fieldset class="artist-choices"><legend>本人同意使用的特征 *</legend><label v-for="(label,key) in features" :key="key"><input v-model="selectedFeatures" type="checkbox" :value="key">{{label}}</label></fieldset>
    <fieldset class="artist-choices"><legend>这次明确允许的用途 *</legend><label v-for="(label,key) in purposes" :key="key"><input v-model="selectedPurposes" type="checkbox" :value="key" :disabled="key==='LONG_LIVED_MODEL'">{{label}}</label></fieldset>
   </template>
   <fieldset v-if="action==='DELEGATION'" class="artist-choices"><legend>逐项选择代办权限 *</legend><label v-for="(label,key) in delegatedActions" :key="key"><input v-model="selectedActions" type="checkbox" :value="key">{{label}}</label></fieldset>
   <label v-if="action==='HALO'" class="artist-check"><input :checked="form.ownership_promise==='true'" type="checkbox" @change="form.ownership_promise=($event.target as HTMLInputElement).checked?'true':'false'">我确认所提交材料属于本人，具有本次审核所需的权利。</label>
   <label v-if="action==='LISTING'" class="artist-check"><input :checked="form.audition_public==='true'" type="checkbox" @change="form.audition_public=($event.target as HTMLInputElement).checked?'true':'false'">另行开启试镜展示；关闭不等于撤回整个公开展示申请。</label>
   <template v-if="offer&&action==='SERVICE'"><section class="artist-offer"><h3>{{offer.title}}</h3><p class="trade-amount">{{money(offer.price_minor)}}</p><dl class="supply-facts"><div><dt>规格版本</dt><dd>{{offer.specification.version}}</dd></div><div><dt>失败后可重试次数</dt><dd>{{offer.specification.service.retry_limit}}</dd></div><div v-if="offer.specification.service.hosting_months"><dt>托管月数</dt><dd>{{offer.specification.service.hosting_months}}</dd></div><div><dt>服务内容</dt><dd>{{offer.specification.deliverables.join('、')}}</dd></div></dl><p class="long-text">{{offer.specification.terms}}</p></section><label v-if="offer.specification.service.kind==='AVATAR_HOSTING'" class="artist-check"><input :checked="form.renewal_reminder==='true'" type="checkbox" @change="form.renewal_reminder=($event.target as HTMLInputElement).checked?'true':'false'">开启续托管提醒；不自动续费，不自动扣款。</label></template>
   <label v-if="needsConfirmation" class="artist-check"><input v-model="confirmed.checked" data-testid="artists-form-confirm" type="checkbox">我已核对当前真人、数字人、用途、材料和本次明确约定。</label>
   <button class="primary" data-testid="artists-form-submit" :disabled="disabled||!payload||needsConfirmation&&!confirmed.checked">{{action==='SERVICE'?'保存服务申请，后续另行报价':action==='REVIEW'?'提交这份版本的审核决定':'提交本次明确内容'}}</button>
  </fieldset>
 </form>
</template>
