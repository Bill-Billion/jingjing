import {ApiError,request,requestBytes,type ApiResult} from '../client'
import {validSupplyId,isSupplyRecord,type SupplyIdentity,type SupplyRecord} from './supply'
import {getTrade,type TradeRecord} from './trade'
import {getProduction,type ProductionRecord} from './production'
import {getProject,type ProjectRecord,iso} from './projects'
import {getFinance,type FinanceRecord} from './finance'
import {getLicense,type LicenseRecord} from './licensing'
import {getGig,type GigRecord} from './gigs'
export const domains={TRADE:'交易',PRODUCTION:'制作',PROJECTS:'项目发行',FINANCE:'结算',SUPPLY:'作品与供给',LICENSE:'许可',GIGS:'商单'} as const
export type Domain=keyof typeof domains
export type CommentDomain='TRADE'|'PRODUCTION'|'PROJECTS'
export interface Target {domain:Domain;record_id:string}
export interface Notification extends Target {id:number;event_code:string;object_version:number;read:boolean;created_at:string}
export interface Comment extends Target {id:string;author_account_id:string;party_id:string|null;reply_to:string|null;body:string|null;current_status:'VISIBLE'|'WITHDRAWN'|'HIDDEN';object_version:number;created_at:string}
export interface Audit {id:number;object_id:string;actor_account_id:string;event_code:string;object_version:number;reason:string;request_id:string;created_at:string}
export interface BusinessAudit {id:string;record_id:string;actor_account_id:string|null;event_code:string;object_version:number;request_id:string;created_at:string}
export interface Page<T,C=string> {items:T[];next_cursor:C|null}
export const reportKinds={CASH:'收退款明细',SETTLEMENT:'结算份额明细',WORKLOAD:'制作情况'} as const
export type ReportKind=keyof typeof reportKinds
export interface ReportRequest {kind:ReportKind;environment:'SANDBOX'|'PRODUCTION';period_start:string;period_end:string}
export interface ReportRow extends Target {source_id:string;source_sha256:string;category:'RECEIPT'|'REFUND'|'ACCRUAL'|'ADJUSTMENT'|'PAYOUT'|'PAYOUT_RETURN'|'PROJECT';amount_minor:number|null;currency:'CNY'|null;status:string|null;party_id:string|null;occurred_at:string}
export interface ReportResult {metric_version:'1';environment:ReportRequest['environment'];period_start:string;period_end:string;generated_at:string;row_count:number;totals:Record<string,number>;rows:ReportRow[];sources:(Target&{content_sha256:string})[];limitations:string[]}
export interface Report {id:string;party_id:string|null;request:ReportRequest&{metric_version:'1'};current_status:'PENDING'|'RUNNING'|'RETRY'|'SUCCEEDED'|'FAILED'|'BLOCKED';error_code:string|null;content_sha256:string|null;result:ReportResult|null}
export type BusinessRecord=TradeRecord|ProductionRecord|ProjectRecord|FinanceRecord|LicenseRecord|SupplyRecord|GigRecord
export interface OperationsWrite {path:string;body:unknown;version?:number;resultKind:'COMMENT'|'READ'|'REPORT';label:string;target?:Target;resultId?:string|number;recovery:'COMMENTS'|'NOTIFICATIONS'|'REPORT'|'CREATE_REPORT';request?:ReportRequest}
export type WriteResult=Comment|Report|{id:number;read:true}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>obj(v)&&keys.length===Object.keys(v).length&&keys.every(k=>Object.hasOwn(v,k))
const str=(v:unknown,max=4000,min=1):v is string=>typeof v==='string'&&v.length>=min&&v.length<=max&&(min===0||!!v.trim())
const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max&&!Object.is(v,-0)
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const nullableId=(v:unknown)=>v===null||validSupplyId(v)
const domain=(v:unknown):v is Domain=>typeof v==='string'&&Object.hasOwn(domains,v)
const target=(v:Record<string,unknown>)=>domain(v.domain)&&validSupplyId(v.record_id)
export function isNotification(v:unknown):v is Notification{return exact(v,['id','domain','record_id','event_code','object_version','read','created_at'])&&target(v)&&int(v.id,1)&&str(v.event_code,80)&&int(v.object_version,1)&&typeof v.read==='boolean'&&iso(v.created_at)}
export function isComment(v:unknown):v is Comment{return exact(v,['id','domain','record_id','author_account_id','party_id','reply_to','body','current_status','object_version','created_at'])&&target(v)&&['TRADE','PRODUCTION','PROJECTS'].includes(String(v.domain))&&[v.id,v.author_account_id].every(validSupplyId)&&nullableId(v.party_id)&&nullableId(v.reply_to)&&['VISIBLE','WITHDRAWN','HIDDEN'].includes(String(v.current_status))&&(v.current_status==='VISIBLE'?str(v.body):v.body===null)&&int(v.object_version,1)&&iso(v.created_at)}
export function isAudit(v:unknown):v is Audit{return exact(v,['id','object_id','actor_account_id','event_code','object_version','reason','request_id','created_at'])&&int(v.id,1)&&[v.object_id,v.actor_account_id].every(validSupplyId)&&str(v.event_code,80)&&int(v.object_version,1)&&str(v.reason,1000,0)&&str(v.request_id,128)&&iso(v.created_at)}
export function isBusinessAudit(v:unknown):v is BusinessAudit{return exact(v,['id','record_id','actor_account_id','event_code','object_version','request_id','created_at'])&&[v.id,v.record_id].every(validSupplyId)&&nullableId(v.actor_account_id)&&str(v.event_code,80)&&int(v.object_version,1)&&str(v.request_id,128)&&iso(v.created_at)}
export function isReportRequest(v:unknown):v is ReportRequest{return exact(v,['kind','environment','period_start','period_end'])&&Object.hasOwn(reportKinds,String(v.kind))&&['SANDBOX','PRODUCTION'].includes(String(v.environment))&&iso(v.period_start)&&iso(v.period_end)&&v.period_start<v.period_end&&Date.parse(v.period_end)-Date.parse(v.period_start)<=366*86400000}
const reportRow=(v:unknown):v is ReportRow=>exact(v,['domain','record_id','source_id','source_sha256','category','amount_minor','currency','status','party_id','occurred_at'])&&target(v)&&str(v.source_id,128)&&hash(v.source_sha256)&&['RECEIPT','REFUND','ACCRUAL','ADJUSTMENT','PAYOUT','PAYOUT_RETURN','PROJECT'].includes(String(v.category))&&(v.amount_minor===null||int(v.amount_minor,-Number.MAX_SAFE_INTEGER))&&(v.currency===null||v.currency==='CNY')&&(v.status===null||str(v.status,80))&&nullableId(v.party_id)&&iso(v.occurred_at)
export function isReport(v:unknown):v is Report {
 if(!exact(v,['id','party_id','request','current_status','error_code','content_sha256','result'])||!validSupplyId(v.id)||!nullableId(v.party_id)||!exact(v.request,['kind','environment','period_start','period_end','metric_version'])||v.request.metric_version!=='1'||!isReportRequest(Object.fromEntries(Object.entries(v.request).filter(([k])=>k!=='metric_version')))||!['PENDING','RUNNING','RETRY','SUCCEEDED','FAILED','BLOCKED'].includes(String(v.current_status))||!(v.error_code===null||str(v.error_code,80)))return false
 if(v.current_status!=='SUCCEEDED')return v.result===null&&v.content_sha256===null
 const r=v.result,q=v.request as unknown as ReportRequest;if(v.error_code!==null||!hash(v.content_sha256)||!exact(r,['metric_version','environment','period_start','period_end','generated_at','row_count','totals','rows','sources','limitations'])||r.metric_version!=='1'||r.environment!==q.environment||r.period_start!==q.period_start||r.period_end!==q.period_end||!iso(r.generated_at)||!int(r.row_count,0,2000)||!obj(r.totals)||!Object.values(r.totals).every(n=>int(n,-Number.MAX_SAFE_INTEGER))||!Array.isArray(r.rows)||r.rows.length!==r.row_count||!r.rows.every(reportRow)||!Array.isArray(r.sources)||r.sources.length>2000||!r.sources.every(s=>exact(s,['domain','record_id','content_sha256'])&&target(s)&&hash(s.content_sha256))||!Array.isArray(r.limitations)||r.limitations.length>10||!r.limitations.every(s=>str(s)))return false
 const totals:Record<string,bigint>={},sources=new Set(r.sources.map(s=>s.domain+':'+s.record_id));if(sources.size!==r.sources.length)return false
 for(const row of r.rows){if(row.occurred_at<q.period_start||row.occurred_at>=q.period_end||!sources.has(row.domain+':'+row.record_id))return false
 if(q.kind==='CASH'&&!(row.domain==='TRADE'&&['RECEIPT','REFUND'].includes(row.category)&&row.amount_minor!==null&&row.amount_minor>=0&&row.currency==='CNY'&&row.party_id===null&&row.status===null))return false
 if(q.kind==='SETTLEMENT'&&!(row.domain==='FINANCE'&&['ACCRUAL','ADJUSTMENT','PAYOUT','PAYOUT_RETURN'].includes(row.category)&&row.amount_minor!==null&&row.currency==='CNY'&&validSupplyId(row.party_id)&&row.status===null&&(!v.party_id||row.party_id===v.party_id)))return false
 if(q.kind==='WORKLOAD'&&!(row.domain==='PRODUCTION'&&row.category==='PROJECT'&&row.amount_minor===null&&row.currency===null&&row.party_id===null&&str(row.status,80)))return false
 const k=row.status||row.category;totals[k]=(totals[k]||0n)+BigInt(row.amount_minor===null?1:row.amount_minor)}
 return Object.keys(totals).length===Object.keys(r.totals).length&&Object.entries(totals).every(([k,n])=>n===BigInt((r.totals as Record<string,number>)[k]!))&&new Set(r.rows.map(row=>row.domain+':'+row.record_id)).size===sources.size
}
const options=(i:SupplyIdentity,signal?:AbortSignal)=>({token:i.token,actingParty:i.partyId,cache:'no-store' as const,signal})
const shapeError=()=>new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'运营回复的身份、内容、状态或来源不符合接口约定，请核对原操作。'})
function checked<T>(r:ApiResult<unknown>,i:SupplyIdentity,guard:(v:unknown)=>v is T):T{if(!guard(r.data)||!r.meta?.request_id||r.meta.actor?.account_id!==i.accountId||r.meta.acting_party!==i.partyId)throw shapeError();return r.data}
const pageGuard=<T,C>(guard:(v:unknown)=>v is T,cursor:(v:unknown)=>boolean)=>(v:unknown):v is Page<T,C>=>exact(v,['items','next_cursor'])&&Array.isArray(v.items)&&v.items.length<=100&&v.items.every(guard)&&cursor(v.next_cursor)
export const getNotifications=async(i:SupplyIdentity,cursor:number|null=null,unread=false,signal?:AbortSignal)=>{const q=new URLSearchParams({limit:'30',unread_only:String(unread)});if(cursor!==null)q.set('cursor',String(cursor));return checked(await request('/operations/notifications?'+q,options(i,signal)),i,pageGuard<Notification,number>(isNotification,c=>c===null||int(c)))}
export const getComments=async(i:SupplyIdentity,t:Target,cursor:string|null=null,signal?:AbortSignal)=>{const q=new URLSearchParams({limit:'30'});if(cursor)q.set('cursor',cursor);return checked(await request(`/operations/objects/${t.domain}/${t.record_id}/comments?${q}`,options(i,signal)),i,pageGuard<Comment,string>((v):v is Comment=>isComment(v)&&v.domain===t.domain&&v.record_id===t.record_id,nullableId))}
export const getAudit=async(i:SupplyIdentity,objectId='',cursor:number|null=null,signal?:AbortSignal)=>{const q=new URLSearchParams({limit:'30'});if(objectId)q.set('object_id',objectId);if(cursor!==null)q.set('cursor',String(cursor));return checked(await request('/operations/audit?'+q,options(i,signal)),i,pageGuard<Audit,number>((v):v is Audit=>isAudit(v)&&(!objectId||v.object_id===objectId),c=>c===null||int(c)))}
export const getBusinessAudit=async(i:SupplyIdentity,t:Target,cursor:string|null=null,signal?:AbortSignal)=>{const q=new URLSearchParams({limit:'30'});if(cursor)q.set('cursor',cursor);return checked(await request(`/operations/objects/${t.domain}/${t.record_id}/audit?${q}`,options(i,signal)),i,pageGuard<BusinessAudit,string>((v):v is BusinessAudit=>isBusinessAudit(v)&&v.record_id===t.record_id,nullableId))}
function canonical(v:unknown):unknown{return Array.isArray(v)?v.map(canonical):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v}
export async function reportHash(result:ReportResult){const bytes=new TextEncoder().encode(JSON.stringify(canonical(result))),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')}
export async function verifyReport(r:Report,i:SupplyIdentity){if(r.party_id!==i.partyId)throw shapeError();if(r.result&&await reportHash(r.result)!==r.content_sha256)throw new ApiError({status:200,code:'PRIVATE_CONTENT_MISMATCH',message:'报表JSON快照指纹不一致，已停止显示和下载。'});return r}
export const getReport=async(i:SupplyIdentity,id:string,signal?:AbortSignal)=>verifyReport(checked(await request('/operations/reports/'+id,options(i,signal)),i,(v):v is Report=>isReport(v)&&v.id===id),i)
export function commentWriteMatches(v:Comment,c:OperationsWrite,i:SupplyIdentity){
 if(!obj(c.body))return false
 if(c.body.action)return v.current_status===(c.body.action==='HIDE'?'HIDDEN':'WITHDRAWN')&&(c.body.action!=='WITHDRAW'||v.author_account_id===i.accountId&&v.party_id===i.partyId)
 return v.author_account_id===i.accountId&&v.party_id===i.partyId&&v.reply_to===c.body.reply_to&&(v.current_status!=='VISIBLE'||v.body===c.body.body)
}
export async function postOperations(i:SupplyIdentity,c:OperationsWrite,key:string,signal?:AbortSignal):Promise<WriteResult>{
 const reply=await request(c.path,{...options(i,signal),method:'POST',body:c.body,idempotencyKey:key,ifMatch:c.version})
 const guard=(v:unknown):v is WriteResult=>c.resultKind==='COMMENT'?isComment(v)&&(!c.target||v.domain===c.target.domain&&v.record_id===c.target.record_id)&&(!c.resultId||v.id===c.resultId)&&commentWriteMatches(v,c,i):c.resultKind==='READ'?exact(v,['id','read'])&&int(v.id,1)&&v.read===true&&v.id===c.resultId:isReport(v)&&(!c.resultId||v.id===c.resultId)&&(!c.request||Object.entries(c.request).every(([k,val])=>v.request[k as keyof ReportRequest]===val))
 try{const r=checked(reply,i,guard);return c.resultKind==='REPORT'?await verifyReport(r as Report,i):r}catch(cause){
  // A trustworthy result identifier survives a malformed/private-content response. Recovery reads only this result.
  if(cause instanceof ApiError&&reply.meta?.request_id&&reply.meta.actor?.account_id===i.accountId&&reply.meta.acting_party===i.partyId&&obj(reply.data)){
   const id=reply.data.id,valid=c.resultKind==='READ'?int(id,1)&&id===c.resultId:validSupplyId(id)&&(!c.resultId||id===c.resultId)
   if(valid)Object.assign(cause,{resultId:id})
  }throw cause
 }
}
export const getCsv=(i:SupplyIdentity,id:string,signal?:AbortSignal)=>requestBytes('/operations/reports/'+id+'/content',options(i,signal),'text/csv')
export async function verifyRecoveryIdentity(i:SupplyIdentity,signal?:AbortSignal){const r=await request('/me',{token:i.token,cache:'no-store',signal});if(!obj(r.data)||r.data.id!==i.accountId||r.meta?.actor?.account_id!==i.accountId||r.meta.acting_party!==null||!r.meta.request_id)throw shapeError();return r.data}
export async function getBusiness(i:SupplyIdentity,t:Target,signal?:AbortSignal):Promise<BusinessRecord>{if(!domain(t.domain)||!validSupplyId(t.record_id))throw new ApiError({status:400,code:'CLIENT_OBJECT_INVALID',message:'请使用真实业务域和完整记录编号。'});switch(t.domain){case'TRADE':return getTrade(i,t.record_id,undefined,signal);case'PRODUCTION':return getProduction(i,t.record_id,undefined,signal);case'PROJECTS':return getProject(i,t.record_id,undefined,signal);case'FINANCE':return getFinance(i,t.record_id,undefined,signal);case'LICENSE':return getLicense(i,t.record_id,undefined,signal);case'GIGS':return getGig(i,t.record_id,undefined,signal);case'SUPPLY':return checked(await request('/supply/records/'+t.record_id,options(i,signal)),i,(v):v is SupplyRecord=>isSupplyRecord(v)&&v.id===t.record_id&&(!i.partyId||v.owner_party_id===i.partyId))}}
export function commentable(t:Target,r:BusinessRecord){return r.id===t.record_id&&(t.domain==='TRADE'&&r.kind==='ORDER'||t.domain==='PRODUCTION'&&['PROJECT','VERSION'].includes(r.kind)||t.domain==='PROJECTS'&&r.kind==='PROJECT')}
export function businessLink(t:Target,r:BusinessRecord){switch(t.domain){case'TRADE':return '/trade/'+({SPEC:'specifications',QUOTE:'quotes',ORDER:'orders',PAYMENT:'payments',REFUND:'refunds',LEGACY:'legacy'} as Record<string,string>)[r.kind]+'/'+r.id;case'PRODUCTION':return r.kind==='PROJECT'?'/production/projects/'+r.id:r.kind==='VERSION'?'/production/versions/'+r.id:'project_id' in r&&r.project_id?'/production/projects/'+r.project_id+(r.kind==='GENERATION'?'/generation':''):'/production/projects';case'PROJECTS':return r.kind==='PROJECT'?'/projects/projects/'+r.id:'/projects/records/'+r.id;case'FINANCE':return r.kind==='AGREEMENT'?'/finance/agreements/'+r.id:'/finance/records/'+r.id;case'SUPPLY':return '/supply/'+(r.kind==='PROFILE'?'profiles':'works')+'/'+r.id;case'LICENSE':return '/licensing/'+({PRODUCT:'products',RESERVATION:'reservations',EVIDENCE:'evidence',GRANT:'grants',PROJECT:'projects',BINDING:'bindings',READING:'readings'} as Record<string,string>)[r.kind]+'/'+r.id;case'GIGS':return '/gigs/'+({GIG:'requests',OFFER:'offers',RELATION:'relations',COMMISSION:'commissions',RULE:'rules',RANKING:'rankings'} as Record<string,string>)[r.kind]+'/'+r.id}}
export const eventLabels:Record<string,string>={COMMENT_CREATED:'业务有新留言',COMMENT_WITHDRAW:'作者已撤回留言',COMMENT_HIDE:'留言已独立隐藏',REPORT_REQUESTED:'报表已申请',REPORT_GENERATED:'报表已生成',REPORT_RETRY:'报表重试已申请',APPROVED:'业务已获批准',REJECTED:'业务已被拒绝',CREATED:'业务记录已建立',PARTY_APPROVED:'本方确认已保存',PARTY_REJECTED:'本方拒绝已保存',PAYOUT_PAID:'真实付款已独立核实',RECEIPT_VERIFIED:'到账已独立核实'}
export const eventText=(code:string)=>eventLabels[code]||'业务状态有变化（'+code+'）'
export const commentStatus={VISIBLE:'可见',WITHDRAWN:'作者已撤回',HIDDEN:'已独立隐藏'}
export const reportStatus={PENDING:'等待后台生成',RUNNING:'后台正在生成',RETRY:'等待后台重试',SUCCEEDED:'已生成不可变结果',FAILED:'失败，需核对条件',BLOCKED:'已阻塞，需修复条件'}
export function utcInput(value:string){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))return '';const candidate=value+(value.length===16?':00':'')+'.000Z';return iso(candidate)?candidate:''}
export function reportMoney(n:number){const value=BigInt(n),negative=value<0n,abs=negative?-value:value;return (negative?'-':'')+'¥'+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0')}
