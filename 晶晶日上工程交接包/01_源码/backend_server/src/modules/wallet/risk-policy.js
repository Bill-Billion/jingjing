'use strict';
const {shape,label,error}=require('../party/policy'),W=require('./policy');
function minute(n){if(!Number.isSafeInteger(n)||n<0||n>1439)throw error('INVALID_QUIET_HOURS',400);return n;}
function window(v){shape(v,['start_minute','end_minute']);minute(v.start_minute);minute(v.end_minute);if(v.start_minute===v.end_minute)throw error('INVALID_QUIET_HOURS',400);return {...v};}
function within(at,w){const d=new Date(Date.parse(at)+8*3600000),m=d.getUTCHours()*60+d.getUTCMinutes();return w.start_minute<w.end_minute?m>=w.start_minute&&m<w.end_minute:m>=w.start_minute||m<w.end_minute;}
function rule(v){
 shape(v,['version','source_ref','message','window_seconds','trigger_count','large_recharge_minor','night','confirmation_seconds','lottery_window_max_draws','lottery_daily_points']);
 for(const k of ['version','source_ref','message'])label(v[k],k==='message'?2000:200);
 W.integer(v.window_seconds,60,86400);W.integer(v.trigger_count,2,1000);W.integer(v.confirmation_seconds,60,3600);
 if(v.large_recharge_minor!==null)W.integer(v.large_recharge_minor,1);
 if(v.night!==null){shape(v.night,['start_minute','end_minute','minimum_minor']);window({start_minute:v.night.start_minute,end_minute:v.night.end_minute});W.integer(v.night.minimum_minor,1);}
 W.integer(v.lottery_window_max_draws,1,1000);W.integer(v.lottery_daily_points,300,100000000);
 return structuredClone(v);
}
function reasons(r,t,usage,at){
 if(t.kind==='LOTTERY'){
  if(usage.window_draws+t.count>r.lottery_window_max_draws||usage.day_points+t.amount_minor>r.lottery_daily_points)throw error('LOTTERY_PARTICIPATION_LIMIT',409);
  return ['RATIONAL_LOTTERY_PARTICIPATION'];
 }
 const out=[];if(usage.cash_attempts+1>=r.trigger_count)out.push('FREQUENT_CASH_REQUESTS');
 if(t.kind==='RECHARGE'&&r.large_recharge_minor!==null&&t.amount_minor>=r.large_recharge_minor)out.push('LARGE_RECHARGE');
 if(r.night&&within(at,r.night)&&t.amount_minor>=r.night.minimum_minor)out.push('LARGE_NIGHT_SPENDING');
 return out;
}
module.exports={rule,window,within,minute,reasons};
