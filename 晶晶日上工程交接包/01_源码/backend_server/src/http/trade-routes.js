 'use strict';
const express=require('express');
const {createTradeRepository}=require('../modules/trade/repository');
const {createTradeProviders}=require('../modules/trade/providers');
const {createTradeService}=require('../modules/trade/service');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createTradeRouters({db,resolvePrincipal,env={},providersFactory,storageFactory}){
 const router=express.Router(),callbacks=express.Router(),repo=createTradeRepository(db,{resolvePrincipal,fulfillmentGate:require('../modules/production/payment-gate').productionPaymentGate});
 const caps=new WeakMap(),storage=storageFactory?storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env,repository:require('../modules/providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 const service=createTradeService(repo,providersFactory?providersFactory(db,env):createTradeProviders(db,env));
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}return req.actingParty=id(v);};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));
 function post(path,method,fields,{party=false,existing=false,target=repo}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const input={...req.body,operation_key:ref(req.get('Idempotency-Key')),...(party?{party_id:acting(req)}:{}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(existing?{expected_version:expected(req)}:{})};reply(req,res,await target[method](req,input));}));}
 post('/specifications','createSpec',['previous_spec_id','title','provider_party_id','line_kind','unit_minor','currency','specification'],{party:true});
 post('/quotes','quote',['buyer_party_id','lines','installments','channel','transaction_model','rule_id','expires_at','payment_window_minutes','license_reservation_id'],{party:true});
 post('/records/:record_id/reviews','review',['decision','reason'],{existing:true});
 post('/quotes/:record_id/acceptance','accept',['quote_sha256'],{party:true,existing:true});
 post('/orders/:record_id/cancellation','cancel',['reason'],{party:true,existing:true});
 post('/payments','startPayment',['order_id','installment_key'],{party:true,target:service});
 post('/payments/:record_id/reconciliation','reconcilePayment',['transaction_id'],{party:true,target:service});
 post('/refunds','requestRefund',['payment_id','allocations','reason'],{party:true});
 post('/refunds/:record_id/execution','executeRefund',[],{target:service});
 post('/refunds/:record_id/reconciliation','reconcileRefund',[],{party:true,target:service});
 post('/legacy-orders','legacy',['buyer_party_id','merchant_party_id','source_system','source_order_id','original_lines','original_terms','evidence_asset_id']);
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{kind:req.query.kind,party_id:acting(req,false),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.get('/legacy-orders/:record_id/evidence/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:id(req.params.record_id),asset_id:id(req.params.asset_id)},asset=await repo.evidenceAsset(req,input),ctx={};caps.set(ctx,asset.object_key);let bytes;try{bytes=await storage.getBuffer(asset.object_key,ctx);}finally{caps.delete(ctx);}if(!Buffer.isBuffer(bytes)||bytes.length!==asset.byte_size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==asset.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);await repo.evidenceAsset(req,input);res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+asset.id+'"','X-Content-Type-Options':'nosniff'}).end(bytes);}));
 callbacks.post('/alipay',express.urlencoded({extended:false,limit:'32kb',parameterLimit:64}),wrap(async(req,res)=>{shape(req.query,[]);await service.notification('ALIPAY',req.body);res.status(200).type('text/plain').end('success');}));
 callbacks.post('/apple',express.json({limit:'64kb',strict:true}),wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['signedPayload']);await service.notification('APPLE',req.body);res.status(200).json({accepted:true});}));
 return {router,callbacks};
}
module.exports={createTradeRouters};
