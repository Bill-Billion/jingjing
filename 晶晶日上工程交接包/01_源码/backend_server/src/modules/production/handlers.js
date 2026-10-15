 'use strict';
const {createProductionRepository}=require('./repository');
const {createProductionProvider}=require('./provider');
const {ref}=require('../party/policy');
function createProductionHandlers(db,{env={},provider=createProductionProvider(db,env)}={}){
 const repo=createProductionRepository(db);
 async function run(job,ctx,recover){
  try{
   const state=await repo.jobContext(job),r=state.request;if(r.current_status==='SUCCEEDED')return {status:'SUCCEEDED',result_ref:r.id};
   await provider.assertReady();const config=await provider.descriptor();if(['provider_code','environment','config_revision'].some(k=>config[k]!==r.data[k]))return {status:'BLOCKED',error_code:'GENERATION_CONFIGURATION_CHANGED'};
   const input={request_key:job.id,operation:r.data.operation,project_id:r.project_id,avatar_id:r.data.avatar_id,consent_id:r.data.consent_id,script_version_id:r.data.script_version_id,upstream_asset_ref:state.asset?.data.upstream_asset_ref||null,task_id:job.provider_task_id||r.data.upstream_task_id};
   // Repeat delivery reconciles using the durable request key; never resubmit on unknown outcome.
   const result=await provider[recover?'query':'submit'](input);if(result?.request_key!==job.id)return {status:'BLOCKED',error_code:'GENERATION_RESULT_MISMATCH'};
   if(result.status==='PENDING'){ref(result.task_id);await ctx.saveProviderTask(result.task_id);}
   const saved=await repo.saveJobObservation(job,result);
   return saved.current_status==='SUCCEEDED'?{status:'SUCCEEDED',result_ref:saved.id}:{status:'RETRY',error_code:'GENERATION_PENDING'};
  }catch(e){const code=['PRODUCTION_ORDER_BLOCKED','PRODUCTION_CONSENT_NOT_AVAILABLE','PRODUCTION_LICENSE_NOT_READY','SCRIPT_VERSION_CHANGED','PROVIDER_NOT_IMPLEMENTED','PROVIDER_NOT_CONFIGURED','PROVIDER_NOT_VERIFIED','LEASE_LOST'].includes(e.code)?e.code:'GENERATION_OUTCOME_UNKNOWN';if(code==='LEASE_LOST')throw e;return {status:'BLOCKED',error_code:code};}
 }
 return new Map([['PRODUCTION_DIGITAL_HUMAN',{execute:(j,c)=>run(j,c,false),recover:(j,c)=>run(j,c,true)}],['CONSENT_WITHDRAWAL_REVIEW',{execute:async job=>{await repo.markConsentWithdrawal(job.payload_ref.replace(/^consent:/,''));return {status:'SUCCEEDED',result_ref:job.payload_ref};}}]]);
}
module.exports={createProductionHandlers};
