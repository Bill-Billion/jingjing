"use strict";
const express=require('express'),{shape,ref,version,error}=require('../modules/party/policy');
function createCollectionsRouter({db,resolvePrincipal,secret,env={}}){
 const router=express.Router(),repo=require('../modules/collections/repository').createCollectionsRepository(db,{resolvePrincipal,secret,env});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>{if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);return fn(req,res);}).catch(next);
 const reply=(req,res,data)=>{if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.set('Cache-Control','no-store').json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:null},data});};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const write=(path,method,fields,match=false,verb='post')=>router[verb](path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body||{},fields);reply(req,res,await repo[method](req,{...req.body,...req.params,...(match?{expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));
 router.get('/preferences',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.preferences(req));}));
 write('/preferences','changePreferences',['history_enabled'],true);
 write('/favorites','favorite',['kind','target_id','saved']);
 write('/history','visit',['kind','target_id'],true);
 write('/history','removeHistory',[],true,'delete');
 write('/history/:kind/:target_id','removeHistory',[],true,'delete');
 router.get('/targets/:kind/:target_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.target(req,req.params));}));
 for(const [path,collection] of [['favorites','FAVORITE'],['history','HISTORY']])router.get('/'+path,wrap(async(req,res)=>{if(req.query.limit!==undefined&&(typeof req.query.limit!=='string'||!/^(?:[1-9][0-9]?|100)$/.test(req.query.limit)))throw error('INVALID_LIMIT',400);reply(req,res,await repo.list(req,collection,{...req.query,...(req.query.limit!==undefined?{limit:Number(req.query.limit)}:{})}));}));
 return router;
}
module.exports={createCollectionsRouter};
