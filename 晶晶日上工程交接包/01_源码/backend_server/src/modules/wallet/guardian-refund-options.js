'use strict';
const A=require('../artists/context'),G=require('../guardians/context'),C=require('./context');
const {id,shape,error}=require('../party/policy');
function createGuardianRefundOptions(db,{resolvePrincipal}) {
 const actor=A.createActor(resolvePrincipal);
 return async(ctx,i)=>{
  shape(i,['guardian_link_id','after','limit']);id(i.guardian_link_id);
  const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);
  if(i.after)id(i.after);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx),link=await G.load(tx,i.guardian_link_id);
   if(link.kind!=='LINK'||link.guardian_account_id!==a.id)throw error('GUARDIAN_OWNER_REQUIRED',403);
   await G.active(tx,link);
   const child=await A.one(tx,"SELECT id FROM parties WHERE personal_account_id=? AND kind='PERSON'",[link.child_account_id]);
   if(!child)throw error('GUARDIAN_REFUND_TARGET_MISMATCH',403);
   await require('./recharge-refund-guardian').applicant(tx,a,{party_id:child.id,guardian_link_id:link.id});
   if(i.after&&!await A.one(tx,"SELECT id FROM wallet_records WHERE id=? AND kind='RECHARGE' AND owner_party_id=? AND current_status='SUCCEEDED'",[i.after,child.id]))throw error('INVALID_CURSOR',400);
   const rows=(await tx.execute("SELECT * FROM wallet_records WHERE kind='RECHARGE' AND owner_party_id=? AND current_status='SUCCEEDED' AND id>? ORDER BY id LIMIT ?",[child.id,i.after||'',limit+1]))[0].map(C.checked);
   return {guardian_link_id:link.id,child_party_id:child.id,
    items:rows.slice(0,limit).map(r=>({id:r.id,object_version:r.object_version,current_status:r.current_status,
     amount_minor:r.data.amount_minor,refunded_minor:r.data.refunded_minor,currency:'CNY'})),
    next_cursor:rows.length>limit?rows[limit-1].id:null};
  });
 };
}
module.exports={createGuardianRefundOptions};
