 'use strict';
const express=require('express'),{createHash}=require('node:crypto');
const {createGigsRepository}=require('../modules/gigs/repository');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createGigsRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=createGigsRepository(db,{resolvePrincipal}),caps=new WeakMap();
 const storage=storageFactory?storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env,repository:require('../modules/providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}return req.actingParty=id(v);};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));
 function post(path,method,fields,{party=true,existing=false}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);reply(req,res,await repo[method](req,{...req.body,operation_key:ref(req.get('Idempotency-Key')),...(party?{party_id:acting(req)}:{}),...(existing?{record_id:id(req.params.record_id),expected_version:expected(req)}:{})}));}));}
 post('/rules','createRule',['rule'],{party:false});
 post('/records/:record_id/reviews','review',['decision','reason','checks'],{party:false,existing:true});
 post('/rules/:record_id/retirement','retireRule',['reason'],{party:false,existing:true});
 post('/relations','relation',['artist_party_id','scope','valid_from','valid_until','exclusive','terms','commission','evidence_asset_ids']);
 post('/relations/:record_id/decision','relationDecision',['decision','reason'],{existing:true});
 post('/requests','createGig',['title','brief','category','scope','rule_id','proofs']);
 post('/requests/:record_id/suspension','suspend',['reason'],{party:false,existing:true});
 post('/offers','offer',['gig_id','spec_id','avatar_id','consent_id','relation_id','commission','terms','ranking_opt_in','evidence_asset_ids']);
 post('/offers/:record_id/acceptance','acceptOffer',['offer_sha256'],{existing:true});
 post('/commissions','calculate',['order_id']);
 post('/rankings','ranking',['rule_id','as_of'],{party:false});
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{kind:req.query.kind,party_id:acting(req,false),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.get('/catalogue',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.catalogue(req));}));
 router.get('/notifications',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.notifications(req,{party_id:acting(req)}));}));
 router.get('/rankings/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.publicRank(req,{record_id:id(req.params.record_id)}));}));
 router.get('/commissions/:record_id/entries',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.entries(req,{record_id:id(req.params.record_id),party_id:acting(req)}));}));
 router.get('/records/:record_id/evidence/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:id(req.params.record_id),asset_id:id(req.params.asset_id),party_id:acting(req,false)},asset=await repo.evidence(req,input),ctx={};caps.set(ctx,asset.object_key);let bytes;try{bytes=await storage.getBuffer(asset.object_key,ctx);}finally{caps.delete(ctx);}await repo.evidence(req,input);if(!Buffer.isBuffer(bytes)||bytes.length!==asset.byte_size||createHash('sha256').update(bytes).digest('hex')!==asset.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="evidence"','X-Content-Type-Options':'nosniff'}).end(bytes);}));
 return router;
}
module.exports={createGigsRouter};
