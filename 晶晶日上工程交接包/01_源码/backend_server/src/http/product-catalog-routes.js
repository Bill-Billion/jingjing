'use strict';
const express=require('express'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createProductCatalogRouter({db,resolvePrincipal}){
 const router=express.Router(),repo=require('../modules/product-catalog/repository').createProductCatalogRepository(db,{resolvePrincipal});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>{if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);req.actingParty=null;return fn(req,res);}).catch(next);
 const reply=(req,res,data)=>{res.set('Cache-Control','no-store');if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:null},data});};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 for(const [route,method,fields,match] of [['/records','create',['kind','code','content'],false],['/records/:record_id/revisions','revise',['content'],true],['/records/:record_id/reviews','review',['decision','checks','reason'],true],['/records/:record_id/withdrawals','withdraw',['reason'],true]])router.post(route,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);reply(req,res,await repo[method](req,{...req.body,...(match?{record_id:id(req.params.record_id),expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));
 for(const [route,method,fields] of [['/records','records',['kind','cursor','limit']],['/catalog','catalog',['kind','code','category_id','slot_code','cursor','limit']]])router.get(route,wrap(async(req,res)=>{shape(req.query,fields);if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);reply(req,res,await repo[method](req,{...req.query,...(req.query.limit!==undefined?{limit:Number(req.query.limit)}:{})}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id)}));}));
 router.get('/catalog/:entity_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.publicRecord(req,{entity_id:id(req.params.entity_id)}));}));
 return router;
}
module.exports={createProductCatalogRouter};
