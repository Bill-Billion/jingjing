'use strict';
const express=require('express');
const {createSupplyRepository}=require('../modules/works/repository');
const {validBinding}=require('../modules/licensing/repository');
const {createSupplyAssets}=require('../modules/works/assets');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createSupplyRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=createSupplyRepository(db,{resolvePrincipal,verifyProjectSource:validBinding}),assets=createSupplyAssets({db,repository:repo,env,storageFactory});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const value=req.get('X-Acting-Party');if(!value){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}req.actingParty=id(value);return req.actingParty;};
 const key=req=>ref(req.get('Idempotency-Key'));
 const expected=req=>{const value=req.get('If-Match');if(!value)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(value))throw error('INVALID_VERSION',400);return version(Number(value.slice(1,-1)));};
 const body=(req,keys)=>{shape(req.body,keys);return req.body;};
 function reply(req,res,data){res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));}
 router.post('/assets',express.raw({type:'application/octet-stream',limit:'8mb'}),wrap(async(req,res)=>{
  shape(req.query,['purpose','media_type']);const data=await assets.upload(req,{party_id:acting(req),purpose:req.query.purpose,media_type:req.query.media_type,body:req.body,operation_key:key(req)});reply(req,res,data);
 }));
 router.get('/assets/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await assets.read(req,req.params.asset_id,acting(req,false)));}));
 router.get('/assets/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const file=await assets.download(req,req.params.asset_id,acting(req,false));res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+file.metadata.id+'"','X-Content-Type-Options':'nosniff'}).end(file.body);}));
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);const limit=req.query.limit===undefined?20:Number(req.query.limit);if(Array.isArray(req.query.limit))throw error('INVALID_LIST',400);reply(req,res,await repo.list(req,{kind:req.query.kind,after:req.query.cursor===undefined?'':id(req.query.cursor),limit,party_id:acting(req,false)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:req.params.record_id,party_id:acting(req,false)}));}));
 router.post('/profiles',wrap(async(req,res)=>{reply(req,res,await repo.createProfile(req,{...body(req,['display_name','description','evidence_asset_ids','previous_profile_id']),party_id:acting(req),operation_key:key(req)}));}));
 router.post('/profiles/:record_id/reviews',wrap(async(req,res)=>{reply(req,res,await repo.reviewProfile(req,{...body(req,['decision','reason']),record_id:req.params.record_id,expected_version:expected(req),operation_key:key(req)}));}));
 router.post('/work-versions',wrap(async(req,res)=>{reply(req,res,await repo.createVersion(req,{...body(req,['work_id','previous_version_id','title','kind','source_version_id','project_id','content_asset_id','evidence_ids','credits']),party_id:acting(req),operation_key:key(req)}));}));
 router.post('/work-versions/:record_id/actions',wrap(async(req,res)=>{reply(req,res,await repo.changeVersion(req,{...body(req,['action','reason']),party_id:acting(req),record_id:req.params.record_id,expected_version:expected(req),operation_key:key(req)}));}));
 router.post('/work-versions/:record_id/reviews',wrap(async(req,res)=>{reply(req,res,await repo.reviewVersion(req,{...body(req,['channel','decision','reason']),record_id:req.params.record_id,expected_version:expected(req),operation_key:key(req)}));}));
 router.post('/avatars',wrap(async(req,res)=>{reply(req,res,await repo.createAvatar(req,{...body(req,['display_name','material_asset_ids']),party_id:acting(req),operation_key:key(req)}));}));
 router.post('/consents',wrap(async(req,res)=>{const input=body(req,['consent']);if(input.consent?.subject_party_id!==acting(req))throw error('ACTING_PARTY_MISMATCH',403);reply(req,res,await repo.createConsent(req,{...input,operation_key:key(req)}));}));
 router.post('/consents/:record_id/reviews',wrap(async(req,res)=>{reply(req,res,await repo.reviewConsent(req,{...body(req,['decision','reason']),record_id:req.params.record_id,expected_version:expected(req),operation_key:key(req)}));}));
 router.post('/consents/:record_id/withdrawals',wrap(async(req,res)=>{reply(req,res,await repo.withdrawConsent(req,{...body(req,['reason']),record_id:req.params.record_id,expected_version:expected(req),operation_key:key(req)}));}));
 router.get('/consents/:record_id/scope',wrap(async(req,res)=>{shape(req.query,['feature','purpose','territory']);reply(req,res,await repo.consentScope(req,{...req.query,party_id:acting(req),record_id:req.params.record_id}));}));
 return router;
}
module.exports={createSupplyRouter};
