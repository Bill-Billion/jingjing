'use strict';
const {id,label,shape,error}=require('../party/policy');
const C=require('./context'),S=require('./source'),P=require('./policy');

// A recovery case records a reviewed claim. Only PAYOUT_EVIDENCE review posts money.
async function basis(tx,g,recipient){
 await S.liveAgreement(tx,g);
 if(g.data.source_type!=='ORDER'||recipient===g.owner_party_id||!g.data.parties.includes(id(recipient)))throw error('RECOVERY_PARTY_INVALID',409);
 const facts=await S.facts(tx,g),totals=await S.totals(tx,g),targets=S.targets(g,facts);
 if(Object.entries(targets).some(([party,value])=>totals[party].accrued_minor!==value))throw error('RECOVERY_SETTLEMENT_REQUIRED',409);
 const due=Math.max(0,-totals[recipient].balance_minor);
 const cursor=await C.one(tx,'SELECT COALESCE(MAX(id),0) AS ledger_cursor FROM finance_entries WHERE agreement_id=?',[g.id]);
 return {source_type:g.data.source_type,source_id:g.data.source_id,source_sha256:g.data.source_sha256,facts_sha256:facts.hash,ledger_cursor:String(cursor.ledger_cursor),recovery_due_minor:due};
}
async function cases(tx,g){return (await tx.execute("SELECT * FROM finance_records WHERE agreement_id=? AND kind='RECOVERY' FOR SHARE",[g.id]))[0].map(C.dto);}
async function unique(tx,g,recipient,exclude=null){if((await cases(tx,g)).some(x=>x.id!==exclude&&x.data.recipient_party_id===recipient&&['IN_REVIEW','APPROVED'].includes(x.current_status)))throw error('RECOVERY_ALREADY_OPEN',409);}
async function approve(tx,g,r){
 await C.asset(tx,r.data.evidence_asset_id,g.owner_party_id);
 const current=await basis(tx,g,r.data.recipient_party_id);
 if(current.facts_sha256!==r.data.basis.facts_sha256||r.data.amount_minor>current.recovery_due_minor)throw error('RECOVERY_BASIS_CHANGED',409);
 await unique(tx,g,r.data.recipient_party_id,r.id);
}
function methods(H){const {mutate,payer,operator,insert,save}=H;return {
 async recovery(ctx,i){
  shape(i,['record_id','party_id','expected_version','recipient_party_id','amount_minor','reason','evidence_asset_id','operation_key']);P.amount(i.amount_minor);label(i.reason,4000);
  return mutate(ctx,i,'RECOVERY',(tx,a,g,r)=>payer(tx,a,g,i),async(tx,a,g,r)=>{
   if(r.kind!=='AGREEMENT')throw error('FINANCE_NOT_FOUND',404);
   const snapshot=await basis(tx,g,i.recipient_party_id);
   if(i.amount_minor>snapshot.recovery_due_minor)throw error('RECOVERY_EXCEEDS_DUE',409);
   await unique(tx,g,i.recipient_party_id);await C.asset(tx,i.evidence_asset_id,g.owner_party_id);
   return insert(tx,a,'RECOVERY',g,i.recipient_party_id,'IN_REVIEW',{recipient_party_id:i.recipient_party_id,amount_minor:i.amount_minor,reason:i.reason,evidence_asset_id:id(i.evidence_asset_id),basis:snapshot,review:null,receipts:[],received_minor:0,meaning:'CLAIM_ONLY_NOT_RECEIVED_OR_DEBT_WRITEOFF'});
  });
 },
 async recoveryReceipt(ctx,i){
  shape(i,['record_id','party_id','expected_version','payout_evidence_id','amount_minor','operation_key']);P.amount(i.amount_minor);
  return mutate(ctx,i,'RECOVERY_RECEIPT',(tx,a,g,r)=>payer(tx,a,g,i),async(tx,a,g,r)=>{
   if(r.kind!=='RECOVERY'||r.current_status!=='APPROVED')throw error('RECOVERY_NOT_APPROVED',409);
   const receipt=await C.load(tx,i.payout_evidence_id,'PAYOUT_EVIDENCE');
   if(receipt.agreement_id!==g.id||receipt.current_status!=='APPROVED'||receipt.data.outcome!=='RETURNED'||receipt.data.recipient_party_id!==r.data.recipient_party_id)throw error('RECOVERY_RECEIPT_NOT_VERIFIED',409);
   await C.asset(tx,receipt.data.evidence_asset_id,g.owner_party_id);
   const rows=(await tx.execute("SELECT * FROM finance_entries WHERE agreement_id=? AND source_id=? AND party_id=? AND category='PAYOUT_RETURN'",[g.id,receipt.id,r.data.recipient_party_id]))[0];
   if(rows.length!==1||Number(rows[0].amount_minor)!==receipt.data.amount_minor||BigInt(rows[0].id)<=BigInt(r.data.basis.ledger_cursor))throw error('RECOVERY_RECEIPT_NOT_CURRENT',409);
   C.checked(rows[0]);
   const all=await cases(tx,g),used=all.flatMap(x=>x.data.receipts).filter(x=>x.payout_evidence_id===receipt.id).reduce((n,x)=>n+x.amount_minor,0);
   if(i.amount_minor>receipt.data.amount_minor-used||i.amount_minor>r.data.amount_minor-r.data.received_minor)throw error('RECOVERY_RECEIPT_EXCEEDS_REMAINING',409);
   const received=r.data.received_minor+i.amount_minor;
   return save(tx,a,g,r,received===r.data.amount_minor?'RECOVERED':'APPROVED',{...r.data,received_minor:received,receipts:[...r.data.receipts,{payout_evidence_id:receipt.id,content_sha256:receipt.content_sha256,ledger_entry_id:String(rows[0].id),amount_minor:i.amount_minor}]},'RECOVERY_RECEIPT_LINKED');
  });
 },
 async cancelRecovery(ctx,i){
  shape(i,['record_id','expected_version','reason','operation_key']);label(i.reason,4000);
  return mutate(ctx,i,'CANCEL_RECOVERY',(tx,a,g,r)=>operator(tx,a,g,r,true),async(tx,a,g,r)=>{
   if(r.kind!=='RECOVERY'||r.current_status!=='APPROVED')throw error('RECOVERY_NOT_APPROVED',409);
   return save(tx,a,g,r,'CANCELLED',{...r.data,cancellation:{reason:i.reason,reviewer_account_id:a.id,meaning:'CASE_CLOSED_WITHOUT_DEBT_WRITEOFF_OR_RECEIPT'}},'RECOVERY_CANCELLED');
  });
 }
};}
module.exports={methods,approve};
