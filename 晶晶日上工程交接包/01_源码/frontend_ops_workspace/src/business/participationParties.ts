import {readBusiness,rowData,type BusinessData} from '@/api/modules/business'
import {ApiError} from '@/api/client'
import {uuid} from './model'

// These are choices from this project's records, not grants or automatic revenue shares.
export async function readParticipationParties(projectId:string,identity:{token:string;accountId:string;partyId:string}) {
 const invalid=()=>new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'项目参与方与原合同不一致，请重新读取当前项目。',requestMethod:'GET'})
 if(!uuid(projectId)||!uuid(identity.partyId))throw invalid()
 const options={token:identity.token,accountId:identity.accountId,actingParty:identity.partyId}
 const project=(await readBusiness(`/projects/records/${projectId}`,options)).data
 if(project.id!==projectId||project.kind!=='PROJECT'||!uuid(project.owner_party_id)||!Number.isSafeInteger(project.object_version))throw invalid()
 const found=new Map<string,{party_id:string;label:string;current_status:string}>()
 const add=(party:unknown,label:string)=>{if(!uuid(party))throw invalid();const prior=found.get(party);found.set(party,{party_id:party,label:prior&&!prior.label.includes(label)?prior.label+' / '+label:prior?.label||label,current_status:'AVAILABLE'})}
 add(project.owner_party_id,'本项目出品 / 付款方')
 for(const kind of ['CANDIDATE','PARTICIPATION']){
  let cursor:string|null=null;const seen=new Set<string>(),records=new Set<string>()
  do{
   const url=`/projects/projects/${projectId}/records?kind=${kind}`+(cursor?'&cursor='+encodeURIComponent(cursor):'')
   const page=(await readBusiness(url,options)).data,next=page.next_cursor
   if(!Array.isArray(page.items)||!(next===null||uuid(next)&&next!==cursor&&!seen.has(next)))throw invalid()
   if(seen.size>=100)throw invalid()
   for(const raw of page.items){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();const r=raw as BusinessData
    if(!uuid(r.id)||r.project_id!==projectId||r.kind!==kind||records.has(r.id)||!uuid(r.owner_party_id))throw invalid();records.add(r.id)
    if(kind==='CANDIDATE'){if(r.current_status==='CONFIRMED')add(r.owner_party_id,'本项目已确认参演方');continue}
    if(r.current_status!=='APPROVED')continue
    const d=rowData(r),f=d.marketplace_finance as BusinessData|null|undefined,a=f?.allocation as BusinessData|undefined
    add(r.owner_party_id,'原已审参演合同艺人方')
    if(!Array.isArray(d.confirmers))throw invalid()
    for(const c of d.confirmers){if(!c||typeof c!=='object')throw invalid();add((c as BusinessData).party_id,'原已审参演合同确认方')}
    if(a)for(const [key,label] of Object.entries({platform_party_id:'原已审参演合同平台方',supplier_party_id:'原已审参演合同供给方',mcn_party_id:'原已审参演合同经纪机构',referrer_party_id:'原已审参演合同直接推荐方'})){if(a[key]!==null&&a[key]!==undefined)add(a[key],label)}
   }
   cursor=next as string|null;if(cursor)seen.add(cursor)
  }while(cursor)
 }
 const current=(await readBusiness(`/projects/records/${projectId}`,options)).data
 if(current.id!==projectId||current.kind!=='PROJECT'||current.owner_party_id!==project.owner_party_id||current.object_version!==project.object_version)throw invalid()
 const data:BusinessData={items:[...found.values()],next_cursor:null};return{data,items:data}
}
