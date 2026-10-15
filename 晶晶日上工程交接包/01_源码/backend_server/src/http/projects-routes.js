 'use strict';
const express=require('express'),{createHash}=require('node:crypto');
const {createProjectsRepository}=require('../modules/projects/repository');
const {createPrivateStorage}=require('../modules/providers/private-storage');
const {createReadinessRepository}=require('../modules/providers/readiness');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createProjectsRouter({db,resolvePrincipal,env={},storageFactory,providerFactory}){
 const router=express.Router(),repo=createProjectsRepository(db,{resolvePrincipal}),caps=new WeakMap();
 const storage=storageFactory?storageFactory():createPrivateStorage({env,repository:createReadinessRepository(db),authorize:async({operation,key,context})=>caps.get(context)?.key===key&&caps.get(context)?.operation===operation});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}return req.actingParty=id(v);};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));
 function post(path,method,fields,{party=true,existing=false}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);reply(req,res,await repo[method](req,{...req.body,operation_key:ref(req.get('Idempotency-Key')),...(party?{party_id:acting(req)}:{}),...(existing?{record_id:id(req.params.record_id),expected_version:expected(req)}:{})}));}));}
 post('/projects','create',["title", "scope"],{party:true,existing:false});
 post('/projects/:record_id/roles','role',["title", "capacity", "pricing", "amount_minor", "terms"],{party:true,existing:true});
 post('/roles/:record_id/invitations','invite',["invitee_party_id"],{party:true,existing:true});
 post('/roles/:record_id/applications','apply',["avatar_id", "consent_id", "amount_minor", "note"],{party:true,existing:true});
 post('/candidates/:record_id/responses','respond',["decision", "avatar_id", "consent_id", "amount_minor", "note"],{party:true,existing:true});
 post('/candidates/:record_id/decisions','decide',["decision", "content_sha256", "reason"],{party:true,existing:true});
 post('/projects/:record_id/plans','plan',["production_project_id", "rights", "confirmers", "funding", "terms"],{party:true,existing:true});
 post('/projects/:record_id/start','start',[],{party:true,existing:true});
 post('/projects/:record_id/editions','edition',["final_version_id", "material_asset_ids", "note"],{party:true,existing:true});
 post('/records/:record_id/confirmations','confirm',["content_sha256", "decision", "reason"],{party:true,existing:true});
 post('/projects/:record_id/cancellation','cancel',["reason"],{party:true,existing:true});
 post('/channels','channel',["name", "channel_reference", "submission_requirements", "evidence_asset_id"],{party:true,existing:false});
 post('/records/:record_id/reviews','review',["decision", "reason", "verification"],{party:false,existing:true});
 post('/projects/:record_id/releases','submitRelease',["channel_id", "prior_release_id", "material_asset_ids", "note"],{party:true,existing:true});
 post('/releases/:record_id/external-events','reportExternal',["outcome", "external_reference", "occurred_at", "evidence_asset_id", "note"],{party:true,existing:true});
 router.get('/projects',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.listProjects(req,{party_id:acting(req,false),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.get('/catalogue',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.catalogue(req));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.get('/projects/:project_id/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{project_id:id(req.params.project_id),party_id:acting(req,false),kind:req.query.kind,after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 for(const [path,method] of [['/records/:record_id/confirmations','confirmations'],['/projects/:record_id/readiness','readiness']])router.get(path,wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo[method](req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 async function download(asset){const data=asset.data||asset,ctx={};caps.set(ctx,{operation:'get',key:data.object_key});try{const bytes=await storage.getBuffer(data.object_key,ctx);if(!Buffer.isBuffer(bytes)||bytes.length!==data.byte_size||createHash('sha256').update(bytes).digest('hex')!==data.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);return bytes;}finally{caps.delete(ctx);}}
 const bytes=(res,body)=>res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="project-evidence"','X-Content-Type-Options':'nosniff'}).end(body);
 router.get('/records/:record_id/evidence/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:id(req.params.record_id),asset_id:id(req.params.asset_id),party_id:acting(req,false)},asset=await repo.evidence(req,input),body=await download(asset);await repo.evidence(req,input);bytes(res,body);}));
 return router;
}
module.exports={createProjectsRouter};
