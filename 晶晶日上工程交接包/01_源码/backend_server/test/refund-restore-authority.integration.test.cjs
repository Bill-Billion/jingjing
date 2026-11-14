'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('restored refund rechecks current authority, provider binding and receipt facts',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_refund_authority_'+randomBytes(7).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,restored;const restoreName=name+'_r';
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,buyer2,reviewer,outsider,trade,stock}=S;
  const grant=async(u,action,enabled=true,version=0)=>require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled,expected_version:version,expires_at:null,authority_ref:'synthetic:recharge-refund',reason:'isolated test only'});
  for(const u of [outsider,reviewer])await grant(u,'WALLET_RULE_REVIEW');for(const u of [buyer,reviewer])await grant(u,'WALLET_REFUND_REVIEW');
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal}),custody=require('../src/modules/wallet/custody').createCustodyLedger(db),R=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(db,{resolvePrincipal:S.resolvePrincipal});
  let rule=await W.createRule(outsider.ctx,{rule:require('./helpers/wallet-rule.cjs'),operation_key:key()});rule=await W.reviewRule(reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'synthetic independent rule',operation_key:key()});
  for(const u of [buyer,buyer2])await W.open(u.ctx,{party_id:u.personal_party_id,rule_id:rule.id,rule_sha256:rule.content_sha256,operation_key:key()});
  const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'v1'};
  const recharge=await db.withTransaction(tx=>custody.prepare(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,amount_minor:30000,operation_key:key()},binding));
  const topupProof={record_id:recharge.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic:'+key(),occurred_at:await require('../src/modules/artists/context').now(db),status:'SUCCEEDED'};await custody.applyVerifiedReceipt(topupProof);
  const proofAsset=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic mistaken topup evidence'),operation_key:key()});
  const summary=()=>W.summary(buyer.ctx,{party_id:buyer.personal_party_id}),read=r=>R.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id}),request=(amount,operation=key())=>R.request(buyer.ctx,{party_id:buyer.personal_party_id,recharge_id:recharge.id,amount_minor:amount,reason:'synthetic mistaken recharge',evidence_asset_ids:[proofAsset.id],operation_key:operation});
  const reviewInput=(r,amount=r.data.requested_minor,decision='APPROVE')=>({record_id:r.id,expected_version:r.object_version,decision,amount_minor:amount,reason:'synthetic independent case decision',checks:{identity_verified:true,source_verified:true,refund_basis_verified:true},operation_key:key()});
  const jobs=require('../src/infrastructure/jobs/repository').createJobRepository(db),{TYPE}=require('../src/modules/wallet/recharge-refund-jobs');
  const {createRechargeRefundHandler}=require('../src/modules/wallet/recharge-refund-handler'),{createWorker}=require('../src/worker/runner');
  const providerCalls=[],observations=new Map();let behavior='success',duringRefund=null;
  const provider={binding,assertReady:async()=>{},refund:async(input,ctx)=>{
   assert.equal(ctx.idempotency_key,input.record_id);providerCalls.push({method:'refund',id:input.record_id});
   const proof={record_id:input.record_id,recharge_id:input.recharge_id,...binding,original_transaction_id:input.original_transaction_id,refund_transaction_id:'synthetic-task:'+input.record_id,currency:'CNY',amount_minor:input.amount_minor,occurred_at:await require('../src/modules/artists/context').now(db),status:'SUCCEEDED'};
   observations.set(input.record_id,proof);
   if(duringRefund)await duringRefund(input);
   if(behavior==='lost')throw new Error('synthetic provider response lost; never expose this text');
   if(behavior==='bad')return {...proof,amount_minor:1};
   return proof;
  },queryRefund:async(input,ctx)=>{assert.equal(ctx.idempotency_key,input.record_id);providerCalls.push({method:'query',id:input.record_id});return observations.get(input.record_id);}};
  const providers=new Map([[binding.provider,provider]]),handler=createRechargeRefundHandler({refunds:R,operatorContext:async()=>reviewer.ctx,providers});
  const worker=createWorker({repository:jobs,handlers:new Map([[TYPE,handler]]),leaseMs:60000,pollMs:10});
  const approvedCase=async amount=>R.review(reviewer.ctx,reviewInput(await request(amount)));
  const schedule=r=>R.schedule(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,operation_key:key()});
  const count=(method,id)=>providerCalls.filter(x=>x.method===method&&x.id===id).length;
  // The seed creates other durable jobs too. Drive the real shared queue until THIS task is attempted.
  async function advance(jobId,instance=worker){
   const before=(await jobs.get(jobId)).attempts;
   for(let n=0;n<200;n++){await instance.tick();const current=await jobs.get(jobId);if(current.attempts>before)return current;}
   throw new Error('synthetic target task was not reached');
  }

  const B=require('../src/operations/backup'),{mysqlReady}=require('../src/http/operations'),evidence=[];
  const r0=await approvedCase(1000),q=await schedule(r0);behavior='lost';await advance(q.job_id);behavior='success';
  const original=await read(r0),originalWallet=await summary(),originalJob=await jobs.get(q.job_id),proof=observations.get(r0.id);
  assert.equal(original.current_status,'UNKNOWN');assert.equal(count('refund',original.id),1);
  const snapshot=await B.backup(db,{source_ref:'synthetic.refund.authority.restore'}),encryptionKey=randomBytes(32),sealed=B.seal(snapshot.payload,encryptionKey);
  await control.query('CREATE DATABASE '+mysql.escapeId(restoreName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  restored=await openDatabase({...env,MYSQL_DATABASE:restoreName});await B.restore(restored,B.unseal(sealed,encryptionKey),{expected_sha256:snapshot.manifest.payload_sha256});
  const R2=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(restored,{resolvePrincipal:S.resolvePrincipal}),W2=require('../src/modules/wallet/repository').createWalletRepository(restored,{resolvePrincipal:S.resolvePrincipal}),J2=require('../src/infrastructure/jobs/repository').createJobRepository(restored);
  const reread=()=>R2.read(buyer.ctx,{record_id:original.id,party_id:buyer.personal_party_id}),balance=()=>W2.summary(buyer.ctx,{party_id:buyer.personal_party_id});
  let readyHook=null,queryHook=null,readyCalls=0,queryCalls=0,sendCalls=0,grantVersion=1;
  const adapter={binding:{...binding},assertReady:async()=>{readyCalls++;if(readyHook)await readyHook();},refund:async()=>{sendCalls++;throw Error('synthetic restored send must never happen');},queryRefund:async(i,ctx)=>{
   queryCalls++;assert.equal(i.record_id,original.id);assert.equal(i.recharge_id,recharge.id);assert.equal(i.original_transaction_id,proof.original_transaction_id);assert.equal(ctx.idempotency_key,original.id);assert.equal(i.amount_minor,1000);
   return queryHook?queryHook(i):proof;
  }};
  const restoredProviders=new Map([[binding.provider,adapter]]),restoredHandler=createRechargeRefundHandler({refunds:R2,operatorContext:async()=>reviewer.ctx,providers:restoredProviders}),restoredWorker=createWorker({repository:J2,handlers:new Map([[TYPE,restoredHandler]]),leaseMs:60000,pollMs:10});
  async function operatorEnabled(enabled){const v=await require('../src/modules/governance/operator-access').maintainOperatorGrant(restored,{account_id:reviewer.account_id,action:'WALLET_REFUND_REVIEW',enabled,expires_at:null,expected_version:grantVersion,authority_ref:'synthetic:restored-authority',reason:'isolated current grant change'});grantVersion=v.object_version;}
  async function attempt(){
   let job=await J2.get(q.job_id);
   if(['BLOCKED','FAILED'].includes(job.status)){const r=await reread();await R2.retryTask(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,reason:'synthetic independent retry after checked cause',operation_key:key()});}
   job=await J2.get(q.job_id);if(job.status==='RETRY')await restored.execute('UPDATE platform_jobs SET next_run_at=CURRENT_TIMESTAMP(6) WHERE id=?',[job.id]);
   for(let n=0;n<50;n++){await restoredWorker.tick();const now=await J2.get(q.job_id);if(now.attempts>job.attempts)return now;}
   throw Error('synthetic restored task was not attempted');
  }
  async function held(){
   assert.equal((await reread()).current_status,'UNKNOWN');assert.deepEqual(await balance(),originalWallet);
   assert.equal(Number((await restored.execute("SELECT COUNT(*) n FROM wallet_records WHERE kind='RECHARGE_REFUND_RECEIPT' AND parent_id=?",[original.id]))[0][0].n),0);
   assert.equal(sendCalls,0);assert.equal(await mysqlReady(restored)(),false);
   assert.deepEqual(await read(original),original);assert.deepEqual(await summary(),originalWallet);assert.deepEqual(await jobs.get(q.job_id),originalJob);
  }
  await t.test('revoked independent authority blocks restored work and cannot authorize its retry; self-review still fails',async()=>{
   await operatorEnabled(false);const job=await attempt();assert.equal(job.status,'BLOCKED');assert.equal(readyCalls,0);assert.equal(queryCalls,0);
   const r=await reread(),i={record_id:r.id,expected_version:r.object_version,reason:'synthetic retry',operation_key:key()};
   await assert.rejects(R2.retryTask(reviewer.ctx,i),{code:'WALLET_OPERATOR_FORBIDDEN'});await assert.rejects(R2.retryTask(buyer.ctx,i),{code:'SELF_REVIEW_FORBIDDEN'});
   await held();await operatorEnabled(true);evidence.push({check:'revoked_and_self_authority_refused',case_id:r.id,query_count:0,reserved_minor:1000});
  });
  await t.test('authority revoked during provider readiness is rechecked before any original-request query',async()=>{
   readyHook=()=>operatorEnabled(false);const job=await attempt();readyHook=null;
   assert.equal(job.status,'BLOCKED');assert.equal(queryCalls,0);await held();await operatorEnabled(true);
   evidence.push({check:'authority_changed_during_readiness',query_count:0,reserved_minor:1000});
  });
  await t.test('missing adapter and changed merchant, revision or environment cannot reroute a restored refund',async()=>{
   restoredProviders.clear();let job=await attempt();assert.equal(job.last_error,'CUSTODY_PROVIDER_NOT_CONNECTED');await held();
   restoredProviders.set(binding.provider,adapter);
   for(const [field,value] of [['merchant_id','synthetic-other-merchant'],['revision','v2'],['environment','PRODUCTION'],['provider','synthetic-other-provider']]){
    adapter.binding={...binding,[field]:value};job=await attempt();assert.equal(job.last_error,'CUSTODY_RECEIPT_MISMATCH');assert.equal(queryCalls,0);await held();
   }
   adapter.binding={...binding};evidence.push({check:'provider_binding_changes_refused',variants:5,query_count:0,reserved_minor:1000});
  });
  await t.test('unready provider and configuration changed during readiness cannot proceed',async()=>{
   readyHook=async()=>{throw Object.assign(Error('synthetic readiness unavailable'),{code:'PROVIDER_NOT_READY'});};let job=await attempt();assert.equal(job.status,'BLOCKED');assert.equal(queryCalls,0);await held();
   readyHook=async()=>{adapter.binding={...binding,revision:'synthetic-changed-during-readiness'};};job=await attempt();assert.equal(job.status,'BLOCKED');assert.equal(queryCalls,0);await held();
   readyHook=null;adapter.binding={...binding};evidence.push({check:'readiness_and_config_race_refused',query_count:0,reserved_minor:1000});
  });
  await t.test('query transport loss and pending or unknown observations preserve reserved money and query only',async()=>{
   const first=queryCalls;queryHook=async()=>{throw Error('synthetic query transport lost');};let job=await attempt();assert.equal(job.status,'RETRY');await held();
   for(const status of ['PENDING','UNKNOWN']){queryHook=async()=>({...proof,status,refund_transaction_id:null});job=await attempt();assert.equal(job.status,'RETRY');await held();}
   queryHook=null;assert.equal(queryCalls-first,3);evidence.push({check:'transport_pending_unknown_keep_reservation',query_count:3,restored_send_count:0,reserved_minor:1000});
  });
  await t.test('wrong amount, merchant, source transaction and missing success reference never settle the restored case',async()=>{
   for(const patch of [{amount_minor:1},{merchant_id:'synthetic-wrong-merchant'},{original_transaction_id:'synthetic-wrong-source'},{refund_transaction_id:null}]){
    queryHook=async()=>({...proof,...patch});const job=await attempt();assert.equal(job.status,'BLOCKED');await held();
   }
   queryHook=null;evidence.push({check:'invalid_receipts_block_without_release',variants:4,restored_send_count:0,reserved_minor:1000});
  });
  await t.test('a lease lost while querying cannot settle; its replacement queries the same request and settles once',async()=>{
   queryHook=async()=>{await restored.execute('UPDATE platform_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?',[q.job_id]);return proof;};
   const stale=await attempt();assert.equal(stale.status,'RUNNING');await held();
   await assert.rejects(R2.applyVerifiedReceipt(proof,{task:stale}),{code:'LEASE_LOST'});
   queryHook=null;const completed=await attempt();assert.equal(completed.status,'SUCCEEDED');assert.equal((await reread()).current_status,'SUCCEEDED');
   assert.equal((await balance()).reserved_balance_minor,0);assert.equal(sendCalls,0);
   const receiptRows=(await restored.execute("SELECT id FROM wallet_records WHERE kind='RECHARGE_REFUND_RECEIPT' AND parent_id=?",[original.id]))[0];assert.equal(receiptRows.length,1);
   const settled=await balance(),finalCase=await reread();assert.deepEqual(await R2.applyVerifiedReceipt(proof),finalCase);
   await assert.rejects(R2.applyVerifiedReceipt({...proof,refund_transaction_id:'synthetic-conflicting-success'}),{code:'CUSTODY_REFUND_TERMINAL_CONFLICT'});
   await assert.rejects(R2.applyVerifiedReceipt({...proof,status:'UNKNOWN',refund_transaction_id:null}),{code:'CUSTODY_REFUND_TERMINAL_CONFLICT'});
   assert.deepEqual(await balance(),settled);assert.equal(await mysqlReady(restored)(),false);
   evidence.push({check:'lost_lease_then_same_request_terminal',case_id:original.id,job_id:q.job_id,restored_send_count:0,receipt_count:1,reserved_minor:0,terminal_conflicts_refused:true,quarantine_preserved:true});
  });
  await t.test('definitive CLOSED releases only the original hold and cannot later be overwritten by success',async()=>{
   const closedName=name+'_closed';let closedDb;
   try{
    await control.query('CREATE DATABASE '+mysql.escapeId(closedName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');closedDb=await openDatabase({...env,MYSQL_DATABASE:closedName});
    await B.restore(closedDb,B.unseal(sealed,encryptionKey),{expected_sha256:snapshot.manifest.payload_sha256});
    const RC=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(closedDb,{resolvePrincipal:S.resolvePrincipal}),JC=require('../src/infrastructure/jobs/repository').createJobRepository(closedDb),WC=require('../src/modules/wallet/repository').createWalletRepository(closedDb,{resolvePrincipal:S.resolvePrincipal});
    const closedProof={...proof,status:'CLOSED',refund_transaction_id:null};let closeQueries=0,closeSends=0;
    const p={binding,assertReady:async()=>{},refund:async()=>{closeSends++;throw Error('synthetic forbidden repeat send');},queryRefund:async(i,c)=>{closeQueries++;assert.equal(i.record_id,original.id);assert.equal(c.idempotency_key,original.id);return closedProof;}};
    const h=createRechargeRefundHandler({refunds:RC,operatorContext:async()=>reviewer.ctx,providers:new Map([[binding.provider,p]])});
    await closedDb.execute('UPDATE platform_jobs SET next_run_at=CURRENT_TIMESTAMP(6) WHERE id=?',[q.job_id]);const task=await JC.claim('synthetic-closed-recovery',60000);assert.equal(task.id,q.job_id);
    const out=await h.recover(task,{});await JC.finish(task,out);assert.equal(out.status,'SUCCEEDED');
    const state=await RC.read(buyer.ctx,{record_id:original.id,party_id:buyer.personal_party_id});assert.equal(state.current_status,'CLOSED');const cash=await WC.summary(buyer.ctx,{party_id:buyer.personal_party_id});
    assert.equal(cash.reserved_balance_minor,0);assert.equal(cash.available_balance_minor,originalWallet.available_balance_minor+1000);
    assert.equal(Number((await closedDb.execute("SELECT COUNT(*) n FROM wallet_records WHERE kind='RECHARGE_REFUND_RECEIPT' AND parent_id=?",[original.id]))[0][0].n),0);
    assert.deepEqual(await RC.applyVerifiedReceipt(closedProof),state);await assert.rejects(RC.applyVerifiedReceipt(proof),{code:'CUSTODY_REFUND_TERMINAL_CONFLICT'});assert.deepEqual(await WC.summary(buyer.ctx,{party_id:buyer.personal_party_id}),cash);
    assert.equal(closeQueries,1);assert.equal(closeSends,0);assert.equal(await mysqlReady(closedDb)(),false);
    evidence.push({check:'closed_original_hold_only',branch:'separate_restore_of_same_snapshot',case_id:original.id,query_count:1,restored_send_count:0,receipt_count:0,reserved_minor:0,contradictory_success_refused:true});
   }finally{if(closedDb)await closedDb.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(closedName));}
  });
  assert.deepEqual(await read(original),original);assert.deepEqual(await summary(),originalWallet);assert.deepEqual(await jobs.get(q.job_id),originalJob);
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/refund-restore-authority-journey.json'),JSON.stringify({synthetic_only:true,evidence,source_send_count:count('refund',original.id),restored_send_count:sendCalls,restored_query_count:queryCalls,source_unchanged:true,limits:['internal engine invocation only; no recovery release or HTTP/worker bootstrap','synthetic adapters and receipts only','current authority/config changes are fixtures in the restored DB, not synchronization of all changes after backup','CLOSED alternative is a separate isolated restore of the same original snapshot','no frontend, live provider or production data']},null,2));
 }finally{if(restored)await restored.close();if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(restoreName));await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
