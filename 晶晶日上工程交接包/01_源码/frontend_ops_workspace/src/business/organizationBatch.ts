import {ApiError} from '@/api/client'
import {uuid} from './model'
import {batchActions,type BatchItem} from '@/stores/organizationBatch'
import type {BusinessData} from '@/api/modules/business'
export function validateBatch(data:BusinessData,items:BatchItem[],party:string){
 const rows=data.items as BusinessData[]
 if(!uuid(data.id)||data.party_id!==party||data.meaning!=='SUBMITTED_NOT_APPROVED'||data.retry_uses_original_request!==true||!['COMPLETED','PARTIAL'].includes(String(data.current_status))||!Array.isArray(rows)||rows.length!==items.length||new Set(rows.map(r=>r.key)).size!==items.length||rows.some((r,i)=>r.key!==items[i]?.key||r.action!==items[i]?.action||!['SUCCEEDED','REJECTED','RETRY_REQUIRED','UNAVAILABLE','NOT_RUN'].includes(String(r.status))||(r.status==='SUCCEEDED'?(!uuid(r.result_id)||typeof r.result_status!=='string'||r.error_code!==null):r.result_id!==null))||((data.current_status==='COMPLETED')!==rows.every(r=>r.status==='SUCCEEDED')))throw new ApiError({status:503,code:'INVALID_BATCH_RESPONSE',message:'返回批次与原清单不一致，请核对同一批次后恢复。'})
}
export const batchStatus:Record<string,string>={SUCCEEDED:'已提交，业务审核或生效另核',REJECTED:'明确拒绝，按原因修改后另办',RETRY_REQUIRED:'结果待恢复，沿原批继续',UNAVAILABLE:'当前无权核对，停止展示结果',NOT_RUN:'尚未办理'}
export function batchResultLink(item:BatchItem,result:BusinessData):string|null{
 if(result.status!=='SUCCEEDED'||!uuid(result.result_id))return null
 const id=String(result.result_id)
 return item.action==='ARTIST_LISTING'?'/artists/people/'+item.input.person_id+'/records/'+id:item.action==='STOCK_LISTING'?'/stock/listings/'+id:item.action==='PRICE_REVISION'?'/trade/specifications/'+id:item.action==='PRODUCTION_ASSIGNMENT'?'/production/projects/'+id:item.input.booking_id?'/auditions/bookings/'+item.input.booking_id:'/trade/orders/'+item.input.order_id
}
export {batchActions}
