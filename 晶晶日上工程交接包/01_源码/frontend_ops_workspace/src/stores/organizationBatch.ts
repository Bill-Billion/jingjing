import {defineStore} from 'pinia'
import {ref,computed,watch} from 'vue'
import {useSessionStore} from './session'
import {newIdempotencyKey} from '@/api/client'
import {businessData,type BusinessData} from '@/api/modules/business'
export const batchActions:Record<string,string>={ARTIST_LISTING:'艺人送审',STOCK_LISTING:'影片送审',PRICE_REVISION:'拟定新价格',MCN_ASSIGNMENT:'经纪分派',PRODUCTION_ASSIGNMENT:'制作负责人分派'}
export interface BatchItem {key:string;action:string;input:BusinessData}
export const useOrganizationBatch=defineStore('organization-batch',()=>{
 const session=useSessionStore(),items=ref<BatchItem[]>([]),frozen=ref(false)
 const available=computed(()=>session.selected?.party.kind==='ORGANIZATION'&&session.selected.membership.current_status==='ACTIVE'&&session.selected.party.current_status==='ACTIVE')
 watch(()=>JSON.stringify([session.token,session.account?.id,session.selectedId,session.revision]),()=>{items.value=[];frozen.value=false},{flush:'sync'})
 function add(action:string,input:BusinessData){
  if(!available.value||frozen.value)throw new Error('先选择有效机构；已有批次待核对时不能改变原内容。')
  if(!Object.hasOwn(batchActions,action)||items.value.length>=20)throw new Error('每批最多20项，请先办理当前批次。')
  const copy=businessData(JSON.parse(JSON.stringify(input)));if('party_id'in copy||'operation_key'in copy)throw new Error('不能改变本批机构或原请求编号。')
  if(items.value.some(i=>i.action===action&&JSON.stringify(i.input)===JSON.stringify(copy)))throw new Error('这份内容已加入本批，请核对清单，不重复加入。')
  items.value.push({key:newIdempotencyKey(),action,input:copy})
 }
 function reset(){if(frozen.value)throw new Error('先核对原批次结果。');items.value=[]}
 return{items,frozen,available,add,reset}
})
