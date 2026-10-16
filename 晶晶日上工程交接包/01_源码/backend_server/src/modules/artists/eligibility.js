"use strict";
const {error}=require('../party/policy');
const C=require('./context'),P=require('./policy');
async function checkAvatarUse(tx,{avatar_id,purpose,grantee_party_id,features=['FACE','VOICE'],territory,requireLink=false}){
 const link=await C.one(tx,'SELECT person_id FROM artist_avatar_links WHERE avatar_id=? FOR SHARE',[avatar_id]);if(!link){if(requireLink)throw error('ARTIST_VERIFIED_LINK_REQUIRED',409);return;}const p=await C.person(tx,link.person_id),at=await C.now(tx);P.adult(p,at);await C.activeParty(tx,p.owner_party_id);await C.activeParty(tx,grantee_party_id);await C.avatar(tx,avatar_id,p);
 const [rows]=await tx.execute("SELECT * FROM artist_records WHERE person_id=? AND avatar_id=? AND kind='CONSENT' AND current_status='APPROVED' FOR SHARE",[p.id,avatar_id]);const consents=rows.map(C.checked);
 for(const feature of features){if(!consents.some(c=>c.data.features.includes(feature)&&c.data.purposes.includes(purpose)&&c.data.grantee_party_id===grantee_party_id&&P.active(c.data,at)&&(!territory||c.data.territories.includes(territory))))throw error('ARTIST_CONSENT_REQUIRED',409);}
 if(['NEW_GENERATION','LONG_LIVED_MODEL'].includes(purpose))await require('./services').hosting(tx,p,avatar_id,at);
}
module.exports={checkAvatarUse};
