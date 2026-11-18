'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
// Explicit positive-fixture prerequisite, never a registration default or runtime hook.
// Existing rejected/expired/minor identities are returned unchanged: negative cases
// must still fail the actual business gate rather than being silently repaired here.
async function seedAdultIdentity(db,resolvePrincipal,user){
 const [[schema]]=await db.execute('SELECT DATABASE() name');assert.match(schema.name,/^jx_test_[a-z0-9_]+$/);
 const [[existing]]=await db.execute('SELECT * FROM artist_people WHERE owner_party_id=?',[user.personal_party_id]);if(existing)return existing;
 const repo=require('../../src/modules/artists/repository').createArtistRepository(db,{resolvePrincipal});
 const p=await repo.createPerson(user.ctx,{party_id:user.personal_party_id,display_name:'Synthetic verified transaction actor',operation_key:randomUUID()});
 const r=await repo.prepareIdentity(user.ctx,{person_id:p.id,party_id:user.personal_party_id,session_ref:'synthetic:'+randomUUID(),operation_key:randomUUID()});
 await repo.applyIdentity(r.id,{request_key:r.data.request_key,person_id:p.id,status:'VERIFIED',issuer:'synthetic-fixture',subject_fingerprint:createHash('sha256').update('free-identity:'+user.account_id).digest('hex'),age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:identity',liveness_verified:true,phone_verified:true});
 return (await db.execute('SELECT * FROM artist_people WHERE id=?',[p.id]))[0][0];
}
module.exports={seedAdultIdentity};
