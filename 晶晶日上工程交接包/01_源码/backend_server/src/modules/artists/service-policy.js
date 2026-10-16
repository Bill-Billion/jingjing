"use strict";
const {shape,id,ref,label,error}=require('../party/policy');
const {copy,amount}=require('../trade/policy');
const TYPES=Object.freeze(['AVATAR_CREATION','AVATAR_HOSTING','HALO_REVIEW']);
function specification(v){shape(v,['version','service_tier','service','deliverables','terms']);ref(v.version);label(v.service_tier,100);label(v.terms,8000);if(!Array.isArray(v.deliverables)||!v.deliverables.length||v.deliverables.length>30)throw error('INVALID_SPECIFICATION',400);v.deliverables.forEach(x=>label(x,500));const s=v.service;shape(s,['kind','unit','rule_version','source_ref','retry_limit','hosting_months','halo_level','failure_policy']);if(!TYPES.includes(s.kind))throw error('INVALID_ARTIST_SERVICE',400);ref(s.rule_version);ref(s.source_ref);if(!Number.isInteger(s.retry_limit)||s.retry_limit<0||s.retry_limit>100)throw error('INVALID_ARTIST_RETRY_LIMIT',400);if(s.failure_policy!=='REFUND_UNDELIVERED')throw error('INVALID_ARTIST_FAILURE_POLICY',400);
 if(s.kind==='AVATAR_CREATION'&&(s.unit!=='PERSON_FIRST'||s.hosting_months!==null||s.halo_level!==null))throw error('INVALID_ARTIST_SERVICE',400);
 if(s.kind==='AVATAR_HOSTING'&&(s.unit!=='AVATAR_MONTH'||!Number.isInteger(s.hosting_months)||s.hosting_months<1||s.hosting_months>120||s.halo_level!==null||s.retry_limit!==0))throw error('INVALID_ARTIST_SERVICE',400);
 if(s.kind==='HALO_REVIEW'&&(s.unit!=='HALO_APPLICATION'||![2,3].includes(s.halo_level)||s.hosting_months!==null||s.retry_limit!==0))throw error('INVALID_ARTIST_SERVICE',400);
 return copy(v);
}
function price(type,spec,minor){amount(minor);if(spec.service.kind!==type)throw error('ARTIST_PRODUCT_MISMATCH',400);const expected=type==='AVATAR_CREATION'?6000:type==='AVATAR_HOSTING'?2900*spec.service.hosting_months:1000;if(minor!==expected)throw error('ARTIST_PRICE_RULE_MISMATCH',409);}
function addMonths(iso,months){const d=new Date(iso),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const end=new Date(d);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);d.setUTCDate(Math.min(day,end.getUTCDate()));return d.toISOString();}
module.exports={TYPES,specification,price,addMonths};
