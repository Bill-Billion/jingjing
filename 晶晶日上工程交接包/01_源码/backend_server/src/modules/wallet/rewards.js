"use strict";
const {digest}=require('../governance/content'),{shape,id,ref,error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy'),E=require('./earnings');
async function grant(tx,a,account,kind,source,at){
 const amount=account.data.rule.free_awards?.[kind];if(!amount)throw error('WALLET_FREE_REWARD_NOT_ENABLED',409);
 const key=digest(['EARNING',['FREE',account.owner_party_id,kind,source]]),old=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='EARNING' AND source_key=? FOR UPDATE",[key]);if(old)return C.checked(old);
 const now=await A.now(tx);require('../trade/policy').instant(at);if(at<account.data.opened_at||at>now)throw error('WALLET_REWARD_EVENT_MISMATCH',409);
 const data={source_kind:'FREE',event_kind:kind,source_ref:source,occurred_at:at,rule_id:account.data.rule_id,rule:account.data.rule,points:amount,reversed:0,growth_reversed:0,spent:0,expired:0,pending_shortfall:0,debt_offset:0,debt_settled:0,paid_minor:0,refunded_minor:0,issued_at:now,expires_at:new Date(Date.parse(now)+P.DAY*account.data.rule.points_days).toISOString()};
 return E.settleDebt(tx,a,await C.insert(tx,a,'EARNING',account.owner_party_id,null,'ISSUED',data,['FREE',account.owner_party_id,kind,source]));
}
async function registration(tx,a,account){if(account.data.rule.free_awards?.REGISTER)return grant(tx,a,account,'REGISTER',account.owner_party_id,account.data.opened_at);}
async function checkIn(tx,a,account){const now=await A.now(tx),day=new Date(Date.parse(now)+8*3600000).toISOString().slice(0,10);return grant(tx,a,account,'DAILY_CHECKIN',day,now);}
// Review/share services must resolve actual, immutable, authorized events. The client never supplies points.
function createRewardService(db,{resolveEvent=async()=>null}={}){return {async award(ctx,{reference}){ref(reference);return db.withTransaction(async tx=>{
 const event=await resolveEvent(tx,ctx,reference);if(!event)throw error('WALLET_REWARD_EVENT_NOT_VERIFIED',409);
 shape(event,['party_id','account_id','kind','reference','occurred_at']);id(event.party_id);id(event.account_id);if(!['REVIEW','SHARE'].includes(event.kind)||event.reference!==reference)throw error('WALLET_REWARD_EVENT_MISMATCH',409);
 const a={id:event.account_id};await C.owner(tx,a,event.party_id,true);const account=await C.account(tx,event.party_id);return grant(tx,a,account,event.kind,reference,event.occurred_at);
 });}};}
module.exports={registration,checkIn,createRewardService};
