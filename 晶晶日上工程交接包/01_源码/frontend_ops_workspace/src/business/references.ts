import {type BusinessData,rowData,recordId,rowsOf,readBusiness} from '@/api/modules/business'
import {uuid,type PartyMode} from './model'
import {display} from './labels'
export interface ReferenceOption {value:string;label:string;record:BusinessData}
export interface ReferenceSource {path:string;party:PartyMode;filter?:(r:BusinessData)=>boolean}
export function sourceFor(key:string,context:Record<string,unknown>,domain:string,party:string):ReferenceSource|null{
 const person=context.person_id||context.seller_person_id
 if(key==='artist_consent_ids')key='consent_id'
 if(key==='person_ids')key='person_id'
 if(key==='supply_consent_id'||key==='consent_ids')return{path:'/supply/records?kind=CONSENT',party:'required'}
 if(['person_id','seller_person_id'].includes(key))return{path:'/artists/people',party:'required'}
 const artistKinds:Record<string,string>={avatar_id:'AVATAR',consent_id:'CONSENT',public_consent_id:'CONSENT',look_version_id:'LOOK',voice_version_id:'VOICE',previous_version_id:'LOOK'}
 if(key==='avatar_id')return uuid(person)?{path:`/artists/people/${person}`,party:'required'}:null
 if(artistKinds[key])return uuid(person)?{path:`/artists/people/${person}/records?kind=${artistKinds[key]}`,party:'required'}:null
 if(['spec_id','quote_id','order_id'].includes(key))return{path:`/trade/records?kind=${key==='spec_id'?'SPEC':key==='quote_id'?'QUOTE':'ORDER'}`,party:'required',...(key==='spec_id'&&domain==='stock'?{filter:(r:BusinessData)=>r.current_status==='PUBLISHED'&&(rowData(r).product_profile as BusinessData|undefined)?.type==='STOCK_VIDEO'}:{})}
 if(key==='party_id'&&domain==='participation'&&uuid(context.project_id))return{path:`/projects/projects/${context.project_id}/records?kind=CANDIDATE`,party:'required',filter:r=>r.current_status==='CONFIRMED'}
 if(key==='target_id'&&domain==='privacy'&&context.action==='FILE_ERASURE'&&uuid(context.request_id))return{path:`/privacy/requests/${context.request_id}/data?category=ARTIST_MATERIALS`,party:'none'}
 if(key==='asset_id'&&domain==='privacy'&&uuid(context.request_id))return{path:`/privacy/requests/${context.request_id}/model-assets`,party:'none'}
 if(key==='request_id')return domain==='privacy'?{path:'/privacy/requests',party:'none'}:{path:'/customization-requests',party:'required'}
 if(key==='account_id'||key==='assignee_account_id')return uuid(party)?{path:`/parties/${party}/members`,party:'required'}:null
 if(domain==='cocreation'&&['file_id','final_version_id'].includes(key))return uuid(context.project_id)?{path:`/production/projects/${context.project_id}/records?kind=${key==='file_id'?'FILE':'VERSION'}`,party:'required',filter:r=>key==='file_id'?r.current_status==='READY':r.current_status==='APPROVED'&&rowData(r).stage==='FINAL'}:null
 if(key==='offer_id')return{path:'/auditions/catalog',party:'none'}
 if(key==='booking_id')return{path:'/auditions/records?kind=BOOKING',party:'required'}
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
export function referenceOptions(data:BusinessData,field:string):ReferenceOption[]{return (field==='avatar_id'&&Array.isArray(data.avatars)?data.avatars as BusinessData[]:rowsOf(data)).map(r=>{const d=rowData(r),value=String(field==='account_id'?r.account_id||r.id:field==='party_id'?r.owner_party_id||r.party_id:recordId(r)),rule=(r.rule||d.rule||{}) as BusinessData,notice=(r.notice||d.notice||{}) as BusinessData,template=(r.template||d.template||{}) as BusinessData,offer=(r.offer||d.offer||{}) as BusinessData;return{value,label:[r.display_name,d.display_name,r.title,d.title,notice.title,template.title,offer.title,rule.version,field==='party_id'&&r.kind==='CANDIDATE'?'本项目已确认参演方':undefined,field==='account_id'?`${display(r.role_code||'MEMBER')} · 账号${String(r.account_id||r.id).slice(0,8)}`:undefined].filter(Boolean).map(String).join(' · ')||String(r.kind||'获准记录'),record:r}}).filter(o=>uuid(o.value)).map(o=>({...o,label:`${o.label} · ${display(o.record.current_status||'')} ${typeof o.record.object_version==='number'?`· 版本${o.record.object_version}`:''} · ${o.value.slice(0,8)}…${o.value.slice(-8)}`}))}
export async function readReferences(source:ReferenceSource,identity:{token:string;accountId:string;partyId:string},cursor?:string){const url=new URL(source.path,'http://local');if(cursor)url.searchParams.set('cursor',cursor);const r=await readBusiness(url.pathname+url.search,{token:identity.token,accountId:identity.accountId,actingParty:source.party==='none'?null:identity.partyId});return{data:r.data,items:source.filter?{...r.data,items:rowsOf(r.data).filter(source.filter)}:r.data}}
