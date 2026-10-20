"use strict";
const {randomUUID,createHash}=require('node:crypto');
const {id,ref,error}=require('../party/policy'),{digest}=require('../governance/content'),P=require('./policy');
const parse=v=>typeof v==='string'?JSON.parse(v):v,sha=b=>createHash('sha256').update(b).digest('hex');
function checked(v,h){const d=parse(v);if(digest(d)!==h)throw error('STORED_CONTENT_MISMATCH',503);return d;}
function createMediaService(db,{resolvePrincipal=async()=>null,env={},storageFactory,moderationFactory,marking}={}){
 const supply=require('../works/repository').createSupplyRepository(db,{resolvePrincipal,maxAssetBytes:50*1024*1024}),production=require('../production/repository').createProductionRepository(db,{resolvePrincipal});
 const caps=new WeakMap(),storage=storageFactory?storageFactory():require('../providers/private-storage').createPrivateStorage({env,repository:require('../providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>caps.get(context)?.operation===operation&&caps.get(context)?.key===key});
 const moderator=moderationFactory?moderationFactory():require('./moderation-provider').createModerationProvider(db,env),jobs=require('../../infrastructure/jobs/repository').createJobRepository(db);
 async function actor(ctx){const principal=await resolvePrincipal(ctx);if(!principal)throw error('AUTHENTICATION_REQUIRED',401);const [[a]]=await db.execute("SELECT * FROM identity_accounts WHERE subject_ref=? AND current_status='ACTIVE'",[ref(principal.subject_ref)]);if(!a)throw error('ACCOUNT_NOT_ACTIVE',403);return a;}
 async function source(ctx,i){let r;
  if(i.source_kind==='SUPPLY_ASSET'){r=await supply.assetAccess(ctx,id(i.source_id),id(i.party_id));if(r.owner_party_id!==i.party_id||!['AVATAR_MATERIAL','WORK_CONTENT'].includes(r.purpose))throw error('MEDIA_SOURCE_FORBIDDEN',403);}
  else if(i.source_kind==='PRODUCTION_VERSION'){const file=await production.content(ctx,{record_id:id(i.source_id),party_id:id(i.party_id),variant:i.variant});await production.assertMediaProducer(ctx,{project_id:file.project_id,party_id:i.party_id});r={id:file.id,project_id:file.project_id,...file.data};}
  else throw error('MEDIA_SOURCE_INVALID',400);
  await db.withTransaction(tx=>require('../privacy/restrictions').assertUnrestricted(tx,'ASSET',r.id));return r;
 }
 async function storageDescriptor(){const info=await storage.inspect?.();if(!info?.configured||!info.implemented||!storage.identity)throw error('MEDIA_STORAGE_NOT_CONFIGURED',503);return {identity:storage.identity,config_revision:info.config_revision};}
 async function descriptor(kind){return {storage:await storageDescriptor(),processor:kind==='MODERATE_FILE'?await moderator.inspect():{processor:'ffmpeg-drawtext-v1',revision:env.MEDIA_PROCESSOR_REVISION||null,ffmpeg:env.MEDIA_FFMPEG||null,ffprobe:env.MEDIA_FFPROBE||null,font:env.MEDIA_FONT_FILE||null}};}
 async function call(operation,key,fn){const c={};caps.set(c,{operation,key});try{return await fn(c);}finally{caps.delete(c);}}
 async function readBody(file){const b=await call('get',file.object_key,c=>storage.getBuffer(file.object_key,c));if(!Buffer.isBuffer(b)||b.length!==file.byte_size||sha(b)!==file.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);return b;}
 async function dto(r,tx){const j=tx?(await tx.execute('SELECT status FROM platform_jobs WHERE id=?',[r.job_id]))[0][0]:await jobs.get(r.job_id);return {id:r.id,task_kind:r.task_kind,source_kind:r.source_kind,source_id:r.source_id,current_status:r.current_status,job_status:j?.status||null,result_sha256:r.result_sha256||null,result:r.result_json?checked(r.result_json,r.result_sha256):null};}
 return {
 async create(ctx,i){
  if(!['MARK_VIDEO','MODERATE_FILE'].includes(i.task_kind)||!['preview','final'].includes(i.variant))throw error('MEDIA_ACTION_INVALID',400);
  const a=await actor(ctx),f=await source(ctx,i),rule=await db.withTransaction(tx=>P.load(tx,i.policy_rule_id));
  if(i.task_kind==='MARK_VIDEO'&&f.media_type!=='video/mp4')throw error('MEDIA_FORMAT_UNSUPPORTED',409);
  const config=await descriptor(i.task_kind);if(i.task_kind==='MARK_VIDEO'&&(!config.processor.revision||!config.processor.ffmpeg||!config.processor.ffprobe||!config.processor.font))throw error('MEDIA_PROCESS_NOT_CONFIGURED',503);
  if(i.task_kind==='MODERATE_FILE'&&(!config.processor.implemented||!config.processor.configured||rule.rules.provider_code!=='aliyun-green'))throw error('MODERATION_NOT_ENABLED',503);
  const input={...i,account_id:a.id,source_file_id:f.id,source_sha256:f.content_sha256,source_bytes:f.byte_size,policy:rule,config};delete input.operation_key;
  return db.withTransaction(async tx=>{
   const [[active]]=await tx.execute("SELECT id FROM identity_accounts WHERE id=? AND current_status='ACTIVE' FOR UPDATE",[a.id]);if(!active)throw error('ACCOUNT_NOT_ACTIVE',403);
   const cmd=digest([a.id,'MEDIA',ref(i.operation_key)]);const [[old]]=await tx.execute('SELECT * FROM media_tasks WHERE command_key=? FOR UPDATE',[cmd]);if(old){if(old.request_sha256!==digest(input))throw error('IDEMPOTENCY_CONFLICT',409);return dto(old,tx);}
   const key=randomUUID(),job=await jobs.enqueue({task_type:'MEDIA_FILE_PROCESS',business_key:key,payload_ref:key,provider:i.task_kind==='MODERATE_FILE'?'aliyun-green':null,max_attempts:120},tx);
   await tx.execute('INSERT INTO media_tasks(id,command_key,account_id,party_id,task_kind,source_kind,source_id,request_json,request_sha256,job_id) VALUES (?,?,?,?,?,?,?,?,?,?)',[key,cmd,a.id,i.party_id,i.task_kind,i.source_kind,i.source_id,JSON.stringify(input),digest(input),job.id]);
   return {id:key,task_kind:i.task_kind,source_kind:i.source_kind,source_id:i.source_id,current_status:'QUEUED',job_status:'PENDING',result_sha256:null,result:null};
  });
 },
 async read(ctx,key){const a=await actor(ctx),[[r]]=await db.execute('SELECT * FROM media_tasks WHERE id=? AND account_id=?',[id(key),a.id]);if(!r)throw error('MEDIA_TASK_NOT_FOUND',404);return dto(r);},
 async review(ctx,i){
  const a=await actor(ctx);if(!['APPROVE','REJECT'].includes(i.decision)||typeof i.reason!=='string'||!i.reason.trim()||i.reason.length>1000)throw error('MEDIA_REVIEW_INVALID',400);
  return db.withTransaction(async tx=>{
   const [[r]]=await tx.execute('SELECT * FROM media_tasks WHERE id=? FOR UPDATE',[id(i.task_id)]);if(!r)throw error('MEDIA_TASK_NOT_FOUND',404);
   const grant=r.source_kind==='PRODUCTION_VERSION'?'PRODUCTION_REVIEW':'SUPPLY_REVIEW_CONTENT';
   if(!await require('../governance/operator-access').authorizeOperator(tx,{account_id:a.id,action:grant}))throw error('MEDIA_REVIEW_FORBIDDEN',403);
   const [[member]]=await tx.execute("SELECT id FROM party_memberships WHERE account_id=? AND party_id=? AND current_status='ACTIVE' FOR SHARE",[a.id,r.party_id]);if(a.id===r.account_id||member)throw error('SELF_REVIEW_FORBIDDEN',403);
   if(r.task_kind!=='MODERATE_FILE'||r.current_status!=='EXECUTED'||!r.result_json)throw error('MODERATION_RESULT_REQUIRED',409);
   const result=checked(r.result_json,r.result_sha256),request=checked(r.request_json,r.request_sha256),operation=ref(i.operation_key);
   if(result.manual_review?.operation_key===operation){if(result.manual_review.account_id!==a.id||result.manual_review.decision!==i.decision||result.manual_review.reason!==i.reason)throw error('IDEMPOTENCY_CONFLICT',409);return dto(r,tx);}
   if(r.result_sha256!==i.result_sha256)throw error('CONFIRMATION_VERSION_MISMATCH',409);
   if(result.decision!=='REVIEW'||typeof result.manual_review!=='string')throw error('MEDIA_REVIEW_NOT_PENDING',409);
   const rule=await P.load(tx,request.policy.id);if(rule.sha256!==result.policy_sha256)throw error('MEDIA_CONFIGURATION_CHANGED',409);
   const [[owner]]=await tx.execute("SELECT id FROM identity_accounts WHERE id=? AND current_status='ACTIVE' FOR SHARE",[r.account_id]);if(!owner)throw error('ACCOUNT_NOT_ACTIVE',403);
   const [[file]]=await tx.execute('SELECT * FROM '+(r.source_kind==='SUPPLY_ASSET'?'supply_assets':'production_records')+' WHERE id=? FOR SHARE',[result.file_id]);if(!file||file.current_status!=='READY'||(r.source_kind==='SUPPLY_ASSET'?file.content_sha256:checked(file.data_json,file.data_sha256).content_sha256)!==result.output_sha256)throw error('MEDIA_SOURCE_CHANGED',409);
   const next={...result,automated_decision:'REVIEW',decision:i.decision==='APPROVE'?'PASS':'REJECT',manual_review:{account_id:a.id,decision:i.decision,reason:i.reason,operation_key:operation}};
   await tx.execute('UPDATE media_tasks SET result_json=?,result_sha256=? WHERE id=?',[JSON.stringify(next),digest(next),r.id]);return dto({...r,result_json:next,result_sha256:digest(next)},tx);
  });
 },
 async readForReview(ctx,key){const a=await actor(ctx);return db.withTransaction(async tx=>{const [[r]]=await tx.execute('SELECT * FROM media_tasks WHERE id=?',[id(key)]);if(!r)throw error('MEDIA_TASK_NOT_FOUND',404);const grant=r.source_kind==='PRODUCTION_VERSION'?'PRODUCTION_REVIEW':'SUPPLY_REVIEW_CONTENT';if(!await require('../governance/operator-access').authorizeOperator(tx,{account_id:a.id,action:grant}))throw error('MEDIA_REVIEW_FORBIDDEN',403);return dto(r,tx);});},
 async run(job){
  let r;
  async function fenced(tx){const [[lease]]=await tx.execute("SELECT id FROM platform_jobs WHERE id=? AND status='RUNNING' AND lease_token=? AND lease_owner=? AND lease_until>CURRENT_TIMESTAMP(6) FOR UPDATE",[job.id,job.lease_token,job.lease_owner]);if(!lease)throw error('LEASE_LOST',409);const [[row]]=await tx.execute('SELECT * FROM media_tasks WHERE id=? AND job_id=? FOR UPDATE',[job.payload_ref,job.id]);if(!row)throw error('MEDIA_TASK_NOT_FOUND',404);return row;}
  try{
   r=await db.withTransaction(fenced);if(r.current_status==='EXECUTED')return {status:'SUCCEEDED',result_ref:r.id};const i=checked(r.request_json,r.request_sha256);
   // A restarted moderation task with unknown submission outcome must not submit again.
   if(r.task_kind==='MODERATE_FILE'&&job.attempts>1&&!job.provider_task_id)throw error('MODERATION_SUBMISSION_NEEDS_REVIEW',409);
   const ctx={media_worker_account:r.account_id},a=await actor(ctx);if(a.id!==r.account_id)throw error('MEDIA_ACTOR_MISMATCH',403);
   const f=await source(ctx,i),policy=await db.withTransaction(tx=>P.load(tx,i.policy.id));if(policy.sha256!==i.policy.sha256||f.id!==i.source_file_id||f.content_sha256!==i.source_sha256||f.byte_size!==i.source_bytes)throw error('MEDIA_SOURCE_CHANGED',409);
   if(digest(await descriptor(r.task_kind))!==digest(i.config))throw error('MEDIA_CONFIGURATION_CHANGED',409);
   const body=await readBody(f);let result;
   if(r.task_kind==='MODERATE_FILE'){
    const reply=await moderator.run({media_type:f.media_type,body,object_key:f.object_key,data_id:r.id,provider_task_id:job.provider_task_id});
    if(reply.pending===true){if(!reply.provider_task_id)throw error('MODERATION_RESULT_UNKNOWN',503);await jobs.saveProviderTask(job,reply.provider_task_id);return {status:'RETRY',error_code:'MODERATION_PENDING'};}
    if(reply.automated!==true||!['PASS','REVIEW','REJECT'].includes(reply.decision)||!reply.provider_request_id)throw error('MODERATION_RESULT_UNKNOWN',503);
    result={file_id:f.id,output_sha256:f.content_sha256,policy_sha256:policy.sha256,decision:reply.decision,provider_request_id:reply.provider_request_id,manual_review:'STILL_REQUIRED'};
   }else{
    if(job.attempts>1)throw error('MEDIA_OUTPUT_RECONCILIATION_REQUIRED',409);
    const processed=await (marking||require('./marking').markVideo)(body,{ffmpeg:env.MEDIA_FFMPEG,ffprobe:env.MEDIA_FFPROBE,fontFile:env.MEDIA_FONT_FILE,ai_label:policy.rules.ai_label,preview_label:policy.rules.preview_label,variant:i.variant,policy_sha256:policy.sha256});
    if(!Buffer.isBuffer(processed.body)||processed.receipt?.output_sha256!==sha(processed.body)||processed.receipt?.source_sha256!==sha(body))throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
    await source(ctx,i);await db.withTransaction(fenced);
    let reserved;if(r.source_kind==='SUPPLY_ASSET')reserved=await supply.reserveAsset(ctx,{party_id:i.party_id,purpose:f.purpose,media_type:'video/mp4',body:processed.body,operation_key:r.id});
    else reserved=await production.reserveFile(ctx,{party_id:i.party_id,project_id:f.project_id,media_type:'video/mp4',body:processed.body,operation_key:r.id});
    const record=reserved.asset||reserved.record,out=record.data||record;if(out.current_status==='READY'||record.current_status==='READY')throw error('MEDIA_OUTPUT_RECONCILIATION_REQUIRED',409);
    const saved=await call('put',out.object_key,c=>storage.put({key:out.object_key,body:processed.body,contentType:'video/mp4',isPrivate:true},c));if(saved.key!==out.object_key||saved.sha256!==sha(processed.body)||saved.size!==processed.body.length)throw error('PRIVATE_CONTENT_MISMATCH',503);
    const stored=await call('get',out.object_key,c=>storage.getBuffer(out.object_key,c));if(!Buffer.isBuffer(stored)||sha(stored)!==sha(processed.body))throw error('PRIVATE_CONTENT_MISMATCH',503);
    if(r.source_kind==='SUPPLY_ASSET')await supply.finishAsset(ctx,record.id,true);else await production.finishFile(ctx,{record_id:record.id,party_id:i.party_id,success:true});
    result={...processed.receipt,file_id:record.id};
   }
   const current=await source(ctx,i);if(current.id!==f.id||current.content_sha256!==f.content_sha256)throw error('MEDIA_SOURCE_CHANGED',409);
   await db.withTransaction(async tx=>{await fenced(tx);const [[active]]=await tx.execute("SELECT id FROM identity_accounts WHERE id=? AND current_status='ACTIVE' FOR SHARE",[r.account_id]);if(!active)throw error('ACCOUNT_NOT_ACTIVE',403);const livePolicy=await P.load(tx,i.policy.id);if(livePolicy.sha256!==i.policy.sha256)throw error('MEDIA_CONFIGURATION_CHANGED',409);await tx.execute("UPDATE media_tasks SET current_status='EXECUTED',result_json=?,result_sha256=? WHERE id=?",[JSON.stringify(result),digest(result),r.id]);});
   return {status:'SUCCEEDED',result_ref:r.id};
  }catch(e){if(e.code==='LEASE_LOST')throw e;return {status:'BLOCKED',error_code:/^(MEDIA_|MODERATION_|PRIVATE_|PROVIDER_|CONTENT_|ACCOUNT_)[A-Z_]+$/.test(e.code||'')?e.code:'MEDIA_PROCESS_NEEDS_REVIEW'};}
 }
 };
}
function createMediaHandlers(db,options={}){
 const resolvePrincipal=async ctx=>{const [[a]]=await db.execute("SELECT subject_ref FROM identity_accounts WHERE id=? AND current_status='ACTIVE'",[ctx.media_worker_account]);return a?{subject_ref:a.subject_ref}:null;};
 const service=createMediaService(db,{...options,resolvePrincipal});return new Map([['MEDIA_FILE_PROCESS',{execute:service.run,recover:service.run}]]);
}
module.exports={createMediaService,createMediaHandlers};
