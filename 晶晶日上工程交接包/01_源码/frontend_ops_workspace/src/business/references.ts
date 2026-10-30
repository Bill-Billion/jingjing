import {type BusinessData,rowData,recordId,rowsOf,readBusiness} from '@/api/modules/business'
import { ApiError } from '@/api/client'
import {uuid,type PartyMode} from './model'
import {display} from './labels'
import { isStorySummary } from '@/api/modules/customizationOwn'
import { creationPage,type CreationKind } from './cocreationCreation'
export interface ReferenceOption {value:string;label:string;record:BusinessData}
export interface ReferenceSource {path:string;party:PartyMode;creation?:CreationKind|'STORY';filter?:(r:BusinessData)=>boolean}
export function sourceFor(key:string,context:Record<string,unknown>,domain:string,party:string):ReferenceSource|null{
 const person=context.person_id||context.seller_person_id
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
 if(key==='policy_rule_id'&&domain==='privacy'&&context.action==='FILE_ERASURE'&&uuid(context.request_id))return{path:`/privacy/requests/${context.request_id}/file-options?kind=POLICY`,party:'none'}
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
export function referenceOptions(data:BusinessData,field:string):ReferenceOption[]{return (field==='avatar_id'&&Array.isArray(data.avatars)?data.avatars as BusinessData[]:rowsOf(data)).map(r=>{const d=rowData(r),value=String(field==='account_id'?r.account_id||r.id:field==='party_id'?r.owner_party_id||r.party_id:field==='source_listing_id'?r.listing_id:field==='consent_id'&&uuid(r.consent_id)?r.consent_id:((r.seller_party_id||r.public_consent_id||r.spec_id&&r.rule_id)&&['spec_id','rule_id','avatar_id','consent_id','public_consent_id'].includes(field)&&uuid(r[field])?r[field]:recordId(r))),rule=(r.rule||d.rule||{}) as BusinessData,notice=(r.notice||d.notice||{}) as BusinessData,template=(r.template||d.template||{}) as BusinessData,offer=(r.offer||d.offer||{}) as BusinessData;return{value,label:[r.label,r.category_title,r.version,r.person_name,r.avatar_name,r.spec_title,r.display_name,d.display_name,r.title,d.title,notice.title,template.title,offer.title,rule.version,field==='party_id'&&r.kind==='CANDIDATE'?'本项目已确认参演方':undefined,field==='account_id'?`${display(r.role_code||'MEMBER')} · 账号${String(r.account_id||r.id).slice(0,8)}`:undefined].filter(Boolean).map(String).join(' · ')||String(r.kind||'获准记录'),record:r}}).filter(o=>uuid(o.value)).map(o=>({...o,label:`${o.label} · ${display(o.record.current_status||'')} ${typeof o.record.object_version==='number'?`· 版本${o.record.object_version}`:''} · ${o.value.slice(0,8)}…${o.value.slice(-8)}`}))}
export async function readReferences(source:ReferenceSource,identity:{token:string;accountId:string;partyId:string},cursor?:string){const url=new URL(source.path,'http://local');if(cursor)url.searchParams.set('cursor',cursor);const r=await readBusiness(url.pathname+url.search,{token:identity.token,accountId:identity.accountId,actingParty:source.party==='none'?null:identity.partyId});if(source.creation){
 if(source.creation==='STORY'){
  if(!Array.isArray(r.data.items)||r.data.items.length>20||!r.data.items.every(item=>isStorySummary(item)&&item.party_id===identity.partyId)||!(r.data.next_cursor===null||typeof r.data.next_cursor==='string'&&r.data.next_cursor.length>0&&r.data.next_cursor.length<=512&&r.data.next_cursor!==cursor))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'无法核对本人的已提交故事，请重新读取。',requestMethod:'GET'})
 }else creationPage(r.data,source.creation,cursor)
 }if(source.path.startsWith('/notices/submission-options?')){const items=rowsOf(r.data);if(r.data.notice_id!==url.searchParams.get('notice_id')||!uuid(r.data.rule_id)||!Array.isArray(r.data.items)||items.some(item=>item.person_id!==url.searchParams.get('person_id')||!['person_id','avatar_id','consent_id','target_party_id'].every(key=>uuid(item[key]))))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'投稿授权与本次人物或通告不一致，请重新读取。',requestMethod:'GET'});return{data:r.data,items:{...r.data,items:items.map(item=>({...item,notice_id:r.data.notice_id,rule_id:r.data.rule_id}))}}};return{data:r.data,items:source.filter?{...r.data,items:rowsOf(r.data).filter(source.filter)}:r.data}}
