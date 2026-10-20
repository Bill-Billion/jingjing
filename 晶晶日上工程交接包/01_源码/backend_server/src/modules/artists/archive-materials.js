'use strict';
const {error}=require('../party/policy');
const C=require('./context'),P=require('./policy');

// An unrelated valid consent must never revive a withdrawn material version.
async function consentFor(tx,p,key,{avatar_id,feature,purpose,grantee},at){
 const r=await C.load(tx,key,'CONSENT');
 if(r.person_id!==p.id||r.avatar_id!==avatar_id||r.current_status!=='APPROVED'
   ||!P.active(r.data,at)||!r.data.features.includes(feature)
   ||!r.data.purposes.includes(purpose)||r.data.grantee_party_id!==grantee)
  throw error('ARTIST_CONSENT_REQUIRED',409);
 return r;
}

async function archiveVersions(tx,p,avatarId){
 await C.avatar(tx,avatarId,p);
 const at=await C.now(tx),versions=[];
 for(const [kind,feature] of [['LOOK','FACE'],['VOICE','VOICE']]){
  // Keep historical versions intact, but never silently fall back to an older
  // version when the latest submitted one is no longer usable.
  const raw=await C.one(tx,`SELECT * FROM artist_records
   WHERE person_id=? AND avatar_id=? AND kind=?
   ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.revision')) AS UNSIGNED) DESC
   LIMIT 1 FOR SHARE`,[p.id,avatarId,kind]);
  if(!raw)continue;
  const v=C.checked(raw);
  if(v.current_status!=='RECORDED')throw error('ARTIST_VARIANT_NOT_USABLE',409);
  await consentFor(tx,p,v.data.consent_id,{avatar_id:avatarId,feature,
   purpose:'PRIVATE_ARCHIVE',grantee:p.owner_party_id},at);
  await C.assets(tx,v.data.material_asset_ids,p.owner_party_id,['AVATAR_MATERIAL']);
  versions.push(v);
 }
 if(!versions.some(v=>v.kind==='LOOK'))throw error('ARCHIVE_VERSION_REQUIRED',409);
 return versions;
}
module.exports={consentFor,archiveVersions};
