'use strict';
const {shape,label,id,error}=require('../party/policy');
const {instant}=require('../trade/policy');
const DAY=86400000;
function integer(n,min=0,max=100000000){if(!Number.isSafeInteger(n)||n<min||n>max)throw error('INVALID_REWARD_NUMBER',400);return n;}
function template(v){
 shape(v,['version','source_ref','title','kind','valid_days','exchange_points','capacity','available_until','terms','production','interview','exposure','service_code']);
 for(const k of ['version','source_ref','title','terms'])label(v[k],k==='terms'?8000:500);
 if(!['PRODUCTION_CREDIT','PRODUCTION_FREE','SERVICE_CREDIT','INTERVIEW','EXPOSURE'].includes(v.kind))throw error('REWARD_KIND_NOT_ENABLED',400);
 integer(v.capacity,1,1000000);integer(v.valid_days,1,v.kind==='SERVICE_CREDIT'?730:365);instant(v.available_until);
 if(v.exchange_points!==null)integer(v.exchange_points,1);
 if(['PRODUCTION_CREDIT','PRODUCTION_FREE','SERVICE_CREDIT'].includes(v.kind)){
  shape(v.production,['face_minor','minimum_minor','spec_ids']);
  const thresholds={5000:50000,10000:80000,20000:100000,50000:200000,100000:300000};
  if(v.kind==='PRODUCTION_CREDIT'&&thresholds[v.production.face_minor]!==v.production.minimum_minor)throw error('PRODUCTION_CREDIT_TERMS_INVALID',400);integer(v.production.face_minor,1,4999999);integer(v.production.minimum_minor,v.production.face_minor);
  if(!Array.isArray(v.production.spec_ids)||!v.production.spec_ids.length||v.production.spec_ids.length>100||new Set(v.production.spec_ids).size!==v.production.spec_ids.length)throw error('REWARD_SPEC_REQUIRED',400);
  v.production.spec_ids.forEach(id);
  if(v.kind==='PRODUCTION_CREDIT'&&v.exchange_points!==null&&(v.production.face_minor===100000||v.exchange_points!==v.production.face_minor*120/100))throw error('PRODUCTION_EXCHANGE_PRICE_INVALID',400);
  if(v.kind!=='PRODUCTION_CREDIT'&&v.exchange_points!==null)throw error('REWARD_EXCHANGE_NOT_AVAILABLE',400);if(v.kind==='SERVICE_CREDIT')label(v.service_code,100);else if(v.service_code!==undefined)throw error('REWARD_TERMS_INVALID',400);if(v.kind==='PRODUCTION_FREE'&&(v.production.spec_ids.length!==1||v.production.face_minor!==v.production.minimum_minor))throw error('FREE_PRODUCT_REQUIRED',400);
  if((v.kind!=='SERVICE_CREDIT'&&v.valid_days!==30)||v.interview!==null||v.exposure!==null)throw error('PRODUCTION_CREDIT_TERMS_INVALID',400);
 }else if(v.kind==='INTERVIEW'){
  shape(v.interview,['channel','project_ref','batch_ref','min_halo','purpose','territory','extension_days','fallback_points']);
  for(const k of ['project_ref','batch_ref','purpose','territory'])label(v.interview[k],200);
  if(!['OPEN','PRIORITY'].includes(v.interview.channel)||v.interview.min_halo!==(v.interview.channel==='OPEN'?1:2)||v.valid_days!==90)throw error('INTERVIEW_CHANNEL_NOT_ENABLED',400);
  integer(v.interview.extension_days,1,90);integer(v.interview.fallback_points,1);
  if(v.production!==null||v.exposure!==null)throw error('REWARD_TERMS_INVALID',400);
 }else{
  shape(v.exposure,['placement','duration_days','fallback_points']);if(v.exposure.fallback_points!==undefined)integer(v.exposure.fallback_points,1);label(v.exposure.placement,100);
  if(v.exposure.duration_days!==7||v.production!==null||v.interview!==null)throw error('EXPOSURE_TERMS_INVALID',400);
 }
 return structuredClone(v);
}
function usable(grant,at){if(grant.current_status!=='AVAILABLE'||grant.data.expires_at<=at)throw error('REWARD_NOT_AVAILABLE',409);}
function view(r,at){return {...r,effective_status:['AVAILABLE','BOUND'].includes(r.current_status)&&r.data.expires_at<=at?'EXPIRED':r.current_status};}
module.exports={DAY,integer,template,usable,view};
