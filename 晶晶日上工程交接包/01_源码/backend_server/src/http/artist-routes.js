"use strict";
const express=require('express');
const {id,ref,shape,version,error}=require('../modules/party/policy');
const {createArtistRepository}=require('../modules/artists/repository');
const {createArtistAssetsRepository}=require('../modules/artists/assets');
const {createArtistIdentityProvider}=require('../modules/artists/identity-provider');
const {createSupplyAssets}=require('../modules/works/assets');
function createArtistRouter({db,resolvePrincipal,env={},storageFactory,identityProviderFactory}){
 const router=express.Router(),repo=createArtistRepository(db,{resolvePrincipal}),assets=createSupplyAssets({db,repository:createArtistAssetsRepository(db,{resolvePrincipal}),env,storageFactory}),identity=identityProviderFactory?identityProviderFactory():createArtistIdentityProvider(db,env);
 const services=require('../modules/artists/services').createArtistServices(db,{resolvePrincipal,merchantPartyId:env.ARTIST_PLATFORM_MERCHANT_PARTY_ID||null});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const value=req.get('X-Acting-Party');if(!value&&required)throw error('ACTING_PARTY_REQUIRED',400);req.actingParty=value?id(value):null;return req.actingParty;};
 const operator=req=>{if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);req.actingParty=null;};
 const key=req=>ref(req.get('Idempotency-Key'));
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const person=req=>id(req.params.person_id);
 const body=(req,fields)=>{shape(req.body,fields);shape(req.query,[]);return req.body;};
 const reply=(req,res,data)=>{if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});};
 function page(req,more=[]){shape(req.query,['cursor','limit',...more]);if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);return {after:req.query.cursor===undefined?'':id(req.query.cursor),limit:req.query.limit===undefined?20:Number(req.query.limit)};}

 router.get('/reviews',wrap(async(req,res)=>{const p=page(req,['kind']);operator(req);reply(req,res,await repo.inbox(req,{...p,kind:req.query.kind}));}));
 router.get('/people/:person_id/records',wrap(async(req,res)=>{const p=page(req,['kind']);reply(req,res,await repo.listRecords(req,{...p,kind:req.query.kind,person_id:person(req),party_id:acting(req)}));}));
 router.post('/people/:person_id/records/:record_id/supplements',wrap(async(req,res)=>reply(req,res,await repo.supplement(req,{...body(req,['evidence_asset_ids','note']),person_id:person(req),party_id:acting(req),record_id:id(req.params.record_id),expected_version:expected(req),operation_key:key(req)}))));
 router.post('/people/:person_id/records/:record_id/appeals',wrap(async(req,res)=>reply(req,res,await repo.appeal(req,{...body(req,['evidence_asset_ids','reason']),person_id:person(req),party_id:acting(req),record_id:id(req.params.record_id),operation_key:key(req)}))));
 const reviewedAssets=createSupplyAssets({db,repository:{assetAccess:async(req,asset_id)=>repo.reviewAsset(req,{person_id:person(req),record_id:id(req.params.record_id),asset_id})},env,storageFactory});
 const publicAssets=createSupplyAssets({db,repository:{assetAccess:async(req,asset_id)=>repo.publicAsset(req,{listing_id:id(req.params.listing_id),asset_id})},env,storageFactory});
 for(const [path,store] of [['/people/:person_id/records/:record_id/assets/:asset_id/content',reviewedAssets],['/catalog/:listing_id/assets/:asset_id/content',publicAssets]])router.get(path,wrap(async(req,res)=>{shape(req.query,[]);operator(req);const file=await store.download(req,id(req.params.asset_id),null);res.set({'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+file.metadata.id+'"','X-Content-Type-Options':'nosniff'}).end(file.body);}));
 router.get('/catalog/:listing_id',wrap(async(req,res)=>{shape(req.query,[]);operator(req);reply(req,res,await repo.publicDetail(req,{listing_id:id(req.params.listing_id)}));}));
 router.get('/services',wrap(async(req,res)=>{shape(req.query,[]);operator(req);reply(req,res,{identity:await identity.readiness(),long_lived_model:{current_status:'NOT_ENABLED',reason_code:'PROVIDER_NOT_IMPLEMENTED'},offers:await services.offers(req)});}));
 router.post('/people/:person_id/services',wrap(async(req,res)=>reply(req,res,await services.request(req,{...body(req,['avatar_id','spec_id','renewal_reminder']),person_id:person(req),party_id:acting(req),operation_key:key(req)}))));
 router.get('/people/:person_id/services/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await services.get(req,{person_id:person(req),party_id:acting(req),record_id:id(req.params.record_id)}));}));
 for(const [path,method,fields,match] of [['sync','sync',[],false],['cancel','cancel',['reason'],true],['reminder','reminder',['enabled'],true]])router.post('/people/:person_id/services/:record_id/'+path,wrap(async(req,res)=>reply(req,res,await services[method](req,{...body(req,fields),person_id:person(req),party_id:acting(req),record_id:id(req.params.record_id),...(match?{expected_version:expected(req)}:{}),operation_key:key(req)}))));
 router.post('/people/:person_id/services/:record_id/results',wrap(async(req,res)=>{const input=body(req,['outcome','archive_asset_id','reason']);operator(req);reply(req,res,await services.result(req,{...input,person_id:person(req),record_id:id(req.params.record_id),expected_version:expected(req),operation_key:key(req)}));}));
 router.get('/catalog',wrap(async(req,res)=>{const p=page(req,['city','tag','audition']);operator(req);if(req.query.audition!==undefined&&!['true','false'].includes(req.query.audition))throw error('INVALID_FILTER',400);reply(req,res,await repo.catalog(req,{...p,...(req.query.city?{city:req.query.city}:{}),...(req.query.tag?{tag:req.query.tag}:{}),...(req.query.audition===undefined?{}:{audition:req.query.audition==='true'})}));}));
 router.post('/people',wrap(async(req,res)=>reply(req,res,await repo.createPerson(req,{...body(req,['display_name']),party_id:acting(req),operation_key:key(req)}))));
 router.get('/people',wrap(async(req,res)=>reply(req,res,await repo.list(req,{...page(req),party_id:acting(req)}))));
 router.get('/people/:person_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.get(req,{person_id:person(req),party_id:acting(req)}));}));
 router.get('/people/:person_id/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.getRecord(req,{person_id:person(req),record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 for(const [path,method,fields] of [['avatars','createAvatar',['display_name']],['consents','declareConsent',['avatar_id','consent']],['delegations','createDelegation',['delegation']],['variants','createVariant',['avatar_id','kind','variant']],['halos','requestHalo',['level','ownership_promise','evidence_asset_ids','service_id']],['listings','submitListing',['avatar_id','listing']]]){
  router.post('/people/:person_id/'+path,wrap(async(req,res)=>reply(req,res,await repo[method](req,{...body(req,fields),person_id:person(req),party_id:acting(req),operation_key:key(req)}))));
 }
 router.post('/people/:person_id/records/:record_id/reviews',wrap(async(req,res)=>{const input=body(req,['decision','reason']);operator(req);reply(req,res,await repo.review(req,{...input,person_id:person(req),record_id:id(req.params.record_id),expected_version:expected(req),operation_key:key(req)}));}));
 router.post('/people/:person_id/records/:record_id/withdrawals',wrap(async(req,res)=>reply(req,res,await repo.withdraw(req,{...body(req,['reason']),person_id:person(req),party_id:acting(req),record_id:id(req.params.record_id),expected_version:expected(req),operation_key:key(req)}))));
 router.post('/people/:person_id/identity',wrap(async(req,res)=>{const i={...body(req,['session_ref']),person_id:person(req),party_id:acting(req),operation_key:key(req)};
  // Readiness is checked before reserving work. Replaying uses the same provider key.
  await repo.get(req,{person_id:i.person_id,party_id:i.party_id});await identity.assertReady();const r=await repo.prepareIdentity(req,i);if(!['PENDING','UNKNOWN'].includes(r.current_status))return reply(req,res,r);
  try{const result=await identity.verify(r.data);reply(req,res,await repo.applyIdentity(r.id,result));}catch(e){await repo.applyIdentity(r.id,null);throw e;}
 }));
 router.post('/people/:person_id/assets',express.raw({type:'application/octet-stream',limit:'8mb'}),wrap(async(req,res)=>{shape(req.query,['purpose','media_type']);reply(req,res,await assets.upload(req,{person_id:person(req),party_id:acting(req),purpose:req.query.purpose,media_type:req.query.media_type,body:req.body,operation_key:key(req)}));}));
 router.get('/assets/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await assets.read(req,id(req.params.asset_id),acting(req)));}));
 router.get('/assets/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const file=await assets.download(req,id(req.params.asset_id),acting(req));res.set({'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+file.metadata.id+'"','X-Content-Type-Options':'nosniff'}).end(file.body);}));
 return router;
}
module.exports={createArtistRouter};
