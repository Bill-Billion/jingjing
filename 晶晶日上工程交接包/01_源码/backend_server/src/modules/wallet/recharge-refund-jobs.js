'use strict';
// Durable internal tasks; registration and provider adapters remain explicitly disabled by default.
const A=require('../artists/context'),C=require('./context'),{shape,id,label,error}=require('../party/policy');
const TYPE='WALLET_RECHARGE_REFUND';
async function fence(tx,r,job){
 const stored=await A.one(tx,"SELECT * FROM platform_jobs WHERE id=? AND status='RUNNING' AND lease_owner=? AND lease_token=? AND lease_until>CURRENT_TIMESTAMP(6) FOR UPDATE",[id(job.id),job.lease_owner,job.lease_token]);
 if(!stored)throw error('LEASE_LOST',409);
 if(stored.task_type!==TYPE||stored.business_key!==r.id||stored.payload_ref!==r.id||stored.provider!==r.data.binding.provider||r.data.dispatch_job_id!==stored.id)throw error('CUSTODY_REFUND_TASK_MISMATCH',409);
 return stored;
}
function methods({db,run,locked,independent,guardian}){
 const jobs=require('../../infrastructure/jobs/repository').createJobRepository(db);
 return {
 async schedule(ctx,i){
  shape(i,['record_id','expected_version','operation_key']);
  return run(ctx,async(tx,a)=>{const r=await locked(tx,id(i.record_id));await independent(tx,a,r);
   return C.command(tx,a,'RECHARGE_REFUND_SCHEDULE',i,async()=>{
    A.match(r,i.expected_version);
    if(!['APPROVED','SUBMITTING','UNKNOWN'].includes(r.current_status))throw error('CUSTODY_REFUND_NOT_SCHEDULABLE',409);
    if(r.current_status==='APPROVED')await guardian.current(tx,r);
    const job=await jobs.enqueue({task_type:TYPE,business_key:r.id,provider:r.data.binding.provider,payload_ref:r.id,max_attempts:10},tx);
    if(r.data.dispatch_job_id&&r.data.dispatch_job_id!==job.id)throw error('CUSTODY_REFUND_TASK_MISMATCH',409);
    const record=r.data.dispatch_job_id?r:await C.save(tx,a,r,r.current_status,{...r.data,dispatch_job_id:job.id},'RECHARGE_REFUND_TASK_SCHEDULED');
    return {record,job_id:job.id};
   });
  });
 },
 async retryTask(ctx,i){
  shape(i,['record_id','expected_version','reason','operation_key']);label(i.reason,2000);
  return run(ctx,async(tx,a)=>{const r=await locked(tx,id(i.record_id));await independent(tx,a,r);
   return C.command(tx,a,'RECHARGE_REFUND_TASK_RETRY',i,async()=>{
    A.match(r,i.expected_version);
    if(!r.data.dispatch_job_id||!['APPROVED','SUBMITTING','UNKNOWN','SUCCEEDED','CLOSED','CANCELLED','REJECTED'].includes(r.current_status))throw error('CUSTODY_REFUND_NOT_SCHEDULABLE',409);
    if(r.current_status==='APPROVED')await guardian.current(tx,r);
    await jobs.manualRetry(r.data.dispatch_job_id,{actor_ref:a.id,reason_ref:r.id,additional_attempts:10},tx);
    return C.save(tx,a,r,r.current_status,{...r.data,task_retry:{by:a.id,reason:i.reason,at:await A.now(tx)}},'RECHARGE_REFUND_TASK_RETRY_AUTHORIZED');
   });
  });
 },
 async taskUnknown(ctx,{record_id,job}){
  return run(ctx,async(tx,a)=>{const r=await locked(tx,id(record_id));await independent(tx,a,r);await fence(tx,r,job);
   if(!['SUBMITTING','UNKNOWN'].includes(r.current_status))throw error('CUSTODY_REFUND_NOT_SUBMITTED',409);
   return r.current_status==='UNKNOWN'?r:C.save(tx,a,r,'UNKNOWN',{...r.data,dispatch_error:'OUTCOME_UNKNOWN'},'RECHARGE_REFUND_TRANSPORT_UNKNOWN');
  });
 }
 };
}
module.exports={TYPE,fence,methods};
