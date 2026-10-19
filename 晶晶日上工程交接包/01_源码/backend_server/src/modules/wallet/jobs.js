"use strict";
const {digest}=require('../governance/content');
const {error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),E=require('./earnings');
const {createJobRepository}=require('../../infrastructure/jobs/repository');
async function fence(tx,job){if(!await A.one(tx,"SELECT id FROM platform_jobs WHERE id=? AND status='RUNNING' AND lease_owner=? AND lease_token=? AND lease_until>CURRENT_TIMESTAMP(6) FOR SHARE",[job.id,job.lease_owner,job.lease_token]))throw error('LEASE_LOST',409);}
async function schedule(tx,account,at,cursor=''){
 const payload=JSON.stringify({account_id:account.id,at,cursor});
 const job=await createJobRepository(null).enqueue({task_type:'WALLET_MAINTENANCE',business_key:digest([account.id,at,cursor]),payload_ref:payload,max_attempts:5},tx);
 if(job.status==='PENDING')await tx.execute("UPDATE platform_jobs SET next_run_at=? WHERE id=? AND status='PENDING'",[at.slice(0,23).replace('T',' '),job.id]);
 return job;
}
function createWalletHandlers(db){return new Map([['WALLET_MAINTENANCE',{async execute(job){
 const input=JSON.parse(job.payload_ref),hint=await db.withTransaction(tx=>C.load(tx,input.account_id,'ACCOUNT','FOR SHARE'));
 // Paging bounds each lease. All business changes recheck the current lease in their transaction.
 const rows=(await db.execute("SELECT id,parent_id FROM wallet_records WHERE owner_party_id=? AND kind='EARNING' AND id>? ORDER BY id LIMIT 100",[hint.owner_party_id,input.cursor]))[0];
 for(const row of rows)await db.withTransaction(async tx=>{
  let order=null;if(row.parent_id){const raw=await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR UPDATE",[row.parent_id]);if(raw)order=E.checked(raw);}
  await C.account(tx,hint.owner_party_id);await fence(tx,job);const earning=await C.load(tx,row.id,'EARNING');
  if(order){await E.financial(tx,order);await E.issue(tx,null,order,await C.load(tx,earning.id,'EARNING'),await A.now(tx));}
 });
 await db.withTransaction(async tx=>{const account=await C.account(tx,hint.owner_party_id);await fence(tx,job);await require('./points').expire(tx,hint.owner_party_id);
 const at=rows.length===100?input.at:new Date(Date.parse(await A.now(tx))+3600000).toISOString();await schedule(tx,account,at,rows.length===100?rows[rows.length-1].id:'');
 });
 return {status:'SUCCEEDED',result_ref:hint.id};
 }}]]);}
// Explicit local/operator startup repair for accounts opened before automatic jobs existed.
async function seed(db){const rows=(await db.execute("SELECT id FROM wallet_records WHERE kind='ACCOUNT' AND current_status='ACTIVE' ORDER BY id"))[0];let count=0;
 for(const row of rows)await db.withTransaction(async tx=>{const a=await C.load(tx,row.id,'ACCOUNT');const pending=await A.one(tx,"SELECT id FROM platform_jobs WHERE task_type='WALLET_MAINTENANCE' AND JSON_UNQUOTE(JSON_EXTRACT(payload_ref,'$.account_id'))=? AND status IN ('PENDING','RETRY','RUNNING','BLOCKED','FAILED') LIMIT 1",[a.id]);if(!pending){await schedule(tx,a,await A.now(tx));count++;}});return {scheduled:count};}
module.exports={schedule,createWalletHandlers,seed,fence};
