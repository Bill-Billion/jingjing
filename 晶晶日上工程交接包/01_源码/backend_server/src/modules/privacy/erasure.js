'use strict';
const {digest}=require('../governance/content');
const {checked}=require('./execution');
const {error}=require('../party/policy');
const one=async(tx,q,a=[])=>(await tx.execute(q,a))[0][0];
function storageFor(db,{env={},storageFactory}={}){
 const grants=new WeakMap();
 const storage=storageFactory?storageFactory():require('../providers/private-storage').createPrivateStorage({
  env,repository:require('../providers/readiness').createReadinessRepository(db),
  authorize:async({operation,key,context})=>operation==='remove'&&grants.get(context)===key,
 });
 const descriptor=async()=>{
  const info=await storage.inspect?.();
  if(!info||!storage.identity||!info.implemented||!info.configured||typeof info.config_revision!=='string')throw error('PRIVACY_STORAGE_NOT_CONFIGURED',503);
  return {provider_code:storage.identity.provider_code,environment:storage.identity.environment,config_revision:info.config_revision};
 };
 return {descriptor,async erase(key,sha){const ctx={};grants.set(ctx,key);try{return await storage.eraseCurrent(key,sha,ctx);}finally{grants.delete(ctx);}}};
}
function createPrivacyHandlers(db,options={}){
 const store=storageFor(db,options);
 async function state(tx,job){
  const lease=await one(tx,"SELECT id FROM platform_jobs WHERE id=? AND task_type='PRIVACY_FILE_ERASURE' AND payload_ref=? AND status='RUNNING' AND lease_token=? AND lease_owner=? AND lease_until>CURRENT_TIMESTAMP(6) FOR UPDATE",[job.id,job.payload_ref,job.lease_token,job.lease_owner]);
  if(!lease)throw error('LEASE_LOST',409);
  const r=await one(tx,'SELECT * FROM privacy_executions WHERE id=? FOR UPDATE',[job.payload_ref]);
  if(!r||r.action_code!=='FILE_ERASURE'||r.job_id!==job.id||!['QUEUED','EXECUTED'].includes(r.current_status))throw error('PRIVACY_JOB_MISMATCH',409);
  r.payload=checked(r.payload_json,r.payload_sha256);if(r.current_status!=='EXECUTED'){const pol=await require('./execution').policy(tx,r.payload.policy.id,'FILE_ERASURE');if(pol.sha256!==r.payload.policy.sha256)throw error('PRIVACY_POLICY_CHANGED',409);}return r;
 }
 async function run(job){
  try{
   const r=await db.withTransaction(tx=>state(tx,job));if(r.current_status==='EXECUTED')return {status:'SUCCEEDED',result_ref:r.id};
   const snapshot=r.payload.snapshot;
   if(digest(snapshot.storage)!==digest(await store.descriptor()))throw error('PRIVACY_STORAGE_CONFIGURATION_CHANGED',409);
   const result=await store.erase(snapshot.object_key,snapshot.content_sha256);
   if(result?.key!==snapshot.object_key||result?.current_object_absent!==true||result?.scope!=='CURRENT_OBJECT_ONLY')throw error('PRIVACY_ERASURE_NOT_CONFIRMED',409);
   await db.withTransaction(async tx=>{
    const current=await state(tx,job);if(current.current_status==='EXECUTED')return;
    const asset=await one(tx,'SELECT * FROM supply_assets WHERE id=? FOR UPDATE',[current.target_id]);
    if(!asset||asset.current_status!=='ERASURE_PENDING'||asset.object_key!==snapshot.object_key||asset.content_sha256!==snapshot.content_sha256)throw error('PRIVACY_TARGET_CHANGED',409);
    const data={effect:'CURRENT_OBJECT_ABSENT',versions_and_backups:'REVIEW_REQUIRED',request_completion:'NOT_CONFIRMED'};
    await tx.execute("UPDATE supply_assets SET current_status='ERASED' WHERE id=?",[asset.id]);
    await tx.execute("UPDATE privacy_tombstones SET current_status='CURRENT_OBJECT_ABSENT' WHERE asset_id=? AND execution_id=?",[asset.id,current.id]);
    await tx.execute("UPDATE privacy_executions SET current_status='EXECUTED',object_version=object_version+1,result_json=?,result_sha256=? WHERE id=?",[JSON.stringify(data),digest(data),current.id]);
    // Atomic result audit; a database failure leaves the task recoverable by
    // checking the same object, without asserting whole-request completion.
    await tx.execute("UPDATE privacy_requests SET current_status='FOLLOW_UP',object_version=object_version+1 WHERE id=?",[current.request_id]);
    await tx.execute("INSERT INTO privacy_events(id,request_id,actor_account_id,event_code,object_version,message) SELECT UUID(),id,account_id,'CURRENT_OBJECT_ERASED',object_version,'当前存储对象已确认不可读；历史版本及备份仍待核对' FROM privacy_requests WHERE id=?",[current.request_id]);
   });
   return {status:'SUCCEEDED',result_ref:r.id};
  }catch(e){if(e.code==='LEASE_LOST')throw e;return {status:'BLOCKED',error_code:['PRIVACY_STORAGE_CONFIGURATION_CHANGED','PRIVACY_ERASURE_NOT_CONFIRMED','PRIVACY_TARGET_CHANGED'].includes(e.code)?e.code:'PRIVACY_ERASURE_NEEDS_REVIEW'};}
 }
 return new Map([['PRIVACY_FILE_ERASURE',{execute:run,recover:run}]]);
}
module.exports={storageFor,createPrivacyHandlers};
