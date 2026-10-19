 'use strict';
const express=require('express');
const {id,ref,shape,version,error}=require('../modules/party/policy');
function createWalletRouter({db,resolvePrincipal}){
 const router=express.Router(),repo=require('../modules/wallet/repository').createWalletRepository(db,{resolvePrincipal});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 function party(req,required=true){const value=req.get('X-Acting-Party');if(required&&!value)throw error('ACTING_PARTY_REQUIRED',400);if(!required&&value)throw error('ACTING_PARTY_NOT_ALLOWED',400);return req.actingParty=value?id(value):null;}
 function expected(req){const value=req.get('If-Match');if(!value)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(value))throw error('INVALID_VERSION',400);return version(Number(value.slice(1,-1)));}
 function reply(req,res,data){if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.set('Cache-Control','no-store');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});}
 function post(path,method,fields,personal=true,match=false){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const p=party(req,personal);reply(req,res,await repo[method](req,{...req.body,...(personal?{party_id:p}:{}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(match?{expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));}
 post('/rules','createRule',['rule'],false);
 post('/rules/:record_id/review','reviewRule',['decision','reason'],false,true);
 post('/accounts','open',['rule_id','rule_sha256']);
 post('/recharges','recharge',['amount_minor']);
 post('/earnings/sync','syncOrder',['order_id']);
 post('/level-six','applyLevelSix',['evidence_asset_ids','valid_from','valid_until','terms']);
 post('/level-six/:record_id/review','reviewLevelSix',['decision','reason'],false,true);
 router.get('/rules',wrap(async(req,res)=>{shape(req.query,[]);party(req,false);reply(req,res,await repo.rules(req));}));
 router.get('/summary',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.summary(req,{party_id:party(req)}));}));
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);reply(req,res,await repo.records(req,{party_id:party(req),kind:req.query.kind,after:req.query.cursor||'',limit:req.query.limit?Number(req.query.limit):20}));}));
 return router;
}
module.exports={createWalletRouter};
