'use strict';
const content=require('./content');
const {id,ref,shape,error}=require('../party/policy');
function normalizeSource(input){
 const value=JSON.parse(content.canonical(input));
 shape(value,['business_ref','revision','party_ids','rule_ids','reader_account_ids','commitments']);
 ref(value.business_ref);ref(value.revision);
 for(const field of ['party_ids','rule_ids','reader_account_ids']){
  if(!Array.isArray(value[field])||!value[field].length||value[field].length>100||new Set(value[field]).size!==value[field].length)throw error('INVALID_COMMITMENT',400);
  value[field].forEach(id);
 }
 if(!value.commitments||typeof value.commitments!=='object'||Array.isArray(value.commitments)||!Object.keys(value.commitments).length)throw error('MISSING_TERMS',400);
 return value;
}
function sourceData(row){
 const value=normalizeSource(typeof row.content_json==='string'?JSON.parse(row.content_json):row.content_json);
 if(content.digest(value)!==row.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);
 if(sourceRef(value)!==row.source_ref)throw error('STORED_CONTENT_MISMATCH',503);
 return {source_ref:row.source_ref,contract_version_id:row.id,content:value,content_sha256:row.content_sha256,current_status:row.current_status,object_version:row.object_version,review_ref:row.review_ref};
}
const sourceRef=value=>'contract:'+content.digest([value.business_ref,value.revision]);
// Lock the reviewed, immutable revision in the same transaction as its snapshot.
async function loadReviewedCommitment(tx,{source_ref}){
 const [[row]]=await tx.execute('SELECT * FROM governance_sources WHERE source_ref=? FOR SHARE',[source_ref]);
 if(!row||row.current_status!=='REVIEWED')return null;
 const {content:value}=sourceData(row);
 await validateParticipants(tx,value,row.created_by);
 return {contract_version_id:row.id,party_ids:value.party_ids,rule_ids:value.rule_ids,reader_account_ids:value.reader_account_ids,commitments:value.commitments};
}
async function validateParticipants(tx,value,creator){
 if(!value.reader_account_ids.includes(creator))throw error('SOURCE_CREATOR_READER_REQUIRED',400);
 for(const partyId of [...value.party_ids].sort()){
  const [[party]]=await tx.execute('SELECT current_status FROM parties WHERE id=? FOR SHARE',[partyId]);
  if(!party||['SUSPENDED','CLOSED'].includes(party.current_status))throw error('PARTY_NOT_ACTIVE');
 }
 for(const accountId of [...value.reader_account_ids].sort()){
  const [[account]]=await tx.execute('SELECT current_status FROM identity_accounts WHERE id=? FOR SHARE',[accountId]);
  if(!account||account.current_status!=='ACTIVE')throw error('READER_NOT_ACTIVE');
  // The recording operator is explicit; other readers must represent one of the parties.
  if(accountId!==creator){
   const [members]=await tx.execute('SELECT party_id FROM party_memberships WHERE account_id=? AND current_status=? FOR SHARE',[accountId,'ACTIVE']);
   if(!members.some(m=>value.party_ids.includes(m.party_id)))throw error('READER_NOT_A_PARTY');
  }
 }
}
module.exports={normalizeSource,sourceData,sourceRef,loadReviewedCommitment,validateParticipants};
