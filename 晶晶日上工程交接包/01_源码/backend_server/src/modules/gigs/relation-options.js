'use strict';
const {shape,id,error}=require('../party/policy');
const C=require('../artists/context'),P=require('../artists/public-access');
function page(i){if(i.after)id(i.after);const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);return limit;}
async function source(tx,listingId,artistParty){const {p,r}=await P.loadPublicListing(tx,id(listingId));if(p.owner_party_id!==artistParty)throw error('GIG_RELATION_SOURCE_MISMATCH',409);return {p,r};}
function methods({db,actor,owner}){return {
 async relationOptions(ctx,i){shape(i,['party_id','after','limit']);const limit=page(i);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx);await owner(tx,a,i.party_id);if(!await C.one(tx,"SELECT party_id FROM party_capabilities WHERE party_id=? AND code='MCN' AND current_status='ACTIVE' FOR SHARE",[i.party_id]))throw error('MCN_CAPABILITY_REQUIRED',409);
  const [rows]=await tx.execute("SELECT id FROM artist_records WHERE kind='LISTING' AND current_status='APPROVED' AND id>? ORDER BY id LIMIT ?",[i.after||'',limit+1]);const items=[];
  for(const row of rows.slice(0,limit)){try{const {p,r}=await P.loadPublicListing(tx,row.id);if(p.owner_party_id===i.party_id)continue;items.push({listing_id:r.id,person_id:p.id,avatar_id:r.avatar_id,artist_party_id:p.owner_party_id,display_name:r.data.display_name,city:r.data.city});}catch(e){if(![403,404,409].includes(e.status))throw e;}}
  return {party_id:i.party_id,items,next_cursor:rows.length>limit?rows[limit-1].id:null};
 });}
};}
module.exports={methods,source,page};
