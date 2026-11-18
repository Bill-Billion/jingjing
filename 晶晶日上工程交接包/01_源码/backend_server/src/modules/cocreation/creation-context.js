"use strict";
const A=require('../artists/context'),C=require('./context'),{id,shape,error}=require('../party/policy');
// Same checks for discovery and the final command; public profiles are not authority.
async function story(tx,a,party,requestId){
 await C.owner(tx,a,id(party));
 const r=await A.one(tx,'SELECT * FROM customization_requests WHERE id=? FOR UPDATE',[id(requestId)]);
 if(!r||r.party_id!==party||r.created_by!==a.id)throw error('CUSTOMIZATION_NOT_FOUND',404);
 if(!['SUBMITTED','INTAKE'].includes(r.current_status)||!r.submission_number)throw error('COCREATION_SUBMITTED_STORY_REQUIRED',409);
 return r;
}
async function available(tx,r){
 await require('../customization/trade-context').assertUnordered(tx,r.id);
 if(await A.one(tx,'SELECT room_id FROM cocreation_rooms WHERE request_id=? FOR SHARE',[r.id]))throw error('COCREATION_ROOM_EXISTS',409);
 if(await A.one(tx,'SELECT quote_id FROM customization_quotes WHERE request_id=? FOR SHARE',[r.id]))throw error('COCREATION_BEFORE_QUOTE_REQUIRED',409);
 if(await A.one(tx,"SELECT id FROM customization_supplements WHERE request_id=? AND current_status='OPEN' FOR SHARE",[r.id]))throw error('COCREATION_STORY_SUPPLEMENT_PENDING',409);
 if(await A.one(tx,'SELECT request_id FROM manual_sample_requests WHERE request_id=? FOR SHARE',[r.id]))throw error('MANUAL_SAMPLE_COCREATION_NOT_ALLOWED',409);
}
async function producer(tx,key,configured){
 if(!configured)throw error('CUSTOMIZATION_MERCHANT_NOT_CONFIGURED',409);
 if(id(key)!==configured)throw error('CUSTOMIZATION_MERCHANT_FORBIDDEN',403);
 const p=await A.activeParty(tx,key);
 if(p.kind!=='ORGANIZATION')throw error('CUSTOMIZATION_MERCHANT_FORBIDDEN',403);
 return {id:p.id,display_name:p.display_name,role:'PLATFORM_CONTRACTING_PARTY'};
}
function methods({db,actor,customizationMerchantPartyId}){return {
 async creationOptions(ctx,i){
  shape(i,['party_id','request_id','kind','after','limit','cursor']);
  const limit=i.limit??20;if(!['RULE','PRODUCER'].includes(i.kind)||!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIST',400);if(i.after)id(i.after);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx),r=await story(tx,a,i.party_id,i.request_id);await available(tx,r);
   if(i.kind==='PRODUCER'){
    if(!customizationMerchantPartyId)return {items:[],next_cursor:null,unavailable_reason:'CUSTOMIZATION_MERCHANT_NOT_CONFIGURED'};
    const p=await producer(tx,customizationMerchantPartyId,customizationMerchantPartyId);
    return {items:p.id!==i.party_id&&p.id>(i.after||'')?[p]:[],next_cursor:null,unavailable_reason:null};
   }
   const rows=(await tx.execute("SELECT * FROM cocreation_records WHERE kind='RULE' AND current_status='EFFECTIVE' AND id>? ORDER BY id LIMIT ?",[i.after||'',limit+1]))[0];
   return {items:rows.slice(0,limit).map(C.checked).map(r=>({id:r.id,content_sha256:r.content_sha256,rule:r.data.rule})),next_cursor:rows.length>limit?rows[limit-1].id:null,unavailable_reason:null};
  });
 }
};}
module.exports={story,available,producer,methods};
