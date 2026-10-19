 'use strict';
const express=require('express'),{id,ref,shape,version,error}=require('../modules/party/policy');
function createNoticesRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=require('../modules/notices/repository').createNoticesRepository(db,{resolvePrincipal});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 function party(req,mode='optional'){const v=req.get('X-Acting-Party');if(mode==='none'&&v)throw error('ACTING_PARTY_NOT_ALLOWED',400);if(mode==='required'&&!v)throw error('ACTING_PARTY_REQUIRED',400);return req.actingParty=v?id(v):null;}
 function expected(req){const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));}
 function reply(req,res,data){if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});}
 function post(path,method,fields,mode='required',match=false){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const p=party(req,mode);reply(req,res,await repo[method](req,{...req.body,...(mode==='none'?{}:{party_id:p}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(match?{expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));}
 post('/rules','createRule',['rule'],'none');
 post('/qualifications','applyQualification',['types','valid_from','valid_until','evidence_asset_ids','terms']);
 post('/facts','recordFact',['party_id','kind','amount','occurred_at','source_ref','evidence_asset_id'],'none');
 post('/announcements','createNotice',['rule_id','notice'],'optional');
 post('/submissions','submit',['rule_id','submission']);
 post('/records/:record_id/reviews','review',['decision','reason','checks'],'none',true);
 post('/records/:record_id/close','close',['reason'],'optional',true);
 post('/submissions/:record_id/decision','decision',['decision'],'required',true);
 post('/cases/:record_id/quote','linkQuote',['quote_id','quote_sha256','reason'],'none',true);
 const page=req=>{if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);return {after:req.query.cursor?id(req.query.cursor):'',limit:req.query.limit?Number(req.query.limit):20};};
 router.get('/rules',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);party(req,'none');reply(req,res,await repo.publicRules(req,page(req)));}));
 router.get('/eligibility',wrap(async(req,res)=>{shape(req.query,['rule_id']);reply(req,res,await repo.eligibility(req,{party_id:party(req,'required'),rule_id:id(req.query.rule_id)}));}));
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{...page(req),kind:req.query.kind,party_id:party(req)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:party(req)}));}));
 router.get('/catalog',wrap(async(req,res)=>{shape(req.query,['cursor','limit','type','city','at']);party(req,'none');reply(req,res,await repo.catalog(req,{...page(req),...Object.fromEntries(['type','city','at'].filter(k=>req.query[k]!==undefined).map(k=>[k,req.query[k]]))}));}));
 router.get('/catalog/:record_id',wrap(async(req,res)=>{shape(req.query,[]);party(req,'none');reply(req,res,await repo.publicRead(req,{record_id:id(req.params.record_id)}));}));
 const caps=new WeakMap(),storage=storageFactory?storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env,repository:require('../modules/providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 router.get('/records/:record_id/materials/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);const i={record_id:id(req.params.record_id),asset_id:id(req.params.asset_id),party_id:party(req)},file=await repo.attachment(req,i),ctx={};caps.set(ctx,file.object_key);let bytes;try{bytes=await storage.getBuffer(file.object_key,ctx);}finally{caps.delete(ctx);}if(!Buffer.isBuffer(bytes)||bytes.length!==file.byte_size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==file.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);await repo.attachment(req,i);res.set({'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+file.id+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(bytes);}));
 return router;
}
module.exports={createNoticesRouter};
