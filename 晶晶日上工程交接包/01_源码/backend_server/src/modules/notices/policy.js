 'use strict';
const {id,ref,label,shape,error}=require('../party/policy');
const {instant,period,copy}=require('../trade/policy');
const TYPES=Object.freeze(['DRAMA','PERFORMANCE','COMMERCIAL','EVENT','RECRUITMENT','OFFICIAL']);
const SUBMISSIONS=Object.freeze(['PROFILE','ROLE','CREATE_DRAMA','INVITATION']);
function text(v,max=4000){label(v,max);if(/(?:https?:\/\/|www\.|微信|wechat|weixin|加微|私下付款|线下付款|\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu.test(v))throw error('NOTICE_PRIVATE_CONTACT_FORBIDDEN',400);return v;}
function list(v,check,max=20){if(!Array.isArray(v)||!v.length||v.length>max||new Set(v).size!==v.length)throw error('NOTICE_LIST_INVALID',400);v.forEach(check);return [...v];}
function window(v){instant(v.valid_from);instant(v.valid_until);if(v.valid_from>=v.valid_until)throw error('NOTICE_PERIOD_INVALID',400);}
function rule(v){shape(v,['version','topup_threshold_minor','membership_days','growth_thresholds','minimum_levels','submission_days','terms']);ref(v.version);label(v.terms,4000);if(!Number.isSafeInteger(v.topup_threshold_minor)||v.topup_threshold_minor<1||v.membership_days!==365||!Number.isInteger(v.submission_days)||v.submission_days<1||v.submission_days>365)throw error('NOTICE_RULE_INVALID',400);if(!Array.isArray(v.growth_thresholds)||v.growth_thresholds.length!==5||v.growth_thresholds.some((n,i)=>!Number.isSafeInteger(n)||n<1||(i&&n<=v.growth_thresholds[i-1])))throw error('NOTICE_RULE_INVALID',400);shape(v.minimum_levels,TYPES);if(Object.keys(v.minimum_levels).length!==6||v.minimum_levels.OFFICIAL!==null||v.minimum_levels.EVENT!==3||v.minimum_levels.COMMERCIAL!==1||v.minimum_levels.RECRUITMENT!==1)throw error('NOTICE_RULE_INVALID',400);for(const n of Object.values(v.minimum_levels))if(n!==null&&(!Number.isInteger(n)||n<1||n>6))throw error('NOTICE_RULE_INVALID',400);return copy(v);}
// Input facts have already passed independent finance review. No client level or balance is accepted.
function scout(rule,facts,now){
 let credit=0,until=null,growth=0,eligibleFrom=null;const day=86400000;
 if(facts.some(f=>f.kind==='REVERSAL'&&f.occurred_at<=now))return {active:false,level:0,valid_until:null,reason:'REFUND_REVIEW_REQUIRED'};
 for(const f of [...facts].sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at))){
  if(f.occurred_at>now)continue;
  if(f.kind==='GROWTH'){growth+=f.amount;continue;}
  if(f.kind!=='TOPUP')continue;
  const at=Date.parse(f.occurred_at);
  if(eligibleFrom!==null&&at<eligibleFrom)continue;
  credit+=f.amount;
  if(credit>=rule.topup_threshold_minor){
   const oldEnd=until;
   until=(until===null||at>=until?at:until)+rule.membership_days*day;
   eligibleFrom=oldEnd===null?at:Math.max(oldEnd,at);
   credit=0;
  }
 }
 const active=until!==null&&Date.parse(now)<until;
 // Level six needs a separate qualification review; it cannot be bought or inferred from a number alone.
 return {active,level:active?Math.min(5,1+rule.growth_thresholds.filter(n=>growth>=n).length):0,valid_until:until===null?null:new Date(until).toISOString(),reason:active?null:'SCOUT_NOT_ACTIVE'};
}
function notice(v){shape(v,['type','title','description','city','valid_from','valid_until','details','project_id','accept_submissions']);if(!TYPES.includes(v.type)||typeof v.accept_submissions!=='boolean')throw error('NOTICE_INVALID',400);text(v.title,160);text(v.description,8000);text(v.city,80);window(v);if(v.project_id!==null)id(v.project_id);const fields={DRAMA:['synopsis','roles'],PERFORMANCE:['venue','schedule','requirements'],COMMERCIAL:['deliverables','requirements'],EVENT:['venue','schedule'],RECRUITMENT:['roles','requirements'],OFFICIAL:['summary']};shape(v.details,fields[v.type]);for(const k of fields[v.type])text(v.details[k],2000);if(v.accept_submissions&&!['DRAMA','RECRUITMENT'].includes(v.type))throw error('NOTICE_SUBMISSIONS_NOT_ALLOWED',400);return copy(v);}
function submission(v){shape(v,['kind','target_party_id','notice_id','person_id','avatar_id','consent_id','purpose','content','role','material_asset_ids','source_listing_id']);if(v.source_listing_id!==undefined){id(v.source_listing_id);if(v.kind!=='INVITATION')throw error('NOTICE_SUBMISSION_INVALID',400);}if(!SUBMISSIONS.includes(v.kind))throw error('NOTICE_SUBMISSION_INVALID',400);for(const k of ['target_party_id','person_id','avatar_id','consent_id'])id(v[k]);if(v.notice_id!==null)id(v.notice_id);text(v.purpose,200);text(v.content,4000);if(v.kind==='ROLE')text(v.role,160);else if(v.role!==null)throw error('NOTICE_SUBMISSION_INVALID',400);if(!Array.isArray(v.material_asset_ids)||v.material_asset_ids.length>6)throw error('NOTICE_LIST_INVALID',400);v.material_asset_ids.forEach(id);return copy(v);}
module.exports={TYPES,SUBMISSIONS,text,list,window,rule,scout,notice,submission};
