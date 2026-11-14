'use strict';
const {randomUUID}=require('node:crypto'),{error}=require('../party/policy');
const VERSION='CONTRACT_20261029';
const modern=x=>x?.acceptance_policy===VERSION;
function validate(x,{required=false}={}){if(x.acceptance_policy!==undefined&&!modern(x)||required&&!modern(x)||modern(x)&&x.acceptance_hours!==48)throw error('ACCEPTANCE_CONTRACT_MISMATCH',409);return x;}
function newSale(x){return validate(x,{required:process.env.ACCEPTANCE_CONTRACT_POLICY===VERSION});}
async function schedule(tx,task,record,start){
 require('./policy').instant(start);const deadline_at=new Date(Date.parse(start)+48*3600000).toISOString();
 const job=await require('../../infrastructure/jobs/repository').createJobRepository({}).enqueue({task_type:task,business_key:randomUUID(),payload_ref:record,max_attempts:20},tx);
 await tx.execute('UPDATE platform_jobs SET next_run_at=? WHERE id=?',[deadline_at.slice(0,23).replace('T',' '),job.id]);
 return {acceptance_started_at:start,deadline_at,job_id:job.id};
}
module.exports={VERSION,modern,validate,newSale,schedule};
