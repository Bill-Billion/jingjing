'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('failed migration is diagnosed and recovered through isolated maintenance commands',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,restored;const restoreName='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),emptyName='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex');
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
  const topupProof={record_id:recharge.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic:'+key(),occurred_at:new Date().toISOString(),status:'SUCCEEDED'};await custody.applyVerifiedReceipt(topupProof);
  const proofAsset=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic mistaken topup evidence'),operation_key:key()});
  const summary=()=>W.summary(buyer.ctx,{party_id:buyer.personal_party_id}),read=r=>R.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id}),request=(amount,operation=key())=>R.request(buyer.ctx,{party_id:buyer.personal_party_id,recharge_id:recharge.id,amount_minor:amount,reason:'synthetic mistaken recharge',evidence_asset_ids:[proofAsset.id],operation_key:operation});
  const reviewInput=(r,amount=r.data.requested_minor,decision='APPROVE')=>({record_id:r.id,expected_version:r.object_version,decision,amount_minor:amount,reason:'synthetic independent case decision',checks:{identity_verified:true,source_verified:true,refund_basis_verified:true},operation_key:key()});
  const jobs=require('../src/infrastructure/jobs/repository').createJobRepository(db),{TYPE}=require('../src/modules/wallet/recharge-refund-jobs');
  const {createRechargeRefundHandler}=require('../src/modules/wallet/recharge-refund-handler'),{createWorker}=require('../src/worker/runner');
  const providerCalls=[],observations=new Map();let behavior='success',duringRefund=null;
  const provider={binding,assertReady:async()=>{},refund:async(input,ctx)=>{
   assert.equal(ctx.idempotency_key,input.record_id);providerCalls.push({method:'refund',id:input.record_id});
   const proof={record_id:input.record_id,recharge_id:input.recharge_id,...binding,original_transaction_id:input.original_transaction_id,refund_transaction_id:'synthetic-task:'+input.record_id,currency:'CNY',amount_minor:input.amount_minor,occurred_at:new Date().toISOString(),status:'SUCCEEDED'};
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

  const {spawnSync}=require('node:child_process'),{inspect}=require('../src/operations/recovery-check'),{mysqlReady}=require('../src/http/operations');
  const fixtureDir=await fs.mkdtemp(path.resolve(__dirname,'../../../../.local/rollback-drill-'));
  const backupFile=path.join(fixtureDir,'before.jxb'),keyFile=path.join(fixtureDir,'key.json'),evidence=[];
  const cli=(command,database=name,extra=[])=>{
   const child=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/release-tools.cjs'),command,'--env-file',process.env.JX_MYSQL_TEST_ENV_FILE,'--database',database,...extra],{env:process.env,encoding:'utf8',timeout:60000,windowsHide:true});
   assert.equal(child.error,undefined);const output=JSON.parse((child.status===0?child.stdout:child.stderr).trim());
   assert.ok(!(child.stdout+child.stderr).includes(env.MYSQL_PASSWORD));
   evidence.push({command,exit_code:child.status,output});return {code:child.status,out:output};
  };
  const r0=await approvedCase(1000),q=await schedule(r0);behavior='lost';await advance(q.job_id);behavior='success';
  const original=await read(r0),balance=await summary(),originalJob=await jobs.get(q.job_id);
  const grants=(await db.execute('SELECT * FROM governance_operator_grants ORDER BY id'))[0];
  assert.equal(original.current_status,'UNKNOWN');assert.equal(balance.reserved_balance_minor,1000);
  let archived,failedHistory,failedRows;
  await t.test('CLI safety rejects live targets and emits no credentials',async()=>{
   const x=cli('recovery-check','jx_dev');assert.equal(x.code,1);assert.equal(x.out.code,'ISOLATED_TARGET_REQUIRED');
  });
  await t.test('read-only diagnostics see waiting work without requiring a release manifest',async()=>{
   const x=cli('recovery-check');assert.equal(x.code,0);assert.equal(x.out.schema.ready,true);assert.equal(x.out.recovery.status,'NOT_RESTORED');
   assert.ok(x.out.jobs.counts.RETRY>=1);assert.ok(x.out.alerts.some(a=>a.code==='JOBS_WAITING'));assert.equal(x.out.production_release,'NOT_APPROVED');
   assert.deepEqual(await jobs.get(q.job_id),originalJob);assert.deepEqual(await summary(),balance);
  });
  await t.test('backup commands create an authenticated pre-change artifact and refuse overwrite',async()=>{
   assert.equal(cli('key-create',name,['--file',keyFile]).code,0);
   archived=cli('backup',name,['--file',backupFile,'--key-file',keyFile,'--source-ref','synthetic.rollback.before']);assert.equal(archived.code,0);assert.equal(archived.out.external_objects_included,false);
   assert.equal(cli('backup',name,['--file',backupFile,'--key-file',keyFile,'--source-ref','synthetic.rollback.before']).out.code,'EEXIST');
  });
  await t.test('actual failed migration retains prior committed DDL and is observable without rewriting history',async()=>{
   const migrations=path.join(fixtureDir,'migrations');await fs.mkdir(migrations);
   const source=path.resolve(__dirname,'../migrations/mysql-runtime');
   for(const f of await fs.readdir(source))if(f.endsWith('.sql'))await fs.copyFile(path.join(source,f),path.join(migrations,f));
   await fs.writeFile(path.join(migrations,'9998_synthetic_partial.sql'),'CREATE TABLE synthetic_partial_migration (id INT PRIMARY KEY) ENGINE=InnoDB');
   await fs.writeFile(path.join(migrations,'9999_synthetic_failure.sql'),'ALTER TABLE synthetic_missing_table ADD COLUMN impossible INT');
   await assert.rejects(migrate(db,{directory:migrations}),{code:'MIGRATION_SQL_FAILED'});
   failedHistory=(await db.execute('SELECT * FROM platform_schema_migrations ORDER BY version,attempt'))[0];
   assert.equal(failedHistory.at(-2).status,'APPLIED');assert.equal(failedHistory.at(-1).status,'FAILED');
   assert.equal((await db.execute("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='synthetic_partial_migration'"))[0][0].n,'1');
   // Released checkout does not contain the failed candidate's extra migration files.
   const x=cli('recovery-check');assert.equal(x.code,0);assert.equal(x.out.schema.code,'MIGRATION_DRIFT');assert.equal(x.out.attention_required,true);assert.equal(x.out.jobs.readable,true);
   await assert.rejects(mysqlReady(db)(),{code:'MIGRATION_DRIFT'});
   failedRows=(await db.execute('SELECT * FROM platform_schema_metadata ORDER BY schema_key'))[0];
   assert.deepEqual((await db.execute('SELECT * FROM platform_schema_migrations ORDER BY version,attempt'))[0],failedHistory);
   assert.deepEqual(await summary(),balance);assert.deepEqual(await read(original),original);
  });
  await t.test('restore refuses wrong hash and a populated target without destroying the failed scene',async()=>{
   await control.query('CREATE DATABASE '+mysql.escapeId(restoreName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
   const args=['--file',backupFile,'--key-file',keyFile,'--sha256',archived.out.payload_sha256];
   assert.equal(cli('restore',name,args).out.code,'RESTORE_TARGET_NOT_EMPTY');
   assert.equal(cli('restore',restoreName,[...args.slice(0,-1),'0'.repeat(64)]).out.code,'BACKUP_CHECKSUM_MISMATCH');
   assert.equal((await control.execute('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=?',[restoreName]))[0][0].n,0);
  });
  await t.test('actual restore command reestablishes pre-change money, authority and original task in a new quarantined database',async()=>{
   const x=cli('restore',restoreName,['--file',backupFile,'--key-file',keyFile,'--sha256',archived.out.payload_sha256]);
   assert.equal(x.code,0);assert.equal(x.out.result,'MATCHED');assert.equal(x.out.runtime_status,'QUARANTINED');assert.equal(x.out.external_objects_restored,false);
   restored=await openDatabase({...env,MYSQL_DATABASE:restoreName});
   const WR=require('../src/modules/wallet/repository').createWalletRepository(restored,{resolvePrincipal:S.resolvePrincipal}),RR=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(restored,{resolvePrincipal:S.resolvePrincipal});
   assert.deepEqual(await WR.summary(buyer.ctx,{party_id:buyer.personal_party_id}),balance);
   assert.deepEqual(await RR.read(buyer.ctx,{record_id:original.id,party_id:buyer.personal_party_id}),original);
   assert.deepEqual((await restored.execute('SELECT * FROM governance_operator_grants ORDER BY id'))[0],grants);
   assert.deepEqual(await require('../src/infrastructure/jobs/repository').createJobRepository(restored).get(q.job_id),originalJob);
   assert.equal((await restored.execute("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='synthetic_partial_migration'"))[0][0].n,'0');
   assert.equal((await restored.execute("SELECT COUNT(*) n FROM platform_schema_migrations WHERE version>='9998'"))[0][0].n,'0');
   assert.equal(await mysqlReady(restored)(),false);assert.equal(count('refund',original.id),1);
  });
  await t.test('post-recovery observation blocks runtime and never claims migration recovery is service cutover',async()=>{
   const x=cli('recovery-check',restoreName);assert.equal(x.code,0);assert.equal(x.out.schema.ready,true);assert.equal(x.out.recovery.status,'QUARANTINED');
   assert.ok(x.out.alerts.some(a=>a.code==='RESTORE_REVIEW_REQUIRED'));assert.equal(x.out.runtime_started,false);assert.equal(x.out.production_release,'NOT_APPROVED');
   await assert.rejects(require('../src/http/main').main({...env,MYSQL_DATABASE:restoreName,PORT:'0'}),/MYSQL_MIGRATIONS_REQUIRED/);
   const worker=spawnSync(process.execPath,[path.resolve(__dirname,'../src/worker/main.js')],{env:{...process.env,...env,MYSQL_DATABASE:restoreName,OPERATIONS_WORKER_ENABLED:'true'},encoding:'utf8',timeout:10000,windowsHide:true});
   assert.equal(worker.status,1);assert.match(worker.stderr,/RESTORE_REVIEW_REQUIRED/);
  });
  await t.test('diagnostics report blocked, failed and expired jobs without executing or exposing private references',async()=>{
   const JR=require('../src/infrastructure/jobs/repository').createJobRepository(restored),ids=[];
   for(const state of ['BLOCKED','FAILED','RUNNING']){
    const j=await JR.enqueue({task_type:'SYNTHETIC_DIAGNOSTIC',business_key:key(),payload_ref:'synthetic:private-reference',max_attempts:3});ids.push(j.id);
    if(state==='RUNNING')await restored.execute("UPDATE platform_jobs SET status='RUNNING',lease_owner='synthetic-expired-owner',lease_token=?,lease_until=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?",[key(),j.id]);
    else await restored.execute('UPDATE platform_jobs SET status=? WHERE id=?',[state,j.id]);
   }
   const before=(await restored.execute('SELECT * FROM platform_jobs ORDER BY id'))[0],x=cli('recovery-check',restoreName);
   for(const code of ['JOBS_BLOCKED','JOBS_FAILED','JOB_LEASE_EXPIRED'])assert.ok(x.out.alerts.some(a=>a.code===code));
   assert.equal(x.out.jobs.expired_running,1);for(const privateValue of [...ids,original.id,'synthetic:private-reference'])assert.ok(!JSON.stringify(x.out).includes(privateValue));
   assert.deepEqual((await restored.execute('SELECT * FROM platform_jobs ORDER BY id'))[0],before);
  });
  await t.test('empty database is diagnosed as unavailable without creating schema',async()=>{
   await control.query('CREATE DATABASE '+mysql.escapeId(emptyName)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
   const x=cli('recovery-check',emptyName);assert.equal(x.code,0);assert.equal(x.out.schema.ready,false);assert.equal(x.out.jobs.readable,false);assert.equal(x.out.recovery.status,'UNAVAILABLE');
   assert.equal((await control.execute('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=?',[emptyName]))[0][0].n,0);
  });
  assert.deepEqual((await db.execute('SELECT * FROM platform_schema_migrations ORDER BY version,attempt'))[0],failedHistory);
  assert.deepEqual((await db.execute('SELECT * FROM platform_schema_metadata ORDER BY schema_key'))[0],failedRows);
  assert.deepEqual(await read(original),original);assert.deepEqual(await summary(),balance);assert.deepEqual(await jobs.get(q.job_id),originalJob);
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/migration-rollback-drill.json'),JSON.stringify({synthetic_only:true,evidence,prechange_refund_id:original.id,reserved_minor:1000,original_send_count:1,source_failure_preserved:true,money_authority_and_task_matched:true,production_release:'NOT_APPROVED',limits:['database recovery rehearsal only; no application release switch','synthetic failed migration and pre-change backup','restored runtime remains quarantined; no provider execution','external private bytes and post-backup external changes are not restored']},null,2));
 }finally{if(restored)await restored.close();if(db)await db.close();for(const n of [restoreName,emptyName,name])await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(n));await control.end();}
});
