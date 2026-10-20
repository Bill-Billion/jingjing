"use strict";
const express=require('express'),{shape,id,ref,error}=require('../modules/party/policy'),{createPrivacyRepository}=require('../modules/privacy/repository');
function createPrivacyRouter(options){const router=express.Router(),repo=createPrivacyRepository(options.db,options),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.use((req,res,next)=>{if(req.get('X-Acting-Party'))return next(error('ACTING_PARTY_NOT_ALLOWED',400));req.actingParty=null;next();});
 const reply=(req,res,data)=>{if(data.object_version!==undefined)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:null},data});};
 function expected(req){const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"(0|[1-9][0-9]*)"$/.test(v))throw error('INVALID_VERSION',400);const n=Number(v.slice(1,-1));if(!Number.isSafeInteger(n)||n>=4294967295)throw error('INVALID_VERSION',400);return n;}
 function input(req,keys,versioned=true){shape(req.query,[]);shape(req.body,keys);return {...req.body,...req.params.request_id?{request_id:id(req.params.request_id)}:{},operation_key:ref(req.get('Idempotency-Key')),...versioned?{expected_version:expected(req)}:{}};}
 const assets=require('../modules/works/assets').createSupplyAssets({db:options.db,env:options.env||{},storageFactory:options.storageFactory,repository:{assetAccess:(ctx,assetId,requestId)=>repo.resultAsset(ctx,{request_id:requestId,asset_id:assetId})}});
 for(const [suffix,method] of [['model-assets','modelAssets'],['actions','actions']]) router.get('/requests/:request_id/'+suffix,wrap(async(req,res)=>{shape(req.query,['cursor','limit']);const limit=req.query.limit===undefined?20:Number(req.query.limit);if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);reply(req,res,await repo[method](req,{request_id:id(req.params.request_id),after:req.query.cursor||'',limit}));}));
 router.post('/requests/:request_id/consent-withdrawals',wrap(async(req,res)=>reply(req,res,await repo.withdrawConsent(req,input(req,['consent_id','consent_version','reason'])))));
 router.post('/requests/:request_id/model-deletions',wrap(async(req,res)=>reply(req,res,await repo.deleteModel(req,input(req,['asset_id','asset_version'])))));
 router.get('/requests/:request_id/history',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.history(req,{request_id:id(req.params.request_id)}));}));
 router.get('/requests/:request_id/evidence/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const data=await assets.download(req,id(req.params.asset_id),id(req.params.request_id));res.type('application/octet-stream').set('Content-Disposition','attachment; filename="privacy-response.bin"').send(data.body);}));
 router.get('/preferences',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.preferences(req));}));
 router.patch('/preferences',wrap(async(req,res)=>{const i=input(req,['personalization','marketing','rest_reminder_minutes']);reply(req,res,await repo.savePreferences(req,{preferences:req.body,operation_key:i.operation_key,expected_version:i.expected_version}));}));
 router.post('/requests',wrap(async(req,res)=>{const i=input(req,['type','scopes','details'],false);reply(req,res,await repo.create(req,{request:req.body,operation_key:i.operation_key}));}));
 for(const prefix of ['/requests','/operations/requests']){const operations=prefix.includes('operations');router.get(prefix,wrap(async(req,res)=>{shape(req.query,['cursor','limit']);const limit=req.query.limit===undefined?20:Number(req.query.limit);if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);reply(req,res,await repo.list(req,{operations,after:req.query.cursor||'',limit}));}));router.get(prefix+'/:request_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{request_id:id(req.params.request_id),operations}));}));}
 router.post('/operations/requests/:request_id/start',wrap(async(req,res)=>reply(req,res,await repo.start(req,input(req,[])))));
 router.post('/operations/requests/:request_id/response',wrap(async(req,res)=>reply(req,res,await repo.propose(req,input(req,['result'])))));
 router.post('/operations/requests/:request_id/review',wrap(async(req,res)=>reply(req,res,await repo.review(req,input(req,['decision','reason','proposal_sha256','evidence_verified','third_party_data_redacted','remaining_actions_checked'])))));
 router.post('/requests/:request_id/reopen',wrap(async(req,res)=>reply(req,res,await repo.reopen(req,input(req,['reason'])))));
 return router;
}
module.exports={createPrivacyRouter};
