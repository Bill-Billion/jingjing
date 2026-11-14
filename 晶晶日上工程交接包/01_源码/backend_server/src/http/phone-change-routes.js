'use strict';
const express=require('express'),{shape,ref,id,version,error}=require('../modules/party/policy');
function createPhoneChangeRouter({phoneChanges}){
 const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 router.use((req,res,next)=>{try{if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);shape(req.query,[]);next();}catch(e){next(e);}});
 const send=(req,res,data)=>{if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.set('Cache-Control','no-store').json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:null},data});};
 const input=req=>{const h=req.get('If-Match');if(!h)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(h))throw error('INVALID_VERSION',400);return {change_id:id(req.params.change_id),expected_version:version(Number(h.slice(1,-1))),operation_key:ref(req.get('Idempotency-Key'))};};
 router.post('/',wrap(async(req,res)=>{shape(req.body,['old_phone','new_phone']);send(req,res,await phoneChanges.create(req.token,{...req.body,operation_key:ref(req.get('Idempotency-Key'))},req.socket.remoteAddress));}));
 router.get('/current',wrap(async(req,res)=>send(req,res,await phoneChanges.current(req.token))));
 router.get('/:change_id',wrap(async(req,res)=>send(req,res,await phoneChanges.get(req.token,id(req.params.change_id)))));
 for(const [path,fn,keys] of [['challenges','send',['side']],['verifications','verify',['side','challenge_id','code']],['confirmation','confirm',[]],['cancellation','cancel',[]]])router.post('/:change_id/'+path,wrap(async(req,res)=>{shape(req.body,keys);send(req,res,await phoneChanges[fn](req.token,{...req.body,...input(req)},req.socket.remoteAddress));}));
 return router;
}
module.exports={createPhoneChangeRouter};
