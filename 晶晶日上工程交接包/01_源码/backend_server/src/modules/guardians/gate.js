'use strict';
const A=require('../artists/context'),C=require('./context'),P=require('./policy'),{error}=require('../party/policy');
async function enforce(db,account,path,method){
 if(/^\/(guardians(?:\/|$)|privacy(?:\/|$)|auth(?:\/|$)|support(?:\/|$)|infringement(?:\/|$))/.test(path)||method==='GET'&&/^\/(me|parties)(\/|$)/.test(path))return;
 // Preserve own historical financial access and cancellation of unsent refunds; repository rechecks ownership.
 // This never permits recharge, spending, new refund applications, review or dispatch.
 if(method==='GET'&&/^\/wallet\/recharge-refunds(?:\/[0-9a-f-]{36})?$/.test(path)||method==='POST'&&/^\/wallet\/recharge-refunds\/[0-9a-f-]{36}\/cancellation$/.test(path))return;
 return db.withTransaction(async tx=>{
 const raw=await A.one(tx,"SELECT * FROM guardian_records WHERE kind='LINK' AND child_account_id=? ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE",[account.id]);
 if(!raw){
  // A missing guardian link does not erase a verified age restriction. Check the
  // actor's personal identity, not the adult artist represented by an organization.
  // Failed/expired reverification retains the last known age; only a trusted new
  // identity result may correct it. Reads retain their repository ownership checks.
  const protection=method==='POST'&&/^\/artists\/people\/[0-9a-f-]{36}\/(?:identity|records\/[0-9a-f-]{36}\/(?:appeals|withdrawals)|services\/[0-9a-f-]{36}\/cancel)$/.test(path);
  if(method!=='GET'&&!protection){
   const minor=await A.one(tx,"SELECT a.id FROM artist_people a JOIN parties p ON p.id=a.owner_party_id WHERE p.personal_account_id=? AND p.kind='PERSON' AND a.age_band='MINOR' LIMIT 1 FOR SHARE",[account.id]);
   if(minor)throw error('MINOR_OPERATION_RESTRICTED',403);
  }
  return;
 }
 const r=await C.active(tx,C.checked(raw));
 // Guardian permission is not an authorization to collect/model children or charge their money.
 if(method!=='GET'||!/^\/(discovery|directory|stock\/catalog|notices)(\/|$)/.test(path))throw error('MINOR_REAL_SERVICE_NOT_ENABLED',403);
 const at=await A.now(tx),usage=await A.one(tx,'SELECT * FROM guardian_usage WHERE child_account_id=? AND local_date=?',[account.id,P.date(at)]);
 P.use(r.data,at,usage);throw error('MINOR_CONTENT_POOL_NOT_ENABLED',403);
 });
}
module.exports={enforce};
