/** Contract snapshots are server facts. Missing legacy fields never imply ownership. */
export const copyrightModes={BUYER_OWNERSHIP:'客户取得成片版权',PRODUCER_OWNERSHIP_LICENSE:'制作方保留版权，客户按约定使用'} as const
export const copyrightPurposes={PRIVATE:'私人使用',PUBLIC_SHARE:'公开分享',COMMERCIAL:'约定商业使用',RELEASE:'约定发行'} as const
export const commercialUses={BRAND_PROMOTION:'品牌宣传',COMMERCIAL_ADVERTISING:'商业广告',CORPORATE_DISPLAY:'企业展示'} as const
export type CopyrightTerms={version:'CONTRACT_20261029';mode:keyof typeof copyrightModes;buyout_price_included:boolean;license:null|{scope:'PERSONAL_NONCOMMERCIAL'|'AGREED_SCOPE';territories:string[];purposes:(keyof typeof copyrightPurposes)[];perpetual:true;exclusive:false;transferable:false;sublicensable:false;terms_text:string};personality_rights_retained:true;underlying_assets_excluded:true;third_party_licenses_retained:true}
export type CopyrightSnapshot={version:'CONTRACT_20261029';line_id:string;source_ref:'CONTRACT_20261029_09'|'CONTRACT_20261029_13_ARTICLE_5';buyer_party_id:string;producer_party_id:string;copyright_owner_party_id:string;licensee_party_id:string|null;personality_rights_owner_party_id:string|null;personality_rights_basis:'INDIVIDUAL_CONSENTS_NOT_TRANSFERRED';terms:CopyrightTerms}
export const rightsObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const text=(v:unknown,max=8000):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const id=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v)
export const rightsList=(v:unknown,check:(s:unknown)=>boolean,max=100,min=1):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(check)&&new Set(v).size===v.length
export function isCopyrightTerms(v:unknown):v is CopyrightTerms {
 if(!rightsObject(v)||Object.keys(v).length!==7||v.version!=='CONTRACT_20261029'||v.personality_rights_retained!==true||v.underlying_assets_excluded!==true||v.third_party_licenses_retained!==true)return false
 if(v.mode==='BUYER_OWNERSHIP')return v.buyout_price_included===true&&v.license===null
 if(v.mode!=='PRODUCER_OWNERSHIP_LICENSE'||v.buyout_price_included!==false||!rightsObject(v.license))return false
 const l=v.license
 return Object.keys(l).length===8&&['PERSONAL_NONCOMMERCIAL','AGREED_SCOPE'].includes(String(l.scope))&&rightsList(l.territories,x=>typeof x==='string'&&/^(WORLD|[A-Z]{2})$/.test(x))&&rightsList(l.purposes,x=>typeof x==='string'&&Object.hasOwn(copyrightPurposes,x)&&(l.scope!=='PERSONAL_NONCOMMERCIAL'||['PRIVATE','PUBLIC_SHARE'].includes(x)),4)&&l.perpetual===true&&l.exclusive===false&&l.transferable===false&&l.sublicensable===false&&text(l.terms_text)
}
export function isCopyrightSnapshot(v:unknown):v is CopyrightSnapshot {
 if(!rightsObject(v)||Object.keys(v).length!==10||v.version!=='CONTRACT_20261029'||!text(v.line_id,128)||!['CONTRACT_20261029_09','CONTRACT_20261029_13_ARTICLE_5'].includes(String(v.source_ref))||![v.buyer_party_id,v.producer_party_id,v.copyright_owner_party_id].every(id)||!(v.licensee_party_id===null||id(v.licensee_party_id))||!(v.personality_rights_owner_party_id===null||id(v.personality_rights_owner_party_id))||v.personality_rights_basis!=='INDIVIDUAL_CONSENTS_NOT_TRANSFERRED'||!isCopyrightTerms(v.terms))return false
 return v.terms.mode==='BUYER_OWNERSHIP'?v.copyright_owner_party_id===v.buyer_party_id&&v.licensee_party_id===null:v.copyright_owner_party_id===v.producer_party_id&&id(v.licensee_party_id)
}
export const rightsErrors:Readonly<Record<string,string>>={COPYRIGHT_CHOICE_REQUIRED:'新报价必须明确选择成片版权归属及使用范围。',COPYRIGHT_CHANGE_REQUIRES_NEW_AGREEMENT:'原订单版权不能随补价修改，请先形成新的明确约定。',CUSTOMIZATION_COPYRIGHT_USE_NOT_ALLOWED:'原个人许可不包含本次商业或发行用途，请另行约定授权。',STOCK_COMMERCIAL_NOT_ENABLED:'商用新售尚未开放；原购买记录按原许可保留。',STOCK_COMMERCIAL_BUYER_REQUIRED:'商用机构购买须由已核准品牌客户的成年实名负责人办理。',STOCK_COMMERCIAL_CONSENT_REQUIRED:'需要每名出镜人本人确认覆盖用途、地域和期间的商用授权。',STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE:'本份商用许可尚未开始、已到期或已失效，不能下载正式文件。',IP_WITHDRAWAL_NOT_ELIGIBLE:'当前不满足撤回条件，不能视为版权已收回。'}
