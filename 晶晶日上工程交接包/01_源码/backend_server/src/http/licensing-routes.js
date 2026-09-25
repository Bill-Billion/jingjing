 'use strict';
const express=require('express');
const {createHash}=require('node:crypto');
const {createLicensingRepository}=require('../modules/licensing/repository');
const {createPrivateStorage}=require('../modules/providers/private-storage');
const {createReadinessRepository}=require('../modules/providers/readiness');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createLicensingRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=createLicensingRepository(db,{resolvePrincipal}),caps=new WeakMap();
 const storage=storageFactory?storageFactory():createPrivateStorage({env,repository:createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}return req.actingParty=id(v);};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));
 function post(path,method,fields,{party=false,existing=false}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const input={...req.body,operation_key:ref(req.get('Idempotency-Key')),...(party?{party_id:acting(req)}:{}),...(existing?{record_id:req.params.record_id,expected_version:expected(req)}:{})};reply(req,res,await repo[method](req,input));}));}
 post('/products','createProduct',['work_version_id','previous_product_id','title','preview_text','terms','price','payment_due_minor','reservation_minutes','rule_id'],{party:true});
 post('/records/:record_id/reviews','review',['decision','reason','verification'],{existing:true});
 post('/records/:record_id/closures','close',['reason'],{party:true,existing:true});
 post('/reservations','reserve',['product_id'],{party:true});
 post('/evidence','submitEvidence',['reservation_id','contract_sha256','seller_signature_asset_id','buyer_signature_asset_id','identity_asset_id','payment_asset_id','external_reference'],{party:true});
 post('/reservations/:record_id/activation','activate',['evidence_id','reason'],{existing:true});
 post('/grants/:record_id/suspensions','suspend',['reason'],{existing:true});
 post('/projects','createProject',['project'],{party:true});
 post('/grants/:record_id/bindings','bind',['project_id'],{party:true,existing:true});
 post('/readings','createReading',['work_version_id','reader_account_id','reader_party_id','valid_until','basis_type','basis_asset_id'],{party:true});
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit','catalog']);if(req.query.catalog!==undefined&&!['true','false'].includes(req.query.catalog)||Array.isArray(req.query.limit))throw error('INVALID_LIST',400);reply(req,res,await repo.list(req,{kind:req.query.kind,party_id:acting(req,false),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit),catalog:req.query.catalog==='true'}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:req.params.record_id,party_id:acting(req,false)}));}));
 async function bytes(asset){const ctx={};caps.set(ctx,asset.object_key);try{const b=await storage.getBuffer(asset.object_key,ctx);if(!Buffer.isBuffer(b)||b.length!==asset.byte_size||createHash('sha256').update(b).digest('hex')!==asset.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);return b;}finally{caps.delete(ctx);}}
 router.get('/readings/:record_id/content',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:req.params.record_id,party_id:acting(req)},access=await repo.readingAsset(req,input),b=await bytes(access.asset);const current=await repo.readingAsset(req,input,true);const text=new TextDecoder('utf-8',{fatal:true}).decode(b);const marked=Array.from({length:Math.max(1,Math.ceil(text.length/1024))},(_,i)=>current.watermark+'\n'+text.slice(i*1024,(i+1)*1024)).join('\n');reply(req,res,{record_id:input.record_id,watermarked_text:marked,allows_generation:false});}));
 router.get('/evidence/:record_id/assets/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:req.params.record_id,asset_id:id(req.params.asset_id)},asset=await repo.evidenceAsset(req,input),b=await bytes(asset);await repo.evidenceAsset(req,input);res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+asset.id+'"','X-Content-Type-Options':'nosniff'}).end(b);}));
 return router;
}
module.exports={createLicensingRouter};
