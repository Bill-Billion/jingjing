"use strict";
const C=require('./context'),P=require('./policy');
const {error}=require('../party/policy');
const {consentFor}=require('./archive-materials');
async function records(tx,p,kind){const [rows]=await tx.execute('SELECT * FROM artist_records WHERE person_id=? AND kind=? ORDER BY created_at,id FOR SHARE',[p.id,kind]);return rows.map(C.checked);}
 async function liveHalos(tx,p,at){const all=await records(tx,p,'HALO'),out=[];for(const h of all){if(h.current_status!=='APPROVED'||h.data.valid_until<=at)continue;if(h.data.service_id){try{await require('./services').fullyPaid(tx,await C.load(tx,h.data.service_id,'SERVICE'));}catch(e){if(e.code==='ARTIST_SERVICE_PAYMENT_REQUIRED')continue;throw e;}}out.push(h);}if(!out.some(h=>h.data.level===1))return [];return out;}
 async function verified(tx,p){P.adult(p,await C.now(tx));await C.activeParty(tx,p.owner_party_id);}
 async function listingUsable(tx,p,r,at){if(r.id)await require('../privacy/restrictions').assertUnrestricted(tx,'ARTIST_LISTING',r.id);await verified(tx,p);await require('./services').hosting(tx,p,r.avatar_id,at);if(P.haloLevel(await liveHalos(tx,p,at),at)<1)throw error('HALO_REQUIRED',409);await C.avatar(tx,r.avatar_id,p);await C.assets(tx,r.data.preview_asset_ids,p.owner_party_id,['AVATAR_MATERIAL']);await require('./public-media').validatePortrait(tx,r);
  await consentFor(tx,p,r.data.consent_id,{avatar_id:r.avatar_id,feature:'FACE',purpose:'PUBLIC_DISPLAY',grantee:p.owner_party_id},at);
  for(const [kind,key] of [['LOOK',r.data.look_version_id],['VOICE',r.data.voice_version_id]]){if(!key)continue;const v=await C.load(tx,key,kind);if(v.person_id!==p.id||v.avatar_id!==r.avatar_id||v.current_status!=='RECORDED')throw error('ARTIST_VARIANT_NOT_USABLE',409);await consentFor(tx,p,v.data.consent_id,{avatar_id:r.avatar_id,feature:kind==='LOOK'?'FACE':'VOICE',purpose:'PRIVATE_ARCHIVE',grantee:p.owner_party_id},at);if(kind==='VOICE')await consentFor(tx,p,r.data.consent_id,{avatar_id:r.avatar_id,feature:'VOICE',purpose:'PUBLIC_DISPLAY',grantee:p.owner_party_id},at);}
 }

async function loadPublicListing(tx,key){
 const hint=await C.load(tx,key,'LISTING',''),p=await C.person(tx,hint.person_id),r=await C.load(tx,key,'LISTING');
 if(r.current_status!=='APPROVED')throw error('ARTIST_NOT_FOUND',404);
 await listingUsable(tx,p,r,await C.now(tx));return {p,r};
}
async function publicDTO(tx,p,r){return {listing_id:r.id,person_id:p.id,avatar_id:r.avatar_id,display_name:r.data.display_name,city:r.data.city,introduction:r.data.introduction,tags:r.data.tags,audition_public:r.data.audition_public,preview_asset_ids:r.data.preview_asset_ids,halo_level:P.haloLevel(await liveHalos(tx,p,await C.now(tx)),await C.now(tx))};}
module.exports={liveHalos,verified,listingUsable,loadPublicListing,publicDTO};
