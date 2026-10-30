'use strict';
const {shape,label,error,id}=require('../party/policy');
const {digest}=require('../governance/content');
const states=['REQUESTED','NEEDS_INFO','APPROVED','DOCUMENT_REVIEW','ISSUED','CORRECTION_REQUESTED','REJECTED','WITHDRAWN'];
function money(n,zero=false){if(!Number.isSafeInteger(n)||n<(zero?0:1)||n>900000000000)throw error('INVALID_INVOICE_AMOUNT',400);return n;}
function header(h){shape(h,['kind','title','tax_id']);if(!['PERSON','ORGANIZATION'].includes(h.kind))throw error('INVALID_INVOICE_HEADER',400);label(h.title,200);if(h.kind==='ORGANIZATION')label(h.tax_id,80);else if(h.tax_id!==null)throw error('INVALID_INVOICE_HEADER',400);return {kind:h.kind,title:h.title,tax_id:h.tax_id};}
function page(i){if(i.after)id(i.after);if(!Number.isInteger(i.limit)||i.limit<1||i.limit>50||i.status&&!states.includes(i.status))throw error('INVALID_PAGE',400);return i.limit;}
// Only trusted server configuration can enable manual production documents. No HTTP writer.
function issuer(env,merchant,environment,now=Date.now()){
 if(environment==='SANDBOX'){
  if(env.NODE_ENV!=='test'||env.INVOICE_SANDBOX_ENABLED!=='true')throw error('INVOICE_SANDBOX_DISABLED',409);
  return {merchant_party_id:merchant,name:'模拟开票方',tax_id:null,config_revision:'synthetic-v1',evidence_ref:'synthetic-only',valid_until:null,simulated:true};
 }
 if(environment!=='PRODUCTION'||env.INVOICE_REAL_MANUAL_ENABLED!=='true')throw error('INVOICE_ISSUER_NOT_READY',409);
 let list;try{list=JSON.parse(env.INVOICE_MANUAL_ISSUERS_JSON||'[]');}catch{throw error('INVOICE_ISSUER_NOT_READY',409);}
 const rows=Array.isArray(list)?list.filter(x=>x?.merchant_party_id===merchant):[];
 if(rows.length!==1)throw error('INVOICE_ISSUER_NOT_READY',409);
 const p=rows[0];try{shape(p,['merchant_party_id','name','tax_id','config_revision','evidence_ref','valid_until','approved']);id(p.merchant_party_id);for(const k of ['name','tax_id','config_revision','evidence_ref'])label(p[k],200);if(p.approved!==true||!Number.isFinite(Date.parse(p.valid_until))||Date.parse(p.valid_until)<=now)throw Error();}catch{throw error('INVOICE_ISSUER_NOT_READY',409);}
 return {...p,simulated:false};
}
function verified(row){const data=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return data;}
module.exports={money,header,page,issuer,verified,states};
