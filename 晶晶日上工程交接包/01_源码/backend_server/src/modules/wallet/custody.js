 'use strict';
// Trusted adapter boundary. No HTTP callback accepts these objects directly, and no real adapter is enabled.
const {id,ref,shape,error}=require('../party/policy');
const {instant}=require('../trade/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
function config(c){shape(c,['provider','environment','merchant_id','revision']);ref(c.provider);ref(c.merchant_id);ref(c.revision);if(!['SANDBOX','PRODUCTION'].includes(c.environment))throw error('CUSTODY_CONFIG_INVALID',400);return structuredClone(c);}
function createCustodyLedger(db){return {
 // Called only after a licensed custody adapter has been configured and user authority resolved by a service.
 async prepare(tx,a,{party_id,amount_minor,operation_key},binding){
  const cfg=config(binding);await C.owner(tx,a,party_id,true);const account=await C.account(tx,party_id),i={party_id,amount_minor,operation_key,binding:cfg};P.integer(amount_minor,1);
  return C.command(tx,a,'RECHARGE',i,async()=>{const now=await A.now(tx),receipts=await C.rows(tx,party_id,'RECHARGE');if(receipts.some(r=>!['FAILED','CANCELLED'].includes(r.current_status)&&['provider','environment','merchant_id'].some(k=>r.data.binding[k]!==cfg[k])))throw error('CUSTODY_ACCOUNT_MIGRATION_REQUIRED',409);P.topupAllowed(account.data.rule,receipts.map(r=>({...r.data,status:r.current_status})),amount_minor,now);return C.insert(tx,a,'RECHARGE',party_id,account.id,'PENDING',{amount_minor,refunded_minor:0,currency:'CNY',binding:cfg,created_at:now,occurred_at:null,transaction_id:null,proof_sha256:null},[party_id,operation_key]);});
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
