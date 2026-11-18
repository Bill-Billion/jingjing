'use strict';
const express=require('express'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createGuardianRouter(options){
 const repo=require('../modules/guardians/repository').createGuardianRepository(options.db,options),r=express.Router(),wrap=f=>(q,s,n)=>Promise.resolve().then(()=>f(q,s)).catch(n);
 const reply=(q,s,d)=>s.set('Cache-Control','no-store').json({meta:{request_id:q.requestId,actor:{account_id:q.account.id},acting_party:null},data:d});
 r.use((q,s,n)=>{if(q.get('X-Acting-Party'))return n(error('ACTING_PARTY_NOT_ALLOWED',400));n();});
 const expected=q=>{const v=q.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const body=(q,keys)=>{shape(q.query,[]);shape(q.body,keys);return {...q.body,operation_key:ref(q.get('Idempotency-Key'))};};
 const list=q=>{shape(q.query,['cursor','limit']);return {after:q.query.cursor||'',limit:q.query.limit===undefined?20:Number(q.query.limit)};};
 r.post('/links',wrap(async(q,s)=>reply(q,s,await repo.invite(q,body(q,['child_account_id','relationship','evidence_asset_ids','rule_id','valid_until'])))));
 for(const prefix of ['/records','/operations/records']){const operations=prefix.includes('operations');
 r.get(prefix,wrap(async(q,s)=>reply(q,s,await repo.list(q,{...list(q),operations}))));
 r.get(prefix+'/:record_id',wrap(async(q,s)=>{shape(q.query,[]);reply(q,s,await repo.read(q,{record_id:id(q.params.record_id),operations}));}));
 r.post(prefix+'/:record_id/decisions',wrap(async(q,s)=>reply(q,s,await repo.decide(q,{...body(q,['decision','age_band','identity_checked','relationship_checked','reason']),record_id:id(q.params.record_id),operations,expected_version:expected(q)}))));
 }
 r.put('/links/:link_id/controls',wrap(async(q,s)=>reply(q,s,await repo.controls(q,{...body(q,['controls']),link_id:id(q.params.link_id),expected_version:expected(q)}))));
 r.get('/links/:link_id/usage',wrap(async(q,s)=>{shape(q.query,[]);reply(q,s,await repo.usage(q,{link_id:id(q.params.link_id)}));}));
 r.post('/links/:link_id/sessions',wrap(async(q,s)=>reply(q,s,await repo.session(q,{...body(q,[]),link_id:id(q.params.link_id)}))));
 r.get('/links/:link_id/information',wrap(async(q,s)=>{shape(q.query,['category','cursor','limit']);reply(q,s,await repo.information(q,{link_id:id(q.params.link_id),category:q.query.category,after:q.query.cursor||'',limit:q.query.limit===undefined?20:Number(q.query.limit)}));}));
 for(const [path,method,fields] of [['privacy-requests','privacyRequest',['type','details']],['spending-consents','spend',['amount_minor','purpose']],['refund-requests','refund',['payment_id','allocations','reason','evidence_asset_ids']]]){
 r.post('/links/:link_id/'+path,wrap(async(q,s)=>reply(q,s,await repo[method](q,{...body(q,fields),link_id:id(q.params.link_id)}))));
 }
 r.post('/records/:record_id/refund',wrap(async(q,s)=>reply(q,s,await repo.executeRefund(q,{...body(q,[]),record_id:id(q.params.record_id),expected_version:expected(q)}))));
 const caps=new WeakMap(),storage=options.storageFactory?options.storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env:options.env||{},repository:require('../modules/providers/readiness').createReadinessRepository(options.db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 r.get('/links/:link_id/content',wrap(async(q,s)=>reply(q,s,await repo.content(q,{...list(q),link_id:id(q.params.link_id)}))));
 r.get('/links/:link_id/content/:listing_id/preview',wrap(async(q,s)=>{shape(q.query,[]);const i={link_id:id(q.params.link_id),listing_id:id(q.params.listing_id)},f=await repo.contentFile(q,i),ctx={};caps.set(ctx,f.object_key);let bytes;try{bytes=await storage.getBuffer(f.object_key,ctx);}finally{caps.delete(ctx);}await repo.contentFile(q,i);if(!Buffer.isBuffer(bytes)||bytes.length!==f.byte_size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==f.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);s.set({'Cache-Control':'no-store','Content-Type':f.media_type,'X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="preview.mp4"'}).send(bytes);}));
 return r;
}
module.exports={createGuardianRouter};
