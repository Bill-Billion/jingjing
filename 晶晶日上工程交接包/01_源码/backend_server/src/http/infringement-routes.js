'use strict';
const express=require('express'),{createHash}=require('node:crypto'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createInfringementRouter(options){
 const repo=require('../modules/infringement/repository').createInfringementRepository(options.db,options),r=express.Router(),wrap=f=>(q,s,n)=>Promise.resolve().then(()=>f(q,s)).catch(n),caps=new WeakMap(),storage=options.storageFactory?options.storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env:options.env||{},repository:require('../modules/providers/readiness').createReadinessRepository(options.db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 const reply=(q,s,d)=>s.set('Cache-Control','no-store').json({meta:{request_id:q.requestId,actor:{account_id:q.account.id},acting_party:q.actingParty||null},data:d});
 const scope=(q,operations)=>{const party=q.get('X-Acting-Party');if(operations&&party)throw error('ACTING_PARTY_NOT_ALLOWED',400);if(!operations&&!party)throw error('ACTING_PARTY_REQUIRED',400);q.actingParty=party?id(party):null;return {operations,party_id:q.actingParty};};
 const expected=q=>{const v=q.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 r.post('/cases',wrap(async(q,s)=>{shape(q.query,[]);shape(q.body,['target_kind','target_id','statement','contact','evidence_asset_ids']);reply(q,s,await repo.create(q,{...q.body,party_id:scope(q,false).party_id,operation_key:ref(q.get('Idempotency-Key'))}));}));
 for(const prefix of ['/cases','/operations/cases']){const operations=prefix.includes('operations');
 r.get(prefix,wrap(async(q,s)=>{shape(q.query,['cursor','limit']);reply(q,s,await repo.list(q,{...scope(q,operations),after:q.query.cursor||'',limit:q.query.limit===undefined?20:Number(q.query.limit)}));}));
 r.get(prefix+'/:case_id',wrap(async(q,s)=>{shape(q.query,[]);reply(q,s,await repo.read(q,{...scope(q,operations),case_id:id(q.params.case_id)}));}));
 r.post(prefix+'/:case_id/actions',wrap(async(q,s)=>{shape(q.query,[]);shape(q.body,['action','statement','contact','evidence_asset_ids','disclosed_asset_ids','decision','reason']);reply(q,s,await repo.act(q,{...q.body,...scope(q,operations),case_id:id(q.params.case_id),expected_version:expected(q),operation_key:ref(q.get('Idempotency-Key'))}));}));
 r.get(prefix+'/:case_id/files/:asset_id',wrap(async(q,s)=>{shape(q.query,[]);const i={...scope(q,operations),case_id:id(q.params.case_id),asset_id:id(q.params.asset_id)},f=await repo.asset(q,i),ctx={};caps.set(ctx,f.object_key);let bytes;try{bytes=await storage.getBuffer(f.object_key,ctx);}finally{caps.delete(ctx);}await repo.asset(q,i);if(!Buffer.isBuffer(bytes)||bytes.length!==f.byte_size||createHash('sha256').update(bytes).digest('hex')!==f.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);s.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="evidence.bin"','X-Content-Type-Options':'nosniff'}).send(bytes);}));
 }return r;
}
module.exports={createInfringementRouter};
