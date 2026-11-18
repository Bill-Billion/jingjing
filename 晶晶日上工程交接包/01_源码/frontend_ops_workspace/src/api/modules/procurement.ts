import {rightsObject as obj,rightsList as list} from './rights'
const text=(v:unknown,max=8000):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v
export const ipRights=['ADAPT','PRODUCE','COPY','DISTRIBUTE','NETWORK_DISTRIBUTE','COMPILE','PROMOTE','SEQUEL','DERIVATIVES','AI_PROCESS'] as const
export function anniversary(value:string,years:number){const d=new Date(value),m=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+years);if(d.getUTCMonth()!==m)d.setUTCDate(0);return d.toISOString()}
export interface Procurement {version:'CONTRACT_20261029';mode:'BUYOUT'|'REVENUE_SHARE';buyer_party_id:string;upfront_minor:0|5000000;royalty_bps:0|800;sublicensing_allowed:true;attribution_terms:string;rights_evidence:{rights_chain_ids:string[];ownership_proof_ids:string[];original_creation_ids:string[];has_coauthors:boolean;coauthor_consent_ids:string[]};settlement_annex:null|{asset_id:string;cycle:'MONTHLY'|'QUARTERLY'|'ANNUAL'|'AGREED';terms_text:string;net_basis:'ALL_RELEASE_AND_DERIVATIVE_INCOME_LESS_PLATFORM_TAX_DISTRIBUTION_PRODUCTION'}}
export type ProcurementReview={decision:'APPROVED'|'REJECTED';reason:string;reviewer_account_id:string;verification?:never}
export type ProcurementEvent={project_id:string|null;event:'DEVELOPMENT'|'PUBLICATION'|'WITHDRAWAL_REQUEST';occurred_at:string;evidence_asset_ids:string[];external_reference:string;note:string;verification_method:'EXTERNAL_MANUAL_REVIEW';review:ProcurementReview|null}
export type RoyaltyInput={period_from:string;period_until:string;income_minor:number;platform_minor:number;tax_minor:number;distribution_minor:number;production_minor:number;evidence_asset_ids:string[];external_reference:string;note:string}
export type RoyaltyData={project_id:string;statement:RoyaltyInput;evidence_asset_ids:string[];calculation:null|{currency:'CNY';royalty_bps:800;project_net_minor:number;cumulative_accrued_minor:number;adjustment_minor:number;payment_state:'NOT_TRANSFERRED';rounding:'CUMULATIVE_FLOOR_TO_FEN'};review:ProcurementReview|null}
export const signedMinor=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&Math.abs(v)<=1000000000000
export function signedMinorInput(v:string):number|null{return /^-?(0|[1-9]\d*)$/.test(v)&&signedMinor(Number(v))?Number(v):null}
const review=(v:unknown)=>v===null||obj(v)&&['APPROVED','REJECTED'].includes(String(v.decision))&&text(v.reason,2000)&&id(v.reviewer_account_id)
export function isProcurement(v:unknown):v is Procurement {
 if(!obj(v)||v.version!=='CONTRACT_20261029'||!['BUYOUT','REVENUE_SHARE'].includes(String(v.mode))||!id(v.buyer_party_id)||v.upfront_minor!==(v.mode==='BUYOUT'?5000000:0)||v.royalty_bps!==(v.mode==='BUYOUT'?0:800)||v.sublicensing_allowed!==true||!text(v.attribution_terms,2000)||!obj(v.rights_evidence))return false
 const e=v.rights_evidence
 if(typeof e.has_coauthors!=='boolean'||!['rights_chain_ids','ownership_proof_ids','original_creation_ids','coauthor_consent_ids'].every(k=>list(e[k],id,30,k==='coauthor_consent_ids'&&!e.has_coauthors?0:1)))return false
 if(v.mode==='BUYOUT')return v.settlement_annex===null
 const a=v.settlement_annex
 return obj(a)&&id(a.asset_id)&&['MONTHLY','QUARTERLY','ANNUAL','AGREED'].includes(String(a.cycle))&&text(a.terms_text)&&a.net_basis==='ALL_RELEASE_AND_DERIVATIVE_INCOME_LESS_PLATFORM_TAX_DISTRIBUTION_PRODUCTION'
}
export function isIPTerms(t:Record<string,unknown>):boolean {
 if(!['IP_BUYOUT_20261029','IP_REVENUE_SHARE_20261029'].includes(String(t.contract_kind))||!instant(t.valid_from))return false
 const buy=t.contract_kind==='IP_BUYOUT_20261029'
 return t.exclusive===true&&list(t.rights,x=>typeof x==='string'&&(ipRights as readonly string[]).includes(x),10)&&t.rights.length===10&&JSON.stringify(t.purposes)===JSON.stringify(['PRIVATE','PUBLIC_SHARE','COMMERCIAL','RELEASE'])&&JSON.stringify(t.territories)==='["WORLD"]'&&JSON.stringify(t.languages)==='["ALL"]'&&t.project_limit===null&&t.episode_limit===null&&t.valid_until===(buy?null:anniversary(t.valid_from,5))&&t.development_until===(buy?null:anniversary(t.valid_from,2))
}
export function procurementMatches(p:unknown,t:Record<string,unknown>,price:{currency:string;amount_minor:number},due?:unknown){return t.contract_kind===undefined?p===undefined:isProcurement(p)&&isIPTerms(t)&&t.contract_kind===(p.mode==='BUYOUT'?'IP_BUYOUT_20261029':'IP_REVENUE_SHARE_20261029')&&price.currency==='CNY'&&price.amount_minor===p.upfront_minor&&(due===undefined||due===p.upfront_minor)}
export function isProcurementEvent(v:unknown):v is ProcurementEvent {return obj(v)&&['DEVELOPMENT','PUBLICATION','WITHDRAWAL_REQUEST'].includes(String(v.event))&&(v.event==='WITHDRAWAL_REQUEST'?v.project_id===null:id(v.project_id))&&instant(v.occurred_at)&&list(v.evidence_asset_ids,id,30)&&text(v.external_reference,128)&&text(v.note,2000)&&v.verification_method==='EXTERNAL_MANUAL_REVIEW'&&review(v.review)}
export function isRoyaltyInput(v:unknown):v is RoyaltyInput {return obj(v)&&instant(v.period_from)&&instant(v.period_until)&&v.period_from<v.period_until&&['income_minor','platform_minor','tax_minor','distribution_minor','production_minor'].every(k=>signedMinor(v[k]))&&list(v.evidence_asset_ids,id,30)&&text(v.external_reference,128)&&text(v.note,2000)}
export function isRoyaltyData(v:unknown):v is RoyaltyData {if(!obj(v)||!id(v.project_id)||!isRoyaltyInput(v.statement)||!list(v.evidence_asset_ids,id,30)||JSON.stringify(v.evidence_asset_ids)!==JSON.stringify(v.statement.evidence_asset_ids)||!review(v.review))return false;const c=v.calculation;return c===null||obj(c)&&c.currency==='CNY'&&c.royalty_bps===800&&['project_net_minor','cumulative_accrued_minor','adjustment_minor'].every(k=>signedMinor(c[k]))&&c.payment_state==='NOT_TRANSFERRED'&&c.rounding==='CUMULATIVE_FLOOR_TO_FEN'}
export function procurementAssets(p:Procurement){return [...new Set([...p.rights_evidence.rights_chain_ids,...p.rights_evidence.ownership_proof_ids,...p.rights_evidence.original_creation_ids,...p.rights_evidence.coauthor_consent_ids,...p.settlement_annex?[p.settlement_annex.asset_id]:[]])]}
