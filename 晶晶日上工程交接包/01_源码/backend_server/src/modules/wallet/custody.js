 'use strict';
// Trusted adapter boundary. No HTTP callback accepts these objects directly, and no real adapter is enabled.
const {id,ref,shape,error}=require('../party/policy');
const {instant}=require('../trade/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
function config(c){shape(c,['provider','environment','merchant_id','revision']);ref(c.provider);ref(c.merchant_id);ref(c.revision);if(!['SANDBOX','PRODUCTION'].includes(c.environment))throw error('CUSTODY_CONFIG_INVALID',400);return structuredClone(c);}
function createCustodyLedger(db){return {
 // Internal, read-only assessment. This is neither an approval nor a reservation/payment instruction.
 // A future refund command must re-read under the same account lock before reserving any funds.
 async assessRefund(tx,a,i,binding){
  shape(i,['party_id','recharge_id']);const cfg=config(binding);
  // Reading original money facts remains possible after adult verification expires.
  await C.owner(tx,a,i.party_id);const account=await C.account(tx,i.party_id);
  const r=await C.load(tx,i.recharge_id,'RECHARGE');
  if(r.owner_party_id!==i.party_id)throw error('WALLET_NOT_FOUND',404);
  if(r.current_status!=='SUCCEEDED')throw error('CUSTODY_RECHARGE_NOT_RECEIVED',409);
  if(digest(r.data.binding)!==digest(cfg))throw error('CUSTODY_RECEIPT_MISMATCH',409);
  const spends=await C.rows(tx,i.party_id,'CASH_SPEND'),related=[];
  const amounts={spent_minor:0,held_minor:0,unknown_minor:0};
  for(const s of spends){
   const allocations=s.data.allocations.filter(x=>x.recharge_id===r.id);
   if(!allocations.length)continue;
   if(!['SPENT','HELD','UNKNOWN','RELEASED'].includes(s.current_status))throw error('CUSTODY_REFUND_REVIEW_REQUIRED',409);
   if(digest(s.data.binding)!==digest(cfg))throw error('WALLET_CASH_INVARIANT',503);
   related.push({id:s.id,object_version:s.object_version,content_sha256:s.content_sha256,status:s.current_status});
   for(const item of allocations){
    P.integer(item.amount_minor,1);P.integer(item.returned_minor);
    if(item.returned_minor>item.amount_minor||(s.current_status!=='SPENT'&&item.returned_minor!==0))throw error('WALLET_CASH_INVARIANT',503);
    if(s.current_status!=='RELEASED'){
     const field={SPENT:'spent_minor',HELD:'held_minor',UNKNOWN:'unknown_minor'}[s.current_status];
     amounts[field]=P.sum([amounts[field],item.amount_minor-item.returned_minor]);
    }
   }
  }
  P.integer(r.data.amount_minor,1);P.integer(r.data.refunded_minor);
  const cash=require('./cash'),refunds=(await C.rows(tx,i.party_id,'RECHARGE_REFUND')).filter(f=>f.parent_id===r.id);
  amounts.refund_reserved_minor=P.sum(cash.refundReservations(refunds).map(f=>f.data.amount_minor));
  const available=r.data.amount_minor-P.sum([r.data.refunded_minor,...Object.values(amounts)]);
  if(available<0)throw error('WALLET_CASH_INVARIANT',503);
  // Cross-check against the allocator used by actual order payment, not a second spending balance.
  if(cash.balances([r],spends,refunds)[0].available_minor!==available)throw error('WALLET_CASH_INVARIANT',503);
  const sources={account:{id:account.id,object_version:account.object_version,content_sha256:account.content_sha256},recharge:{id:r.id,object_version:r.object_version,content_sha256:r.content_sha256},spends:related,refunds:refunds.map(f=>({id:f.id,object_version:f.object_version,content_sha256:f.content_sha256,status:f.current_status}))};
  return {recharge_id:r.id,currency:'CNY',binding:cfg,original_transaction_id:r.data.transaction_id,
   amount_minor:r.data.amount_minor,refunded_minor:r.data.refunded_minor,...amounts,available_for_refund_minor:available,
   observed_at:await A.now(tx),source_sha256:digest(sources),execution_enabled:false,meaning:'ASSESSMENT_ONLY_NOT_REFUND_APPROVAL'};
 },
 // Called only after a licensed custody adapter has been configured and user authority resolved by a service.
 async prepare(tx,a,{party_id,amount_minor,operation_key},binding){
  const cfg=config(binding);await C.owner(tx,a,party_id,true);const account=await C.account(tx,party_id),i={party_id,amount_minor,operation_key,binding:cfg};P.integer(amount_minor,1);
  return C.command(tx,a,'RECHARGE',i,async()=>{const now=await A.now(tx),receipts=await C.rows(tx,party_id,'RECHARGE');if(receipts.some(r=>!['FAILED','CANCELLED'].includes(r.current_status)&&['provider','environment','merchant_id'].some(k=>r.data.binding[k]!==cfg[k])))throw error('CUSTODY_ACCOUNT_MIGRATION_REQUIRED',409);P.topupAllowed(account.data.rule,receipts.map(r=>({...r.data,status:r.current_status})),amount_minor,now);const recharge=await C.insert(tx,a,'RECHARGE',party_id,account.id,'PENDING',{amount_minor,refunded_minor:0,currency:'CNY',binding:cfg,created_at:now,occurred_at:null,transaction_id:null,proof_sha256:null},[party_id,operation_key]);await require('./consumer-controls').check(tx,party_id,'RECHARGE');await require('./risk').enforce(tx,party_id,{kind:'RECHARGE',amount_minor,request_key:operation_key,recharge_id:recharge.id});return recharge;});
 },
 // proof must come from adapter signature verification/query, never from a user or an operator form.
 async applyVerifiedReceipt(proof){
  shape(proof,['record_id','provider','environment','merchant_id','revision','currency','amount_minor','transaction_id','occurred_at','status']);id(proof.record_id);ref(proof.transaction_id);instant(proof.occurred_at);P.integer(proof.amount_minor,1);
  return db.withTransaction(async tx=>{
   const hint=await C.load(tx,proof.record_id,'RECHARGE','');await C.account(tx,hint.owner_party_id);const r=await C.load(tx,proof.record_id,'RECHARGE'),d=r.data;
   if(['provider','environment','merchant_id','revision'].some(k=>proof[k]!==d.binding[k])||proof.currency!=='CNY'||proof.amount_minor!==d.amount_minor||proof.status!=='SUCCEEDED'||proof.occurred_at>await A.now(tx)||proof.occurred_at<d.created_at)throw error('CUSTODY_RECEIPT_MISMATCH',409);
   const fingerprint=digest(proof);if(r.current_status==='SUCCEEDED'){if(d.proof_sha256!==fingerprint)throw error('CUSTODY_RECEIPT_MISMATCH',409);return r;}
   if(r.current_status!=='PENDING')throw error('CUSTODY_RECHARGE_NOT_PENDING',409);
   await C.insert(tx,{id:r.created_by},'CASH_RECEIPT',r.owner_party_id,r.id,'RECORDED',{transaction_id:proof.transaction_id,binding:d.binding,amount_minor:d.amount_minor,occurred_at:proof.occurred_at,proof_sha256:fingerprint},[proof.provider,proof.environment,proof.merchant_id,proof.transaction_id]);
   return C.save(tx,null,r,'SUCCEEDED',{...d,occurred_at:proof.occurred_at,transaction_id:proof.transaction_id,proof_sha256:fingerprint},'CUSTODY_RECHARGE_RECEIVED');
  });
 }
};}
module.exports={createCustodyLedger,config};
