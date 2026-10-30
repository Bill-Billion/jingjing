"use strict";
const express=require('express'),{id,ref,shape,version,error}=require('../modules/party/policy');
function createDirectoryRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=require('../modules/directory/repository').createDirectoryRepository(db,{resolvePrincipal});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 function party(req,mode='optional'){const value=req.get('X-Acting-Party');if(mode==='none'&&value)throw error('ACTING_PARTY_NOT_ALLOWED',400);if(mode==='required'&&!value)throw error('ACTING_PARTY_REQUIRED',400);return req.actingParty=value?id(value):null;}
 function expected(req){const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));}
 function reply(req,res,data){if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.set('Cache-Control','no-store').json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});}
 const page=req=>{if(req.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(req.query.limit))throw error('INVALID_LIMIT',400);return {cursor:req.query.cursor||'',limit:req.query.limit?Number(req.query.limit):20};};
 function post(path,method,fields,mode,match=false){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const p=party(req,mode);reply(req,res,await repo[method](req,{...req.body,...(mode==='none'?{}:{party_id:p}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(match?{expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));}
 post('/organization-profiles','submitOrganization',['profile'],'required');post('/featured-artists','proposeFeature',['feature'],'none');
 post('/records/:record_id/reviews','review',['decision','reason','checks'],'none',true);post('/records/:record_id/withdrawals','withdraw',['reason'],'optional',true);
 router.get('/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{...page(req),kind:req.query.kind,party_id:party(req)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:party(req)}));}));
 for(const [path,kind] of [['organizations','ORGANIZATION'],['featured-artists','FEATURED_ARTIST']])router.get('/'+path,wrap(async(req,res)=>{shape(req.query,['city','q','cursor','limit']);party(req,'none');reply(req,res,await repo.catalog(req,{...page(req),kind,...Object.fromEntries(['city','q'].filter(k=>req.query[k]!==undefined).map(k=>[k,req.query[k]]))}));}));
 router.get('/organizations/:party_id',wrap(async(req,res)=>{shape(req.query,[]);party(req,'none');reply(req,res,await repo.organization(req,{party_id:id(req.params.party_id)}));}));
 const caps=new WeakMap(),storage=storageFactory?storageFactory():require('../modules/providers/private-storage').createPrivateStorage({env,repository:require('../modules/providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 function download(path,publicCover){router.get(path,wrap(async(req,res)=>{shape(req.query,[]);const i=publicCover?(party(req,'none'),{party_id:id(req.params.party_id)}):{record_id:id(req.params.record_id),asset_id:id(req.params.asset_id),party_id:party(req)};const method=publicCover?'organizationCover':'material',before=await repo[method](req,i),file=before.file,ctx={};caps.set(ctx,file.object_key);let bytes;try{bytes=await storage.getBuffer(file.object_key,ctx);}finally{caps.delete(ctx);}
 if(!Buffer.isBuffer(bytes)||bytes.length!==file.byte_size||require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==file.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);
 const after=await repo[method](req,i);if(after.record_id!==before.record_id||after.file.id!==file.id||after.file.content_sha256!==file.content_sha256)throw error('DIRECTORY_CONTENT_CHANGED',409);
 if(publicCover&&!(file.media_type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217))throw error('PRIVATE_CONTENT_MISMATCH',503);
 res.set({'Content-Type':publicCover?file.media_type:'application/octet-stream','Content-Disposition':(publicCover?'inline':'attachment')+'; filename="'+file.id+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(bytes);}));}
 download('/organizations/:party_id/cover',true);download('/records/:record_id/materials/:asset_id',false);return router;
}
module.exports={createDirectoryRouter};
