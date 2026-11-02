'use strict';
const express=require('express'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createReconciliationRouter(options){
 const r=express.Router(),repo=require('../modules/reconciliation/repository').createReconciliationRepository(options.db,options),wrap=f=>(q,s,n)=>Promise.resolve().then(()=>f(q,s)).catch(n);
 const reply=(q,s,data)=>s.set('Cache-Control','no-store').json({meta:{request_id:q.requestId,actor:{account_id:q.account.id},acting_party:null},data});
 r.use((q,s,n)=>q.get('X-Acting-Party')?n(error('ACTING_PARTY_NOT_ALLOWED',400)):n());
 const expected=q=>{const v=q.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const post=(path,method,fields,existing=true)=>r.post(path,wrap(async(q,s)=>{shape(q.query,[]);shape(q.body,fields);reply(q,s,await repo[method](q,{...q.body,...existing?{report_id:id(q.params.report_id),expected_version:expected(q)}:{},operation_key:ref(q.get('Idempotency-Key'))}));}));
 post('/','create',['scope','note'],false);
 post('/:report_id/statements','statement',['kind','mode','items','external_reference','evidence_asset_id','no_activity_reason']);
 post('/:report_id/manual-evidence','manual',['mode','items']);
 post('/:report_id/comparison','compare',[]);
 post('/:report_id/review','review',['decision','reason','verification']);
 post('/:report_id/reopen','reopen',['reason']);
 r.get('/',wrap(async(q,s)=>{shape(q.query,['cursor','limit','merchant_party_id','business_date']);reply(q,s,await repo.list(q,{after:q.query.cursor||'',limit:Number(q.query.limit||20),merchant_party_id:q.query.merchant_party_id,business_date:q.query.business_date}));}));
 r.get('/:report_id',wrap(async(q,s)=>{shape(q.query,[]);reply(q,s,await repo.read(q,{report_id:id(q.params.report_id)}));}));
 r.get('/:report_id/facts',wrap(async(q,s)=>{shape(q.query,['cursor','limit','source_fingerprint']);reply(q,s,await repo.facts(q,{report_id:id(q.params.report_id),after:Number(q.query.cursor||0),limit:Number(q.query.limit||50),source_fingerprint:q.query.source_fingerprint}));}));
 r.get('/:report_id/history',wrap(async(q,s)=>{shape(q.query,[]);reply(q,s,await repo.history(q,{report_id:id(q.params.report_id)}));}));
 const caps=new WeakMap(),storage=options.storageFactory?options.storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env:options.env||{},repository:require('../modules/providers/readiness').createReadinessRepository(options.db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 r.get('/:report_id/files/:asset_id',wrap(async(q,s)=>{shape(q.query,[]);const i={report_id:id(q.params.report_id),asset_id:id(q.params.asset_id)},f=await repo.evidence(q,i),ctx={};caps.set(ctx,f.object_key);let bytes;try{bytes=await storage.getBuffer(f.object_key,ctx);}finally{caps.delete(ctx);}await repo.evidence(q,i);if(!Buffer.isBuffer(bytes)||bytes.length!==f.byte_size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==f.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);s.set({'Cache-Control':'no-store','Content-Type':f.media_type,'X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="reconciliation-evidence"'}).send(bytes);}));
 return r;
}
module.exports={createReconciliationRouter};
