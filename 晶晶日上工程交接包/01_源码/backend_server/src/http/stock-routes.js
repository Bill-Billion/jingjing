"use strict";
const express=require('express');
const {id,ref,shape,version,error}=require('../modules/party/policy');
function createStockRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=require('../modules/stock/repository').createStockRepository(db,{resolvePrincipal}),trade=require('../modules/trade/repository').createTradeRepository(db,{resolvePrincipal});
 const assets=require('../modules/works/assets').createSupplyAssets({db,repository:require('../modules/works/repository').createSupplyRepository(db,{resolvePrincipal,maxAssetBytes:50*1024*1024}),env,storageFactory});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v&&required)throw error('ACTING_PARTY_REQUIRED',400);return req.actingParty=v?id(v):null;};
 const operator=req=>{if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);req.actingParty=null;};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>{if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});};
 const page=(req,extra=[])=>{shape(req.query,['cursor','limit',...extra]);if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);return {after:req.query.cursor===undefined?'':id(req.query.cursor),limit:req.query.limit===undefined?20:Number(req.query.limit)};};
 function post(path,method,fields,{party=true,match=false,target=repo}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const party_id=party?acting(req):null;if(!party)operator(req);reply(req,res,await target[method](req,{...req.body,...(party?{party_id}:{}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(req.params.order_id?{order_id:id(req.params.order_id)}:{}),...(match?{expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));}
 post('/listings','create',['sales_publication_id','spec_id','rule_id','description','city','file_id','preview_file_id','participants','rights_evidence_ids','qualification','seller_person_id','payment_window_minutes','apple_product_id']);
 post('/listings/:record_id/revisions','create',['sales_publication_id','spec_id','rule_id','description','city','file_id','preview_file_id','participants','rights_evidence_ids','qualification','seller_person_id','payment_window_minutes','apple_product_id'],{match:true});
 post('/sales-publications','createSalesPublication',['seller_party_id','spec_id','rule_id','title','terms'],{party:false});
 post('/sales-publications/:record_id/reviews','reviewSalesPublication',['decision','reason'],{party:false,match:true});
 router.get('/sales-publication-sources',wrap(async(req,res)=>{const p=page(req,['kind','seller_party_id']);operator(req);reply(req,res,await repo.salesPublicationSources(req,{...p,kind:req.query.kind,...(req.query.seller_party_id?{seller_party_id:req.query.seller_party_id}:{})}));}));
 router.get('/sales-publications',wrap(async(req,res)=>{const p=page(req);reply(req,res,await repo.salesPublications(req,{...p,party_id:acting(req,false)}));}));
 router.get('/participant-options',wrap(async(req,res)=>{const p=page(req,['person_id']);reply(req,res,await repo.participantOptions(req,{...p,party_id:acting(req),person_id:id(req.query.person_id)}));}));
 post('/listings/:record_id/reviews','review',['channel','decision','reason','verification'],{party:false,match:true});
 post('/listings/:record_id/status','status',['action','reason'],{party:true,match:true});
 post('/reviews/:record_id/status','status',['action','reason'],{party:false,match:true});
 post('/checkout','stockCheckout',['listing_id','offer_sha256','channel'],{target:trade});
 for(const [path,method,fields,party] of [['receipt','receipt',[],true],['acceptance','accept',[],true],['cases','openCase',['kind','reason'],true],['case-resolution','resolveCase',['case_id','decision','reason'],false]])post('/purchases/:order_id/'+path,method,fields,{party,match:true});
 router.get('/catalog',wrap(async(req,res)=>{const p=page(req,['city','person_id']);operator(req);reply(req,res,await repo.catalog(req,{...p,...(req.query.city?{city:req.query.city}:{}),...(req.query.person_id?{person_id:req.query.person_id}:{})}));}));
 router.get('/catalog/:record_id',wrap(async(req,res)=>{shape(req.query,[]);operator(req);reply(req,res,await repo.offer(req,{record_id:id(req.params.record_id)}));}));
 router.get('/listings',wrap(async(req,res)=>{const p=page(req);reply(req,res,await repo.listings(req,{...p,party_id:acting(req,false)}));}));
 router.get('/listings/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.get('/purchases',wrap(async(req,res)=>{const p=page(req);reply(req,res,await repo.purchases(req,{...p,party_id:acting(req)}));}));
 router.get('/purchases/:order_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.purchased(req,{order_id:id(req.params.order_id),party_id:acting(req,false)}));}));
 router.post('/files',express.raw({type:'application/octet-stream',limit:'50mb'}),wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await assets.upload(req,{party_id:acting(req),purpose:'WORK_CONTENT',media_type:'video/mp4',body:req.body,operation_key:ref(req.get('Idempotency-Key'))}));}));
 const caps=new WeakMap(),storage=storageFactory?storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env,repository:require('../modules/providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 function download(path,method,input,observe=false){router.get(path,wrap(async(req,res)=>{shape(req.query,[]);const i=input(req),file=await repo[method](req,i),ctx={};caps.set(ctx,file.object_key);let bytes;try{bytes=await storage.getBuffer(file.object_key,ctx);}finally{caps.delete(ctx);}if(!Buffer.isBuffer(bytes)||bytes.length!==file.byte_size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==file.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);await repo[method](req,i);if(observe)await repo.observed(req,i);res.set({'Content-Type':file.media_type,'Content-Disposition':'attachment; filename="'+file.id+'"','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).end(bytes);}));}
 download('/catalog/:record_id/preview','listingFile',req=>{operator(req);return {record_id:id(req.params.record_id),variant:'preview',public_preview:true};});
 download('/listings/:record_id/files/:variant','listingFile',req=>({record_id:id(req.params.record_id),party_id:acting(req,false),variant:req.params.variant,public_preview:false}));
 download('/listings/:record_id/evidence/:asset_id','evidence',req=>({record_id:id(req.params.record_id),asset_id:id(req.params.asset_id),party_id:acting(req,false)}));
 download('/purchases/:order_id/content','content',req=>({order_id:id(req.params.order_id),party_id:acting(req)}),true);
 return router;
}
module.exports={createStockRouter};
