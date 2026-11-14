'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const C=require('../src/modules/wallet/context');
test('durable recharge refund recovery and guardian delegation in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_refund_tasks_'+randomBytes(7).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
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
  const receipt=async(r,status='SUCCEEDED',extra={})=>({record_id:r.id,recharge_id:recharge.id,...binding,original_transaction_id:topupProof.transaction_id,refund_transaction_id:status==='SUCCEEDED'?'synthetic-refund:'+r.id:null,currency:'CNY',amount_minor:r.data.amount_minor,occurred_at:await require('../src/modules/artists/context').now(db),status,...extra});
  const assessment=()=>db.withTransaction(tx=>custody.assessRefund(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,recharge_id:recharge.id},binding));
  const config={...S.config,provider:'CUSTODY',merchant_id:binding.merchant_id,config_revision:binding.revision,custody_binding:binding};
  async function order(amount){let spec=await trade.createSpec(S.seller.ctx,{party_id:S.seller.personal_party_id,previous_spec_id:null,title:'synthetic refund/payment competition',provider_party_id:S.seller.personal_party_id,line_kind:'OTHER',unit_minor:amount,currency:'CNY',specification:S.spec.data.specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic cash',operation_key:key()});await S.publishSales(S.seller.personal_party_id,spec.id);let l=await stock.create(S.seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});l=await S.reviewListing(l,'RIGHTS');l=await S.reviewListing(l,'CONTENT');return trade.stockCheckout(buyer.ctx,{party_id:buyer.personal_party_id,listing_id:l.id,offer_sha256:l.content_sha256,channel:'CUSTODY',operation_key:key()});}
  const payment=o=>trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,installment_key:'stock',operation_key:key()},config);
  const cancel=r=>R.cancel(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id,expected_version:r.object_version,reason:'synthetic cancel unsent refund',operation_key:key()});

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
  const due=id=>db.execute("UPDATE platform_jobs SET next_run_at=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?",[id]);
  const retry=async r=>{r=await read(r);return R.retryTask(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,reason:'synthetic independent recovery',operation_key:key()});};
  const count=(method,id)=>providerCalls.filter(x=>x.method===method&&x.id===id).length;
  // The seed creates other durable jobs too. Drive the real shared queue until THIS task is attempted.
  async function advance(jobId,instance=worker){
   const before=(await jobs.get(jobId)).attempts;
   for(let n=0;n<200;n++){await instance.tick();const current=await jobs.get(jobId);if(current.attempts>before)return current;}
   throw new Error('synthetic target task was not reached');
  }
  async function claimFor(jobId,owner){
   for(let n=0;n<200;n++){const j=await jobs.claim(owner,60000);assert(j);if(j.id===jobId)return j;assert.notEqual(j.task_type,TYPE);await jobs.finish(j,{status:'BLOCKED',error_code:'SYNTHETIC_UNRELATED_HANDLER'});}
   throw new Error('synthetic target claim was not reached');
  }
  const evidence=[];
  await t.test('task insert and case link are atomic; same case scheduling keeps one durable task',async()=>{
   let r=await approvedCase(1000);
   await assert.rejects(R.schedule(buyer.ctx,{record_id:r.id,expected_version:r.object_version,operation_key:key()}),{code:'SELF_REVIEW_FORBIDDEN'});
   const trigger='refund_job_failure';await db.withConnection(c=>c.query("CREATE TRIGGER "+trigger+" BEFORE INSERT ON platform_jobs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic task insert failure'"));
   try{await assert.rejects(schedule(r),/synthetic task insert failure/);}finally{await db.withConnection(c=>c.query('DROP TRIGGER '+trigger));}
   assert.equal((await read(r)).data.dispatch_job_id,undefined);assert.equal((await read(r)).object_version,r.object_version);
   const input={record_id:r.id,expected_version:r.object_version,operation_key:key()},first=await R.schedule(reviewer.ctx,input);
   assert.equal((await R.schedule(reviewer.ctx,input)).job_id,first.job_id);
   assert.equal((await schedule(await read(r))).job_id,first.job_id);
   assert.equal((await db.execute('SELECT id FROM platform_jobs WHERE business_key=?',[r.id]))[0].length,1);
   await advance(first.job_id);assert.equal((await jobs.get(first.job_id)).status,'SUCCEEDED',JSON.stringify({last_error:(await jobs.get(first.job_id)).last_error,proof_at:observations.get(r.id)?.occurred_at,submitted_at:(await read(r)).data.submitted_at}));assert.ok(observations.get(r.id).occurred_at>=(await read(r)).data.submitted_at);assert.equal((await read(r)).current_status,'SUCCEEDED');
   assert.equal(count('refund',r.id),1);evidence.push({case_id:r.id,job_id:first.job_id,check:'atomic_schedule_and_one_send'});
  });
  await t.test('lost provider response persists UNKNOWN and worker restart only queries the original refund',async()=>{
   const r=await approvedCase(1000),q=await schedule(r);behavior='lost';
   await advance(q.job_id);assert.equal((await jobs.get(q.job_id)).status,'RETRY');assert.equal((await read(r)).current_status,'UNKNOWN');assert.equal(count('refund',r.id),1);
   const reserved=(await summary()).reserved_balance_minor;assert.equal(reserved,1000);
   behavior='success';await due(q.job_id);
   const restarted=createWorker({repository:jobs,handlers:new Map([[TYPE,createRechargeRefundHandler({refunds:R,operatorContext:async()=>reviewer.ctx,providers})]]),leaseMs:60000,pollMs:10});
   await advance(q.job_id,restarted);assert.equal((await jobs.get(q.job_id)).status,'SUCCEEDED');assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);assert.equal((await summary()).reserved_balance_minor,0);
   evidence.push({case_id:r.id,job_id:q.job_id,check:'restart_queries_without_resend'});
  });
  await t.test('expired lease cannot settle money or finish a job; a new lease queries and settles once',async()=>{
   const r=await approvedCase(1000),q=await schedule(r),old=await claimFor(q.job_id,'old-worker');
   assert.equal(old.id,q.job_id);duringRefund=()=>db.execute("UPDATE platform_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?",[q.job_id]);
   try{await assert.rejects(handler.execute(old,{}),{code:'LEASE_LOST'});}finally{duringRefund=null;}
   await assert.rejects(jobs.finish(old,{status:'SUCCEEDED',result_ref:r.id}),{code:'LEASE_LOST'});
   await assert.rejects(R.applyVerifiedReceipt(observations.get(r.id),{task:old}),{code:'LEASE_LOST'});
   assert.equal((await read(r)).current_status,'SUBMITTING');
   await advance(q.job_id);assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);assert.equal((await jobs.get(q.job_id)).status,'SUCCEEDED');
   evidence.push({case_id:r.id,job_id:q.job_id,check:'expired_lease_blocked_then_recovered'});
  });
  await t.test('bad receipt blocks, never releases funds; current independent permission is required to resume',async()=>{
   const r=await approvedCase(1000),q=await schedule(r);behavior='bad';await advance(q.job_id);behavior='success';
   assert.equal((await jobs.get(q.job_id)).status,'BLOCKED');assert.equal((await read(r)).current_status,'SUBMITTING');assert.equal((await summary()).reserved_balance_minor,1000);
   const i={record_id:r.id,expected_version:(await read(r)).object_version,reason:'synthetic retry',operation_key:key()};
   await assert.rejects(R.retryTask(buyer.ctx,i),{code:'SELF_REVIEW_FORBIDDEN'});
   await grant(reviewer,'WALLET_REFUND_REVIEW',false,1);await assert.rejects(R.retryTask(reviewer.ctx,i),{code:'WALLET_OPERATOR_FORBIDDEN'});await grant(reviewer,'WALLET_REFUND_REVIEW',true,2);
   await R.retryTask(reviewer.ctx,i);await R.retryTask(reviewer.ctx,i);
   assert.equal((await db.execute('SELECT id FROM platform_job_retries WHERE job_id=?',[q.job_id]))[0].length,1);
   await advance(q.job_id);assert.equal((await jobs.get(q.job_id)).status,'SUCCEEDED');assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);
   evidence.push({case_id:r.id,job_id:q.job_id,check:'independent_retry_does_not_resend'});
  });
  await t.test('missing adapter and changed merchant fail closed; cancelled queued cases never send',async()=>{
   let r=await approvedCase(1000),q=await schedule(r);providers.clear();await advance(q.job_id);
   assert.equal((await jobs.get(q.job_id)).last_error,'CUSTODY_PROVIDER_NOT_CONNECTED');assert.equal((await read(r)).current_status,'APPROVED');assert.equal(count('refund',r.id),0);
   providers.set(binding.provider,{...provider,binding:{...binding,merchant_id:'wrong'}});await retry(r);await advance(q.job_id);assert.equal((await jobs.get(q.job_id)).last_error,'CUSTODY_RECEIPT_MISMATCH');assert.equal(count('refund',r.id),0);
   providers.set(binding.provider,provider);await cancel(await read(r));
   r=await approvedCase(1000);q=await schedule(r);await cancel(await read(r));await advance(q.job_id);
   assert.equal(count('refund',r.id),0);assert.equal((await jobs.get(q.job_id)).status,'SUCCEEDED');assert.equal((await summary()).reserved_balance_minor,0);
  });

  await t.test('a manually sent old case is scheduled for query only; completed money survives a lost job-completion write',async()=>{
   const r=await approvedCase(1000),claimed=(await R.claim(reviewer.ctx,{record_id:r.id},binding)).record;
   const input={record_id:r.id,recharge_id:r.parent_id,binding,original_transaction_id:r.data.original_transaction_id,currency:'CNY',amount_minor:1000};
   await provider.refund(input,{idempotency_key:r.id});
   const q=await schedule(claimed),j=await claimFor(q.job_id,'lost-finish');
   const outcome=await handler.execute(j,{});assert.equal(outcome.status,'SUCCEEDED');assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);
   await db.execute("UPDATE platform_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?",[j.id]);
   await assert.rejects(jobs.finish(j,outcome),{code:'LEASE_LOST'});
   providers.clear();await advance(q.job_id);providers.set(binding.provider,provider);
   assert.equal((await jobs.get(q.job_id)).status,'SUCCEEDED');assert.equal(count('refund',r.id),1);assert.equal(count('query',r.id),1);
   evidence.push({case_id:r.id,job_id:q.job_id,check:'legacy_send_query_and_finished_money_job_recovery'});
  });
  await t.test('consumed recharge case remains open; actual order refund restores its original lot then original-route refund completes',async()=>{
   const amount=(await summary()).available_balance_minor,o=await order(amount),p=await payment(o);
   await trade.applyPayment({...config,payment_id:p.id,currency:'CNY',amount_minor:amount,transaction_id:'synthetic:'+p.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   let r=await request(amount);await assert.rejects(R.review(reviewer.ctx,reviewInput(r)),{code:'CUSTODY_REFUND_FUNDS_UNAVAILABLE'});
   assert.equal((await read(r)).current_status,'IN_REVIEW');
   let purchase=await stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id});purchase=await stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,expected_version:purchase.object_version,kind:'RIGHTS_DISPUTE',reason:'synthetic adjudicated original consumption',operation_key:key()});
   await stock.resolveCase(reviewer.ctx,{order_id:o.id,expected_version:purchase.object_version,case_id:purchase.data.current_case_id,decision:'REFUND',reason:'synthetic independent',operation_key:key()});
   let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:p.id,allocations:[{line_id:'stock',amount_minor:amount}],reason:'synthetic original lot recovery',operation_key:key()});
   refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'synthetic independent',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');
   await trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
   assert.equal((await summary()).available_balance_minor,amount);
   r=await R.review(reviewer.ctx,reviewInput(r));const q=await schedule(r);await advance(q.job_id);
   assert.equal((await read(r)).current_status,'SUCCEEDED');assert.equal((await summary()).recorded_balance_minor,0);assert.equal((await summary()).qualifying_growth,0);
   assert.equal((await db.withTransaction(tx=>C.load(tx,recharge.id))).data.refunded_minor,30000);
   evidence.push({recharge_id:recharge.id,order_id:o.id,payment_id:p.id,consumption_refund_id:refund.id,case_id:r.id,job_id:q.job_id,check:'spent_lot_recovered_then_original_refund'});
  });
  // Synthetic historical recharge first, then change this isolated person's age band to represent a minor's old balance.
  // This does not enable a minor to create new real recharges.
  const childTopup=await db.withTransaction(tx=>custody.prepare(tx,{id:buyer2.account_id},{party_id:buyer2.personal_party_id,amount_minor:30000,operation_key:key()},binding));
  await custody.applyVerifiedReceipt({record_id:childTopup.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic-child:'+childTopup.id,occurred_at:await require('../src/modules/artists/context').now(db),status:'SUCCEEDED'});
  await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[buyer2.person.id]);
  const G=require('../src/modules/guardians/repository').createGuardianRepository(db,{resolvePrincipal:S.resolvePrincipal});
  await grant(reviewer,'PRIVACY_REVIEW');await grant(S.seller,'WALLET_REFUND_REVIEW');await grant(buyer2,'WALLET_REFUND_REVIEW');
  const guardianProof=await S.supply.upload(S.seller.ctx,{party_id:S.seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic guardian case evidence'),operation_key:key()});
  const ruleId=key(),terms={version:'CONTRACT_20261029',daily_minutes:30,rest_minutes:15,single_minor:1000,daily_minor:2000,night_start:22,night_end:8,terms:'synthetic guardian only'},content=require('../src/modules/governance/content').createRuleContent({id:ruleId,rule_key:'guardian.protection',version:'synthetic-v1',terms:{guardian_protection:terms}});
  await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[ruleId,'guardian.protection',content.version,JSON.stringify(content),'2020-01-01 00:00:00',reviewer.account_id]);
  let link=await G.invite(S.seller.ctx,{child_account_id:buyer2.account_id,relationship:'synthetic parent',evidence_asset_ids:[guardianProof.id],rule_id:ruleId,valid_until:'2099-01-01T00:00:00.000Z',operation_key:key()});
  const childInput=()=>({party_id:buyer2.personal_party_id,recharge_id:childTopup.id,amount_minor:10000,reason:'synthetic guardian original refund',evidence_asset_ids:[guardianProof.id],guardian_link_id:link.id,operation_key:key()});
  await t.test('guardian must be active and owns evidence; no child impersonation, foreign source or self-review',async()=>{
   await assert.rejects(R.request(S.seller.ctx,childInput()),{code:'GUARDIAN_LINK_NOT_ACTIVE'});
   link=await G.decide(buyer2.ctx,{record_id:link.id,expected_version:link.object_version,decision:'ACCEPT',reason:'synthetic child acceptance',operation_key:key()});
   link=await G.decide(reviewer.ctx,{record_id:link.id,operations:true,expected_version:link.object_version,decision:'APPROVE',age_band:'AGE_14_17',identity_checked:true,relationship_checked:true,reason:'synthetic independent guardian verification',operation_key:key()});
   await assert.rejects(R.request(outsider.ctx,childInput()),{code:'GUARDIAN_OWNER_REQUIRED'});
   await assert.rejects(R.request(S.seller.ctx,{...childInput(),party_id:buyer.personal_party_id}),{code:'GUARDIAN_REFUND_TARGET_MISMATCH'});
   await assert.rejects(R.request(S.seller.ctx,{...childInput(),evidence_asset_ids:[proofAsset.id]}),{code:'PRIVATE_MATERIAL_NOT_READY'});
   const input=childInput(),r=await R.request(S.seller.ctx,input);assert.equal((await R.request(S.seller.ctx,input)).id,r.id);
   assert.equal(r.created_by,S.seller.account_id);assert.equal(r.owner_party_id,buyer2.personal_party_id);
   assert.equal((await R.readForGuardian(S.seller.ctx,{record_id:r.id})).id,r.id);await assert.rejects(R.readForGuardian(outsider.ctx,{record_id:r.id}),{code:'WALLET_NOT_FOUND'});
   for(const u of [S.seller,buyer2])await assert.rejects(R.review(u.ctx,reviewInput(r)),{code:'SELF_REVIEW_FORBIDDEN'});
   await assert.rejects(R.review(reviewer.ctx,reviewInput(r)),{code:'GUARDIAN_REFUND_VERIFICATION_REQUIRED'});
   const approved=await R.review(reviewer.ctx,{...reviewInput(r),checks:{...reviewInput(r).checks,relationship_verified:true}}),q=await schedule(approved);await advance(q.job_id);
   assert.equal((await jobs.get(q.job_id)).status,'SUCCEEDED');assert.equal((await db.withTransaction(tx=>C.load(tx,childTopup.id))).data.refunded_minor,10000);
   evidence.push({guardian_link_id:link.id,recharge_id:childTopup.id,case_id:r.id,job_id:q.job_id,check:'independent_guardian_refund'});
  });
  await t.test('revoked guardian cannot submit, read or dispatch an unsent approval; trusted in-flight result may still settle',async()=>{
   const one=await R.request(S.seller.ctx,childInput()),two=await R.request(S.seller.ctx,childInput());
   const approve=r=>R.review(reviewer.ctx,{...reviewInput(r),checks:{...reviewInput(r).checks,relationship_verified:true}});
   const approved=await approve(one),inflight=await approve(two),queued=await schedule(approved),active=await schedule(inflight);
   // Claim only the in-flight task explicitly; the queued approval is still unsent.
   const task=await claimFor(queued.job_id,'guardian-inflight');
   assert.ok([queued.job_id,active.job_id].includes(task.id));
   const sentId=task.payload_ref,unsentId=sentId===one.id?two.id:one.id;
   const claimed=await R.claim(reviewer.ctx,{record_id:sentId},binding,{task});
   const req={record_id:sentId,recharge_id:childTopup.id,binding,original_transaction_id:claimed.record.data.original_transaction_id,currency:'CNY',amount_minor:10000};
   await provider.refund(req,{idempotency_key:sentId});
   link=await G.decide(S.seller.ctx,{record_id:link.id,expected_version:link.object_version,decision:'REVOKE',reason:'synthetic revoked guardianship',operation_key:key()});
   await assert.rejects(R.request(S.seller.ctx,childInput()),{code:'GUARDIAN_LINK_NOT_ACTIVE'});
   await assert.rejects(R.readForGuardian(S.seller.ctx,{record_id:one.id}),{code:'GUARDIAN_LINK_NOT_ACTIVE'});
   await assert.rejects(R.claim(reviewer.ctx,{record_id:unsentId},binding),{code:'GUARDIAN_LINK_NOT_ACTIVE'});
   const outcome=await handler.recover(task,{});await jobs.finish(task,outcome);assert.equal(outcome.status,'SUCCEEDED');assert.equal(count('refund',sentId),1);assert.equal(count('query',sentId),1);
   await advance(active.job_id);const unsent=await R.read(reviewer.ctx,{record_id:unsentId,operations:true});assert.equal(unsent.current_status,'APPROVED');
   await R.cancel(buyer2.ctx,{record_id:unsent.id,party_id:buyer2.personal_party_id,expected_version:unsent.object_version,reason:'synthetic child cancels unsent case',operation_key:key()});
   assert.equal((await db.withTransaction(tx=>C.load(tx,childTopup.id))).data.refunded_minor,20000);
   evidence.push({guardian_link_id:link.id,sent_case_id:sentId,unsent_case_id:unsentId,check:'revocation_blocks_new_send_but_preserves_financial_truth'});
  });
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/recharge-refund-recovery-journey.json'),JSON.stringify({synthetic_only:true,evidence,provider_calls:providerCalls,live_provider_enabled:false,frontend_run:false,limits:['Internal injected normalized adapter, not real signatures or network','Guardian relation and cases via repository, no new HTTP or page','Spent funds recovered only by actual synthetic order refund; no platform advance']},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
