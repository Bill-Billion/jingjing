<script setup lang="ts">
import { commercialUses } from '@/api/modules/rights'
import { computed, reactive, ref, watch, onUnmounted } from 'vue'
import { validSupplyId,type SupplyAsset } from '@/api/modules/supply'
import { sha256,features,purposes,delegatedActions,artistMediaTypes,type ArtistDetail,type ArtistServices,type ArtistRecord } from '@/api/modules/artists'
import { money } from '@/api/modules/trade'
export type ArtistFormAction='PERSON'|'AVATAR'|'IDENTITY'|'CONSENT'|'DELEGATION'|'VARIANT'|'HALO'|'LISTING'|'SERVICE'|'SUPPLEMENT'|'APPEAL'|'WITHDRAW'|'REVIEW'|'RESULT'
const props=defineProps<{action:ArtistFormAction;disabled:boolean;person?:ArtistDetail|null;record?:ArtistRecord|null;services?:ArtistServices|null;avatarId?:string;readEvidence?:string[];assets?:SupplyAsset[];canManageMaterials?:boolean;reviewServices?:ArtistRecord[];uploadMaterial?:(file:File)=>Promise<SupplyAsset|null>}>(),emit=defineEmits<{submit:[body:unknown];readPortraits:[assetIds:string[]];inspectPortrait:[asset:SupplyAsset]}>()
const form=reactive<Record<string,string>>({avatar_id:props.avatarId||'',level:'',renewal_reminder:'false',audition_public:'false',ownership_promise:'false',primary_portrait_asset_id:'',replace_materials:'false'})
const selectedFeatures=ref<string[]>([]),selectedPurposes=ref<string[]>([]),selectedActions=ref<string[]>([])
const titles:Record<ArtistFormAction,string>={PERSON:'建立本人的真人档案',AVATAR:'建立一个数字人档案',IDENTITY:'核对实名服务会话',CONSENT:'本人确认这次用途',DELEGATION:'本人确认机构代办范围',VARIANT:'保存造型或声音新版本',HALO:'提交认证申请',LISTING:'申请公开展示',SERVICE:'选择已审核的服务',SUPPLEMENT:'补充原申请材料',APPEAL:'对原审核提出异议',WITHDRAW:'撤回本次同意、委托或展示',REVIEW:'独立审核这份申请',RESULT:'记录创建服务的实际结果'}
type Field={key:string;label:string;type?:'text'|'textarea'|'datetime-local'|'select'|'ids';required?:boolean;max?:number;options?:Record<string,string>;id?:boolean}
const f=(key:string,label:string,extra:Omit<Field,'key'|'label'>={}):Field=>({key,label,required:true,...extra})
const avatar=()=>f('avatar_id','具体数字人',{type:'select',options:Object.fromEntries((props.person?.avatars||[]).map(a=>[a.id,a.data.display_name]))})
const evidence=()=>f('evidence_asset_ids','已上传证明材料编号（每行一个）',{type:'ids'})
const offer=computed(()=>props.services?.offers.items.find(o=>o.spec_id===form.spec_id))
const reviewService=computed(()=>props.reviewServices?.find(r=>r.id===form.service_id&&r.kind==='SERVICE'))
const newReview=computed(()=>props.action==='HALO'&&form.level==='2'&&(reviewService.value?.kind==='SERVICE'?reviewService.value.data.specification.service.rule_version==='CONTRACT_20261029':props.services?.offers.contract_policy==='CONTRACT_20261029'))
const selectedCommercialUses=ref<string[]>([])
const replaceable=computed(()=>props.action==='SUPPLEMENT'&&props.record?.kind==='HALO'&&props.record.data.rule_version==='CONTRACT_20261029')
const classified=computed(()=>newReview.value||replaceable.value&&form.replace_materials==='true')
const freeOffer=computed(()=>props.services?.offers.current_status==='CONFIGURED'?props.services.offers.free_services?.find(o=>form.spec_id==='free:'+o.kind):undefined)
const classifiedFields=()=>[f('model_card_asset_id','模卡（PNG、JPEG或PDF）',{id:true}),f('lifestyle_asset_ids','生活照（PNG或JPEG，1—10张）',{type:'ids'}),f('full_body_asset_ids','全身照（PNG或JPEG，1—10张）',{type:'ids'}),f('personal_introduction','个人简介',{type:'textarea',max:2000}),f('resume','文字简历',{type:'textarea',max:8000})]
let disposed=false;onUnmounted(()=>disposed=true)
const uploadError=ref('')
const pendingUpload=ref<{key:string;hash:string;size:number;media:string}|null>(null)
function attachUpload(asset:SupplyAsset,key:string){form[key]=key==='model_card_asset_id'?asset.id:[...new Set([...split(form[key]),asset.id])].join('\n');confirmed.checked=false;pendingUpload.value=null}
watch(()=>[props.disabled,props.assets],()=>{const p=pendingUpload.value;if(disposed||props.disabled||!p)return;const asset=props.assets?.find(a=>a.content_sha256===p.hash&&a.byte_size===p.size&&a.media_type===p.media&&a.purpose==='REVIEW_EVIDENCE'&&a.owner_party_id===props.person?.person.owner_party_id);if(asset)attachUpload(asset,p.key)},{deep:true})
async function uploadClassified(key:string,event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file||!props.uploadMaterial||pendingUpload.value)return;uploadError.value='';const types=key==='model_card_asset_id'?['image/png','image/jpeg','application/pdf']:['image/png','image/jpeg'];if(!types.includes(file.type)){uploadError.value='请使用指定的模卡或照片格式。';input.value='';return}const hash=await sha256(file);if(disposed)return;pendingUpload.value={key,hash,size:file.size,media:file.type};const asset=await props.uploadMaterial(file);if(disposed)return;if(asset)attachUpload(asset,key);else if(!props.disabled)pendingUpload.value=null;input.value=''}
const fields=computed<Field[]>(()=>{
 switch(props.action){
  case 'PERSON':case 'AVATAR':return [f('display_name',props.action==='PERSON'?'本人艺名或展示名称':'数字人名称',{max:120})]
  case 'IDENTITY':return [f('session_ref','实名服务提供的会话引用',{max:128})]
  case 'CONSENT':return [avatar(),f('grantee_party_id','本次获准使用的主体编号',{id:true}),f('territories','允许使用的地区（每行一个）',{type:'textarea',max:3000}),f('valid_from','生效时间',{type:'datetime-local'}),f('valid_until','结束时间',{type:'datetime-local'}),f('terms','本次明确同意的用途和限制',{type:'textarea',max:8000}),evidence()]
  case 'DELEGATION':return [f('organization_party_id','受托机构主体编号',{id:true}),f('relation_id','已由本人接受的MCN合作关系编号',{id:true}),f('valid_from','代办开始时间',{type:'datetime-local'}),f('valid_until','代办结束时间',{type:'datetime-local'}),f('terms','代办约定及限制',{type:'textarea',max:8000}),evidence()]
  case 'VARIANT':return [avatar(),f('kind','版本类型',{type:'select',options:{LOOK:'造型',VOICE:'声音'}}),f('display_name','本版名称',{max:120}),f('previous_version_id','上一版本编号（首版留空）',{id:true,required:false}),f('consent_id','同一数字人已通过的私人档案同意编号',{id:true}),f('material_asset_ids','已上传形象或声音素材编号（每行一个）',{type:'ids'})]
  case 'HALO':return [f('level','申请级别',{type:'select',options:{'1':'L1 本人权属审核（免费）','2':'L2 认证（须原审核服务已核实付款）'}}),...(form.level==='2'?[f('service_id','原L2审核服务请求编号',{id:true})]:[]),...(classified.value?classifiedFields():[]),evidence()]
  case 'LISTING':return [avatar(),f('display_name','公开名称',{max:120}),f('city','公开城市',{max:100}),f('introduction','公开简介',{type:'textarea',max:2000}),f('tags','公开标签（每行一个，最多15项）',{type:'textarea',max:600}),f('consent_id','同一数字人的已批准公开展示同意编号',{id:true}),f('look_version_id','已保存的造型版本编号',{id:true}),f('voice_version_id','声音版本编号（可选，未指定时留空）',{id:true,required:false}),f('preview_asset_ids','本次指定公开的预览材料编号（每行一个，最多6项）',{type:'ids'})]
  case 'SERVICE':return [f('spec_id','平台当前已审核服务',{type:'select',options:Object.fromEntries([...(props.services?.offers.current_status==='CONFIGURED'?props.services.offers.free_services||[]:[]).map(o=>['free:'+o.kind,(o.kind==='AVATAR_CREATION'?'基础形象与声音创建':'资产托管')+' · 永久免费']),...(props.services?.offers.items||[]).filter(o=>o.specification.service.halo_level!==3).map(o=>[o.spec_id,o.title+' · '+money(o.price_minor)])])}),...(freeOffer.value||offer.value&&offer.value.specification.service.kind!=='HALO_REVIEW'?[avatar()]:[])]
  case 'SUPPLEMENT':return [...(classified.value?classifiedFields():[]),evidence(),f('note','本次补充说明',{type:'textarea',max:2000})]
  case 'APPEAL':return [f('reason','异议事实与理由',{type:'textarea',max:2000}),evidence()]
  case 'WITHDRAW':return [f('reason','撤回理由',{type:'textarea',max:2000})]
  case 'REVIEW':return [f('decision','本次独立决定',{type:'select',options:{APPROVE:'核对通过',REJECT:'拒绝',NEEDS_MATERIAL:'要求补充材料'}}),f('reason','本次核对事实与理由',{type:'textarea',max:2000})]
  case 'RESULT':return [f('outcome','实际创建结果',{type:'select',options:{ARCHIVE_DELIVERED:'私人档案交付已核对',ATTEMPT_FAILED:'本次尝试失败',UNDELIVERABLE:props.record?.kind==='SERVICE'&&props.record.data.payment_requirement==='NONE'?'无法交付（免费服务失败，无付款退款）':'无法交付，待原订单退款'}}),...(form.outcome==='ARCHIVE_DELIVERED'?[f('archive_asset_id','原造型版本引用的档案材料编号',{id:true})]:[]),f('reason','已核对结果及依据',{type:'textarea',max:2000})]
 }
})
const split=(value='')=>value.split(/[\n,，]/).map(v=>v.trim()).filter(Boolean)
const previewIds=computed(()=>split(form.preview_asset_ids))
const canReadPortraits=computed(()=>previewIds.value.length>0&&previewIds.value.length<=6&&previewIds.value.every(validSupplyId)&&new Set(previewIds.value).size===previewIds.value.length)
const portraitOptions=computed(()=>(props.canManageMaterials?props.assets||[]:[]).filter((a):a is SupplyAsset&{media_type:'image/jpeg'|'image/png'}=>previewIds.value.includes(a.id)&&a.owner_party_id===props.person?.person.owner_party_id&&a.purpose==='AVATAR_MATERIAL'&&a.current_status==='READY'&&['image/jpeg','image/png'].includes(a.media_type)))
const selectedPortrait=computed(()=>portraitOptions.value.find(a=>a.id===form.primary_portrait_asset_id))
watch(portraitOptions,()=>{if(form.primary_portrait_asset_id&&!selectedPortrait.value)form.primary_portrait_asset_id=''},{flush:'sync'})
const iso=(value='')=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():''}
const payload=computed(()=>{
 for(const field of fields.value){const value=(form[field.key]||'').trim();if(field.required&&!value||field.max&&Array.from(value).length>field.max||field.id&&value&&!validSupplyId(value)||field.type==='select'&&value&&!Object.hasOwn(field.options||{},value)||field.type==='ids'&&(!split(value).length||split(value).some(v=>!validSupplyId(v))||new Set(split(value)).size!==split(value).length||split(value).length>(['lifestyle_asset_ids','full_body_asset_ids'].includes(field.key)?10:field.key==='preview_asset_ids'?6:30))||field.type==='datetime-local'&&!iso(value))return null}
 const ids=(key:string)=>split(form[key]),value=(key:string)=>(form[key]||'').trim();const materials=classified.value?{model_card_asset_id:value('model_card_asset_id'),lifestyle_asset_ids:ids('lifestyle_asset_ids'),full_body_asset_ids:ids('full_body_asset_ids'),personal_introduction:value('personal_introduction'),resume:value('resume')}:undefined;if(materials&&new Set([materials.model_card_asset_id,...materials.lifestyle_asset_ids,...materials.full_body_asset_ids,...ids('evidence_asset_ids')]).size>30)return null
 switch(props.action){
  case 'PERSON':case 'AVATAR':return {display_name:value('display_name')}
  case 'IDENTITY':return {session_ref:value('session_ref')}
  case 'CONSENT':if(selectedPurposes.value.includes('STOCK_COMMERCIAL')&&!selectedCommercialUses.value.length)return null;if(!selectedFeatures.value.length||!selectedPurposes.value.length||ids('territories').length>30||!ids('territories').length||ids('territories').some(v=>Array.from(v).length>100)||iso(form.valid_from)>=iso(form.valid_until))return null;return {avatar_id:value('avatar_id'),consent:{features:[...selectedFeatures.value],purposes:[...selectedPurposes.value],...(selectedPurposes.value.includes('STOCK_COMMERCIAL')?{stock_commercial_uses:[...selectedCommercialUses.value]}:{}),grantee_party_id:value('grantee_party_id'),territories:ids('territories'),valid_from:iso(form.valid_from),valid_until:iso(form.valid_until),terms:value('terms'),evidence_asset_ids:ids('evidence_asset_ids')}}
  case 'DELEGATION':if(!selectedActions.value.length||iso(form.valid_from)>=iso(form.valid_until))return null;return {delegation:{organization_party_id:value('organization_party_id'),relation_id:value('relation_id'),actions:[...selectedActions.value],valid_from:iso(form.valid_from),valid_until:iso(form.valid_until),terms:value('terms'),evidence_asset_ids:ids('evidence_asset_ids')}}
  case 'VARIANT':return {avatar_id:value('avatar_id'),kind:value('kind'),variant:{previous_version_id:value('previous_version_id')||null,display_name:value('display_name'),material_asset_ids:ids('material_asset_ids'),consent_id:value('consent_id')}}
  case 'HALO':if(form.ownership_promise!=='true')return null;return {level:Number(form.level),service_id:form.level==='1'?null:value('service_id'),ownership_promise:true,evidence_asset_ids:ids('evidence_asset_ids'),...(materials?{certification_materials:materials}:{})}
  case 'LISTING':if(!ids('tags').length||ids('tags').length>15||ids('tags').some(v=>Array.from(v).length>40)||value('primary_portrait_asset_id')&&!selectedPortrait.value)return null;return {avatar_id:value('avatar_id'),listing:{display_name:value('display_name'),city:value('city'),introduction:value('introduction'),tags:ids('tags'),consent_id:value('consent_id'),look_version_id:value('look_version_id'),voice_version_id:value('voice_version_id')||null,audition_public:form.audition_public==='true',preview_asset_ids:ids('preview_asset_ids'),primary_portrait_asset_id:value('primary_portrait_asset_id')||null}}
  case 'SERVICE':if(freeOffer.value)return {avatar_id:value('avatar_id'),kind:freeOffer.value.kind,rule_version:'CONTRACT_20261029'};if(!offer.value)return null;return {avatar_id:offer.value.specification.service.kind==='HALO_REVIEW'?null:value('avatar_id'),spec_id:offer.value.spec_id,renewal_reminder:offer.value.specification.service.kind==='AVATAR_HOSTING'&&form.renewal_reminder==='true'}
  case 'SUPPLEMENT':return {evidence_asset_ids:ids('evidence_asset_ids'),note:value('note'),...(materials?{certification_materials:materials}:{})}
  case 'APPEAL':return {reason:value('reason'),evidence_asset_ids:ids('evidence_asset_ids')}
  case 'WITHDRAW':return {reason:value('reason')}
  case 'REVIEW':return {decision:value('decision'),reason:value('reason')}
  case 'RESULT':return {outcome:value('outcome'),archive_asset_id:form.outcome==='ARCHIVE_DELIVERED'?value('archive_asset_id'):null,reason:value('reason')}
 }
})
const confirmed=reactive({checked:false})
watch(()=>props.record?.object_version,()=>{confirmed.checked=false})
watch(()=>[form.preview_asset_ids,form.primary_portrait_asset_id],()=>{confirmed.checked=false},{flush:'sync'})
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
  <fieldset :disabled="disabled"><label v-if="replaceable" class="artist-check"><input v-model="form.replace_materials" type="checkbox" true-value="true" false-value="false">替换分类资料（不选则保留原分类版本）</label><p v-if="classified" class="muted">每类单独上传本人私有审核材料。其他授权证据仍另填；合计去重最多30份。补件替换保留旧版本，不另收费。</p><p v-if="uploadError" role="alert">{{uploadError}}</p>
   <div class="artist-fields">
    <label v-for="field in fields" :key="field.key" :class="{'artist-field-wide':field.type==='textarea'||field.type==='ids'}"><span>{{field.label}}<span v-if="field.required" class="required"> *</span></span>
     <select v-if="field.type==='select'" v-model="form[field.key]" :data-testid="'artists-field-'+field.key" :required="field.required"><option value="">请明确选择</option><option v-for="(label,value) in field.options" :key="value" :value="value">{{label}}</option></select>
     <textarea v-else-if="field.type==='textarea'||field.type==='ids'" v-model="form[field.key]" :data-testid="'artists-field-'+field.key" :maxlength="field.max||2000" :required="field.required" :rows="field.type==='ids'?3:4"></textarea>
     <input v-else v-model="form[field.key]" :data-testid="'artists-field-'+field.key" :type="field.type||'text'" :maxlength="field.max||2000" :required="field.required">
     <input v-if="classified&&['model_card_asset_id','lifestyle_asset_ids','full_body_asset_ids'].includes(field.key)&&uploadMaterial" :data-testid="'artists-upload-'+field.key" type="file" :accept="field.key==='model_card_asset_id'?'image/png,image/jpeg,application/pdf':'image/png,image/jpeg'" @change="uploadClassified(field.key,$event)">
    </label>
   </div>
   <template v-if="action==='CONSENT'">
    <fieldset class="artist-choices"><legend>本人同意使用的特征 *</legend><label v-for="(label,key) in features" :key="key"><input v-model="selectedFeatures" type="checkbox" :value="key">{{label}}</label></fieldset>
    <fieldset class="artist-choices"><legend>这次明确允许的用途 *</legend><label v-for="(label,key) in purposes" :key="key"><input v-model="selectedPurposes" type="checkbox" :value="key" :disabled="key==='LONG_LIVED_MODEL'">{{label}}</label></fieldset><fieldset v-if="selectedPurposes.includes('STOCK_COMMERCIAL')" class="artist-choices"><legend>本人明确允许的商用用途 *</legend><label v-for="(label,key) in commercialUses" :key="key"><input v-model="selectedCommercialUses" type="checkbox" :value="key">{{label}}</label><p>只允许以下填写地域与期间内的所选用途。个人授权不替代商用，机构不能代本人同意。</p></fieldset>
   </template>
   <fieldset v-if="action==='DELEGATION'" class="artist-choices"><legend>逐项选择代办权限 *</legend><label v-for="(label,key) in delegatedActions" :key="key"><input v-model="selectedActions" type="checkbox" :value="key">{{label}}</label></fieldset>
   <label v-if="action==='HALO'" class="artist-check"><input :checked="form.ownership_promise==='true'" type="checkbox" @change="form.ownership_promise=($event.target as HTMLInputElement).checked?'true':'false'">我确认所提交材料属于本人，具有本次审核所需的权利。</label>
   <section v-if="action==='LISTING'" class="artist-portrait-choice" data-testid="artists-portrait-choice">
    <h3>主肖像（可选）</h3><p class="muted">只可选择本次预览材料中的 JPEG 或 PNG 图片。不选择时显示占位；更换肖像随本次展示申请独立审核，通过后才公开。</p>
    <button type="button" class="outline" data-testid="artists-read-portraits" :disabled="disabled||!canReadPortraits||!canManageMaterials" @click="emit('readPortraits',[...previewIds])">读取本次可选肖像</button>
    <p v-if="!canManageMaterials" class="muted">主肖像图片需由本人或具有材料管理权限的受托机构核对。当前仍可不设置主肖像，继续提交展示申请。</p>
    <label>本次主肖像<select v-model="form.primary_portrait_asset_id" :disabled="!canManageMaterials" data-testid="artists-field-primary_portrait_asset_id"><option value="">不设置主肖像</option><option v-for="asset in portraitOptions" :key="asset.id" :value="asset.id">{{artistMediaTypes[asset.media_type]}} · {{asset.id}}</option></select></label>
    <p v-if="!portraitOptions.length" class="muted">尚无已核实的可选图片。填写本次预览材料编号后，读取并核对图片。</p>
    <button v-if="selectedPortrait" type="button" class="outline" data-testid="artists-inspect-portrait" @click="emit('inspectPortrait',selectedPortrait)">查看所选主肖像</button>
    <label class="artist-check"><input :checked="form.audition_public==='true'" type="checkbox" @change="form.audition_public=($event.target as HTMLInputElement).checked?'true':'false'">另行开启试镜展示；关闭不等于撤回整个公开展示申请。</label>
   </section>
   <section v-if="freeOffer&&action==='SERVICE'" data-testid="artists-free-offer"><h3>永久免费，无需付款或续费</h3><p>{{freeOffer.specification.terms}}</p><p>创建申请等待人工处理；托管只登记免费权益。长期模型与云服务未启用。历史收费单仍按原合同办理。</p></section><template v-if="offer&&action==='SERVICE'"><p v-if="offer.specification.service.failure_policy==='REVIEW_FEE_NON_REFUNDABLE'" role="status">10元为一次人工审核费，不支持常规退款。付款不代表认证通过；补件沿用原费用。请在付款前核对。</p><section class="artist-offer"><h3>{{offer.title}}</h3><p class="trade-amount">{{money(offer.price_minor)}}</p><dl class="supply-facts"><div><dt>规格版本</dt><dd>{{offer.specification.version}}</dd></div><div><dt>失败后可重试次数</dt><dd>{{offer.specification.service.retry_limit}}</dd></div><div v-if="offer.specification.service.hosting_months"><dt>托管月数</dt><dd>{{offer.specification.service.hosting_months}}</dd></div><div><dt>服务内容</dt><dd>{{offer.specification.deliverables.join('、')}}</dd></div></dl><p class="long-text">{{offer.specification.terms}}</p></section><label v-if="offer.specification.service.kind==='AVATAR_HOSTING'" class="artist-check"><input :checked="form.renewal_reminder==='true'" type="checkbox" @change="form.renewal_reminder=($event.target as HTMLInputElement).checked?'true':'false'">开启续托管提醒；不自动续费，不自动扣款。</label></template>
   <label v-if="needsConfirmation" class="artist-check"><input v-model="confirmed.checked" data-testid="artists-form-confirm" type="checkbox">我已核对当前真人、数字人、用途、材料和本次明确约定。</label>
   <button class="primary" data-testid="artists-form-submit" :disabled="disabled||!payload||needsConfirmation&&!confirmed.checked">{{action==='SERVICE'?(freeOffer?'提交免费申请':'保存服务申请，后续另行报价'):action==='REVIEW'?'提交这份版本的审核决定':'提交本次明确内容'}}</button>
  </fieldset>
 </form>
</template>
