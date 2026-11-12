'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const C=require('../src/modules/wallet/context');
test('original recharge refund cases, reservations, trusted recovery and private copies in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_recharge_refund_'+randomBytes(7).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
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
  const receipt=(r,status='SUCCEEDED',extra={})=>({record_id:r.id,recharge_id:recharge.id,...binding,original_transaction_id:topupProof.transaction_id,refund_transaction_id:status==='SUCCEEDED'?'synthetic-refund:'+r.id:null,currency:'CNY',amount_minor:r.data.amount_minor,occurred_at:new Date().toISOString(),status,...extra});
  const assessment=()=>db.withTransaction(tx=>custody.assessRefund(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,recharge_id:recharge.id},binding));
  const config={...S.config,provider:'CUSTODY',merchant_id:binding.merchant_id,config_revision:binding.revision,custody_binding:binding};
  async function order(amount){let spec=await trade.createSpec(S.seller.ctx,{party_id:S.seller.personal_party_id,previous_spec_id:null,title:'synthetic refund/payment competition',provider_party_id:S.seller.personal_party_id,line_kind:'OTHER',unit_minor:amount,currency:'CNY',specification:S.spec.data.specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic cash',operation_key:key()});await S.publishSales(S.seller.personal_party_id,spec.id);let l=await stock.create(S.seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});l=await S.reviewListing(l,'RIGHTS');l=await S.reviewListing(l,'CONTENT');return trade.stockCheckout(buyer.ctx,{party_id:buyer.personal_party_id,listing_id:l.id,offer_sha256:l.content_sha256,channel:'CUSTODY',operation_key:key()});}
  const payment=o=>trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,installment_key:'stock',operation_key:key()},config);
  const cancel=r=>R.cancel(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id,expected_version:r.object_version,reason:'synthetic cancel unsent refund',operation_key:key()});
  let first,second,approved,successfulProof,final;
  await t.test('same request key returns one case; foreign account and changed request are denied',async()=>{
   const op=key();first=await request(20000,op);assert.equal((await request(20000,op)).id,first.id);await assert.rejects(request(19999,op),{code:'IDEMPOTENCY_CONFLICT'});
   await assert.rejects(R.request(buyer2.ctx,{party_id:buyer2.personal_party_id,recharge_id:recharge.id,amount_minor:1,reason:'foreign',evidence_asset_ids:[proofAsset.id],operation_key:key()}),{code:'WALLET_NOT_FOUND'});
   await assert.rejects(R.read(buyer2.ctx,{record_id:first.id,party_id:buyer2.personal_party_id}),{code:'WALLET_NOT_FOUND'});
   assert.equal((await summary()).available_balance_minor,30000);assert.equal((await summary()).membership.active,true);
  });
  await t.test('only a separately granted independent reviewer can approve; approval atomically reserves the original lot',async()=>{
   const input=reviewInput(first);await assert.rejects(R.review(buyer.ctx,input),{code:'SELF_REVIEW_FORBIDDEN'});await assert.rejects(R.review(outsider.ctx,input),{code:'WALLET_OPERATOR_FORBIDDEN'});
   await assert.rejects(R.review(reviewer.ctx,{...input,checks:{...input.checks,refund_basis_verified:false}}),{code:'CUSTODY_REFUND_VERIFICATION_REQUIRED'});
   await assert.rejects(R.review(reviewer.ctx,{...input,expected_version:2}),{code:'VERSION_CONFLICT'});
   approved=await R.review(reviewer.ctx,input);assert.equal((await R.review(reviewer.ctx,input)).object_version,approved.object_version);
   const q=await summary();assert.equal(q.recorded_balance_minor,30000);assert.equal(q.available_balance_minor,10000);assert.equal(q.reserved_balance_minor,20000);assert.equal(q.membership.active,true);
   assert.equal((await assessment()).refund_reserved_minor,20000);assert.equal((await assessment()).available_for_refund_minor,10000);
   await assert.rejects(R.applyVerifiedReceipt(receipt(approved)),{code:'CUSTODY_RECEIPT_MISMATCH'});
  });
  await t.test('reserved refund blocks actual payment; insufficient available funds leave a new case open rather than rejecting its basis',async()=>{
   const o=await order(20000);await assert.rejects(payment(o),{code:'WALLET_BALANCE_INSUFFICIENT'});
   second=await request(20000);await assert.rejects(R.review(reviewer.ctx,reviewInput(second)),{code:'CUSTODY_REFUND_FUNDS_UNAVAILABLE'});
   assert.equal((await read(second)).current_status,'IN_REVIEW');assert.equal((await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND order_id=?",[o.id]))[0].length,0);
  });
  await t.test('one dispatch claim and unknown recovery keep funds reserved; wrong proofs cannot change the original recharge',async()=>{
   await assert.rejects(R.claim(outsider.ctx,{record_id:first.id},binding),{code:'WALLET_OPERATOR_FORBIDDEN'});
   await assert.rejects(R.claim(reviewer.ctx,{record_id:first.id},{...binding,merchant_id:'wrong'}),{code:'CUSTODY_RECEIPT_MISMATCH'});
   const claims=await Promise.all([R.claim(reviewer.ctx,{record_id:first.id},binding),R.claim(reviewer.ctx,{record_id:first.id},binding)]);assert.equal(claims.filter(x=>x.dispatch).length,1);assert.equal(claims.find(x=>!x.dispatch).reconcile,true);
   let current=await read(first);const unknown=receipt(current,'UNKNOWN');current=await R.applyVerifiedReceipt(unknown);assert.equal((await R.applyVerifiedReceipt(unknown)).object_version,current.object_version);
   await assert.rejects(cancel(current),{code:'CUSTODY_REFUND_CANNOT_CANCEL'});assert.equal((await R.claim(reviewer.ctx,{record_id:first.id},binding)).reconcile,true);
   for(const extra of [{amount_minor:1},{merchant_id:'other'},{environment:'PRODUCTION'},{revision:'other'},{recharge_id:key()},{original_transaction_id:'wrong'},{occurred_at:'2000-01-01T00:00:00.000Z'},{occurred_at:'2099-01-01T00:00:00.000Z'}])await assert.rejects(R.applyVerifiedReceipt(receipt(current,'SUCCEEDED',extra)),{code:'CUSTODY_RECEIPT_MISMATCH'});
   assert.equal((await summary()).available_balance_minor,10000);assert.equal((await summary()).membership.active,true);assert.equal((await db.withTransaction(tx=>C.load(tx,recharge.id))).data.refunded_minor,0);
  });
  await t.test('trusted partial receipt and duplicate queries reduce recharge net once; membership recalculates without adding consumption growth',async()=>{
   successfulProof=receipt(await read(first));const results=await Promise.all([R.applyVerifiedReceipt(successfulProof),R.applyVerifiedReceipt(successfulProof)]);assert.equal(results[0].object_version,results[1].object_version);
   const q=await summary();assert.equal(q.recorded_balance_minor,10000);assert.equal(q.reserved_balance_minor,0);assert.equal(q.membership.active,false);assert.equal(q.qualifying_growth,0);assert.equal(q.available_points,0);
   assert.equal((await custody.applyVerifiedReceipt(topupProof)).data.refunded_minor,20000);assert.equal((await summary()).recorded_balance_minor,10000);
   await assert.rejects(R.applyVerifiedReceipt({...successfulProof,refund_transaction_id:'different'}),{code:'CUSTODY_REFUND_TERMINAL_CONFLICT'});
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='RECHARGE_REFUND_RECEIPT'"))[0].length,1);
  });
  await t.test('partial independent decision can reserve remaining funds and unsent cancellation releases exactly that reservation',async()=>{
   let r=await R.review(reviewer.ctx,reviewInput(second,10000));assert.equal(r.data.requested_minor,20000);assert.equal(r.data.amount_minor,10000);assert.equal((await summary()).available_balance_minor,0);
   const input={record_id:r.id,party_id:buyer.personal_party_id,expected_version:r.object_version,reason:'cancel before send',operation_key:key()};r=await R.cancel(buyer.ctx,input);assert.equal((await R.cancel(buyer.ctx,input)).id,r.id);
   assert.equal((await summary()).available_balance_minor,10000);assert.equal((await R.claim(reviewer.ctx,{record_id:r.id},binding)).dispatch,false);
   await assert.rejects(request(10001),{code:'CUSTODY_REFUND_EXCEEDS_RECHARGE'});
  });
  await t.test('two refund approvals and actual payment versus refund cannot reserve the same remaining money twice',async()=>{
   const a=await request(6000),b=await request(6000),race=await Promise.allSettled([R.review(reviewer.ctx,reviewInput(a)),R.review(reviewer.ctx,reviewInput(b))]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.find(x=>x.status==='rejected').reason.code,'CUSTODY_REFUND_FUNDS_UNAVAILABLE');
   await cancel(race.find(x=>x.status==='fulfilled').value);assert.equal((await summary()).available_balance_minor,10000);
   const o=await order(10000),r=await request(10000),results=await Promise.allSettled([payment(o),R.review(reviewer.ctx,reviewInput(r))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await summary()).available_balance_minor,0);assert.equal((await summary()).reserved_balance_minor,10000);
   if(results[0].status==='fulfilled'){const p=results[0].value;assert.equal(results[1].reason.code,'CUSTODY_REFUND_FUNDS_UNAVAILABLE');await trade.applyPayment({...config,payment_id:p.id,currency:'CNY',amount_minor:10000,transaction_id:'synthetic:'+p.id,status:'CLOSED',product_id:null,app_account_token:null});}
   else{assert.equal(results[0].reason.code,'WALLET_BALANCE_INSUFFICIENT');await cancel(results[1].value);}
   assert.equal((await summary()).available_balance_minor,10000);
  });
  await t.test('verified close releases an unknown refund, terminal contradictions require review and revoked operators cannot dispatch',async()=>{
   let r=await R.review(reviewer.ctx,reviewInput(await request(5000)));await grant(reviewer,'WALLET_REFUND_REVIEW',false,1);await assert.rejects(R.claim(reviewer.ctx,{record_id:r.id},binding),{code:'WALLET_OPERATOR_FORBIDDEN'});await grant(reviewer,'WALLET_REFUND_REVIEW',true,2);
   r=(await R.claim(reviewer.ctx,{record_id:r.id},binding)).record;const closed=receipt(r,'CLOSED');r=await R.applyVerifiedReceipt(closed);assert.equal((await R.applyVerifiedReceipt(closed)).object_version,r.object_version);assert.equal((await summary()).available_balance_minor,10000);
   await assert.rejects(R.applyVerifiedReceipt(receipt(r)),{code:'CUSTODY_REFUND_TERMINAL_CONFLICT'});
  });
  await t.test('receipt replay across cases and failed audit cannot mutate money; final remainder receipt closes the original recharge net',async()=>{
   final=await R.review(reviewer.ctx,reviewInput(await request(10000)));final=(await R.claim(reviewer.ctx,{record_id:final.id},binding)).record;
   await assert.rejects(R.applyVerifiedReceipt(receipt(final,'SUCCEEDED',{refund_transaction_id:successfulProof.refund_transaction_id})),{code:'WALLET_SOURCE_ALREADY_USED'});
   const trigger='refund_audit_fail';await db.withConnection(c=>c.query("CREATE TRIGGER "+trigger+" BEFORE INSERT ON wallet_audit FOR EACH ROW BEGIN IF NEW.event_code='RECHARGE_REFUND_SETTLED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic refund audit failure'; END IF; END"));
   const proof=receipt(final);
   try{await assert.rejects(R.applyVerifiedReceipt(proof),/synthetic refund audit failure/);}finally{await db.withConnection(c=>c.query('DROP TRIGGER '+trigger));}
   assert.equal((await db.withTransaction(tx=>C.load(tx,recharge.id))).data.refunded_minor,20000);assert.equal((await read(final)).current_status,'SUBMITTING');assert.equal((await summary()).reserved_balance_minor,10000);
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='RECHARGE_REFUND_RECEIPT'"))[0].length,1);
   final=await R.applyVerifiedReceipt(proof);await R.applyVerifiedReceipt(proof);assert.equal((await db.withTransaction(tx=>C.load(tx,recharge.id))).data.refunded_minor,30000);const q=await summary();assert.equal(q.recorded_balance_minor,0);assert.equal(q.available_balance_minor,0);assert.equal(q.reserved_balance_minor,0);assert.equal(q.qualifying_growth,0);assert.equal(q.membership.active,false);
  });
  const fixtures=[];server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function http(url,schema,u=buyer,party=false){const r=await fetch(base+url,{headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':u.personal_party_id}:{}}}),value=await r.json();fixtures.push({method:'GET',path:new URL(base+url).pathname,schema:r.status===200?schema:'ErrorResponse',value});return {status:r.status,value};}
  await t.test('owner wallet and requested personal copy expose refund facts without channel credentials or independent review notes',async()=>{
   const q=await http('/wallet/summary','WalletResponse',buyer,true);assert.equal(q.status,200);assert.equal(q.value.data.recorded_balance_minor,0);assert.equal(q.value.data.custody.enabled,false);
   const privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal}),request=await privacy.create(buyer.ctx,{request:{type:'COPY',scopes:['TRANSACTIONS'],details:'synthetic original recharge refund copy'},operation_key:key()});
   const url='/privacy/requests/'+request.id+'/account-data?section=WALLET&limit=100',copy=await http(url,'PrivacyAccountCopyPageResponse');assert.equal(copy.status,200);
   const records=copy.value.data.items,own=records.find(x=>x.id===first.id);assert.equal(own.kind,'RECHARGE_REFUND');assert.equal(own.current_status,'SUCCEEDED');assert.equal(own.data.amount_minor,20000);assert.equal(own.data.requested_minor,20000);assert.equal(records.filter(x=>x.kind==='RECHARGE_REFUND_RECEIPT').length,2);
   for(const x of records.filter(x=>x.kind.startsWith('RECHARGE_REFUND')))for(const field of ['binding','original_transaction_id','refund_transaction_id','review','receipt','proof_sha256'])assert.equal(x.data[field],undefined);
   assert.equal((await http(url,'PrivacyAccountCopyPageResponse',outsider)).status,404);
  });
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/recharge-refund-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/recharge-refund-journey.json'),JSON.stringify({synthetic_only:true,recharge_id:recharge.id,partial_refund_id:first.id,remainder_refund_id:final.id,original_minor:30000,refunded_minor:30000,final_summary:await summary(),live_provider_enabled:false,limits:['Internal service methods; normalized trusted proofs injected, no provider network','No new refund HTTP endpoint, guardian recharge delegation or front-end work']},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
