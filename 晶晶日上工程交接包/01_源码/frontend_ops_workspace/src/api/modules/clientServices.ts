import { ApiError, request, type RequestOptions } from '@/api/client'
import { validSupplyId as id, type SupplyIdentity } from './supply'
import { isArtistCatalogItem, type ArtistCatalogItem } from './artists'
export type Json = Record<string, any>
export const object = (v:unknown):v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v:unknown):v is string => typeof v === 'string' && !!v.trim()
const integer = (v:unknown,min=0):v is number => Number.isSafeInteger(v) && Number(v)>=min
const date = (v:unknown):v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const ids = (v:unknown):v is string[] => Array.isArray(v) && v.length<=10 && v.every(id) && new Set(v).size===v.length
export interface Page<T=Json> { items:T[];next_cursor:string|number|null }
export function isPage<T>(guard:(v:unknown)=>v is T,cursor:'string'|'number'='string') { return (v:unknown):v is Page<T> => object(v)&&Array.isArray(v.items)&&v.items.length<=100&&v.items.every(guard)&&(v.next_cursor===null||(cursor==='number'?integer(v.next_cursor,1):text(v.next_cursor)&&v.next_cursor.length<=512)) }
export const shapeError=()=>new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'返回内容与当前账号、身份或业务记录不符，请重新读取。'})
export async function serviceRequest<T>(identity:SupplyIdentity,path:string,guard:(v:unknown)=>v is T,options:RequestOptions={}) {
 const result=await request<unknown>(path,{...options,token:identity.token,actingParty:identity.partyId,cache:'no-store'})
 if(!result.meta?.request_id||result.meta.actor?.account_id!==identity.accountId||result.meta.acting_party!==identity.partyId||!guard(result.data))throw shapeError()
 return result.data
}
export function query(values:Record<string,unknown>) { const q=new URLSearchParams();Object.entries(values).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=='')q.set(k,String(v))});return q.size?'?'+q:'' }
export const kinds={ARTIST:'艺人',STOCK:'现成影片',AUDITION:'试镜',NOTICE:'通告'} as const
export type PublicKind=keyof typeof kinds
export type CollectionKind=Exclude<PublicKind,'AUDITION'>
export function publicLink(kind:PublicKind,target:string) { return kind==='ARTIST'?`/artists/catalog/${target}`:kind==='STOCK'?`/stock/catalog/${target}`:kind==='NOTICE'?`/notices/catalog/${target}`:`/auditions/catalog/${target}` }
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export function isStockOffer(v:unknown):v is Json {return object(v)&&id(v.id)&&id(v.seller_party_id)&&text(v.title)&&text(v.description)&&text(v.city)&&Array.isArray(v.person_ids)&&v.person_ids.every(id)&&integer(v.unit_minor,1)&&v.currency==='CNY'&&object(v.license)&&integer(v.object_version,1)&&sha(v.offer_sha256)}
export function isAuditionOffer(v:unknown):v is Json {return object(v)&&id(v.id)&&id(v.person_id)&&id(v.avatar_id)&&text(v.title)&&text(v.city)&&text(v.service_area)&&['OFFLINE','ONLINE_MATERIALS'].includes(v.mode)&&Array.isArray(v.slots)&&v.slots.every((s:unknown)=>object(s)&&date(s.starts_at)&&date(s.ends_at))&&typeof v.public_price==='boolean'&&(v.public_price?integer(v.unit_minor):v.unit_minor===null)&&v.currency==='CNY'&&v.transport_included===true&&sha(v.offer_sha256)}
export function isNoticePublic(v:unknown):v is Json {return object(v)&&id(v.id)&&(v.owner_party_id===null||id(v.owner_party_id))&&integer(v.object_version,1)&&object(v.notice)&&text(v.notice.title)&&text(v.notice.description)&&text(v.notice.city)&&date(v.notice.valid_from)&&date(v.notice.valid_until)&&typeof v.official==='boolean'&&v.chat_enabled===false&&id(v.rule_id)}
export function isPublicItem(v:unknown):v is Json {return isArtistCatalogItem(v)||isStockOffer(v)||isAuditionOffer(v)||isNoticePublic(v)}
export function isSearch(v:unknown):v is Json&Page {return object(v)&&Object.hasOwn(kinds,v.kind)&&(v.city===null||text(v.city))&&(v.q===null||text(v.q))&&isPage(({ARTIST:isArtistCatalogItem,STOCK:isStockOffer,AUDITION:isAuditionOffer,NOTICE:isNoticePublic} as Record<string,(v:unknown)=>v is Json>)[v.kind]!)(v)&&(v.next_cursor===null||typeof v.next_cursor==='string')}
export interface Cities {revision:string;scope:'QUICK_CHOICES';allows_custom_city:true;items:{code:string;name:string;aliases:string[]}[]}
export function isCities(v:unknown):v is Cities {return object(v)&&text(v.revision)&&v.scope==='QUICK_CHOICES'&&v.allows_custom_city===true&&Array.isArray(v.items)&&v.items.every(x=>object(x)&&text(x.code)&&text(x.name)&&Array.isArray(x.aliases)&&x.aliases.every(text))}
export interface Cover {asset_id:string;media_type:'image/jpeg'|'image/png';byte_size:number;content_sha256:string}
export function isCover(v:unknown):v is Cover {return object(v)&&id(v.asset_id)&&['image/jpeg','image/png'].includes(v.media_type)&&integer(v.byte_size,1)&&v.byte_size<=8388608&&/^[a-f0-9]{64}$/.test(v.content_sha256)}
export interface Organization {record_id:string;object_version:number;party_id:string;display_name:string;introduction:string;city:string;verified_capabilities:string[];valid_from:string;valid_until:string;cover:Cover|null}
export function isOrganization(v:unknown):v is Organization {return object(v)&&id(v.record_id)&&id(v.party_id)&&integer(v.object_version,1)&&text(v.display_name)&&text(v.introduction)&&text(v.city)&&Array.isArray(v.verified_capabilities)&&v.verified_capabilities.every((c:unknown)=>typeof c==='string'&&Object.hasOwn(capabilities,c))&&date(v.valid_from)&&date(v.valid_until)&&(v.cover===null||isCover(v.cover))}
export interface Featured {record_id:string;object_version:number;recommendation:string;selection_kind:'EDITORIAL_SELECTION';artist:ArtistCatalogItem;valid_from:string;valid_until:string;sort_order:number}
export function isFeatured(v:unknown):v is Featured {return object(v)&&id(v.record_id)&&integer(v.object_version,1)&&text(v.recommendation)&&v.selection_kind==='EDITORIAL_SELECTION'&&isArtistCatalogItem(v.artist)&&date(v.valid_from)&&date(v.valid_until)&&integer(v.sort_order)}
export const directoryStatus:Record<string,string>={IN_REVIEW:'等待独立审核',APPROVED:'已审核通过',REJECTED:'已退回',WITHDRAWN:'已撤回',REPLACED:'已有新版本'}
export function isDirectoryRecord(v:unknown):v is Json {
 if(!object(v)||!id(v.id)||!['ORGANIZATION','FEATURED_ARTIST'].includes(v.kind)||!id(v.owner_party_id)||!id(v.source_id)||!id(v.created_by)||!integer(v.object_version,1)||!integer(v.sort_order)||!sha(v.content_sha256)||!Object.hasOwn(directoryStatus,v.current_status)||!object(v.data))return false
 const d=v.kind==='ORGANIZATION'?v.data.profile:v.data.feature,r=v.data.review
 if(!object(d)||!date(d.valid_from)||!date(d.valid_until)||Date.parse(d.valid_from)>=Date.parse(d.valid_until)||!(r===null||object(r)&&id(r.account_id)&&['APPROVE','REJECT'].includes(r.decision)&&text(r.reason)&&(r.checks===null||object(r.checks))))return false
 return v.kind==='ORGANIZATION'?text(d.display_name)&&text(d.introduction)&&text(d.city)&&Array.isArray(d.capabilities)&&d.capabilities.every((c:unknown)=>typeof c==='string'&&Object.hasOwn(capabilities,c))&&(d.cover_asset_id===null||id(d.cover_asset_id))&&ids(d.evidence_asset_ids)&&d.evidence_asset_ids.length>0:id(d.listing_id)&&text(d.recommendation)&&integer(d.sort_order)&&text(v.data.city)&&text(v.data.search_text)
}
export const capabilities:Record<string,string>={AUTHOR:'作者',SCRIPT_SUPPLIER:'剧本供给',PRODUCER:'制作',MCN:'艺人经营',BRAND_CLIENT:'品牌客户'}
export interface Preferences {history_enabled:boolean;object_version:number;history_days:number;history_max_entries:number}
export function isPreferences(v:unknown):v is Preferences{return object(v)&&typeof v.history_enabled==='boolean'&&integer(v.object_version,1)&&integer(v.history_days,1)&&integer(v.history_max_entries,1)}
export interface CollectionEntry {kind:CollectionKind;target_id:string;recorded_at:string;availability:'AVAILABLE'|'UNAVAILABLE';title:string|null;city:string|null}
export function isCollectionEntry(v:unknown):v is CollectionEntry {return object(v)&&['ARTIST','STOCK','NOTICE'].includes(v.kind)&&id(v.target_id)&&date(v.recorded_at)&&(v.availability==='AVAILABLE'&&(v.title===null||typeof v.title==='string')&&(v.city===null||typeof v.city==='string')||v.availability==='UNAVAILABLE'&&v.title===null&&v.city===null)}
export interface TargetState {saved:boolean;visited:boolean}
export const isTargetState=(v:unknown):v is TargetState=>object(v)&&typeof v.saved==='boolean'&&typeof v.visited==='boolean'
export const isApplied=(v:unknown):v is {applied:true}=>object(v)&&v.applied===true
export const supportStatus={SUBMITTED:'已提交，等待受理',PROCESSING:'正在处理',NEEDS_INFO:'请补充材料',ANSWERED:'已有答复',CLOSED:'已关闭'} as const
export const supportActions:Record<string,string>={SUBMIT:'提交',START:'开始处理',REQUEST_INFO:'要求补充材料',ANSWER:'给出答复',CLOSE:'结束本次反馈',REOPEN:'重新提出问题',SUPPLEMENT:'补交说明与附件'}
export interface SupportTarget {domain:string;record_id:string}
export interface Ticket {id:string;kind:'FEEDBACK'|'REPORT';title:string;party_id:string;target:SupportTarget|null;current_status:keyof typeof supportStatus;object_version:number;created_at:string;updated_at:string}
export function isTarget(v:unknown):v is SupportTarget {return object(v)&&text(v.domain)&&id(v.record_id)}
export function isTicket(v:unknown):v is Ticket {return object(v)&&id(v.id)&&['FEEDBACK','REPORT'].includes(v.kind)&&text(v.title)&&id(v.party_id)&&(v.target===null||isTarget(v.target))&&Object.hasOwn(supportStatus,v.current_status)&&integer(v.object_version,1)&&date(v.created_at)&&date(v.updated_at)}
export interface SupportEvent {object_version:number;actor_kind:'APPLICANT'|'SUPPORT';action:string;text:string;asset_ids:string[];created_at:string}
export function isSupportEvent(v:unknown):v is SupportEvent {return object(v)&&integer(v.object_version,1)&&['APPLICANT','SUPPORT'].includes(v.actor_kind)&&Object.hasOwn(supportActions,v.action)&&text(v.text)&&ids(v.asset_ids)&&date(v.created_at)}
export function availableSupportActions(status:Ticket['current_status'],operator:boolean):string[]{return operator?({SUBMITTED:['START'],PROCESSING:['REQUEST_INFO','ANSWER'],NEEDS_INFO:[],ANSWERED:['CLOSE'],CLOSED:[]})[status]:({SUBMITTED:[],PROCESSING:[],NEEDS_INFO:['SUPPLEMENT'],ANSWERED:['CLOSE','REOPEN'],CLOSED:['REOPEN']})[status]}
export const channels={ORDER_CONVERSATIONS:'订单会话',SUBMISSION_INTENTS:'投稿意向',ACTIVITY_VOTING:'活动投票',SYSTEM:'系统通知'} as const
export type Channel=keyof typeof channels
export interface FeedItem {id:number;domain:string;record_id:string;event_code:string;object_version:number;read:boolean;created_at:string;channel:Channel;target:SupportTarget}
export function isFeedItem(v:unknown):v is FeedItem {return object(v)&&integer(v.id,1)&&text(v.domain)&&id(v.record_id)&&text(v.event_code)&&integer(v.object_version,1)&&typeof v.read==='boolean'&&date(v.created_at)&&Object.hasOwn(channels,v.channel)&&isTarget(v.target)}
export interface Unread {total:number;channels:Record<Channel,number>;snapshot_id:string;as_of:string;expires_at:string;coverage:'CURRENT_AUTHORIZED_NOTIFICATIONS'}
export function isUnread(v:unknown):v is Unread {return object(v)&&integer(v.total)&&object(v.channels)&&Object.keys(channels).every(k=>integer(v.channels[k]))&&Object.values(v.channels).reduce((a:number,n:any)=>a+Number(n),0)===v.total&&id(v.snapshot_id)&&date(v.as_of)&&date(v.expires_at)&&v.coverage==='CURRENT_AUTHORIZED_NOTIFICATIONS'}
export const isReadAll=(v:unknown):v is {snapshot_id:string;as_of:string;marked_count:number;skipped_count:number}=>object(v)&&id(v.snapshot_id)&&date(v.as_of)&&integer(v.marked_count)&&integer(v.skipped_count)
export function directTargetLink(t:SupportTarget,notification=false):string|null {switch(t.domain){case'SUPPORT':return'/support/tickets/'+t.record_id;case'AUDITIONS':return'/auditions/'+(notification?'messages/':'bookings/')+t.record_id;case'GIG_ORDER':return'/conversations/messages/'+t.record_id;case'ENGAGEMENT':return'/engagement/records/'+t.record_id;case'NOTICES':return'/notices/submissions/'+t.record_id;case'ARTIST_PUBLIC':return publicLink('ARTIST',t.record_id);case'STOCK_PUBLIC':return publicLink('STOCK',t.record_id);case'NOTICE_PUBLIC':return publicLink('NOTICE',t.record_id);case'CUSTOMIZATION':return'/operations/customization/mine/'+t.record_id;case'STOCK':return'/stock/listings/'+t.record_id;case'COCREATION':return'/cocreation/rooms/'+t.record_id;case'REDEMPTION':return'/redemption/grants/'+t.record_id;case'PRIVACY':return'/privacy/requests/'+t.record_id;default:return null}}
