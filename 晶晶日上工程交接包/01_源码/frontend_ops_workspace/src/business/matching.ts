import {isSearch,type Json,type PublicKind} from '@/api/modules/clientServices'
export const matchReasons:Record<string,string>={PUBLIC_AVAILABLE:'当前公开且可用',CITY_MATCH:'符合所选城市',TEXT_MATCH:'公开介绍符合关键词',LICENSE_MATCH:'许可范围符合用途',COMMERCIAL_USE_MATCH:'包含所选商用用途',PUBLIC_PRICE_WITHIN_BUDGET:'公开价格在预算内',HALO_THRESHOLD_MET:'达到所选星环等级',TAG_MATCH:'包含所选标签',AUDITION_MODE_MATCH:'符合试镜方式',NOTICE_TYPE_MATCH:'符合通告类型'}
export const matchFields:Record<PublicKind,string[]>={ARTIST:['min_halo','tag'],STOCK:['purpose','commercial_use','max_price_minor'],AUDITION:['audition_mode','max_price_minor'],NOTICE:['notice_type']}
export function matchingFilters(kind:PublicKind,input:Record<string,string>):Record<string,string|number>{
 if(Object.entries(input).some(([key,value])=>value.trim()&&!matchFields[kind].includes(key)))throw new Error('此类型不支持所选条件，请切换类型或清除条件。')
 if(input.commercial_use?.trim()&&input.purpose!=='COMMERCIAL_LIMITED')throw new Error('商用用途需要先选择约定商用范围。')
 const result:Record<string,string|number>={}
 for(const key of matchFields[kind]){const v=input[key]?.trim();if(!v)continue;if(key==='commercial_use'&&input.purpose!=='COMMERCIAL_LIMITED')continue
 if(key==='max_price_minor'){if(!/^\d{1,10}(\.\d{1,2})?$/.test(v))throw new Error('预算按元填写，最多两位小数。');const [whole,fraction='']=v.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(n>900000000000)throw new Error('预算超出可查询范围。');result[key]=n}
 else if(key==='min_halo'){if(!/^[0-3]$/.test(v))throw new Error('星环等级仅支持0至3。');result[key]=Number(v)}
 else result[key]=key==='tag'?v.normalize('NFKC').toLowerCase():v
 }return result
}
export function isMatches(v:unknown):v is Json {
 if(!v||typeof v!=='object')return false;const d=v as Json
 return d.algorithm_version==='EXPLICIT_BUSINESS_FILTERS_V1'&&d.personalized===false&&d.price_personalized===false&&d.requires_business_validation===true&&d.principle==='EXPLICIT_FILTERS_THEN_PUBLIC_CATALOG_ORDER'&&typeof d.scan_limited==='boolean'&&d.filters&&typeof d.filters==='object'&&!Array.isArray(d.filters)&&Array.isArray(d.items)&&d.items.every((r:Json)=>r&&Array.isArray(r.reasons)&&r.reasons.length>0&&r.reasons.every((k:unknown)=>typeof k==='string'&&Object.hasOwn(matchReasons,k)))&&isSearch({...d,items:d.items.map((r:Json)=>r.item)})
}
export const rankingReasons:Record<string,string>={PUBLIC_CATALOG:'公开目录顺序',RECENT_BROWSING_CITY:'与你近期浏览的公开内容城市相关',RECENT_PURCHASE_CITY:'与你近期实际购买的公开内容城市相关'}
export const discoveryReasons={...matchReasons,...rankingReasons}
function isRanked(v:unknown,matching:boolean):v is Json {
 if(!v||typeof v!=='object')return false;const d=v as Json
 const principle=d.personalized?'RECENT_PURCHASE_CITY_THEN_BROWSING_CITY_THEN_CATALOG':'PUBLIC_CATALOG_ORDER'
 return typeof d.personalized==='boolean'&&d.price_personalized===false&&d.candidate_limit===500&&typeof d.catalog_truncated==='boolean'&&d.algorithm_version===(matching?'EXPLICIT_FILTERS_CITY_ACTIVITY_V1':'CITY_ACTIVITY_V1')&&d.principle===(matching?'EXPLICIT_FILTERS_THEN_':'')+principle&&(!matching||d.requires_business_validation===true&&d.filters&&typeof d.filters==='object'&&!Array.isArray(d.filters))&&Array.isArray(d.items)&&d.items.every((r:Json)=>r&&Array.isArray(r.reasons)&&r.reasons.length>0&&r.reasons.every((k:unknown)=>typeof k==='string'&&Object.hasOwn(matching?discoveryReasons:rankingReasons,k))&&r.reasons.filter((k:string)=>Object.hasOwn(rankingReasons,k)).length===1&&(d.personalized||r.reasons.includes('PUBLIC_CATALOG')))&&isSearch({...d,items:d.items.map((r:Json)=>r.item)})
}
export const isRecommendations=(v:unknown):v is Json=>isRanked(v,false)
export const isRecommendedMatches=(v:unknown):v is Json=>isRanked(v,true)
