'use strict';
// These functions run inside the business transaction. They are never public balance-edit APIs.
const W=require('../wallet/context'),A=require('../artists/context');
const {error}=require('../party/policy');
async function spend(tx,ctx,record,points,purpose='REDEMPTION'){
 const service=require('../wallet/points').createPointsService({withTransaction:fn=>fn(tx)},{resolveUse:async()=>({party_id:record.owner_party_id,purpose,reference:record.id,points})});
 const hold=await service.reserve(ctx,{reference:record.id});
 await service.finish(ctx,{hold_id:hold.id,decision:'COMMIT'});return hold.id;
}
async function returnSpend(tx,party,holdId){
 await W.account(tx,party);const hold=await W.load(tx,holdId,'POINT_HOLD');
 if(hold.owner_party_id!==party||hold.data.purpose!=='REDEMPTION')throw error('REWARD_RETURN_MISMATCH',409);
 if(hold.current_status==='RETURNED')return;
 if(hold.current_status!=='SPENT')throw error('REWARD_RETURN_MISMATCH',409);
 for(const allocation of hold.data.allocations){
  const lot=await W.load(tx,allocation.lot_id,'EARNING');if(lot.data.spent<allocation.points)throw error('REWARD_RETURN_MISMATCH',409);
  const ownDebt=Math.min(allocation.points,lot.data.pending_shortfall||0);
  const data={...lot.data,spent:lot.data.spent-allocation.points,reversed:lot.data.reversed+ownDebt,pending_shortfall:lot.data.pending_shortfall-ownDebt};
  await W.save(tx,null,lot,data.pending_shortfall?'REVERSAL_PENDING':'ISSUED',data,'REDEMPTION_POINTS_RETURNED');
  await require('../wallet/earnings').settleDebt(tx,null,await W.load(tx,lot.id,'EARNING'));
 }
 await W.save(tx,null,hold,'RETURNED',hold.data,'REDEMPTION_RETURNED');await require('../wallet/points').expire(tx,party);
}
async function award(tx,a,party,points,reference){
 const account=await W.account(tx,party),at=await A.now(tx);
 const data={source_kind:'FREE',event_kind:'REWARD',source_ref:require('../governance/content').digest(reference),occurred_at:at,rule_id:account.data.rule_id,rule:account.data.rule,points,reversed:0,growth_reversed:0,spent:0,expired:0,pending_shortfall:0,debt_offset:0,debt_settled:0,paid_minor:0,refunded_minor:0,issued_at:at,expires_at:new Date(Date.parse(at)+account.data.rule.points_days*86400000).toISOString()};
 return require('../wallet/earnings').settleDebt(tx,a,await W.insert(tx,a,'EARNING',party,null,'ISSUED',data,['REWARD',reference]));
}
module.exports={spend,returnSpend,award};
