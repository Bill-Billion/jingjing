"use strict";
const {createHmac,timingSafeEqual}=require('node:crypto');
const {shape,id,error}=require('../party/policy'),S=require('./search');
const VERSION='EXPLICIT_BUSINESS_FILTERS_V1';
const fields=['purpose','commercial_use','max_price_minor','min_halo','audition_mode','notice_type','tag'];
const reasons=['PUBLIC_AVAILABLE','CITY_MATCH','TEXT_MATCH','LICENSE_MATCH','COMMERCIAL_USE_MATCH','PUBLIC_PRICE_WITHIN_BUDGET','HALO_THRESHOLD_MET','TAG_MATCH','AUDITION_MODE_MATCH','NOTICE_TYPE_MATCH'];
function query(input){
 shape(input,['kind','city','q','cursor','limit',...fields]);
 const base=Object.fromEntries(['kind','city','q','cursor','limit'].filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]])),p=S.query(base),filters={};
 const allowed={STOCK:['purpose','commercial_use','max_price_minor'],AUDITION:['max_price_minor','audition_mode'],ARTIST:['min_halo','tag'],NOTICE:['notice_type']}[p.kind];
 for(const k of fields){if(!Object.hasOwn(input,k))continue;if(!allowed.includes(k))throw error('MATCH_FILTER_NOT_APPLICABLE',400);const v=input[k];
 if(k==='max_price_minor'||k==='min_halo'){if(!Number.isSafeInteger(v)||v<0||v>(k==='min_halo'?3:900000000000))throw error('INVALID_MATCH_FILTER',400);}
 else if(k==='tag'){if(typeof v!=='string'||!v.trim()||v.length>40)throw error('INVALID_MATCH_FILTER',400);}
 else {const options={purpose:['PERSONAL_NONCOMMERCIAL','COMMERCIAL_LIMITED'],commercial_use:['BRAND_PROMOTION','COMMERCIAL_ADVERTISING','CORPORATE_DISPLAY'],audition_mode:['OFFLINE','ONLINE_MATERIALS'],notice_type:['DRAMA','PERFORMANCE','COMMERCIAL','EVENT','RECRUITMENT','OFFICIAL']}[k];if(!options.includes(v))throw error('INVALID_MATCH_FILTER',400);}
 filters[k]=k==='tag'?v.trim().normalize('NFKC').toLowerCase():v;
 }
 if(filters.commercial_use&&filters.purpose!=='COMMERCIAL_LIMITED')throw error('MATCH_COMMERCIAL_PURPOSE_REQUIRED',400);
 return {...p,filters};
}
function match(p,item){
 if(!S.matches(p.kind,item,p.q))return null;
 const f=p.filters,r=['PUBLIC_AVAILABLE'];if(p.city)r.push('CITY_MATCH');if(p.q)r.push('TEXT_MATCH');
 if(f.purpose){if(item.license?.scope!==f.purpose)return null;r.push('LICENSE_MATCH');}
 if(f.commercial_use){if(!item.license?.commercial_uses?.includes(f.commercial_use)||item.license?.excluded?.includes(f.commercial_use))return null;r.push('COMMERCIAL_USE_MATCH');}
 if(f.max_price_minor!==undefined){if((p.kind==='AUDITION'&&item.public_price!==true)||!Number.isSafeInteger(item.unit_minor)||item.unit_minor<0||item.unit_minor>f.max_price_minor)return null;r.push('PUBLIC_PRICE_WITHIN_BUDGET');}
 if(f.min_halo!==undefined){if(!Number.isInteger(item.halo_level)||item.halo_level<f.min_halo)return null;r.push('HALO_THRESHOLD_MET');}
 if(f.tag){if(!item.tags?.some(v=>v.normalize('NFKC').toLowerCase()===f.tag))return null;r.push('TAG_MATCH');}
 if(f.audition_mode){if(item.mode!==f.audition_mode)return null;r.push('AUDITION_MODE_MATCH');}
 if(f.notice_type){if(item.notice?.type!==f.notice_type)return null;r.push('NOTICE_TYPE_MATCH');}
 return r;
}
function createMatching({catalogs,secret}){
 const mac=(body,scope)=>createHmac('sha256',secret).update(JSON.stringify([VERSION,scope,body])).digest();
 return async(ctx,input,account)=>{
 id(account);const p=query(input),scope=[account,p.kind,p.city,p.q,p.filters],items=[];let after='',more=null;
 if(input.cursor!==undefined){try{const c=input.cursor;if(typeof c!=='string'||c.length>512)throw 0;const [body,sig,...tail]=c.split('.');if(tail.length||!/^[A-Za-z0-9_-]+$/.test(body)||!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(mac(body,scope),Buffer.from(sig,'hex')))throw 0;after=id(Buffer.from(body,'base64url').toString());}catch{throw error('INVALID_CURSOR',400);}}
 // Each read uses the remaining output capacity, so no matching tail is skipped.
 // Existing public catalogs retain current visibility, authorization and expiry checks.
 for(let n=0;n<10;n++){
  const page=await catalogs[p.kind](ctx,{after,limit:p.limit-items.length,...p.city?{city:p.city}:{}});
  for(const item of page.items){const why=match(p,item);if(why)items.push({item,reasons:why});}
  more=page.next_cursor;if(more===after&&more)throw error('SEARCH_CURSOR_STALLED',503);if(!more||items.length===p.limit)break;after=more;
 }
 let cursor=null;if(more){const body=Buffer.from(id(more)).toString('base64url');cursor=body+'.'+mac(body,scope).toString('hex');}
 return {kind:p.kind,city:p.city||null,q:p.q||null,filters:p.filters,algorithm_version:VERSION,personalized:false,price_personalized:false,requires_business_validation:true,principle:'EXPLICIT_FILTERS_THEN_PUBLIC_CATALOG_ORDER',items,next_cursor:cursor,scan_limited:!!more&&items.length<p.limit};
 };
}
module.exports={createMatching,query,match,VERSION,reasons};
