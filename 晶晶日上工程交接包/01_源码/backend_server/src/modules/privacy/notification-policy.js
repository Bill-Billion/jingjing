'use strict';
const {shape,error}=require('../party/policy');
const defaults=()=>({push_enabled:false,night_reminder_enabled:false,quiet_hours:{enabled:false,start_minute:1320,end_minute:480}});
function validate(v){
 for(const k of ['push_enabled','night_reminder_enabled'])if(k in v&&typeof v[k]!=='boolean')throw error('INVALID_PRIVACY_PREFERENCES',400);
 if('quiet_hours' in v){const q=v.quiet_hours;shape(q,['enabled','start_minute','end_minute']);if(typeof q.enabled!=='boolean')throw error('INVALID_PRIVACY_PREFERENCES',400);require('../wallet/risk-policy').window({start_minute:q.start_minute,end_minute:q.end_minute});}
 return v;
}
const normalize=v=>({...defaults(),...v});
function until(at,q){
 if(!q.enabled||!require('../wallet/risk-policy').within(at,q))return null;
 const local=new Date(Date.parse(at)+8*3600000),m=local.getUTCHours()*60+local.getUTCMinutes();
 if(q.start_minute>q.end_minute&&m>=q.start_minute)local.setUTCDate(local.getUTCDate()+1);
 local.setUTCHours(Math.floor(q.end_minute/60),q.end_minute%60,0,0);
 return new Date(local.getTime()-8*3600000).toISOString();
}
function night(v,at){const p=normalize(v);return {enabled:p.night_reminder_enabled,due:p.night_reminder_enabled&&require('../wallet/risk-policy').within(at,p.quiet_hours),timezone:'Asia/Shanghai',start_minute:p.quiet_hours.start_minute,end_minute:p.quiet_hours.end_minute};}
function decision(v,category,at,marketingSentToday=0){
 const p=normalize(v);if(!p.push_enabled)return {status:'SUPPRESSED',reason:'PUSH_DISABLED',retry_at:null};
 if(category==='MARKETING'&&!p.marketing)return {status:'SUPPRESSED',reason:'MARKETING_OPTED_OUT',retry_at:null};
 const retry=until(at,p.quiet_hours);if(retry)return {status:'DEFERRED',reason:'QUIET_HOURS',retry_at:retry};
 // Conservative implementation proposal, not a client-specified numeric threshold.
 if(category==='MARKETING'&&marketingSentToday>=1)return {status:'SUPPRESSED',reason:'MARKETING_DAILY_LIMIT',retry_at:null};
 return {status:'READY',reason:null,retry_at:null};
}
module.exports={defaults,validate,normalize,until,night,decision};
