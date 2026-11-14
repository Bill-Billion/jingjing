import {rowData,type BusinessData} from '@/api/modules/business'

const kinds:Record<string,string>={
  PRODUCTION_CREDIT:'制作金',PRODUCTION_FREE:'指定服务免付权益',
  INTERVIEW_OPEN:'公开面试权益',INTERVIEW_PRIORITY:'优先面试权益',
  EXPOSURE:'曝光权益',POINT_BACK:'晶钻返还',NONE:'本次未获实物权益',
  // Preserve the older display label if an earlier record used it.
  EMPTY:'本次未获实物权益',
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
type DrawItem={index:number;label:string;guaranteed:boolean;points:number|null;grantId:string|null}
export function drawState(record:BusinessData):string|null{
  if(record.kind!=='DRAW')return null
  if(record.current_status==='SETTLED')return '开奖结果已保存'
  if(record.current_status==='PENDING')return '开奖结果待核对'
  return null
}
export function drawSummary(record:BusinessData):{count:number;points:number;items:DrawItem[]}|null{
  if(record.kind!=='DRAW'||record.current_status!=='SETTLED')return null
  const data=rowData(record),count=data.count,points=data.points,results=data.results
  if((count!==1&&count!==10)||!Number.isSafeInteger(points)||Number(points)<0||!Array.isArray(results)||results.length!==count)return null
  const seen=new Set<number>(),items:DrawItem[]=[]
  for(const item of results){
    if(!item||typeof item!=='object'||Array.isArray(item))return null
    const r=item as BusinessData,index=r.index,kind=r.kind,grant=r.grant_id,back=r.point_back
    if(!Number.isSafeInteger(index)||Number(index)<0||Number(index)>=count||seen.has(Number(index))||typeof kind!=='string'||!kinds[kind]||typeof r.guaranteed_slot!=='boolean'||grant!=null&&!uuid(grant)||back!=null&&(!Number.isSafeInteger(back)||Number(back)<0))return null
    seen.add(Number(index));items.push({index:Number(index),label:kinds[kind]!,guaranteed:r.guaranteed_slot,points:back==null?null:Number(back),grantId:grant==null?null:grant as string})
  }
  items.sort((a,b)=>a.index-b.index)
  return {count,points:Number(points),items}
}
