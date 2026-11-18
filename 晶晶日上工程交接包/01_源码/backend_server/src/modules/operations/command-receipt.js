'use strict';
// A minimal historical acknowledgement, not a replay or current business permission.
const A = require('../artists/context');
const {digest} = require('../governance/content');
const {shape, ref, id, error} = require('../party/policy');
const domains = {
 NOTICES: {table:'notice_commands', operations:['SUBMIT']},
 ENGAGEMENT: {table:'engagement_commands', operations:['NOMINATE','VOTE','APPEAL']},
};
function createCommandReceipts(db,{resolvePrincipal,domain}) {
 const config=domains[domain];
 if(!config)throw new Error('Unknown receipt domain');
 const actor=A.createActor(resolvePrincipal);
 return async(ctx,i)=>{
  shape(i,['party_id','operation','operation_key']);id(i.party_id);ref(i.operation_key);
  if(!config.operations.includes(i.operation))throw error('INVALID_OPERATION',400);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx);
   // Keep current account and party authority; expired business eligibility is separate.
   if(domain==='NOTICES')await require('../party/representatives').authority(tx,a,i.party_id,'TRADE');
   else await require('../engagement/context').owner(tx,a,i.party_id);
   const row=await A.one(tx,'SELECT fingerprint,result_json,result_sha256 FROM '+config.table+' WHERE id=?',
    [digest([a.id,i.operation,ref(i.operation_key)])]);
   const empty={operation:i.operation,operation_key:i.operation_key,outcome:'NOT_OBSERVED',
    request_sha256:null,record_id:null,record_kind:null,original_object_version:null,original_status:null};
   // A concurrent transaction may commit after this read. Absence is never proof of failure.
   if(!row||!row.result_json)return empty;
   if(A.sha(row.result_json)!==row.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);
   const result=JSON.parse(row.result_json);
   if(result.created_by!==a.id||result.owner_party_id!==i.party_id)throw error('OPERATION_NOT_FOUND',404);
   return {...empty,outcome:'COMMITTED',request_sha256:row.fingerprint,record_id:result.id,
    record_kind:result.kind,original_object_version:result.object_version,original_status:result.current_status};
  });
 };
}
module.exports={createCommandReceipts};
