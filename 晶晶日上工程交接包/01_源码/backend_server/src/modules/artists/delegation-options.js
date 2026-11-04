'use strict';
const {shape,error}=require('../party/policy'),C=require('./context');
function methods({db,actor}){return {async delegationOptions(ctx,i){shape(i,['person_id','party_id','kind','after','limit']);const limit=require('../gigs/relation-options').page(i);if(!['RELATION','EVIDENCE'].includes(i.kind))throw error('INVALID_LIST',400);return db.withTransaction(async tx=>{
 const a=await actor(tx,ctx),p=await C.person(tx,i.person_id);await C.self(tx,a,p,i.party_id);await require('./public-access').verified(tx,p);const at=await C.now(tx);let rows;const items=[];
 if(i.kind==='RELATION'){
  [rows]=await tx.execute("SELECT * FROM gig_records WHERE kind='RELATION' AND counterparty_id=? AND current_status='ACTIVE' AND id>? ORDER BY id LIMIT ?",[p.owner_party_id,i.after||'',limit+1]);
  for(const raw of rows.slice(0,limit)){const r=require('../gigs/context').dto(raw);try{await C.relation(tx,{counterparty_id:r.owner_party_id,data:{relation_id:r.id}},p,at);const org=await C.activeParty(tx,r.owner_party_id);items.push({id:r.id,organization_party_id:org.id,display_name:org.display_name,valid_from:r.data.valid_from,valid_until:r.data.valid_until});}catch(e){if(![403,404,409].includes(e.status))throw e;}}
 }else{
  [rows]=await tx.execute("SELECT * FROM supply_assets WHERE owner_party_id=? AND purpose='CONSENT_EVIDENCE' AND current_status='READY' AND id>? ORDER BY id LIMIT ?",[p.owner_party_id,i.after||'',limit+1]);
  for(const r of rows.slice(0,limit)){try{await C.assets(tx,[r.id],p.owner_party_id,['CONSENT_EVIDENCE']);items.push({id:r.id,purpose:r.purpose,media_type:r.media_type,byte_size:Number(r.byte_size),content_sha256:r.content_sha256});}catch(e){if(![403,404,409].includes(e.status))throw e;}}
 }
 return {person_id:p.id,kind:i.kind,items,next_cursor:rows.length>limit?rows[limit-1].id:null};
});}};}
module.exports={methods};
