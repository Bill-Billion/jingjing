import { ApiError, request, requestBytes } from '@/api/client'
import { uuid } from '@/business/model'

export interface StockMediaIdentity { token:string; accountId:string }
export interface StockMediaRecord { id:string; object_version:number; offer_sha256:string }
export interface StockPublicMedia {
  listing_id:string; listing_version:number; source_sha256:string; preview_sha256:string
  duration_ms:number; preview_duration_ms:number; preview_width:number; preview_height:number
  cover:{media_type:'image/jpeg';byte_size:number;content_sha256:string;width:number;height:number;frame_ms:0;source:'REVIEWED_PREVIEW'}
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const integer=(v:unknown,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=max
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
function invalid(message='封面或时长无法核对，请重新读取。'):never { throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message}) }
export function isStockMediaRecord(v:unknown):v is StockMediaRecord {
  return object(v)&&uuid(v.id)&&integer(v.object_version,2147483647)&&hash(v.offer_sha256)
}
export function isStockPublicMedia(v:unknown):v is StockPublicMedia {
  if(!object(v)||!exact(v,['listing_id','listing_version','source_sha256','preview_sha256','duration_ms','preview_duration_ms','preview_width','preview_height','cover']))return false
  const c=v.cover
  return uuid(v.listing_id)&&integer(v.listing_version,2147483647)&&hash(v.source_sha256)&&hash(v.preview_sha256)
    &&integer(v.duration_ms,1800000)&&integer(v.preview_duration_ms,1800000)&&integer(v.preview_width,4096)&&integer(v.preview_height,4096)
    &&object(c)&&exact(c,['media_type','byte_size','content_sha256','width','height','frame_ms','source'])&&c.media_type==='image/jpeg'
    &&integer(c.byte_size,2097151)&&hash(c.content_sha256)&&integer(c.width,640)&&integer(c.height,640)&&c.frame_ms===0&&c.source==='REVIEWED_PREVIEW'
}
function identity(i:StockMediaIdentity) { if(!i.token||!uuid(i.accountId))throw new ApiError({status:401,code:'CLIENT_IDENTITY_REQUIRED',message:'请登录后读取封面和时长。'}) }
export async function getStockPublicMedia(i:StockMediaIdentity,record:StockMediaRecord,signal?:AbortSignal) {
  identity(i);if(!isStockMediaRecord(record))invalid('请先重新读取当前影片。')
  const r=await request<unknown>(`/stock/catalog/${record.id}/media`,{token:i.token,signal,cache:'no-store'})
  if(!r.meta?.request_id||r.meta.actor?.account_id!==i.accountId||r.meta.acting_party!==null||!isStockPublicMedia(r.data)
    ||r.data.listing_id!==record.id||r.data.listing_version!==record.object_version)invalid('影片版本或媒体资料已经变化，请刷新当前影片后重试。')
  return r.data
}
export async function getStockCover(i:StockMediaIdentity,media:StockPublicMedia,signal?:AbortSignal) {
  identity(i);if(!isStockPublicMedia(media))invalid()
  const blob=await requestBytes(`/stock/catalog/${media.listing_id}/cover`,{token:i.token,signal},'image/jpeg')
  if(blob.size!==media.cover.byte_size)invalid()
  const bytes=await blob.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')
  const signature=new Uint8Array(bytes,0,Math.min(bytes.byteLength,3))
  if(digest!==media.cover.content_sha256||signature[0]!==255||signature[1]!==216||signature[2]!==255)invalid()
  return blob
}
export function stockDuration(milliseconds:number) {
  if(!integer(milliseconds,1800000))return '暂不可读取'
  const minutes=Math.floor(milliseconds/60000),seconds=(milliseconds%60000/1000).toFixed(3).replace(/\.?0+$/,'')||'0'
  return minutes?`${minutes} 分 ${seconds} 秒`:`${seconds} 秒`
}
