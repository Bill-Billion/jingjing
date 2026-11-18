'use strict';
// Explicit synthetic custody receipt + one fenced task. Never registers a live provider.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server'),load=p=>require(path.join(backend,p));
require(path.join(backend,'scripts/test-network-guard.cjs'));
async function main(){
 const [directory,id,mode]=process.argv.slice(2),out=path.resolve(directory||'');
 assert.equal(process.argv.length,5);assert.equal(path.dirname(out),path.join(root,'.local/stock-sandbox'));
 assert.match(path.basename(out),/^jx_test_stock_pm03_[a-f0-9]{24}$/);assert.match(id,/^[0-9a-f-]{36}$/);assert.ok(['LOST','SETTLE'].includes(mode));
 const state=JSON.parse(await fs.readFile(path.join(out,'state.json'),'utf8'));
 assert.equal(state.synthetic_only,true);assert.equal(state.mode,'BATCH');assert.equal(state.database,path.basename(out));assert.ok(Date.parse(state.expires_at)>Date.now());
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:state.database});
 try{
  const actor=state.accounts.reviewer,[[account]]=await db.execute('SELECT subject_ref FROM identity_accounts WHERE id=?',[actor.account_id]);
  assert(account);const ctx={subject_ref:account.subject_ref};
  const refunds=load('src/modules/wallet/recharge-refunds').createRechargeRefunds(db,{resolvePrincipal:async c=>c});
  const record=await refunds.read(ctx,{record_id:id,operations:true}),binding=record.data.binding;
  assert.equal(binding.provider,'synthetic-custodian');assert.equal(binding.environment,'SANDBOX');assert.equal(binding.merchant_id,'synthetic-guardian');assert.equal(binding.revision,'pm03');
  assert.ok(record.data.dispatch_job_id,'Schedule through the independent operator page first');
  const jobs=load('src/infrastructure/jobs/repository').createJobRepository(db),jobId=record.data.dispatch_job_id;
  // Claim only this explicitly selected test job; leave all other business jobs untouched.
  const job=await db.withTransaction(async tx=>{
   const [[j]]=await tx.execute('SELECT *,next_run_at<=CURRENT_TIMESTAMP(6) AS due FROM platform_jobs WHERE id=? FOR UPDATE',[jobId]);
   assert.equal(j.task_type,'WALLET_RECHARGE_REFUND');assert.equal(j.business_key,id);assert.equal(j.payload_ref,id);
   assert.ok(['PENDING','RETRY'].includes(j.status)&&j.due&&j.attempts<j.max_attempts,'Original job must be due and unclaimed');
   await tx.execute("UPDATE platform_jobs SET status='RUNNING',attempts=attempts+1,lease_owner=?,lease_token=?,lease_until=TIMESTAMPADD(SECOND,60,CURRENT_TIMESTAMP(6)) WHERE id=?",['pm03-synthetic-refund',randomUUID(),jobId]);
   return (await tx.execute('SELECT * FROM platform_jobs WHERE id=?',[jobId]))[0][0];
  });
  const proofFile=path.join(out,'synthetic-refund-'+id+'.json'),methods=[];
  const provider={binding,assertReady:async()=>{},refund:async(input,c)=>{
   assert.equal(c.idempotency_key,id);assert.equal(input.record_id,id);methods.push('refund');
   const proof={record_id:id,recharge_id:input.recharge_id,...binding,original_transaction_id:input.original_transaction_id,refund_transaction_id:'synthetic-pm03:'+id,currency:'CNY',amount_minor:input.amount_minor,occurred_at:await load('src/modules/artists/context').now(db),status:'SUCCEEDED'};
   await fs.writeFile(proofFile,'',{mode:0o600});await require('./test-fixtures/private-state.cjs').protectPrivateState(proofFile);await fs.writeFile(proofFile,JSON.stringify(proof));
   if(mode==='LOST')throw Error('SYNTHETIC_REPLY_LOST');return proof;
  },queryRefund:async(input,c)=>{assert.equal(c.idempotency_key,id);methods.push('query');return JSON.parse(await fs.readFile(proofFile,'utf8'));}};
  const handler=load('src/modules/wallet/recharge-refund-handler').createRechargeRefundHandler({refunds,operatorContext:async()=>ctx,providers:new Map([[binding.provider,provider]])});
  const outcome=await handler[job.attempts>1?'recover':'execute'](job,{});await jobs.finish(job,outcome);
  const current=await refunds.read(ctx,{record_id:id,operations:true});
  const result={synthetic_only:true,real_money:false,record_id:id,recharge_id:current.parent_id,job_id:jobId,mode,methods,status:current.current_status,job_status:(await jobs.get(jobId)).status,amount_minor:current.data.amount_minor};
  await fs.writeFile(path.join(out,'refund-simulation-'+id+'-'+mode+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await db.close()}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
