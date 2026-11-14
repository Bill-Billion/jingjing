'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const C=require('../src/modules/wallet/context');
test('unknown recharge refund survives encrypted restore without enabling dispatch',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_refund_restore_'+randomBytes(7).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,restored,restoredLive;const restoreName=name+'_r',liveName=name+'_live';
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
  let r,q,backup,before,jobBefore,sealed;
  const B=require('../src/operations/backup'),F=require('../src/operations/data-format'),{mysqlReady}=require('../src/http/operations'),encryptionKey=randomBytes(32),evidence=[];
  await t.test('unknown original send is frozen with reserved funds and the same durable task',async()=>{
   r=await approvedCase(1000);q=await schedule(r);behavior='lost';await advance(q.job_id);behavior='success';
   r=await read(r);assert.equal(r.current_status,'UNKNOWN');assert.equal(count('refund',r.id),1);
   assert.ok(observations.get(r.id).occurred_at>=r.data.submitted_at,'synthetic provider receipt uses the same database clock as dispatch');
   before=await summary();assert.equal(before.reserved_balance_minor,1000);jobBefore=await jobs.get(q.job_id);
   backup=await B.backup(db,{source_ref:'synthetic.refund.unknown.restore'});sealed=B.seal(backup.payload,encryptionKey);
   assert.equal(backup.manifest.external_object_bytes_included,false);assert.ok(!JSON.stringify(sealed).includes(r.id));
   assert.throws(()=>B.unseal(sealed,randomBytes(32)),{code:'BACKUP_AUTHENTICATION_FAILED'});
   evidence.push({check:'frozen_unknown_refund',case_id:r.id,recharge_id:recharge.id,job_id:q.job_id,reserved_minor:1000,send_count:1});
  });
  await t.test('restored case, task, operation keys and wallet facts match while external bytes are explicitly absent',async()=>{
   await control.query('CREATE DATABASE '+mysql.escapeId(restoreName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
   restored=await openDatabase({...env,MYSQL_DATABASE:restoreName,MYSQL_CONNECTION_LIMIT:'1'});
   const result=await B.restore(restored,B.unseal(sealed,encryptionKey),{expected_sha256:backup.manifest.payload_sha256});assert.equal(result.result,'MATCHED');assert.equal(result.runtime_status,'QUARANTINED');assert.equal(result.external_objects_restored,false);
   const R2=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(restored,{resolvePrincipal:S.resolvePrincipal});
   const restoredCase=await R2.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id});assert.deepEqual(restoredCase,r);
   assert.deepEqual(await require('../src/infrastructure/jobs/repository').createJobRepository(restored).get(q.job_id),jobBefore);
   const W2=require('../src/modules/wallet/repository').createWalletRepository(restored,{resolvePrincipal:S.resolvePrincipal});
   assert.deepEqual(await W2.summary(buyer.ctx,{party_id:buyer.personal_party_id}),before);
   for(const table of ['wallet_records','wallet_commands','wallet_audit','platform_jobs']){
    const a=(await db.execute('SELECT * FROM '+table))[0],b=(await restored.execute('SELECT * FROM '+table))[0];
    assert.deepEqual(a.map(x=>JSON.stringify(x)).sort(),b.map(x=>JSON.stringify(x)).sort());
   }
   evidence.push({check:'same_case_job_wallet_restored',case_id:r.id,job_id:q.job_id,source_sha256:backup.manifest.payload_sha256,tables:result.tables,external_objects_restored:false});
  });
  await t.test('restored quarantine blocks HTTP bootstrap and worker without changing money or sending again',async()=>{
   assert.equal(await mysqlReady(restored)(),false);
   await assert.rejects(require('../src/http/main').main({...env,MYSQL_DATABASE:restoreName,PORT:'0'}),/MYSQL_MIGRATIONS_REQUIRED/);
   const child=require('node:child_process').spawnSync(process.execPath,[path.resolve(__dirname,'../src/worker/main.js')],{env:{...process.env,...env,MYSQL_DATABASE:restoreName,OPERATIONS_WORKER_ENABLED:'true'},encoding:'utf8',timeout:10000,windowsHide:true});
   assert.equal(child.status,1);assert.match(child.stderr,/RESTORE_REVIEW_REQUIRED/);
   assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),0);assert.deepEqual(await summary(),before);assert.deepEqual(await read(r),r);
   const restoredR=await restored.execute("SELECT current_status FROM wallet_records WHERE id=?",[r.id]);assert.equal(restoredR[0][0].current_status,'UNKNOWN');
   evidence.push({check:'quarantine_blocks_dispatch',http_bootstrap_refused:true,worker_refused:true,send_count:1,query_count:0,source_unchanged:true});
  });
  let oldLease,restoredJobs,restoredRefunds,liveBackup,exhaustedLease,latestRegister;
  await t.test('restoring a still-running refund invalidates its old lease while preserving original request and attempts',async()=>{
   await db.execute('UPDATE platform_jobs SET next_run_at=CURRENT_TIMESTAMP(6) WHERE id=?',[q.job_id]);
   oldLease=await jobs.claim('synthetic-pre-restore-worker',3600000);assert.equal(oldLease.id,q.job_id);
   await jobs.saveProviderTask(oldLease,'synthetic-original-channel-reference');oldLease=await jobs.get(oldLease.id);
   const exhausted=await jobs.enqueue({task_type:'SYNTHETIC_RESTORE_CAP',business_key:key(),provider:'synthetic-custodian',payload_ref:'synthetic:restore-cap',max_attempts:1});
   exhaustedLease=await jobs.claim('synthetic-exhausted-worker',3600000);assert.equal(exhaustedLease.id,exhausted.id);
   liveBackup=await B.backup(db,{source_ref:'synthetic.refund.running.restore'});
   await control.query('CREATE DATABASE '+mysql.escapeId(liveName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
   restoredLive=await openDatabase({...env,MYSQL_DATABASE:liveName});
   const result=await B.restore(restoredLive,B.unseal(B.seal(liveBackup.payload,encryptionKey),encryptionKey),{expected_sha256:liveBackup.manifest.payload_sha256});
   restoredJobs=require('../src/infrastructure/jobs/repository').createJobRepository(restoredLive);
   restoredRefunds=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(restoredLive,{resolvePrincipal:S.resolvePrincipal});
   const now=await restoredJobs.get(q.job_id);assert.equal(now.status,'RETRY');
   assert.equal(result.invalidated_job_leases,2);assert.equal(now.lease_token,null);assert.equal(now.lease_owner,null);assert.equal(now.lease_until,null);
   for(const field of ['id','business_key','provider','provider_task_id','payload_ref','intent_hash','attempts','max_attempts','next_run_at'])assert.equal(now[field],oldLease[field],field);
   assert.deepEqual(await restoredRefunds.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id}),r);
   assert.deepEqual(await jobs.get(q.job_id),oldLease);
   const untouched=(await db.execute("SELECT * FROM platform_jobs WHERE status<>'RUNNING' ORDER BY id"))[0];
   for(const item of untouched)assert.deepEqual(await restoredJobs.get(item.id),item);
   evidence.push({check:'running_lease_invalidated',case_id:r.id,job_id:q.job_id,invalidated_job_leases:result.invalidated_job_leases,attempts_preserved:true,source_lease_unchanged:true});
  });
  await t.test('the pre-restore lease cannot heartbeat, attach a provider id, or finish in the restored database',async()=>{
   await assert.rejects(restoredJobs.heartbeat(oldLease,60000),{code:'LEASE_LOST'});
   await assert.rejects(restoredJobs.saveProviderTask(oldLease,'synthetic-stale-provider-id'),{code:'LEASE_LOST'});
   await assert.rejects(restoredJobs.finish(oldLease,{status:'SUCCEEDED',result_ref:r.id}),{code:'LEASE_LOST'});
   evidence.push({check:'old_lease_writes_refused',heartbeat:true,provider_task:true,finish:true});
  });
  await t.test('the original process cannot settle the restored refund using its copied lease',async()=>{
   await assert.rejects(restoredRefunds.applyVerifiedReceipt(observations.get(r.id),{task:oldLease}),{code:'LEASE_LOST'});
   assert.equal((await restoredRefunds.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id})).current_status,'UNKNOWN');
   assert.equal((await require('../src/modules/wallet/repository').createWalletRepository(restoredLive,{resolvePrincipal:S.resolvePrincipal}).summary(buyer.ctx,{party_id:buyer.personal_party_id})).reserved_balance_minor,1000);
   evidence.push({check:'old_lease_money_refused',case_id:r.id,reserved_minor:1000});
  });
  await t.test('read-only release inspection includes waiting and restored retry jobs without approving or executing them',async()=>{
   const pending=await restoredJobs.enqueue({task_type:'SYNTHETIC_PENDING_INSPECTION',business_key:key(),provider:null,payload_ref:'synthetic:inspection',max_attempts:2});
   await restoredLive.execute("UPDATE platform_jobs SET next_run_at='2099-01-01 00:00:00' WHERE id=?",[pending.id]);
   const beforeJobs=(await restoredLive.execute('SELECT * FROM platform_jobs ORDER BY id'))[0];
   const report=await require('../src/operations/release-check').inspect(restoredLive,{format:'JX_RELEASE_REVIEW_V1',commit:'1'.repeat(40),checks:[],providers:[]},env);
   assert.equal(report.pending_jobs.find(x=>x.status==='RETRY')?.count,2);assert.equal(report.pending_jobs.find(x=>x.status==='PENDING')?.count,1);
   assert.equal(report.restore_quarantined,true);assert.equal(report.production_release,'NOT_APPROVED');
   assert.deepEqual((await restoredLive.execute('SELECT * FROM platform_jobs ORDER BY id'))[0],beforeJobs);
   assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),0);
   evidence.push({check:'read_only_pending_work_visible',retry_count:2,pending_count:1,production_release:report.production_release,quarantine_preserved:true,task_rows_unchanged:true});
  });
  await t.test('latest synthetic erasure replay is atomic, suppresses the original proof and account, and still cannot release recovery',async()=>{
   const privacy=require('../src/operations/privacy-recovery'),guard=require('../src/infrastructure/database/recovery-guard'),{digest}=require('../src/modules/governance/content');
   const [[asset]]=await db.execute('SELECT * FROM supply_assets WHERE id=?',[proofAsset.id]);
   // A synthetic latest-register fixture, not a claim that a real user's erasure was approved.
   latestRegister={...(await privacy.capture(db,{source_ref:'synthetic:latest-restore-register'})).data,files:[{asset_id:asset.id,content_sha256:asset.content_sha256,object_key:asset.object_key}],accounts:[outsider.account_id]};
   const assets=require('../src/modules/works/assets').createSupplyAssets({db:restoredLive,repository:require('../src/modules/works/repository').createSupplyRepository(restoredLive,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});
   assert.equal((await assets.download(buyer.ctx,proofAsset.id,buyer.personal_party_id)).metadata.content_sha256,proofAsset.content_sha256);
   const options={expected_sha256:digest(latestRegister),reviewer_ref:'synthetic:independent-recovery-review',latest_register_confirmed:true};
   await assert.rejects(privacy.replay(restoredLive,latestRegister,{...options,expected_sha256:'0'.repeat(64)}),{code:'PRIVACY_RECOVERY_REGISTER_INVALID'});
   await assert.rejects(privacy.replay(restoredLive,latestRegister,{...options,latest_register_confirmed:false}),{code:'PRIVACY_RECOVERY_REGISTER_INVALID'});
   const mismatch={...latestRegister,files:[{...latestRegister.files[0],object_key:'synthetic:wrong-object'}]};
   await assert.rejects(privacy.replay(restoredLive,mismatch,{...options,expected_sha256:digest(mismatch)}),{code:'PRIVACY_RECOVERY_OBJECT_MISMATCH'});
   assert.equal((await restoredLive.execute('SELECT current_status FROM supply_assets WHERE id=?',[proofAsset.id]))[0][0].current_status,'READY');
   assert.equal((await restoredLive.execute('SELECT current_status FROM identity_accounts WHERE id=?',[outsider.account_id]))[0][0].current_status,'ACTIVE');
   const applied=await privacy.replay(restoredLive,latestRegister,options);assert.equal(applied.runtime_status,'QUARANTINED');assert.equal(applied.files_suppressed,1);assert.equal(applied.accounts_closed,1);
   await assert.rejects(assets.download(buyer.ctx,proofAsset.id,buyer.personal_party_id),{code:'SUPPLY_NOT_FOUND',status:404});
   const [[session]]=await restoredLive.execute('SELECT revoked FROM auth_sessions WHERE account_id=?',[outsider.account_id]);assert.equal(Number(session.revoked),1);
   assert.equal(await guard.recoveryAllowed(restoredLive),false);assert.equal(await mysqlReady(restoredLive)(),false);
   assert.deepEqual(await jobs.get(q.job_id),oldLease);assert.deepEqual(await read(r),r);
   evidence.push({check:'latest_privacy_register_replayed',synthetic_register:true,file_download_refused:true,account_closed:true,session_revoked:true,quarantine_preserved:true});
  });
  await t.test('isolated internal recovery queries only the original request and a lost completion write cannot settle twice',async()=>{
   // Exercise the internal engine in the disposable DB. Never start HTTP/worker main or set RELEASED.
   const restoredHandler=createRechargeRefundHandler({refunds:restoredRefunds,operatorContext:async()=>reviewer.ctx,providers});
   const fresh=await restoredJobs.claim('synthetic-isolated-recovery',60000);assert.equal(fresh.id,q.job_id);assert.notEqual(fresh.lease_token,oldLease.lease_token);assert.equal(fresh.attempts,oldLease.attempts+1);
   // A receipt earlier than dispatch remains invalid; aligning synthetic clocks must not weaken the money guard.
   await assert.rejects(restoredRefunds.applyVerifiedReceipt({...observations.get(r.id),occurred_at:new Date(Date.parse(r.data.submitted_at)-1).toISOString()},{task:fresh}),{code:'CUSTODY_RECEIPT_MISMATCH'});
   const outcome=await restoredHandler.recover(fresh,{});assert.equal(outcome.status,'SUCCEEDED');
   assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);
   const wallet=require('../src/modules/wallet/repository').createWalletRepository(restoredLive,{resolvePrincipal:S.resolvePrincipal});
   const settled=await wallet.summary(buyer.ctx,{party_id:buyer.personal_party_id});assert.equal(settled.reserved_balance_minor,0);
   // Simulate a crash after money committed but before job completion was written.
   await restoredLive.execute('UPDATE platform_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?',[fresh.id]);
   await assert.rejects(restoredJobs.finish(fresh,outcome),{code:'LEASE_LOST'});
   const replacement=await restoredJobs.claim('synthetic-isolated-recovery-restart',60000);assert.equal(replacement.id,fresh.id);
   const repeated=await restoredHandler.recover(replacement,{});await restoredJobs.finish(replacement,repeated);
   assert.equal((await restoredJobs.get(q.job_id)).status,'SUCCEEDED');assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);
   assert.deepEqual(await wallet.summary(buyer.ctx,{party_id:buyer.personal_party_id}),settled);
   const [[receipts]]=await restoredLive.execute("SELECT COUNT(*) n FROM wallet_records WHERE kind='RECHARGE_REFUND_RECEIPT' AND parent_id=?",[r.id]);assert.equal(Number(receipts.n),1);
   assert.deepEqual(await read(r),r);assert.deepEqual(await summary(),before);assert.deepEqual(await jobs.get(q.job_id),oldLease);
   assert.equal(await mysqlReady(restoredLive)(),false);
   evidence.push({check:'restored_original_query_and_completion_recovery',case_id:r.id,job_id:q.job_id,total_send_count:1,restored_query_count:1,receipt_count:1,reserved_minor:0,source_unchanged:true,quarantine_preserved:true,internal_engine_only:true});
  });
  await t.test('restoration does not reset an exhausted task attempt budget',async()=>{
   assert.equal(await restoredJobs.claim('synthetic-cap-check',60000),null);
   const capped=await restoredJobs.get(exhaustedLease.id);assert.equal(capped.status,'FAILED');assert.equal(capped.last_error,'ATTEMPTS_EXHAUSTED');assert.equal(capped.attempts,1);assert.equal(capped.max_attempts,1);
   await assert.rejects(restoredJobs.heartbeat(exhaustedLease,60000),{code:'LEASE_LOST'});
   evidence.push({check:'attempt_budget_preserved',job_id:exhaustedLease.id,attempts:1,max_attempts:1,status:'FAILED'});
  });
  await t.test('rebacking up the restored database cannot carry old privacy approval or a live lease into another recovery',async()=>{
   const nestedName=name+'_nested';let nested;
   try{
    const snapshot=await B.backup(restoredLive,{source_ref:'synthetic.second.recovery'});
    await control.query('CREATE DATABASE '+mysql.escapeId(nestedName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');nested=await openDatabase({...env,MYSQL_DATABASE:nestedName});
    const result=await B.restore(nested,snapshot.payload,{expected_sha256:snapshot.manifest.payload_sha256});assert.equal(result.invalidated_job_leases,0);
    assert.equal(Number((await nested.execute("SELECT COUNT(*) n FROM platform_schema_metadata WHERE schema_key IN ('privacy_erasure_status','privacy_erasure_review')"))[0][0].n),0);
    const retained=await require('../src/operations/privacy-recovery').capture(nested,{source_ref:'synthetic.retained'});assert.deepEqual(retained.data.files,latestRegister.files);assert.deepEqual(retained.data.accounts,latestRegister.accounts);
    assert.equal(await mysqlReady(nested)(),false);
    assert.equal((await nested.execute('SELECT current_status FROM wallet_records WHERE id=?',[r.id]))[0][0].current_status,'SUCCEEDED');
    evidence.push({check:'second_restore_keeps_facts_not_old_approval',case_id:r.id,settlement_preserved:true,erasure_register_preserved:true,old_approval_cleared:true,quarantine_preserved:true});
   }finally{if(nested)await nested.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(nestedName));}
  });
  await t.test('failure while invalidating restored leases rolls back all business rows and leaves quarantine',async()=>{
   const failedName=name+'_failed';let failed;
   try{
    await control.query('CREATE DATABASE '+mysql.escapeId(failedName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');failed=await openDatabase({...env,MYSQL_DATABASE:failedName});
    const failing={...failed,withTransaction:fn=>failed.withTransaction(tx=>fn({...tx,execute:async(sql,params)=>{if(sql.startsWith("UPDATE platform_jobs SET status='RETRY',lease_owner=NULL"))throw Object.assign(new Error('synthetic restore fence failure'),{code:'SYNTHETIC_FENCE_FAILURE'});return tx.execute(sql,params);}}))};
    await assert.rejects(B.restore(failing,liveBackup.payload,{expected_sha256:liveBackup.manifest.payload_sha256}),{code:'SYNTHETIC_FENCE_FAILURE'});
    assert.equal(Number((await failed.execute('SELECT COUNT(*) n FROM wallet_records'))[0][0].n),0);assert.equal(Number((await failed.execute('SELECT COUNT(*) n FROM platform_jobs'))[0][0].n),0);
    assert.equal((await failed.execute("SELECT schema_value FROM platform_schema_metadata WHERE schema_key='recovery_status'"))[0][0].schema_value,'QUARANTINED');
    assert.equal(await mysqlReady(failed)(),false);assert.deepEqual(await jobs.get(q.job_id),oldLease);
    evidence.push({check:'fencing_failure_atomic_rollback',wallet_rows:0,job_rows:0,quarantine_preserved:true,source_unchanged:true});
   }finally{if(failed)await failed.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(failedName));}
  });
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/refund-restore-journey.json'),JSON.stringify({synthetic_only:true,evidence,limits:['synthetic normalized custody provider only','internal recovery invocation only; no recovery approval or HTTP/worker bootstrap','no restored refund send; original request query only','synthetic latest erasure register; no actual customer erasure or external byte deletion','external private file bytes are not in this database backup','not a real legacy database migration or production recovery','no frontend']},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(restoredLive)await restoredLive.close();if(restored)await restored.close();if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(liveName));await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(restoreName));await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
