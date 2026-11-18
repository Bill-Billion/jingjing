'use strict';
const assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');
// Prepare a real reviewed company specification without giving the negative-case owner an identity.
// The organization qualification is synthetic; membership and TRADE authority use the actual repository.
async function seedCompanySpecForIdentityNegative(db,{parties,trade,owner,author,reviewer,partyId,input}){
 const [[schema]]=await db.execute('SELECT DATABASE() name');assert.match(schema.name,/^jx_test_[a-z0-9_]+$/);
 const ownerPeople=async()=>Number((await db.execute('SELECT COUNT(*) n FROM artist_people WHERE owner_party_id=?',[owner.personal_party_id]))[0][0].n);
 assert.equal(await ownerPeople(),0);await db.withTransaction(tx=>require('../../src/modules/artists/context').verifiedAdultActor(tx,{id:author.account_id}));
 await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=? AND kind='ORGANIZATION'",[partyId]);
 const expiry=new Date(Date.now()+86400000).toISOString();
 const invitation=await parties.inviteMember(owner.ctx,{party_id:partyId,invitee_account_id:author.account_id,expires_at:expiry,operation_key:key()});
 await parties.respondInvitation(author.ctx,{party_id:partyId,invitation_id:invitation.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
 let grant=await parties.offerRepresentation(owner.ctx,{party_id:partyId,account_id:author.account_id,scope:'TRADE',expires_at:expiry,operation_key:key()});
 grant=await parties.actRepresentation(author.ctx,{party_id:partyId,representation_id:grant.id,action:'ACCEPT',expected_version:grant.object_version,operation_key:key()});assert.equal(grant.effective,true);
 let spec;try{
  spec=await trade.createSpec(author.ctx,{...input,party_id:partyId,provider_party_id:partyId,operation_key:key()});assert.equal(spec.created_by,author.account_id);
  spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'Synthetic independently reviewed company specification by a verified representative',operation_key:key()});
 }finally{
  const revoked=await parties.actRepresentation(owner.ctx,{party_id:partyId,representation_id:grant.id,action:'REVOKE',expected_version:grant.object_version,operation_key:key()});assert.equal(revoked.effective,false);
 }
 assert.equal(await ownerPeople(),0);assert.equal(spec.merchant_party_id,partyId);assert.equal(spec.current_status,'PUBLISHED');return spec;
}
module.exports={seedCompanySpecForIdentityNegative};
