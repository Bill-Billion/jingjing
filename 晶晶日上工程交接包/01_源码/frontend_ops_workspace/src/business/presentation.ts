import type { BusinessData } from '@/api/modules/business'
// The API still returns institution-wide aggregates for a scoped staff member.
// This presentation boundary limits what is displayed; server-side scope remains a Core blocker.
export function mcnDashboardView(record:BusinessData,accountId:string,owner:boolean):BusinessData {
 if(owner||!Array.isArray(record.assignments))return record
 const assignments=(record.assignments as BusinessData[]).filter(r=>(r.data as BusinessData|undefined)?.account_id===accountId)
 const orderIds=new Set(assignments.map(r=>(r.data as BusinessData|undefined)?.order_id).filter(Boolean))
 return {assignments,orders:(Array.isArray(record.orders)?record.orders as BusinessData[]:[]).filter(r=>orderIds.has(r.id)||orderIds.has(r.order_id)),history_preserved:record.history_preserved,truncated:record.truncated,staff_scope:true,scope_note:'这里只展示当前账号的明确受派事项。实际收入范围待服务端复核；机构整体关系与汇总金额暂不展示。'}
}
