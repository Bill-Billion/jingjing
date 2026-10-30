"use strict";
const A=require('../artists/context'),{digest}=require('../governance/content'),{id}=require('../party/policy');
const {createJobRepository}=require('../../infrastructure/jobs/repository');
async function schedule(tx,account,config){
 const first=await A.one(tx,"SELECT MIN(LEAST(expires_at,DATE_ADD(recorded_at,INTERVAL ? DAY))) at FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[config.history_days,account]);if(!first?.at)return;
 const at=A.instant(first.at),job=await createJobRepository(null).enqueue({task_type:'COLLECTION_HISTORY_EXPIRE',business_key:digest([account,at]),payload_ref:JSON.stringify({account_id:account}),max_attempts:5},tx);
 if(job.status==='PENDING')await tx.execute("UPDATE platform_jobs SET next_run_at=? WHERE id=? AND status='PENDING'",[at.slice(0,23).replace('T',' '),job.id]);
}
async function ensure(tx,account,config){
 const first=await A.one(tx,"SELECT MIN(LEAST(expires_at,DATE_ADD(recorded_at,INTERVAL ? DAY))) at FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[config.history_days,account]);if(!first?.at)return;
 const at=A.instant(first.at).slice(0,23).replace('T',' ');
 if(!await A.one(tx,"SELECT id FROM platform_jobs WHERE task_type='COLLECTION_HISTORY_EXPIRE' AND JSON_UNQUOTE(JSON_EXTRACT(payload_ref,'$.account_id'))=? AND status IN ('PENDING','RUNNING','RETRY','BLOCKED','FAILED') AND next_run_at<=? LIMIT 1",[account,at]))await schedule(tx,account,config);
}
function createCollectionHandlers(db,{env={}}={}){
 const config=require('./policy').settings(env);
 return new Map([['COLLECTION_HISTORY_EXPIRE',{async execute(job){const input=JSON.parse(job.payload_ref);id(input.account_id);return db.withTransaction(async tx=>{
  await require('./repository').state(tx,input.account_id);await require('../wallet/jobs').fence(tx,job);
  await require('./repository').prune(tx,input.account_id,config);await schedule(tx,input.account_id,config);return {status:'SUCCEEDED',result_ref:'collection-history-pruned'};
 });}}]]);
}
module.exports={ensure,schedule,createCollectionHandlers};
