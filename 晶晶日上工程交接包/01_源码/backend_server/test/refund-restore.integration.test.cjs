'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const C=require('../src/modules/wallet/context');
test('unknown recharge refund survives encrypted restore without enabling dispatch',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_refund_restore_'+randomBytes(7).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,restored;const restoreName=name+'_r';
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
  let r,q,backup,before,jobBefore,sealed;
  const B=require('../src/operations/backup'),F=require('../src/operations/data-format'),{mysqlReady}=require('../src/http/operations'),encryptionKey=randomBytes(32),evidence=[];
  await t.test('unknown original send is frozen with reserved funds and the same durable task',async()=>{
   r=await approvedCase(1000);q=await schedule(r);behavior='lost';await advance(q.job_id);behavior='success';
   r=await read(r);assert.equal(r.current_status,'UNKNOWN');assert.equal(count('refund',r.id),1);
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
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/refund-restore-journey.json'),JSON.stringify({synthetic_only:true,evidence,limits:['synthetic normalized custody provider only','no recovery approval and no restored refund dispatch','external private file bytes are not in this database backup','not a real legacy database migration or production recovery','no frontend']},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(restored)await restored.close();if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(restoreName));await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
