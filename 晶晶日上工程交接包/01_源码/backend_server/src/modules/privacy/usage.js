'use strict';
const {digest}=require('../governance/content');
const {error}=require('../party/policy');
const A=require('../artists/context'),P=require('./usage-policy');
async function reset(tx,accountId){
 const r=await A.one(tx,'SELECT * FROM privacy_usage_state WHERE account_id=? FOR UPDATE',[accountId]);
 if(!r)return;
 if(r.object_version>=4294967294)throw error('OBJECT_VERSION_EXHAUSTED',409);
 const data=P.empty(await A.now(tx));
 await tx.execute('UPDATE privacy_usage_state SET object_version=object_version+1,data_json=?,data_sha256=? WHERE account_id=?',[JSON.stringify(data),digest(data),accountId]);
}
function methods({db,actor,command,decode}){
 async function run(ctx,action,i={}){return db.withTransaction(async tx=>{
  // Account row is the common lock with preferences; multiple devices count wall time once.
  const a=await actor(tx,ctx,'FOR UPDATE'),at=await A.now(tx);
  const prefs=await A.one(tx,'SELECT * FROM privacy_preferences WHERE account_id=?',[a.id]);
  const preferences=prefs?decode(prefs.data_json,prefs.data_sha256):{},minutes=preferences.rest_reminder_minutes||0;
  const view=(d,v)=>({...P.view(d,at,minutes,v),night_reminder:require('./notification-policy').night(preferences,at)});
  const r=await A.one(tx,'SELECT * FROM privacy_usage_state WHERE account_id=?',[a.id]);
  const data=r?decode(r.data_json,r.data_sha256):P.empty(at),v=r?.object_version||0;
  if(action==='READ'||!minutes&&action==='PULSE')return view(data,v);
  const write=async()=>{
   if(v>=4294967294)throw error('OBJECT_VERSION_EXHAUSTED',409);
   let next;
   if(action==='ACK'){
    if(v!==i.expected_version)throw error('VERSION_CONFLICT',412);
    if(!P.view(data,at,minutes,v).rest_due)throw error('REST_REMINDER_NOT_DUE',409);
    next={...P.current(data,at),reminder_seconds:0,last_at:at};
   }else next=P.pulse(data,at);
   await tx.execute('INSERT INTO privacy_usage_state(account_id,object_version,data_json,data_sha256) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE object_version=VALUES(object_version),data_json=VALUES(data_json),data_sha256=VALUES(data_sha256)',[a.id,v+1,JSON.stringify(next),digest(next)]);
   return view(next,v+1);
  };
  // Pulses carry no caller time or duration and never replay financial or business actions.
  return action==='ACK'?command(tx,a,'REST_ACK',i,async()=>{await write();return {acknowledged:true};}):write();
 });}
 return {usageStatus:ctx=>run(ctx,'READ'),usagePulse:ctx=>run(ctx,'PULSE'),acknowledgeRest:(ctx,i)=>run(ctx,'ACK',i)};
}
module.exports={methods,reset};
