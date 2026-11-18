'use strict';
const {error}=require('../party/policy');
const GAP_SECONDS=90, HEARTBEAT_SECONDS=30;
const day=at=>new Date(Date.parse(at)+8*3600000).toISOString().slice(0,10);
const empty=at=>({local_date:day(at),day_seconds:0,reminder_seconds:0,last_at:null});
function current(value,at){
 const d={...value};
 if(d.local_date!==day(at)){d.local_date=day(at);d.day_seconds=0;}
 if(d.last_at!==null&&Date.parse(at)-Date.parse(d.last_at)>GAP_SECONDS*1000)d.reminder_seconds=0;
 return d;
}
function pulse(value,at){
 const d=current(value,at),now=Date.parse(at),last=d.last_at===null?null:Date.parse(d.last_at);
 if(last!==null&&now<last)throw error('USAGE_CLOCK_REVIEW_REQUIRED',503);
 const elapsed=last===null?0:Math.floor((now-last)/1000);
 if(last!==null&&now-last<=GAP_SECONDS*1000){
  const start=Date.parse(day(at)+'T00:00:00+08:00');
  d.day_seconds=Math.min(86400,d.day_seconds+Math.max(0,Math.floor((now-Math.max(last,start))/1000)));
  d.reminder_seconds=Math.min(86400,d.reminder_seconds+elapsed);
 }
 // Preserve fractions on retries: a burst cannot repeatedly erase elapsed seconds.
 if(last===null||elapsed>0)d.last_at=at;
 return d;
}
function view(value,at,minutes,version){
 const d=minutes?current(value,at):empty(at);
 return {object_version:version,enabled:minutes>0,local_date:d.local_date,timezone:'Asia/Shanghai',day_seconds:d.day_seconds,
  reminder_seconds:d.reminder_seconds,rest_reminder_minutes:minutes,rest_due:minutes>0&&d.reminder_seconds>=minutes*60,
  seconds_until_reminder:minutes?Math.max(0,minutes*60-d.reminder_seconds):null,
  heartbeat_seconds:HEARTBEAT_SECONDS,idle_after_seconds:GAP_SECONDS,as_of:at,
  measurement:'FOREGROUND_HEARTBEAT_ESTIMATE',purpose:'PERSONAL_REST_REMINDER'};
}
module.exports={empty,pulse,current,view,GAP_SECONDS,HEARTBEAT_SECONDS};
