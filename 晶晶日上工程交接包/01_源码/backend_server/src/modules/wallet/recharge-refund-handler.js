'use strict';
// Injection-only adapter boundary. No provider registration, credentials, URLs or live channel here.
const {TYPE}=require('./recharge-refund-jobs');
const {digest}=require('../governance/content');
function createRechargeRefundHandler({refunds,operatorContext,providers}){
 if(!refunds||typeof operatorContext!=='function'||!(providers instanceof Map))throw new Error('CUSTODY_REFUND_HANDLER_CONFIG_INVALID');
 async function process(job,context={},recover=false){
  const blocked=code=>({status:'BLOCKED',error_code:code}),retry=()=>({status:'RETRY',error_code:'CUSTODY_REFUND_QUERY_REQUIRED'});
  if(job.task_type!==TYPE||job.payload_ref!==job.business_key)return blocked('CUSTODY_REFUND_TASK_MISMATCH');
  if(context.signal?.aborted)return blocked('LEASE_LOST');
  const ctx=await operatorContext(job);
  const original=await refunds.read(ctx,{record_id:job.payload_ref,operations:true});
  if(['SUCCEEDED','CLOSED','CANCELLED','REJECTED'].includes(original.current_status)){
   const terminal=await refunds.claim(ctx,{record_id:original.id},original.data.binding,{task:job});
   if(!terminal.dispatch&&!terminal.reconcile)return {status:'SUCCEEDED',result_ref:original.id};
   return blocked('CUSTODY_REFUND_TASK_MISMATCH');
  }
  const provider=providers.get(job.provider);
  if(!provider||typeof provider.assertReady!=='function'||typeof provider.refund!=='function'||typeof provider.queryRefund!=='function')return blocked('CUSTODY_PROVIDER_NOT_CONNECTED');
  if(digest(provider.binding)!==digest(original.data.binding))return blocked('CUSTODY_RECEIPT_MISMATCH');
  await provider.assertReady();
  const claim=await refunds.claim(ctx,{record_id:original.id},provider.binding,{task:job}),r=claim.record;
  if(!claim.dispatch&&!claim.reconcile){
   if(['SUCCEEDED','CLOSED','CANCELLED','REJECTED'].includes(r.current_status))return {status:'SUCCEEDED',result_ref:r.id};
   return blocked('CUSTODY_REFUND_NOT_SUBMITTED');
  }
  if(context.signal?.aborted)return blocked('LEASE_LOST');
  // A stable original refund id is the only external idempotency/query key, even after job replacement.
  const request={record_id:r.id,recharge_id:r.parent_id,binding:r.data.binding,original_transaction_id:r.data.original_transaction_id,currency:r.data.currency,amount_minor:r.data.amount_minor};
  let proof;
  try{
   proof=await provider[claim.dispatch&&!recover?'refund':'queryRefund'](request,{signal:context.signal,idempotency_key:r.id});
  }catch{
   if(context.signal?.aborted)return blocked('LEASE_LOST');
   await refunds.taskUnknown(ctx,{record_id:r.id,job});return retry();
  }
  if(context.signal?.aborted)return blocked('LEASE_LOST');
  // A malformed/unverified observation must not settle a job or release funds.
  const settled=await refunds.applyVerifiedReceipt(proof,{task:job});
  return ['SUCCEEDED','CLOSED'].includes(settled.current_status)?{status:'SUCCEEDED',result_ref:r.id}:retry();
 }
 return Object.freeze({execute:(j,c)=>process(j,c,false),recover:(j,c)=>process(j,c,true)});
}
module.exports={createRechargeRefundHandler};
