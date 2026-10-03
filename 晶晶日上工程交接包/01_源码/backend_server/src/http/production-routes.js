 'use strict';
const express=require('express'),{createHash}=require('node:crypto');
const {createProductionRepository}=require('../modules/production/repository');
const {createPrivateStorage}=require('../modules/providers/private-storage');
const {createReadinessRepository}=require('../modules/providers/readiness');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createProductionRouter({db,resolvePrincipal,env={},storageFactory,providerFactory}){
 const provider=providerFactory?providerFactory(db,env):require('../modules/production/provider').createProductionProvider(db,env);
 const router=express.Router(),repo=createProductionRepository(db,{resolvePrincipal}),caps=new WeakMap();
 const storage=storageFactory?storageFactory():createPrivateStorage({env,repository:createReadinessRepository(db),authorize:async({operation,key,context})=>caps.get(context)?.key===key&&caps.get(context)?.operation===operation});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}return req.actingParty=id(v);};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));
 function post(path,method,fields,{party=true,existing=false}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);reply(req,res,await repo[method](req,{...req.body,operation_key:ref(req.get('Idempotency-Key')),...(party?{party_id:acting(req)}:{}),...(existing?{record_id:id(req.params.record_id),expected_version:expected(req)}:{})}));}));}
 post('/projects','create',['order_id','line_id','script_version_id','license_project_id','assignee_account_id','purpose','territory','consent_ids','evidence_asset_id']);
 post('/records/:record_id/reviews','review',['decision','reason','verification'],{party:false,existing:true});
 post('/projects/:record_id/assignment','assign',['assignee_account_id','reason'],{existing:true});
 post('/projects/:record_id/versions','submitVersion',['stage','file_id','preview_file_id','note'],{existing:true});
 post('/versions/:record_id/feedback','feedback',['decision','note','checklist'],{existing:true});
 router.get('/projects/:record_id/generation-readiness',wrap(async(req,res)=>{shape(req.query,[]);await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req)});reply(req,res,await provider.readiness());}));
 router.post('/projects/:record_id/generation',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['operation','avatar_id','asset_id','consent_id']);const party_id=acting(req);await repo.read(req,{record_id:id(req.params.record_id),party_id});await provider.assertReady();reply(req,res,await repo.requestGeneration(req,{...req.body,party_id,record_id:id(req.params.record_id),expected_version:expected(req),operation_key:ref(req.get('Idempotency-Key'))},await provider.descriptor()));}));
 router.get('/generations/:record_id/job',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.generationJob(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.post('/generations/:record_id/retry',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['reason_ref']);reply(req,res,await repo.retryGeneration(req,{record_id:id(req.params.record_id),reason_ref:req.body.reason_ref,operation_key:ref(req.get('Idempotency-Key'))}));}));
 router.get('/projects',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.listProjects(req,{party_id:acting(req),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.get('/projects/:project_id/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{project_id:id(req.params.project_id),party_id:acting(req,false),kind:req.query.kind,after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.post('/projects/:project_id/files',express.raw({type:'application/octet-stream',limit:'50mb'}),wrap(async(req,res)=>{
  shape(req.query,['media_type']);const input={project_id:id(req.params.project_id),party_id:acting(req),media_type:req.query.media_type,operation_key:ref(req.get('Idempotency-Key')),body:req.body},reserved=await repo.reserveFile(req,input),r=reserved.record;
  if(r.current_status==='READY')return reply(req,res,r);if(!reserved.fresh||r.current_status!=='UPLOADING')throw error('UPLOAD_RECONCILIATION_REQUIRED',409);
  const ctx={};caps.set(ctx,{operation:'put',key:r.data.object_key});try{const saved=await storage.put({key:r.data.object_key,body:req.body,contentType:r.data.media_type,isPrivate:true},ctx);if(saved.key!==r.data.object_key||saved.size!==r.data.byte_size||saved.sha256!==r.data.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);reply(req,res,await repo.finishFile(req,{record_id:r.id,party_id:input.party_id,success:true}));}catch(e){await repo.finishFile(req,{record_id:r.id,party_id:input.party_id,success:false}).catch(()=>{});throw e;}finally{caps.delete(ctx);}
 }));
 async function download(asset){const data=asset.data||asset,ctx={};caps.set(ctx,{operation:'get',key:data.object_key});try{const bytes=await storage.getBuffer(data.object_key,ctx);if(!Buffer.isBuffer(bytes)||bytes.length!==data.byte_size||createHash('sha256').update(bytes).digest('hex')!==data.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);return bytes;}finally{caps.delete(ctx);}}
 const bytes=(res,body)=>res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="production-content"','X-Content-Type-Options':'nosniff'}).end(body);
 router.get('/versions/:record_id/content',wrap(async(req,res)=>{shape(req.query,['variant']);const input={record_id:id(req.params.record_id),party_id:acting(req,false),variant:req.query.variant},asset=await repo.content(req,input),body=await download(asset);await repo.content(req,input);bytes(res,body);}));
 router.get('/projects/:record_id/evidence',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:id(req.params.record_id)},asset=await repo.evidence(req,input),body=await download(asset);await repo.evidence(req,input);bytes(res,body);}));
 return router;
}
module.exports={createProductionRouter};
