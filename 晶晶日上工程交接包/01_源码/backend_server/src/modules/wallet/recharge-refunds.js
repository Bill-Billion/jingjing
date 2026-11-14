'use strict';
// Custody engine. HTTP uses explicit projections; dispatch and receipts remain internal only.
const {shape,id,label,error}=require('../party/policy');
const {instant}=require('../trade/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./policy'),cash=require('./cash');
const KIND='RECHARGE_REFUND',ACTION='WALLET_REFUND_REVIEW',guardian=require('./recharge-refund-guardian'),tasks=require('./recharge-refund-jobs');
function createRechargeRefunds(db,{resolvePrincipal=async()=>null}={}){
 const actor=A.createActor(resolvePrincipal);
 const run=(ctx,fn)=>db.withTransaction(async tx=>fn(tx,await actor(tx,ctx)));
 async function locked(tx,key){const hint=await C.load(tx,key,KIND,'');await C.account(tx,hint.owner_party_id);return C.load(tx,key,KIND);}
 async function recharge(tx,r){const source=await C.load(tx,r.parent_id,'RECHARGE');if(source.current_status!=='SUCCEEDED'||source.owner_party_id!==r.owner_party_id||source.data.transaction_id!==r.data.original_transaction_id||digest(source.data.binding)!==digest(r.data.binding))throw error('CUSTODY_REFUND_SOURCE_MISMATCH',409);return source;}
 async function independent(tx,a,r){await C.operator(tx,a,ACTION,r);await C.operator(tx,a,ACTION,await recharge(tx,r));}
 async function available(tx,r){const lots=await cash.snapshot(tx,r.owner_party_id);const lot=lots.find(x=>x.id===r.parent_id);if(!lot)throw error('CUSTODY_REFUND_SOURCE_MISMATCH',409);return lot.available_minor;}
 const api={
  async request(ctx,i){
   shape(i,['party_id','recharge_id','amount_minor','reason','evidence_asset_ids','guardian_link_id','operation_key']);P.integer(i.amount_minor,1);label(i.reason,2000);
   if(!Array.isArray(i.evidence_asset_ids)||!i.evidence_asset_ids.length||i.evidence_asset_ids.length>20||new Set(i.evidence_asset_ids).size!==i.evidence_asset_ids.length)throw error('EVIDENCE_REQUIRED',400);
   return run(ctx,async(tx,a)=>{
    await C.account(tx,i.party_id);const applicant=await guardian.applicant(tx,a,i);const source=await C.load(tx,id(i.recharge_id),'RECHARGE');if(source.owner_party_id!==i.party_id)throw error('WALLET_NOT_FOUND',404);
    return C.command(tx,a,'RECHARGE_REFUND_REQUEST',i,async()=>{
     if(source.current_status!=='SUCCEEDED')throw error('CUSTODY_RECHARGE_NOT_RECEIVED',409);
     if(i.amount_minor>source.data.amount_minor-source.data.refunded_minor)throw error('CUSTODY_REFUND_EXCEEDS_RECHARGE',409);
     await A.assets(tx,i.evidence_asset_ids,applicant.evidence_owner_party_id,['REVIEW_EVIDENCE']);
     // A consumed/frozen balance does not reject the case. Approval must resolve its funding first.
     return C.insert(tx,a,KIND,i.party_id,source.id,'IN_REVIEW',{...applicant,recharge_id:source.id,binding:source.data.binding,currency:'CNY',original_transaction_id:source.data.transaction_id,requested_minor:i.amount_minor,amount_minor:0,reason:i.reason,evidence_asset_ids:i.evidence_asset_ids,created_at:await A.now(tx),review:null,submitted_at:null,settled_at:null,proof_sha256:null},[i.party_id,i.operation_key]);
    });
   });
  },
  async read(ctx,i){shape(i,['record_id','party_id','operations']);return run(ctx,async(tx,a)=>{const r=await C.load(tx,i.record_id,KIND,'FOR SHARE');if(i.operations===true)await independent(tx,a,r);else{await C.owner(tx,a,i.party_id);if(r.owner_party_id!==i.party_id)throw error('WALLET_NOT_FOUND',404);}return r;});},
  async readForGuardian(ctx,i){shape(i,['record_id']);return run(ctx,async(tx,a)=>{const r=await locked(tx,id(i.record_id));if(!r.data.guardian_link_id||r.data.guardian_account_id!==a.id)throw error('WALLET_NOT_FOUND',404);await guardian.current(tx,r);return r;});},
  async list(ctx,i){
   shape(i,['party_id','guardian','operations','after','limit']);const limit=i.limit??20;P.integer(limit,1,100);if(i.after)id(i.after);
   return run(ctx,async(tx,a)=>{
    let filter,args;
    if(i.operations===true){await C.operator(tx,a,ACTION);filter="1=1";args=[];}
    else if(i.guardian===true){filter="r.created_by=? AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.guardian_account_id'))=?";args=[a.id,a.id];}
    else{await C.owner(tx,a,i.party_id);filter="r.owner_party_id=?";args=[i.party_id];}
    const q="SELECT r.* FROM wallet_records r WHERE r.kind='RECHARGE_REFUND' AND "+filter;
    if(i.after&&!(await tx.execute(q+' AND r.id=?',[...args,i.after]))[0].length)throw error('INVALID_CURSOR',400);
    const rows=(await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[...args,i.after||'',limit+1]))[0],items=[];
    for(const raw of rows.slice(0,limit)){
     const r=C.checked(raw);
     try{if(i.operations===true)await independent(tx,a,r);if(i.guardian===true)await guardian.current(tx,r);}
     catch(e){if(['SELF_REVIEW_FORBIDDEN','GUARDIAN_ACCOUNT_NOT_AVAILABLE','GUARDIAN_VERIFIED_IDENTITY_REQUIRED','GUARDIAN_LINK_NOT_ACTIVE'].includes(e.code))continue;throw e;}
     items.push(require('./recharge-refund-view').view(r));
    }
    return {items,next_cursor:rows.length>limit?rows[limit-1].id:null};
   });
  },
  async evidence(ctx,i){
   shape(i,['record_id','asset_id']);
   return run(ctx,async(tx,a)=>{const r=await locked(tx,id(i.record_id));await independent(tx,a,r);
    if(!r.data.evidence_asset_ids.includes(id(i.asset_id)))throw error('WALLET_NOT_FOUND',404);
    await A.assets(tx,[i.asset_id],r.data.evidence_owner_party_id||r.owner_party_id,['REVIEW_EVIDENCE']);
    return A.one(tx,'SELECT * FROM supply_assets WHERE id=?',[i.asset_id]);
   });
  },
  async review(ctx,i){
   shape(i,['record_id','expected_version','decision','amount_minor','reason','checks','operation_key']);label(i.reason,2000);P.integer(i.amount_minor);shape(i.checks,['identity_verified','source_verified','refund_basis_verified','relationship_verified']);
   if(!['APPROVE','REJECT'].includes(i.decision)||i.decision==='REJECT'&&i.amount_minor!==0)throw error('INVALID_REVIEW',400);
   return run(ctx,async(tx,a)=>{const r=await locked(tx,i.record_id);await independent(tx,a,r);return C.command(tx,a,'RECHARGE_REFUND_REVIEW',i,async()=>{
    A.match(r,i.expected_version);if(r.current_status!=='IN_REVIEW')throw error('REVIEW_NOT_PENDING',409);
    if(i.decision==='APPROVE'){
     if(!['identity_verified','source_verified','refund_basis_verified'].every(k=>i.checks[k]===true))throw error('CUSTODY_REFUND_VERIFICATION_REQUIRED',409);
     P.integer(i.amount_minor,1);if(i.amount_minor>r.data.requested_minor)throw error('CUSTODY_REFUND_EXCEEDS_REQUEST',409);
     await guardian.current(tx,r);if(r.data.guardian_link_id&&i.checks.relationship_verified!==true)throw error('GUARDIAN_REFUND_VERIFICATION_REQUIRED',409);
     await A.assets(tx,r.data.evidence_asset_ids,r.data.evidence_owner_party_id||r.owner_party_id,['REVIEW_EVIDENCE']);
     if(i.amount_minor>await available(tx,r))throw error('CUSTODY_REFUND_FUNDS_UNAVAILABLE',409);
    }
    return C.save(tx,a,r,i.decision==='APPROVE'?'APPROVED':'REJECTED',{...r.data,amount_minor:i.amount_minor,review:{by:a.id,at:await A.now(tx),decision:i.decision,reason:i.reason,checks:i.checks}},'RECHARGE_REFUND_REVIEWED');
   });});
  },
  async cancel(ctx,i){shape(i,['record_id','party_id','expected_version','reason','operation_key']);label(i.reason,2000);return run(ctx,async(tx,a)=>{await C.owner(tx,a,i.party_id);const r=await locked(tx,i.record_id);if(r.owner_party_id!==i.party_id)throw error('WALLET_NOT_FOUND',404);return C.command(tx,a,'RECHARGE_REFUND_CANCEL',i,async()=>{A.match(r,i.expected_version);if(!['IN_REVIEW','APPROVED'].includes(r.current_status))throw error('CUSTODY_REFUND_CANNOT_CANCEL',409);return C.save(tx,a,r,'CANCELLED',{...r.data,cancellation:{by:a.id,at:await A.now(tx),reason:i.reason}},'RECHARGE_REFUND_CANCELLED_UNSENT');});});},
  // Claim exactly once. A false dispatch with reconcile=true means query the SAME record id.
  async claim(ctx,{record_id},binding,{task=null}={}){const cfg=require('./custody').config(binding);return run(ctx,async(tx,a)=>{
   const r=await locked(tx,record_id);await independent(tx,a,r);if(task)await tasks.fence(tx,r,task);if(digest(cfg)!==digest(r.data.binding))throw error('CUSTODY_RECEIPT_MISMATCH',409);
   if(r.current_status!=='APPROVED')return {dispatch:false,reconcile:['SUBMITTING','UNKNOWN'].includes(r.current_status),record:r};
   await guardian.current(tx,r);
   await available(tx,r); // Includes this refund's reservation; fail closed on a ledger contradiction.
   return {dispatch:true,reconcile:false,record:await C.save(tx,a,r,'SUBMITTING',{...r.data,submitted_at:await A.now(tx)},'RECHARGE_REFUND_DISPATCH_CLAIMED')};
  });},
  // Only a signature-verifying/querying adapter may call this, never a browser or operator form.
  async applyVerifiedReceipt(proof,{task=null}={}){
   shape(proof,['record_id','recharge_id','provider','environment','merchant_id','revision','original_transaction_id','refund_transaction_id','currency','amount_minor','occurred_at','status']);id(proof.record_id);id(proof.recharge_id);P.integer(proof.amount_minor,1);instant(proof.occurred_at);
   if(!['SUCCEEDED','CLOSED','PENDING','UNKNOWN'].includes(proof.status))throw error('CUSTODY_RECEIPT_MISMATCH',409);
   if(proof.status==='SUCCEEDED')require('../party/policy').ref(proof.refund_transaction_id);else if(proof.refund_transaction_id!==null)throw error('CUSTODY_RECEIPT_MISMATCH',409);
   return db.withTransaction(async tx=>{
    const r=await locked(tx,proof.record_id),source=await recharge(tx,r),d=r.data;if(task)await tasks.fence(tx,r,task);
    if(['provider','environment','merchant_id','revision'].some(k=>proof[k]!==d.binding[k])||proof.recharge_id!==source.id||proof.original_transaction_id!==d.original_transaction_id||proof.currency!=='CNY'||proof.amount_minor!==d.amount_minor||!d.submitted_at||proof.occurred_at<d.submitted_at||proof.occurred_at>await A.now(tx))throw error('CUSTODY_RECEIPT_MISMATCH',409);
    const hash=digest(proof);
    if(['SUCCEEDED','CLOSED'].includes(r.current_status)){if(r.current_status!==proof.status||d.proof_sha256!==hash)throw error('CUSTODY_REFUND_TERMINAL_CONFLICT',409);return r;}
    if(!['SUBMITTING','UNKNOWN'].includes(r.current_status))throw error('CUSTODY_REFUND_NOT_SUBMITTED',409);
    if(d.proof_sha256===hash)return r;
    await available(tx,r);
    if(proof.status==='SUCCEEDED'){
     const total=P.sum([source.data.refunded_minor,d.amount_minor]);if(total>source.data.amount_minor)throw error('CUSTODY_REFUND_EXCEEDS_RECHARGE',409);
     await C.insert(tx,{id:r.created_by},'RECHARGE_REFUND_RECEIPT',r.owner_party_id,r.id,'RECORDED',{refund_id:r.id,recharge_id:source.id,amount_minor:d.amount_minor,currency:'CNY',occurred_at:proof.occurred_at,binding:d.binding,refund_transaction_id:proof.refund_transaction_id,proof_sha256:hash},[proof.provider,proof.environment,proof.merchant_id,proof.refund_transaction_id]);
     await C.save(tx,null,source,'SUCCEEDED',{...source.data,refunded_minor:total},'RECHARGE_REFUND_RECEIVED');
    }
    const terminal=['SUCCEEDED','CLOSED'].includes(proof.status);
    return C.save(tx,null,r,terminal?proof.status:'UNKNOWN',{...d,proof_sha256:hash,receipt:proof,settled_at:terminal?proof.occurred_at:null},terminal?'RECHARGE_REFUND_SETTLED':'RECHARGE_REFUND_RESULT_UNKNOWN');
   });
  }
 };Object.assign(api,tasks.methods({db,run,locked,independent,guardian}));return api;
}
module.exports={createRechargeRefunds};
