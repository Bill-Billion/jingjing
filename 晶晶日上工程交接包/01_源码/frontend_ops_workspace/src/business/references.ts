import { commercialUses } from '@/api/modules/rights'
import {type BusinessData,rowData,recordId,rowsOf,readBusiness} from '@/api/modules/business'
import { ApiError } from '@/api/client'
import {uuid,type PartyMode} from './model'
import {display} from './labels'
import { isStorySummary } from '@/api/modules/customizationOwn'
import { creationPage,type CreationKind } from './cocreationCreation'
export interface ReferenceOption {value:string;label:string;record:BusinessData}
export interface ReferenceSource {path:string;party:PartyMode;creation?:CreationKind|'STORY';privacyPolicy?:{requestId:string;action?:string;scope?:string};delivery?:{booking:string;person:string;avatar:string;kind:'PHOTO'|'VIDEO'|'CONSENT'};filter?:(r:BusinessData)=>boolean}
export function sourceFor(key:string,context:Record<string,unknown>,domain:string,party:string):ReferenceSource|null{
 const person=context.person_id||context.seller_person_id
 if(domain==='auditions'&&context.audition_delivery===true&&['photos','videos','consent_id'].includes(key)){
  if(!uuid(context.record_id)||!uuid(context.delivery_person_id)||!uuid(context.delivery_avatar_id))return null
  const kind=key==='photos'?'PHOTO':key==='videos'?'VIDEO':'CONSENT'
  return{path:`/auditions/bookings/${context.record_id}/delivery-options?kind=${kind}&limit=20`,party:'required',delivery:{booking:context.record_id,person:context.delivery_person_id,avatar:context.delivery_avatar_id,kind}}
 }
 if(domain==='cocreation'){
  if(key==='request_id')return{path:'/customization-requests?limit=20',party:'required',creation:'STORY',filter:r=>['SUBMITTED','INTAKE'].includes(String(r.current_status))}
  if(['producer_party_id','rule_id'].includes(key))return uuid(context.request_id)?{path:`/cocreation/creation-options?${new URLSearchParams({request_id:context.request_id,kind:key==='rule_id'?'RULE':'PRODUCER',limit:'20'})}`,party:'required',creation:key==='rule_id'?'RULE':'PRODUCER'}:null
 }
 if(domain==='stock'){
  if(context.stock_publication===true&&['spec_id','rule_id'].includes(key))return key==='rule_id'?{path:'/stock/sales-publication-sources?kind=RULE',party:'none'}:{path:'/stock/sales-publication-sources?kind=SPEC'+(uuid(context.seller_party_id)?'&seller_party_id='+context.seller_party_id:''),party:'none'}
  if(['spec_id','rule_id'].includes(key))return{path:'/stock/sales-publications',party:'required',filter:r=>key==='spec_id'||r.spec_id===context.spec_id}
  if(['avatar_id','consent_id'].includes(key))return uuid(person)?{path:`/stock/participant-options?person_id=${person}`,party:'required'}:null
 }
 if(domain==='auditions'&&['rule_id','avatar_id','public_consent_id'].includes(key))return uuid(person)?{path:`/auditions/offer-options?person_id=${person}&kind=${key==='rule_id'?'RULE':'AUTHORIZATION'}`,party:'required'}:null
 if(key==='artist_consent_ids')key='consent_id'
 if(key==='person_ids')key='person_id'
 if(key==='supply_consent_id'||key==='consent_ids')return{path:'/supply/records?kind=CONSENT',party:'required'}
 if(domain==='notices'&&key==='consent_id'&&uuid(context.notice_id))return uuid(person)?{path:`/notices/submission-options?${new URLSearchParams({person_id:person,notice_id:context.notice_id})}`,party:'required'}:null
 if(domain==='notices'&&key==='consent_id'&&uuid(person))return{path:`/artists/people/${person}/records?kind=CONSENT`,party:'required',filter:r=>{const data=rowData(r);return r.current_status==='APPROVED'&&Array.isArray(data.purposes)&&data.purposes.includes('COOPERATION_SUBMISSION')&&(!uuid(context.target_party_id)||data.grantee_party_id===context.target_party_id)}}
 if(['person_id','seller_person_id'].includes(key))return{path:'/artists/people',party:'required'}
 const artistKinds:Record<string,string>={avatar_id:'AVATAR',consent_id:'CONSENT',public_consent_id:'CONSENT',look_version_id:'LOOK',voice_version_id:'VOICE',previous_version_id:'LOOK'}
 if(key==='avatar_id')return uuid(person)?{path:`/artists/people/${person}`,party:'required'}:null
 if(artistKinds[key])return uuid(person)?{path:`/artists/people/${person}/records?kind=${artistKinds[key]}`,party:'required'}:null
 if(['spec_id','quote_id','order_id'].includes(key))return{path:`/trade/records?kind=${key==='spec_id'?'SPEC':key==='quote_id'?'QUOTE':'ORDER'}`,party:'required',...(key==='spec_id'&&domain==='stock'?{filter:(r:BusinessData)=>r.current_status==='PUBLISHED'&&(rowData(r).product_profile as BusinessData|undefined)?.type==='STOCK_VIDEO'}:{})}
 if(key==='party_id'&&domain==='participation'&&uuid(context.project_id))return{path:`/projects/projects/${context.project_id}/records?kind=CANDIDATE`,party:'required',filter:r=>r.current_status==='CONFIRMED'}
 if(key==='target_id'&&domain==='privacy'&&context.action==='FILE_ERASURE'&&uuid(context.request_id))return{path:`/privacy/requests/${context.request_id}/file-options?kind=FILE`,party:'none'}
 if(key==='policy_rule_id'&&domain==='privacy'&&uuid(context.request_id)){
  const requestId=context.request_id,action=String(context.action||''),scope=String(context.scope||'')
  if(['PROFILE','ARTIST_MATERIALS','PRIVATE_STORY','CONTRACTS','TRANSACTIONS','CONTENT','DIGITAL_MODELS'].includes(scope))return{path:`/privacy/operations/requests/${requestId}/retention-policy-options?${new URLSearchParams({scope,limit:'20'})}`,party:'none',privacyPolicy:{requestId,scope}}
  if(['PROFILE_CORRECTION','FILE_ERASURE','ACCOUNT_CLOSURE','RESTRICT_CONTENT','RELEASE_CONTENT'].includes(action))return{path:`/privacy/${['RESTRICT_CONTENT','RELEASE_CONTENT'].includes(action)?'operations/':''}requests/${requestId}/execution-policy-options?${new URLSearchParams({action,limit:'20'})}`,party:'none',privacyPolicy:{requestId,action}}
  return null
 }
 if(key==='asset_id'&&domain==='privacy'&&uuid(context.request_id))return{path:`/privacy/requests/${context.request_id}/model-assets`,party:'none'}
 if(key==='request_id')return domain==='privacy'?{path:'/privacy/requests',party:'none'}:{path:'/customization-requests',party:'required'}
 if(key==='account_id'||key==='assignee_account_id')return uuid(party)?{path:`/parties/${party}/members`,party:'required'}:null
 if(domain==='cocreation'&&['file_id','final_version_id'].includes(key))return uuid(context.project_id)?{path:`/production/projects/${context.project_id}/records?kind=${key==='file_id'?'FILE':'VERSION'}`,party:'required',filter:r=>key==='file_id'?r.current_status==='READY':r.current_status==='APPROVED'&&rowData(r).stage==='FINAL'}:null
 if(key==='offer_id')return{path:'/auditions/catalog',party:'none'}
 if(key==='booking_id')return{path:'/auditions/records?kind=BOOKING',party:'required'}
 if(key==='source_listing_id'&&domain==='notices')return{path:'/artists/catalog',party:'none'}
 if(key==='listing_id')return{path:'/stock/catalog',party:'none'}
 if(key==='stock_id')return{path:'/redemption/catalog',party:'none'}
 if(key==='pool_id')return{path:'/redemption/pools',party:'none'}
 if(key==='benefit_id')return{path:'/cocreation/benefits',party:'required'}
 if(key==='agreement_id')return uuid(context.project_id)?{path:`/projects/projects/${context.project_id}/records?kind=PARTICIPATION`,party:'required'}:null
 if(key==='source_id'&&domain==='media'&&context.source_kind==='PRODUCTION_VERSION')return uuid(context.project_id)?{path:`/production/projects/${context.project_id}/records?kind=VERSION`,party:'required'}:null
 if(key==='project_id'||key==='production_project_id')return{path:key==='production_project_id'||domain==='media'?'/production/projects':'/projects/projects',party:'required'}
 if(key==='invitation_id')return{path:'/notices/records?kind=SUBMISSION',party:'required',filter:r=>rowData(r).decision==='INTERESTED'||r.current_status==='INTERESTED'}
 if(key==='notice_id')return{path:'/notices/catalog',party:'none'}
 if(key==='rule_id')return ['wallet','notices','cocreation'].includes(domain)?{path:`/${domain}/rules`,party:'none'}:domain==='engagement'?{path:'/engagement/queue?kind=RULE',party:'none',filter:r=>r.current_status==='EFFECTIVE'}:null
 return null
}
export function referenceOptions(data:BusinessData,field:string):ReferenceOption[]{if(['photos','videos','consent_id'].includes(field)&&['PHOTO','VIDEO','CONSENT'].includes(String(data.kind)))return rowsOf(data).map(r=>({value:String(r.id),label:(field==='consent_id'?'本次取样授权 · 截止 '+String(r.valid_until):String(r.media_type)+' · '+String(r.byte_size)+' 字节')+' · '+String(r.id).slice(-8),record:r})).filter(r=>uuid(r.value));return (field==='avatar_id'&&Array.isArray(data.avatars)?data.avatars as BusinessData[]:rowsOf(data)).map(r=>{const d=rowData(r),value=String(field==='account_id'?r.account_id||r.id:field==='party_id'?r.owner_party_id||r.party_id:field==='source_listing_id'?r.listing_id:field==='consent_id'&&uuid(r.consent_id)?r.consent_id:((r.seller_party_id||r.public_consent_id||r.spec_id&&r.rule_id)&&['spec_id','rule_id','avatar_id','consent_id','public_consent_id'].includes(field)&&uuid(r[field])?r[field]:recordId(r))),rule=(r.rule||d.rule||{}) as BusinessData,notice=(r.notice||d.notice||{}) as BusinessData,template=(r.template||d.template||{}) as BusinessData,offer=(r.offer||d.offer||{}) as BusinessData;return{value,label:[r.label,r.category_title,r.version,field==='policy_rule_id'?r.basis:undefined,field==='policy_rule_id'&&Array.isArray(r.categories)?r.categories.map(c=>{const v=c as BusinessData;const names:Record<string,string>={PROFILE:'账号资料',ARTIST_MATERIALS:'本人原始素材',PRIVATE_STORY:'私人故事',CONTRACTS:'合同',TRANSACTIONS:'交易记录',CONTENT:'作品内容',DIGITAL_MODELS:'登记模型'};return `${names[String(v.scope)]||v.scope}：${v.basis} · ${v.max_review_days}天内复核`}).join('；'):undefined,r.person_name,r.avatar_name,uuid(r.consent_id)&&r.seller_party_id?[Array.isArray(r.stock_commercial_uses)&&r.stock_commercial_uses.length?r.stock_commercial_uses.map(v=>commercialUses[String(v) as keyof typeof commercialUses]||String(v)).join('、'):'未列明商用许可',Array.isArray(r.territories)?r.territories.join('、'):'',r.valid_from,r.valid_until].filter(Boolean).join(' · '):undefined,r.spec_title,r.display_name,d.display_name,r.title,d.title,notice.title,template.title,offer.title,rule.version,field==='party_id'&&r.kind==='CANDIDATE'?'本项目已确认参演方':undefined,field==='account_id'?`${display(r.role_code||'MEMBER')} · 账号${String(r.account_id||r.id).slice(0,8)}`:undefined].filter(Boolean).map(String).join(' · ')||String(r.kind||'获准记录'),record:r}}).filter(o=>uuid(o.value)).map(o=>({...o,label:`${o.label} · ${display(o.record.current_status||'')} ${typeof o.record.object_version==='number'?`· 版本${o.record.object_version}`:''} · ${o.value.slice(0,8)}…${o.value.slice(-8)}`}))}
export async function readReferences(source:ReferenceSource,identity:{token:string;accountId:string;partyId:string},cursor?:string){const url=new URL(source.path,'http://local');if(cursor)url.searchParams.set('cursor',cursor);const r=await readBusiness(url.pathname+url.search,{token:identity.token,accountId:identity.accountId,actingParty:source.party==='none'?null:identity.partyId});if(source.privacyPolicy){
 const expected=source.privacyPolicy,d=r.data,items=rowsOf(d),text=(v:unknown)=>typeof v==='string'&&v.trim().length>0
 const valid=d.request_id===expected.requestId&&(expected.action?d.action===expected.action:d.scope===expected.scope)&&Array.isArray(d.items)&&items.length<=20&&new Set(items.map(item=>item.id)).size===items.length&&(d.next_cursor===null||uuid(d.next_cursor)&&(!cursor||d.next_cursor>cursor))&&items.every(item=>uuid(item.id)&&(!cursor||item.id>cursor)&&text(item.version)&&(expected.action?text(item.basis)&&text(item.contact_reference)&&(item.retention_rule_id===null||uuid(item.retention_rule_id)):Array.isArray(item.categories)&&item.categories.length>0&&item.categories.every(c=>{if(!c||typeof c!=='object')return false;const v=c as BusinessData;return v.scope===expected.scope&&text(v.basis)&&Number.isSafeInteger(v.max_review_days)&&Number(v.max_review_days)>0})))
 if(!valid)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'处理规则与本次申请、操作或资料类别不一致，请重新读取。',requestMethod:'GET'})
 }
 if(source.delivery){
 const d=source.delivery,items=r.data.items,next=r.data.next_cursor
 const validItem=(raw:unknown)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;const item=raw as BusinessData;if(!uuid(item.id))return false;if(d.kind==='CONSENT')return typeof item.valid_until==='string'&&!Number.isNaN(Date.parse(item.valid_until));return (d.kind==='PHOTO'?['image/jpeg','image/png'].includes(String(item.media_type)):item.media_type==='video/mp4')&&Number.isSafeInteger(item.byte_size)&&Number(item.byte_size)>0&&typeof item.content_sha256==='string'&&/^[a-f0-9]{64}$/.test(item.content_sha256)}
 if(r.data.booking_id!==d.booking||r.data.person_id!==d.person||r.data.avatar_id!==d.avatar||r.data.kind!==d.kind||!Array.isArray(items)||items.length>20||!items.every(validItem)||new Set(items.map(x=>x.id)).size!==items.length||!(next===null||uuid(next)&&next!==cursor))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'无法确认本预约材料与授权，请重新读取。',requestMethod:'GET'})
 }
 if(source.creation){
 if(source.creation==='STORY'){
  if(!Array.isArray(r.data.items)||r.data.items.length>20||!r.data.items.every(item=>isStorySummary(item)&&item.party_id===identity.partyId)||!(r.data.next_cursor===null||typeof r.data.next_cursor==='string'&&r.data.next_cursor.length>0&&r.data.next_cursor.length<=512&&r.data.next_cursor!==cursor))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'无法核对本人的已提交故事，请重新读取。',requestMethod:'GET'})
 }else creationPage(r.data,source.creation,cursor)
 }if(source.path.startsWith('/notices/submission-options?')){const items=rowsOf(r.data);if(r.data.notice_id!==url.searchParams.get('notice_id')||!uuid(r.data.rule_id)||!Array.isArray(r.data.items)||items.some(item=>item.person_id!==url.searchParams.get('person_id')||!['person_id','avatar_id','consent_id','target_party_id'].every(key=>uuid(item[key]))))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'投稿授权与本次人物或通告不一致，请重新读取。',requestMethod:'GET'});return{data:r.data,items:{...r.data,items:items.map(item=>({...item,notice_id:r.data.notice_id,rule_id:r.data.rule_id}))}}};return{data:r.data,items:source.filter?{...r.data,items:rowsOf(r.data).filter(source.filter)}:r.data}}
