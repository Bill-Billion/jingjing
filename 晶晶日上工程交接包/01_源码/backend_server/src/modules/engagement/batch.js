'use strict';
const {randomUUID}=require('node:crypto');
const {shape,id,ref,version,error}=require('../party/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context');
const actions=['ARTIST_LISTING','STOCK_LISTING','PRICE_REVISION','MCN_ASSIGNMENT','PRODUCTION_ASSIGNMENT'];
function payload(items){
 if(!Array.isArray(items)||!items.length||items.length>20)throw error('INVALID_BATCH',400);
 const keys=new Set();for(const x of items){shape(x,['key','action','input']);ref(x.key);if(x.key.length>64||keys.has(x.key)||!actions.includes(x.action))throw error('INVALID_BATCH',400);keys.add(x.key);if(!x.input||typeof x.input!=='object'||Array.isArray(x.input)||Object.hasOwn(x.input,'party_id')||Object.hasOwn(x.input,'operation_key'))throw error('INVALID_BATCH',400);}
 // Keep the ordinary business fingerprint bound; never accept arbitrary methods or URLs.
 try{digest(items);}catch{throw error('INVALID_BATCH',400);}return JSON.parse(JSON.stringify(items));
}
function createOrganizationBatch(db,{resolvePrincipal}){
 const actor=A.createActor(resolvePrincipal),options={resolvePrincipal};
 const artists=require('../artists/repository').createArtistRepository(db,options),stock=require('../stock/repository').createStockRepository(db,options),trade=require('../trade/repository').createTradeRepository(db,options),engagement=require('./repository').createEngagementRepository(db,options),production=require('../production/repository').createProductionRepository(db,options);
 async function org(tx,ctx,party){const a=await actor(tx,ctx),p=await A.activeParty(tx,id(party));if(!await A.one(tx,"SELECT id FROM party_memberships WHERE party_id=? AND account_id=? AND current_status='ACTIVE' FOR SHARE",[party,a.id]))throw error('MEMBERSHIP_REQUIRED',403);if(p.kind!=='ORGANIZATION')throw error('ORGANIZATION_REQUIRED',403);return a;}
 async function priceSource(tx,ctx,party,i,checkVersion=true){shape(i,['record_id','expected_version','unit_minor']);version(i.expected_version);require('../trade/policy').amount(i.unit_minor);const a=await org(tx,ctx,party);await A.owner(tx,a,party);const r=await require('../stock/context').listing(tx,id(i.record_id));if(r.seller_party_id!==party)throw error('STOCK_NOT_FOUND',404);if(checkVersion)A.match(r,i.expected_version);await require('../stock/context').validateRights(tx,r,a);return r;}
 async function authorizeItem(ctx,party,item){
  await db.withTransaction(tx=>org(tx,ctx,party));
  const i=item.input;
  if(item.action==='ARTIST_LISTING')return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.authorize(tx,a,await A.person(tx,id(i.person_id)),party,'SUBMIT_LISTING');});
  if(item.action==='STOCK_LISTING')return db.withTransaction(async tx=>{const a=await actor(tx,ctx);if(!Array.isArray(i.participants))throw error('INVALID_INPUT',400);const ids=[i.seller_person_id,...i.participants.map(p=>p?.person_id)];for(const person of [...new Set(ids)].sort())await A.authorize(tx,a,await A.person(tx,id(person)),party,'SUBMIT_LISTING');});
  if(item.action==='PRICE_REVISION')return db.withTransaction(tx=>priceSource(tx,ctx,party,i,false));
  // Read existing target through the same domain permission checks on every replay.
  if(item.action==='PRODUCTION_ASSIGNMENT')return production.read(ctx,{record_id:id(i.record_id),party_id:party});
  return db.withTransaction(async tx=>{
   const a=await org(tx,ctx,party),mcn=require('./mcn');
   const {person_ids,action}=await mcn.assignmentTarget(tx,party,i);
   for(const person of person_ids)await mcn.delegated(tx,a,party,person,action);
  });
 }
 async function execute(ctx,batch,item){
  const i={...item.input,party_id:batch.party_id,operation_key:'batch:'+digest([batch.id,item.key])};
  if(item.action==='ARTIST_LISTING')return artists.submitListing(ctx,i);
  if(item.action==='STOCK_LISTING')return stock.create(ctx,i);
  if(item.action==='MCN_ASSIGNMENT')return engagement.assign(ctx,i);
  if(item.action==='PRODUCTION_ASSIGNMENT')return production.assign(ctx,i);
  const r=await db.withTransaction(tx=>priceSource(tx,ctx,batch.party_id,item.input)),s=r.data.spec;
  return trade.createSpec(ctx,{party_id:batch.party_id,previous_spec_id:r.data.spec_id,title:s.title,provider_party_id:s.provider_party_id,line_kind:s.line_kind,unit_minor:item.input.unit_minor,currency:s.currency,specification:s.specification,product_profile:s.product_profile,operation_key:i.operation_key});
 }
 function checkedResult(r){const d=A.parse(r.result_json);if(digest(d)!==r.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
 function itemsOf(r){const d=A.parse(r.payload_json);if(digest(d)!==r.payload_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
 async function load(ctx,party,batchId){return db.withTransaction(async tx=>{const a=await org(tx,ctx,party),b=await A.one(tx,'SELECT * FROM organization_batches WHERE id=? AND account_id=? AND party_id=?',[id(batchId),a.id,party]);if(!b)throw error('BATCH_NOT_FOUND',404);itemsOf(b);return b;});}
 async function persist(b,item,result){
  return db.withTransaction(async tx=>{
   await A.one(tx,'SELECT id FROM organization_batches WHERE id=? FOR UPDATE',[b.id]);
   const old=await A.one(tx,'SELECT * FROM organization_batch_items WHERE batch_id=? AND item_key=?',[b.id,item.key]);
   if(old&&checkedResult(old).status==='SUCCEEDED')return checkedResult(old);
   await tx.execute('INSERT INTO organization_batch_items(batch_id,item_key,result_json,result_sha256) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE result_json=VALUES(result_json),result_sha256=VALUES(result_sha256),updated_at=CURRENT_TIMESTAMP(3)',[b.id,item.key,JSON.stringify(result),digest(result)]);
   return result;
  });
 }
 function failure(item,e,status){return {key:item.key,action:item.action,status:status||(e.status&&e.status<500?'REJECTED':'RETRY_REQUIRED'),result_id:null,result_status:null,error_code:e.status&&e.status<500&&/^[A-Z][A-Z0-9_]+$/.test(e.code)?e.code:'BATCH_ITEM_RETRY_REQUIRED'};}
 async function output(ctx,b,run){
  const items=[];
  for(const item of itemsOf(b)){
   try{await authorizeItem(ctx,b.party_id,item);}catch(e){items.push(failure(item,e,'UNAVAILABLE'));continue;}
   let result;
   try{
    const old=await A.one(db,'SELECT * FROM organization_batch_items WHERE batch_id=? AND item_key=?',[b.id,item.key]);
    if(old)result=checkedResult(old);
    if(run&&result?.status!=='SUCCEEDED'){
     try{const r=await execute(ctx,b,item);result={key:item.key,action:item.action,status:'SUCCEEDED',result_id:r.id,result_status:r.current_status,error_code:null};}
     catch(e){result=failure(item,e);}
     // Domain commit precedes this receipt. Replaying uses the same business key.
     result=await persist(b,item,result);
    }
    result??={key:item.key,action:item.action,status:'NOT_RUN',result_id:null,result_status:null,error_code:null};
    await authorizeItem(ctx,b.party_id,item);
   }catch(e){result=failure(item,e,e.status===403||e.status===404?'UNAVAILABLE':undefined);}
   items.push(result);
  }
  return {id:b.id,party_id:b.party_id,items,current_status:items.every(x=>x.status==='SUCCEEDED')?'COMPLETED':'PARTIAL',meaning:'SUBMITTED_NOT_APPROVED',retry_uses_original_request:true};
 }

 return {
  async submit(ctx,i){shape(i,['party_id','items','operation_key']);const items=payload(i.items),key=ref(i.operation_key),b=await db.withTransaction(async tx=>{const a=await org(tx,ctx,i.party_id),hash=digest(items),requestKey=digest([a.id,i.party_id,key]);await tx.execute('INSERT INTO organization_batches(id,request_key,account_id,party_id,payload_json,payload_sha256) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE request_key=request_key',[randomUUID(),requestKey,a.id,i.party_id,JSON.stringify(items),hash]);const b=await A.one(tx,'SELECT * FROM organization_batches WHERE request_key=? FOR SHARE',[requestKey]);if(b.payload_sha256!==hash)throw error('IDEMPOTENCY_CONFLICT',409);itemsOf(b);return b;});return output(ctx,b,true);},
  async lookup(ctx,i){shape(i,['party_id','operation_key']);const operation=ref(i.operation_key);const b=await db.withTransaction(async tx=>{const a=await org(tx,ctx,i.party_id);const row=await A.one(tx,'SELECT * FROM organization_batches WHERE request_key=? AND account_id=? AND party_id=?',[digest([a.id,i.party_id,operation]),a.id,i.party_id]);if(!row)throw error('BATCH_NOT_FOUND',404);itemsOf(row);return row;});return output(ctx,b,false);},
  async read(ctx,i){shape(i,['party_id','batch_id']);return output(ctx,await load(ctx,i.party_id,i.batch_id),false);},
 };
}
module.exports={createOrganizationBatch,payload,actions};
