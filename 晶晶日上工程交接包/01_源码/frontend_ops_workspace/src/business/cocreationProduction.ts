import {ApiError} from '@/api/client'
import {rowData,type BusinessData} from '@/api/modules/business'
import {uuid} from './model'

/** Only an actual assigned project and its matching fulfillment may supply room context. */
export function cocreationProductionContext(project:BusinessData,flow:BusinessData,scope:{projectId:string;roomId?:string;partyId:string;accountId:string}){
 const data=rowData(project),co=flow.cocreation as BusinessData|undefined
 if(project.kind!=='PROJECT'||project.id!==scope.projectId||flow.project_id!==project.id||flow.order_id!==project.order_id||!uuid(project.order_id)||!uuid(co?.room_id)||scope.roomId&&scope.roomId!==co?.room_id||data.producer_party_id!==scope.partyId||data.assignee_account_id!==scope.accountId)
  throw new ApiError({status:403,code:'COCREATION_ASSIGNED_PROJECT_REQUIRED',message:'请由本项目当前获派制作人员读取原共创材料；项目、房间或办理身份不一致。'})
 return {record_id:String(co!.room_id),project_id:scope.projectId,order_id:String(project.order_id)}
}
