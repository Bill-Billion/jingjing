import {object,serviceRequest,query} from './clientServices'
import {validSupplyId as id,type SupplyIdentity} from './supply'
import type {RequestOptions} from '../client'

export const invoiceStatuses={REQUESTED:'待审核',NEEDS_INFO:'待补资料',APPROVED:'申请已批准，待录入票据',DOCUMENT_REVIEW:'待另一位工作人员核准',ISSUED:'已开具，可领取',CORRECTION_REQUESTED:'更正处理中',REJECTED:'申请已退回',WITHDRAWN:'申请已撤回'} as const
export const invoiceActions={SUPPLEMENT:'补充资料',WITHDRAW:'撤回申请',REQUEST_CORRECTION:'申请更正',REQUEST_INFO:'要求补充资料',APPROVE:'批准申请',REJECT:'退回申请',RECORD_DOCUMENT:'录入票据，提交独立核准',VERIFY_DOCUMENT:'核准票据',REJECT_DOCUMENT:'退回本次票据'} as const
export type InvoiceStatus=keyof typeof invoiceStatuses
export type InvoiceAction=keyof typeof invoiceActions
export type InvoiceRole='applicant'|'handle'|'verify'
export type InvoiceHeader={kind:'PERSON';title:string;tax_id:null}|{kind:'ORGANIZATION';title:string;tax_id:string}
export interface InvoiceEligibility {order_id:string;currency:'CNY';environment:'SANDBOX'|'PRODUCTION'|null;received_minor:number;refunded_minor:number;pending_refund_minor:number;occupied_minor:number;available_minor:number}
export interface Invoice {id:string;order_id:string;buyer_party_id:string;issuer_party_id:string;environment:'SANDBOX'|'PRODUCTION';currency:'CNY';requested_minor:number;occupied_minor:number;current_status:InvoiceStatus;object_version:number;header:InvoiceHeader;issued_document_id:string|null;pending_document_id:string|null;requires_correction:boolean;available_for_this_request_minor:number;created_at:string;updated_at:string;allowed_actions?:(InvoiceAction|'READ')[]}
export interface InvoiceEvent {object_version:number;actor_kind:'APPLICANT'|'OPERATOR';action:InvoiceAction|'SUBMIT';text:string;header:InvoiceHeader;status:InvoiceStatus;amount_minor:number;document_id:string|null;asset_ids:string[];created_at:string}
export interface InvoiceDocument {id:string;current_status:'PENDING'|'REJECTED'|'ISSUED'|'SUPERSEDED';content_sha256:string;content:{invoice_id:string;order_id:string;environment:'SANDBOX'|'PRODUCTION';simulated:boolean;label:string;amount_minor:number;currency:'CNY';reference:string;issued_at:string;header:InvoiceHeader;issuer:{merchant_party_id:string;name:string;tax_id:string|null;config_revision:string;evidence_ref:string;valid_until:string|null;simulated:boolean;approved?:boolean};issuer_sha256:string;replaces_document_id:string|null;asset_proof:{content_sha256:string;byte_size:number}|null};created_at:string}
export interface InvoicePage<T,C=string> {items:T[];next_cursor:C|null}
const nonempty=(v:unknown,max=2000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max
const date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const integer=(v:unknown,min=0,max=900000000000):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max
const version=(v:unknown):v is number=>integer(v,1,4294967294)
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const nullableId=(v:unknown):v is string|null=>v===null||id(v)
export function isInvoiceHeader(v:unknown):v is InvoiceHeader {return object(v)&&nonempty(v.title,200)&&(v.kind==='PERSON'?v.tax_id===null:v.kind==='ORGANIZATION'&&nonempty(v.tax_id,80))}
export function isInvoiceEligibility(v:unknown):v is InvoiceEligibility {return object(v)&&id(v.order_id)&&v.currency==='CNY'&&[null,'SANDBOX','PRODUCTION'].includes(v.environment)&&['received_minor','refunded_minor','pending_refund_minor','occupied_minor','available_minor'].every(k=>integer(v[k]))}
export function isInvoice(v:unknown):v is Invoice {return object(v)&&['id','order_id','buyer_party_id','issuer_party_id'].every(k=>id(v[k]))&&['SANDBOX','PRODUCTION'].includes(v.environment)&&v.currency==='CNY'&&integer(v.requested_minor,1)&&integer(v.occupied_minor)&&Object.hasOwn(invoiceStatuses,v.current_status)&&version(v.object_version)&&isInvoiceHeader(v.header)&&nullableId(v.issued_document_id)&&nullableId(v.pending_document_id)&&typeof v.requires_correction==='boolean'&&integer(v.available_for_this_request_minor)&&date(v.created_at)&&date(v.updated_at)&&(v.allowed_actions===undefined||Array.isArray(v.allowed_actions)&&v.allowed_actions.every((a:unknown)=>typeof a==='string'&&(a==='READ'||Object.hasOwn(invoiceActions,a)))&&new Set(v.allowed_actions).size===v.allowed_actions.length)}
export function isInvoiceEvent(v:unknown):v is InvoiceEvent {return object(v)&&version(v.object_version)&&['APPLICANT','OPERATOR'].includes(v.actor_kind)&&(v.action==='SUBMIT'||Object.hasOwn(invoiceActions,v.action))&&nonempty(v.text)&&isInvoiceHeader(v.header)&&Object.hasOwn(invoiceStatuses,v.status)&&integer(v.amount_minor)&&nullableId(v.document_id)&&Array.isArray(v.asset_ids)&&v.asset_ids.length<=8&&v.asset_ids.every(id)&&new Set(v.asset_ids).size===v.asset_ids.length&&date(v.created_at)}
export function isInvoiceDocument(v:unknown):v is InvoiceDocument {
 if(!object(v)||!id(v.id)||!['PENDING','REJECTED','ISSUED','SUPERSEDED'].includes(v.current_status)||!sha(v.content_sha256)||!date(v.created_at)||!object(v.content))return false
 const c=v.content,p=c.issuer
 return id(c.invoice_id)&&id(c.order_id)&&['SANDBOX','PRODUCTION'].includes(c.environment)&&typeof c.simulated==='boolean'&&c.simulated===(c.environment==='SANDBOX')&&nonempty(c.label)&&integer(c.amount_minor)&&c.currency==='CNY'&&nonempty(c.reference,200)&&date(c.issued_at)&&isInvoiceHeader(c.header)&&object(p)&&id(p.merchant_party_id)&&nonempty(p.name)&&(p.tax_id===null||nonempty(p.tax_id))&&nonempty(p.config_revision)&&nonempty(p.evidence_ref)&&(p.valid_until===null||date(p.valid_until))&&p.simulated===c.simulated&&(p.approved===undefined||typeof p.approved==='boolean')&&sha(c.issuer_sha256)&&nullableId(c.replaces_document_id)&&(c.asset_proof===null?c.simulated:!c.simulated&&object(c.asset_proof)&&sha(c.asset_proof.content_sha256)&&integer(c.asset_proof.byte_size,1))
}
export function invoicePage<T,C extends string|number=string>(guard:(v:unknown)=>v is T,numeric=false){return (v:unknown):v is InvoicePage<T,C>=>object(v)&&Array.isArray(v.items)&&v.items.length<=50&&v.items.every(guard)&&(v.next_cursor===null||(numeric?version(v.next_cursor):id(v.next_cursor)))}
export function invoiceBase(role:InvoiceRole){return '/invoices/'+(role==='applicant'?'requests':'operations/requests')}
export function invoiceRoute(role:InvoiceRole){return role==='applicant'?'/invoices/requests':'/invoices/operations/'+role}
export function invoiceAvailableActions(v:Invoice,role:InvoiceRole):InvoiceAction[]{
 const state:Partial<Record<InvoiceAction,InvoiceStatus[]>>=role==='applicant'?{SUPPLEMENT:['NEEDS_INFO'],WITHDRAW:v.issued_document_id?[]:['REQUESTED','NEEDS_INFO','APPROVED','DOCUMENT_REVIEW'],REQUEST_CORRECTION:['ISSUED']}:role==='handle'?{REQUEST_INFO:['REQUESTED','APPROVED'],APPROVE:['REQUESTED'],REJECT:['REQUESTED','NEEDS_INFO','APPROVED'],RECORD_DOCUMENT:['APPROVED','CORRECTION_REQUESTED'],REQUEST_CORRECTION:['ISSUED']}:{VERIFY_DOCUMENT:['DOCUMENT_REVIEW'],REJECT_DOCUMENT:['DOCUMENT_REVIEW']}
 return (Object.keys(state) as InvoiceAction[]).filter(a=>state[a]?.includes(v.current_status)&&(role==='applicant'||v.allowed_actions?.includes(a)))
}
export function invoiceAmount(value:string,allowZero=false):number|null {if(!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));return integer(amount,allowZero?0:1)?amount:null}
export function invoiceMoney(value:number){return '¥'+(value/100).toFixed(2)}
export const readInvoiceEligibility=(i:SupplyIdentity,order:string,options:RequestOptions={})=>serviceRequest(i,'/invoices/orders/'+order+'/eligibility',(v):v is InvoiceEligibility=>isInvoiceEligibility(v)&&v.order_id===order,options)
export const readInvoiceList=(i:SupplyIdentity,role:InvoiceRole,status='',cursor:string|null=null,options:RequestOptions={})=>serviceRequest(i,invoiceBase(role)+query({limit:20,status,cursor}),invoicePage((v):v is Invoice=>isInvoice(v)&&(role!=='applicant'||v.buyer_party_id===i.partyId)),options)
