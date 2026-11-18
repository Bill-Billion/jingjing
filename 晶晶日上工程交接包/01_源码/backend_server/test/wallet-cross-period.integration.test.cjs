'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const A=require('../src/modules/artists/context'),C=require('../src/modules/wallet/context');
test('one wallet keeps original recharge lots through renewal, expiry, spending and original-route refunds',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_wallet_period_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,failed=false;const checks=[],fixtures=[];
 const check=async(label,fn)=>t.test(label,async()=>{try{checks.push({name:label,result:'PASS',records:await fn()});}catch(e){failed=true;checks.push({name:label,result:'FAIL',error:e.code||e.message});throw e;}});
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await require('../src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'1'});await require('../src/infrastructure/database/migrator').migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,reviewer,outsider,trade,stock}=S;
  const grant=(u,action)=>require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:cross-period',reason:'isolated test only'});
  for(const u of [outsider,reviewer])await grant(u,'WALLET_RULE_REVIEW');await grant(reviewer,'WALLET_REFUND_REVIEW');
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal}),custody=require('../src/modules/wallet/custody').createCustodyLedger(db),R=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(db,{resolvePrincipal:S.resolvePrincipal});
  let rule=await W.createRule(outsider.ctx,{rule:require('./helpers/wallet-rule.cjs'),operation_key:key()});rule=await W.reviewRule(reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'Synthetic independent',operation_key:key()});
  const account=await W.open(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:rule.id,rule_sha256:rule.content_sha256,operation_key:key()});
  const proofAsset=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic original recharge refund proof'),operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url='http://127.0.0.1:'+server.address().port+'/api/v1/wallet/summary';
  async function summary(expected=200){const res=await fetch(url,{headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id},signal:AbortSignal.timeout(10000)}),value=await res.json();fixtures.push({method:'GET',path:'/api/v1/wallet/summary',schema:res.ok?'WalletResponse':'ErrorResponse',value});assert.equal(res.status,expected,JSON.stringify(value));if(expected!==200){assert.equal(value.error.code,'AUTHENTICATION_REQUIRED');return;}return value.data;}
  const epoch=Math.floor(Date.parse(await A.now(db))/1000)+60,at=days=>new Date((epoch+days*86400)*1000).toISOString();let day=-1;
  async function advance(next){assert.ok(next>day);await db.execute('SET timestamp=?',[epoch+next*86400]);if(day>=0){await summary(401);const auth=require('../src/modules/auth/repository').createAuthRepository(db,{secret:S.secret});buyer.token=randomBytes(32).toString('base64url');await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',buyer.token),buyer.account_id]);}day=next;}
  const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'v1'},topups=[];
  async function topup(amount){const r=await db.withTransaction(tx=>custody.prepare(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,amount_minor:amount,operation_key:key()},binding));const proof={record_id:r.id,...binding,currency:'CNY',amount_minor:amount,transaction_id:'synthetic:'+r.id,occurred_at:await A.now(db),status:'SUCCEEDED'};const done=await custody.applyVerifiedReceipt(proof);assert.equal((await custody.applyVerifiedReceipt(proof)).object_version,done.object_version);topups.push({record:done,proof});return done;}
  let paidOrder,payment,renewal,refundCase,earning;
  await check('two actual recharge receipts reach the first threshold without creating consumption growth',async()=>{
   await advance(0);await topup(10000);assert.equal((await summary()).membership.active,false);await advance(1);await topup(20000);
   const q=await summary();assert.equal(q.membership.active,true);assert.equal(q.membership.valid_until,at(366));assert.equal(q.recorded_balance_minor,30000);assert.equal(q.qualifying_growth,0);assert.equal(q.available_points,0);
   return {account_id:account.id,recharge_ids:topups.map(x=>x.record.id),balance_minor:30000,valid_until:at(366)};
  });
  await check('renewal extends the same account once and expiry preserves every original balance lot',async()=>{
   await advance(10);await topup(30000);assert.equal((await summary()).membership.valid_until,at(731));await advance(730);assert.equal((await summary()).membership.active,true);await advance(731);
   const q=await summary();assert.equal(q.membership.active,false);assert.equal(q.membership.reason,'MEMBERSHIP_EXPIRED');assert.equal(q.recorded_balance_minor,60000);assert.equal(q.available_balance_minor,60000);assert.equal(q.qualifying_growth,0);
   return {account_id:account.id,recharge_ids:topups.map(x=>x.record.id),expiry:at(731),balance_minor:60000};
  });
  await check('expired membership still spends existing funds and actual stock acceptance establishes the original earning',async()=>{
   await advance(732);await assert.rejects(S.listing(),{code:'STOCK_L1_REQUIRED'});
   // The seller's original annual declaration also expired; renew it through its existing independent review.
   let halo=await S.artists.requestHalo(S.seller.ctx,{person_id:S.seller.person.id,party_id:S.seller.personal_party_id,level:1,ownership_promise:true,evidence_asset_ids:[S.evidence.id],service_id:null,operation_key:key()});halo=await S.artists.review(reviewer.ctx,{person_id:S.seller.person.id,record_id:halo.id,expected_version:halo.object_version,decision:'APPROVE',reason:'Synthetic current seller declaration',operation_key:key()});
   const listing=await S.listing();paidOrder=await trade.stockCheckout(buyer.ctx,{party_id:buyer.personal_party_id,listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'CUSTODY',operation_key:key()});
   const cfg={...S.config,provider:'CUSTODY',merchant_id:binding.merchant_id,config_revision:binding.revision,custody_binding:binding};payment=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id,installment_key:'stock',operation_key:key()},cfg);
   await trade.applyPayment({...cfg,payment_id:payment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic:'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   await stock.content(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id});await stock.observed(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id});const p=await stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id});await stock.accept(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id,expected_version:p.object_version,operation_key:key()});
   assert.equal((await W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id,operation_key:key()})).pending_reason,'AFTERCARE_WINDOW');const q=await summary();assert.equal(q.recorded_balance_minor,59900);assert.equal(q.membership.active,false);assert.equal(q.qualifying_growth,0);
   return {account_id:account.id,order_id:paidOrder.id,payment_id:payment.id,spent_minor:100,accepted_at:at(732),membership_active:false};
  });
  await check('actual accepted consumption matures and a later recharge restores membership without buying growth',async()=>{
   await advance(739);earning=await W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id,operation_key:key()});assert.equal(earning.current_status,'ISSUED');assert.equal((await summary()).qualifying_growth,10);
   await advance(740);renewal=await topup(30000);const q=await summary();assert.equal(q.membership.active,true);assert.equal(q.membership.valid_until,at(1105));assert.equal(q.qualifying_growth,10);assert.equal(q.available_points,10);assert.equal(q.recorded_balance_minor,89900);
   return {account_id:account.id,earning_id:earning.id,order_id:paidOrder.id,recharge_id:renewal.id,valid_until:at(1105),growth:10};
  });
  await check('unsent refund cancellation releases its hold; unknown result keeps it until original-route receipt settles once',async()=>{
   await advance(741);const request=()=>R.request(buyer.ctx,{party_id:buyer.personal_party_id,recharge_id:renewal.id,amount_minor:30000,reason:'Synthetic mistaken new-period recharge',evidence_asset_ids:[proofAsset.id],operation_key:key()});
   const approve=r=>R.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',amount_minor:30000,reason:'Synthetic independent',checks:{identity_verified:true,source_verified:true,refund_basis_verified:true},operation_key:key()});
   let r=await approve(await request());assert.equal((await summary()).reserved_balance_minor,30000);await R.cancel(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id,expected_version:r.object_version,reason:'Synthetic cancel before send',operation_key:key()});assert.equal((await summary()).reserved_balance_minor,0);
   r=await approve(await request());r=(await R.claim(reviewer.ctx,{record_id:r.id},binding)).record;
   const proof={record_id:r.id,recharge_id:renewal.id,...binding,original_transaction_id:topups[3].proof.transaction_id,refund_transaction_id:null,currency:'CNY',amount_minor:30000,occurred_at:await A.now(db),status:'UNKNOWN'};
   r=await R.applyVerifiedReceipt(proof);assert.equal(r.current_status,'UNKNOWN');assert.equal((await summary()).reserved_balance_minor,30000);assert.equal((await summary()).membership.active,true);
   await assert.rejects(R.applyVerifiedReceipt({...proof,status:'SUCCEEDED',refund_transaction_id:'synthetic:'+r.id,amount_minor:1}),{code:'CUSTODY_RECEIPT_MISMATCH'});
   const success={...proof,status:'SUCCEEDED',refund_transaction_id:'synthetic:'+r.id};refundCase=await R.applyVerifiedReceipt(success);assert.equal((await R.applyVerifiedReceipt(success)).object_version,refundCase.object_version);
   const q=await summary();assert.equal(q.recorded_balance_minor,59900);assert.equal(q.reserved_balance_minor,0);assert.equal(q.membership.active,false);assert.equal(q.membership.valid_until,at(731));assert.equal(q.qualifying_growth,10);assert.equal(q.available_points,10);
   return {account_id:account.id,recharge_id:renewal.id,refund_case_id:refundCase.id,refunded_minor:30000,balance_minor:59900,membership_active:false,growth_preserved:10};
  });
  await check('refund of the same accepted purchase restores its original recharge lot and reverses only its consumption growth',async()=>{
   await advance(742);let p=await stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id});p=await stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:paidOrder.id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'Synthetic independently verified rights case',operation_key:key()});await stock.resolveCase(reviewer.ctx,{order_id:paidOrder.id,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',reason:'Synthetic independent full refund',operation_key:key()});
   let r=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'Synthetic original purchase refund',operation_key:key()});r=await trade.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'Synthetic independent',operation_key:key()});await trade.claim(reviewer.ctx,r.id,null,'REFUND');const proof={...r.data,refund_id:r.id,status:'SUCCEEDED'};await trade.applyRefund(r.id,proof);await trade.applyRefund(r.id,proof);
   const q=await summary();assert.equal(q.recorded_balance_minor,60000);assert.equal(q.qualifying_growth,0);assert.equal(q.available_points,0);assert.equal(q.membership.active,false);
   const spend=(await W.records(buyer.ctx,{party_id:buyer.personal_party_id,kind:'CASH_SPEND'})).items[0];assert.equal(spend.data.allocations[0].recharge_id,topups[0].record.id);assert.equal(spend.data.allocations[0].returned_minor,100);
   const old=await trade.read(buyer.ctx,{record_id:paidOrder.id,party_id:buyer.personal_party_id});assert.deepEqual(old.data.contract,paidOrder.data.contract);assert.deepEqual(old.data.financial,{received_minor:100,refunded_minor:100,net_minor:0});
   return {account_id:account.id,order_id:paidOrder.id,refund_id:r.id,restored_recharge_id:topups[0].record.id,restored_minor:100,growth:0,balance_minor:60000};
  });
  await check('a later recharge restores one year from its own receipt while original rules and settled refunds stay unchanged',async()=>{
   await advance(750);const r=await topup(30000),q=await summary();assert.equal(q.membership.active,true);assert.equal(q.membership.valid_until,at(1115));assert.equal(q.recorded_balance_minor,90000);assert.equal(q.qualifying_growth,0);
   assert.deepEqual((await db.withTransaction(tx=>C.load(tx,account.id))).data,account.data);assert.equal((await db.withTransaction(tx=>C.load(tx,renewal.id))).data.refunded_minor,30000);assert.equal((await R.read(buyer.ctx,{record_id:refundCase.id,party_id:buyer.personal_party_id})).current_status,'SUCCEEDED');
   return {account_id:account.id,recharge_id:r.id,valid_until:at(1115),balance_minor:90000,original_rule_unchanged:true};
  });
 }catch(e){failed=true;throw e;}finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
  const out=path.resolve(__dirname,'../../../..','.local');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'wallet-cross-period-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(out,'wallet-cross-period-result.json'),JSON.stringify({result:failed?'FAIL':'PASS',checks,limits:['One isolated connection clock advances monotonically; new synthetic login sessions replace expired sessions','Identity and provider receipt prerequisites are synthetic; no real channel','Business records are created by repositories; no inserted balances, membership dates or earning statuses','HTTP summaries plus repository financial operations; no frontend']},null,2));
 }
});
