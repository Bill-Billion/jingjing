'use strict';
// Internal authorization; an approved guardian never becomes the child's principal.
const A=require('../artists/context'),G=require('../guardians/context'),C=require('./context'),{id,error}=require('../party/policy');
async function applicant(tx,a,i){
 if(!i.guardian_link_id){await C.owner(tx,a,i.party_id);return {evidence_owner_party_id:i.party_id};}
 const link=await G.load(tx,id(i.guardian_link_id));
 if(link.kind!=='LINK'||link.guardian_account_id!==a.id)throw error('GUARDIAN_OWNER_REQUIRED',403);
 await G.active(tx,link);
 const child=await A.one(tx,"SELECT personal_account_id FROM parties WHERE id=? AND kind='PERSON'",[i.party_id]);
 const guardian=await A.one(tx,"SELECT id FROM parties WHERE personal_account_id=? AND kind='PERSON'",[a.id]);
 if(child?.personal_account_id!==link.child_account_id||!guardian)throw error('GUARDIAN_REFUND_TARGET_MISMATCH',403);
 return {guardian_link_id:link.id,guardian_account_id:a.id,evidence_owner_party_id:guardian.id};
}
async function current(tx,r){
 if(!r.data.guardian_link_id)return;
 const link=await G.load(tx,r.data.guardian_link_id);await G.active(tx,link);
 const child=await A.one(tx,"SELECT personal_account_id FROM parties WHERE id=? AND kind='PERSON'",[r.owner_party_id]);
 const guardian=await A.one(tx,"SELECT id FROM parties WHERE personal_account_id=? AND kind='PERSON'",[link.guardian_account_id]);
 if(link.guardian_account_id!==r.data.guardian_account_id||r.created_by!==link.guardian_account_id||child?.personal_account_id!==link.child_account_id||guardian?.id!==r.data.evidence_owner_party_id)throw error('GUARDIAN_REFUND_TARGET_MISMATCH',403);
}
module.exports={applicant,current};
