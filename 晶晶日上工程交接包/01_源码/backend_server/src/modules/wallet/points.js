 'use strict';
// Internal port for voting/redemption modules. No generic public "spend points" route.
// resolveUse must re-read and authorize the business object within this same transaction.
const {id,ref,shape,error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
function createPointsService(db,{resolveUse}={}){
 async function use(tx,ctx,reference){if(typeof resolveUse!=='function')throw error('POINTS_USE_NOT_CONNECTED',503);const u=await resolveUse(tx,ctx,ref(reference));if(!u||!['VOTE','REDEMPTION','LOTTERY'].includes(u.purpose))throw error('POINTS_USE_NOT_ALLOWED',409);id(u.party_id);ref(u.reference);P.integer(u.points,1);if(u.reference!==reference)throw error('POINTS_USE_MISMATCH',409);return u;}
 async function lots(tx,party){return (await C.rows(tx,party,'EARNING')).filter(r=>['ISSUED','REVERSAL_PENDING'].includes(r.current_status));}
 async function allowed(tx,party){const all=await lots(tx,party);if(all.some(r=>r.data.pending_shortfall))throw error('POINTS_REVERSAL_PENDING',409);return all;}
 return {
 async reserve(ctx,i){shape(i,['reference']);return db.withTransaction(async tx=>{
  const u=await use(tx,ctx,i.reference),account=await C.account(tx,u.party_id);await A.verifiedAdultParty(tx,u.party_id);const now=await A.now(tx);
  const all=await allowed(tx,u.party_id),holds=await C.rows(tx,u.party_id,'POINT_HOLD'),old=holds.find(h=>h.data.reference===u.reference&&h.data.purpose===u.purpose);
  if(old){if(old.data.points!==u.points)throw error('IDEMPOTENCY_CONFLICT',409);if(old.current_status==='HELD'&&old.data.expires_at>now)return old;throw error('POINTS_USE_ALREADY_HANDLED',409);}
  const expires_at=new Date(Date.parse(now)+account.data.rule.hold_minutes*60000).toISOString(),allocations=P.reserve(all.map(r=>({id:r.id,...r.data})),holds.map(r=>({...r.data,status:r.current_status})),u.points,now,expires_at);
  return C.insert(tx,{id:account.created_by},'POINT_HOLD',u.party_id,null,'HELD',{purpose:u.purpose,reference:u.reference,points:u.points,expires_at,allocations},[u.party_id,u.purpose,u.reference]);
 });},
 async finish(ctx,i){shape(i,['hold_id','decision']);if(!['COMMIT','RELEASE'].includes(i.decision))throw error('POINTS_USE_INVALID',400);return db.withTransaction(async tx=>{
  const hint=await C.load(tx,i.hold_id,'POINT_HOLD',''),u=await use(tx,ctx,hint.data.reference);if(u.party_id!==hint.owner_party_id||u.purpose!==hint.data.purpose||u.points!==hint.data.points)throw error('POINTS_USE_MISMATCH',409);
  await C.account(tx,u.party_id);const hold=await C.load(tx,i.hold_id,'POINT_HOLD'),now=await A.now(tx),status=i.decision==='COMMIT'?'SPENT':'RELEASED';
  if(hold.current_status===status)return hold;if(hold.current_status!=='HELD')throw error('POINTS_USE_ALREADY_HANDLED',409);
  if(i.decision==='COMMIT'){
   await A.verifiedAdultParty(tx,u.party_id);await allowed(tx,u.party_id);if(hold.data.expires_at<=now)throw error('WALLET_HOLD_EXPIRED',409);
   for(const allocation of hold.data.allocations){const lot=await C.load(tx,allocation.lot_id,'EARNING');if(lot.data.expires_at<=now||P.remaining(lot.data)<allocation.points)throw error('WALLET_POINTS_INSUFFICIENT',409);await C.save(tx,null,lot,lot.current_status,{...lot.data,spent:lot.data.spent+allocation.points},'POINTS_SPENT');}
  }
  return C.save(tx,null,hold,status,hold.data,'POINT_HOLD_'+status);
 });},
 async expireParty(party){id(party);return db.withTransaction(async tx=>{
  await C.account(tx,party);return expire(tx,party);
 });}
 };
}
async function expire(tx,party){
const now=await A.now(tx);let count=0;
  for(const h of await C.rows(tx,party,'POINT_HOLD'))if(h.current_status==='HELD'&&h.data.expires_at<=now){await C.save(tx,null,h,'EXPIRED',h.data,'POINT_HOLD_EXPIRED');count++;}
  for(const lot of (await C.rows(tx,party,'EARNING')).filter(r=>['ISSUED','REVERSAL_PENDING'].includes(r.current_status)))if(lot.data.expires_at<=now&&P.remaining(lot.data)>0){await C.save(tx,null,lot,lot.current_status,{...lot.data,expired:lot.data.expired+P.remaining(lot.data)},'POINTS_EXPIRED');count++;}
  return {changed:count};
}
module.exports={createPointsService,expire};
