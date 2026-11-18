import { ApiError } from '@/api/client'
import type { BusinessData } from '@/api/modules/business'
import { uuid } from './model'
export const refundBase = '/wallet/operations/recharge-refunds'
export const refundStates: Record<string,string> = {IN_REVIEW:'待独立核验',APPROVED:'已核定，尚非到账',REJECTED:'申请已退回',CANCELLED:'未发送申请已取消',SUBMITTING:'正在提交原退款',UNKNOWN:'原退款结果待核对',SUCCEEDED:'退款已核实成功',CLOSED:'原退款已关闭'}
export interface RechargeRefund extends BusinessData { id:string; current_status:string; object_version:number; recharge_id:string; requested_minor:number; amount_minor:number; currency:'CNY'; reason:string; created_at:string; submitted_at:string|null; settled_at:string|null; applicant_kind:'SELF'|'GUARDIAN'; task_scheduled:boolean; evidence_asset_ids?:string[] }
const validTime=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))
export function refundShape():never {throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'充值退款记录无法核对，请保留原请求并重新读取。'})}
export function refundRecord(value:BusinessData,detail=false):RechargeRefund {
 if(!uuid(value.id)||!uuid(value.recharge_id)||typeof value.current_status!=='string'||!Object.prototype.hasOwnProperty.call(refundStates,value.current_status)||!Number.isSafeInteger(value.object_version)||Number(value.object_version)<1||!Number.isSafeInteger(value.requested_minor)||Number(value.requested_minor)<1||!Number.isSafeInteger(value.amount_minor)||Number(value.amount_minor)<0||Number(value.amount_minor)>Number(value.requested_minor)||value.currency!=='CNY'||typeof value.reason!=='string'||!validTime(value.created_at)||value.submitted_at!==null&&!validTime(value.submitted_at)||value.settled_at!==null&&!validTime(value.settled_at)||!['SELF','GUARDIAN'].includes(String(value.applicant_kind))||typeof value.task_scheduled!=='boolean')refundShape()
 const ids=value.evidence_asset_ids
 if(detail||ids!==undefined)if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(x=>!uuid(x))||new Set(ids).size!==ids.length)refundShape()
 return value as RechargeRefund
}
export function refundPage(value:BusinessData,previous:string) {
 if(!Array.isArray(value.items)||value.next_cursor!==null&&!uuid(value.next_cursor)||value.next_cursor===previous&&previous)refundShape()
 const items=value.items.map(x=>{if(!x||typeof x!=='object'||Array.isArray(x))refundShape();return refundRecord(x as BusinessData)})
 return {items,next:value.next_cursor as string|null}
}
export function refundActionAllowed(r:RechargeRefund,key:string) {
 if(key==='review')return r.current_status==='IN_REVIEW'
 if(key==='scheduling')return ['APPROVED','SUBMITTING','UNKNOWN'].includes(r.current_status)
 if(key==='retry')return r.task_scheduled&&['APPROVED','SUBMITTING','UNKNOWN','SUCCEEDED','CLOSED','CANCELLED','REJECTED'].includes(r.current_status)
 return false
}
export const refundMoney=(n:number)=>`¥${(n/100).toFixed(2)}`
