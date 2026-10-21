"use strict";
// Consumer custody balances only. Supplier payables never enter this ledger.
const {error}=require('../party/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
const active=new Set(['HELD','UNKNOWN','SPENT']);
function balances(topups,spends){
 const used=new Map();
 for(const s of spends)if(active.has(s.current_status))for(const a of s.data.allocations){
  const n=a.amount_minor-(a.returned_minor||0);P.integer(n);used.set(a.recharge_id,P.sum([used.get(a.recharge_id)||0,n]));
 }
 return topups.filter(t=>t.current_status==='SUCCEEDED').map(t=>{
  const available=t.data.amount_minor-t.data.refunded_minor-(used.get(t.id)||0);
  if(available<0)throw error('WALLET_CASH_INVARIANT',503);
  return {id:t.id,binding:t.data.binding,occurred_at:t.data.occurred_at,available_minor:available};
 });
}
async function snapshot(tx,party){return balances(await C.rows(tx,party,'RECHARGE'),await C.rows(tx,party,'CASH_SPEND'));}
async function overview(tx,party){const spends=await C.rows(tx,party,'CASH_SPEND'),topups=await C.rows(tx,party,'RECHARGE'),available=P.sum(balances(topups,spends).map(l=>l.available_minor)),reserved=P.sum(spends.filter(s=>['HELD','UNKNOWN'].includes(s.current_status)).flatMap(s=>s.data.allocations.map(a=>a.amount_minor-a.returned_minor)));return {recorded_balance_minor:P.sum([available,reserved]),available_balance_minor:available,reserved_balance_minor:reserved};}
async function find(tx,payment){const r=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='CASH_SPEND' AND source_key=? FOR UPDATE",[digest(['CASH_SPEND',payment])]);if(!r)throw error('WALLET_SPEND_MISSING',409);return C.checked(r);}
// Runs inside trade.preparePayment: order lock precedes account lock. A trusted adapter supplies binding.
async function reserve(tx,a,order,payment,config){
 if(payment.data.provider!=='CUSTODY')return;
 if(!config.custody_binding)throw error('CUSTODY_PROVIDER_NOT_CONNECTED',503);
 const binding=require('./custody').config(config.custody_binding);
 if(binding.environment!==payment.data.environment||binding.merchant_id!==payment.data.merchant_id||binding.revision!==payment.data.config_revision)throw error('CUSTODY_CONFIG_INVALID',409);
 await C.owner(tx,a,order.buyer_party_id,true);const account=await C.account(tx,order.buyer_party_id);
 const candidates=(await snapshot(tx,order.buyer_party_id)).filter(t=>digest(t.binding)===digest(binding)).sort((x,y)=>x.occurred_at.localeCompare(y.occurred_at)||x.id.localeCompare(y.id));
 let left=payment.data.amount_minor;const allocations=[];
 for(const lot of candidates){const n=Math.min(left,lot.available_minor);if(n)allocations.push({recharge_id:lot.id,amount_minor:n,returned_minor:0});left-=n;if(!left)break;}
 if(left)throw error('WALLET_BALANCE_INSUFFICIENT',409);
 return C.insert(tx,a,'CASH_SPEND',order.buyer_party_id,payment.id,'HELD',{account_id:account.id,order_id:order.id,payment_id:payment.id,binding,currency:'CNY',amount_minor:payment.data.amount_minor,allocations,transaction_id:null,refund_ids:[]},payment.id);
}
// Called only after the ordinary trade verifier accepts provider proofs. Same transaction as its journal.
async function payment(tx,p,proof){
 if(p.data.provider!=='CUSTODY')return;
 await C.account(tx,p.buyer_party_id);const s=await find(tx,p.id);
 if(proof.status==='REFUNDED')throw error('CUSTODY_SEPARATE_REFUND_REQUIRED',409);
 if(proof.status==='PENDING')return;
 if(proof.status==='REVIEW_REQUIRED'){if(s.current_status==='HELD')await C.save(tx,null,s,'UNKNOWN',s.data,'CASH_PROVIDER_REVIEW');return;}
 if(proof.status==='CLOSED'){
  if(s.current_status==='SPENT')return;
  if(s.current_status!=='RELEASED')await C.save(tx,null,s,'RELEASED',s.data,'CASH_RESERVATION_RELEASED');return;
 }
 if(proof.status!=='SUCCEEDED')throw error('CUSTODY_RECEIPT_MISMATCH',409);
 if(s.current_status==='SPENT'){if(s.data.transaction_id!==proof.transaction_id)throw error('CUSTODY_RECEIPT_MISMATCH',409);return;}
 if(!['HELD','UNKNOWN'].includes(s.current_status))throw error('CUSTODY_LATE_PAYMENT_REVIEW_REQUIRED',409);
 await C.save(tx,null,s,'SPENT',{...s.data,transaction_id:proof.transaction_id},'CASH_PAYMENT_VERIFIED');
}
async function refund(tx,r){
 if(r.data.provider!=='CUSTODY')return;
 await C.account(tx,r.buyer_party_id);const s=await find(tx,r.parent_id);
 if(s.current_status!=='SPENT'||s.data.transaction_id!==r.data.transaction_id)throw error('CUSTODY_REFUND_MISMATCH',409);
 if(s.data.refund_ids.includes(r.id))return;
 let left=r.data.amount_minor;const allocations=s.data.allocations.map(a=>{const n=Math.min(left,a.amount_minor-a.returned_minor);left-=n;return {...a,returned_minor:a.returned_minor+n};});
 if(left)throw error('CUSTODY_REFUND_EXCEEDS_PAYMENT',409);
 await C.save(tx,null,s,'SPENT',{...s.data,allocations,refund_ids:[...s.data.refund_ids,r.id]},'CASH_REFUND_ORIGINAL_LOTS');
 await C.insert(tx,{id:s.created_by},'CASH_REFUND',s.owner_party_id,s.id,'SUCCEEDED',{refund_id:r.id,payment_id:r.parent_id,amount_minor:r.data.amount_minor,currency:'CNY',binding:s.data.binding},r.id);
}
// Verified statement/query only; a difference is evidence, never an instruction to mint or delete money.
function createCashReconciler(db){return {async observe(proof){
 const {shape,id,ref}=require('../party/policy');shape(proof,['party_id','binding','statement_id','available_minor','occurred_at']);id(proof.party_id);ref(proof.statement_id);P.integer(proof.available_minor);require('../trade/policy').instant(proof.occurred_at);const binding=require('./custody').config(proof.binding);
 return db.withTransaction(async tx=>{const account=await C.account(tx,proof.party_id),now=await A.now(tx);if(proof.occurred_at>now)throw error('CUSTODY_RECEIPT_MISMATCH',409);
 const source=[binding.provider,binding.environment,binding.merchant_id,proof.statement_id],key=digest(['CASH_RECONCILIATION',source]);const old=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='CASH_RECONCILIATION' AND source_key=? FOR UPDATE",[key]);if(old){const r=C.checked(old);if(r.data.proof_sha256!==digest(proof)||r.owner_party_id!==proof.party_id)throw error('CUSTODY_RECEIPT_MISMATCH',409);return r;}
 const balance=P.sum((await snapshot(tx,proof.party_id)).filter(l=>digest(l.binding)===digest(binding)).map(l=>l.available_minor));
 return C.insert(tx,{id:account.created_by},'CASH_RECONCILIATION',proof.party_id,account.id,balance===proof.available_minor?'MATCHED':'DIFFERENCE',{binding,statement_id:proof.statement_id,observed_at:now,occurred_at:proof.occurred_at,local_available_minor:balance,provider_available_minor:proof.available_minor,proof_sha256:digest(proof),meaning:'OBSERVATION_ONLY_NO_BALANCE_ADJUSTMENT'},source);
 });
 }};}
module.exports={balances,snapshot,overview,reserve,payment,refund,createCashReconciler};
