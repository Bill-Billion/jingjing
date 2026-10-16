"use strict";
const {randomUUID}=require('node:crypto');
const {id,ref,shape,error}=require('../party/policy');
const {digest}=require('../governance/content');
const C=require('./context'),P=require('./policy');
function createArtistAssetsRepository(db,{resolvePrincipal=async()=>null}={}){
 const actor=C.createActor(resolvePrincipal);
 async function access(tx,ctx,key,partyId){const a=await actor(tx,ctx),r=await C.one(tx,'SELECT s.*,l.person_id,l.acting_party_id FROM supply_assets s JOIN artist_asset_links l ON l.asset_id=s.id WHERE s.id=? FOR SHARE',[id(key)]);if(!r)throw error('ARTIST_ASSET_NOT_FOUND',404);const p=await C.person(tx,r.person_id);await C.authorize(tx,a,p,id(partyId),'MANAGE_MATERIALS');if(p.owner_party_id!==partyId&&r.purpose!=='AVATAR_MATERIAL')throw error('ARTIST_PERSONAL_CONFIRMATION_REQUIRED',403);return {a,p,r};}
 return Object.freeze({
 async reserveAsset(ctx,i){shape(i,['person_id','party_id','purpose','media_type','body','operation_key']);if(!Buffer.isBuffer(i.body)||i.body.length<1||i.body.length>8*1024*1024)throw error('INVALID_ASSET_SIZE',400);if(!['AVATAR_MATERIAL','CONSENT_EVIDENCE','REVIEW_EVIDENCE'].includes(i.purpose)||!['image/jpeg','image/png','video/mp4','audio/mpeg','audio/wav','application/pdf','text/plain'].includes(i.media_type))throw error('INVALID_ASSET_TYPE',400);const hash=C.sha(i.body);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),p=await C.person(tx,i.person_id,'FOR UPDATE');await C.authorize(tx,a,p,id(i.party_id),'MANAGE_MATERIALS');P.adult(p,await C.now(tx));if(i.purpose!=='AVATAR_MATERIAL')await C.self(tx,a,p,i.party_id);
  const operation=digest(['ARTIST_ASSET',a.id,p.id,i.party_id,ref(i.operation_key)]),old=await C.one(tx,'SELECT * FROM supply_assets WHERE operation_hash=? FOR UPDATE',[operation]);
  if(old){if(old.content_sha256!==hash||old.purpose!==i.purpose||old.media_type!==i.media_type||old.byte_size!==i.body.length)throw error('IDEMPOTENCY_CONFLICT',409);if(old.current_status!=='READY')throw error('ASSET_UPLOAD_RECONCILIATION_REQUIRED',409);return {asset:old,replay:true};}
  const key=randomUUID();await tx.execute("INSERT INTO supply_assets(id,owner_party_id,created_by,operation_hash,object_key,purpose,media_type,byte_size,content_sha256,current_status) VALUES (?,?,?,?,?,?,?,?,?,'UPLOADING')",[key,p.owner_party_id,a.id,operation,'private/'+p.owner_party_id+'/'+key,i.purpose,i.media_type,i.body.length,hash]);await tx.execute('INSERT INTO artist_asset_links(asset_id,person_id,acting_party_id) VALUES (?,?,?)',[key,p.id,i.party_id]);return {asset:await C.one(tx,'SELECT * FROM supply_assets WHERE id=?',[key]),replay:false};
 });},
 async finishAsset(ctx,key,success){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),hint=await C.one(tx,'SELECT person_id,acting_party_id FROM artist_asset_links WHERE asset_id=?',[id(key)]);if(!hint)throw error('ARTIST_ASSET_NOT_FOUND',404);const p=await C.person(tx,hint.person_id,'FOR UPDATE'),r=await C.one(tx,'SELECT * FROM supply_assets WHERE id=? FOR UPDATE',[key]);if(r.created_by!==a.id)throw error('ARTIST_ASSET_NOT_FOUND',404);if(r.current_status!=='UPLOADING')return r;
  if(success){await C.authorize(tx,a,p,hint.acting_party_id,'MANAGE_MATERIALS');P.adult(p,await C.now(tx));}const status=success?'READY':'FAILED';await tx.execute('UPDATE supply_assets SET current_status=? WHERE id=?',[status,key]);await C.audit(tx,a,p,key,'ASSET_'+status,1,{sha256:r.content_sha256});return {...r,current_status:status};
 });},
 async assetAccess(ctx,key,partyId){return db.withTransaction(async tx=>{const {r}=await access(tx,ctx,key,partyId);if(r.current_status!=='READY')throw error('PRIVATE_MATERIAL_NOT_READY',409);return r;});},
 });
}
module.exports={createArtistAssetsRepository};
