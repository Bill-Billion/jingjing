'use strict';
// ACC-DEL-17.01 / 17.04: one person owns payable income, custody lots,
// points and a coupon. All records arise through module transactions/HTTP.
// The explicit synthetic registration award only prepares asset separation;
// it is not a claim about the production free-award amount or earned-points chain.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {digest,createRuleContent}=require('../src/modules/governance/content');
test('one wallet separates supplier payables, original cash lots, points and used coupons',
 {skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const[k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_qa18_sources_'+randomBytes(10).toString('hex'),realStart=Date.now(),start=Math.floor(realStart/1000)*1000-2*86400000,deadline=realStart+3600000;
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 const fixtures=[],state={synthetic_only:true,database:name,started_at:new Date(realStart).toISOString(),clock_steps:[],checks:[],stages:[],complete:false};let db,server,created=false,failed=false;
 const check=(label,fn)=>t.test(label,async()=>{try{await fn();state.checks.push({label,result:'PASS'});}catch(e){failed=true;state.checks.push({label,result:'FAIL',error:e.code||e.message});throw e;}});
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'1'});await migrate(db);
  async function clock(minutes){const ms=start+minutes*60000;await db.execute('SET timestamp=?',[ms/1000]);const [[r]]=await db.execute('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 ms');assert.equal(Number(r.ms),ms);state.clock_steps.push({minutes,at:new Date(ms).toISOString()});}
  await clock(0);const S=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider,artist}=S.people;
  await require('./helpers/trusted-identity.cjs').seedAdultIdentity(db,S.resolvePrincipal,buyer);
  // Only this newly created fixture's sessions are provisioned, for one wall-clock hour.
  for(const u of Object.values(S.people))await db.execute('UPDATE auth_sessions SET expires_ms=? WHERE account_id=?',[deadline,u.account_id]);
  for(const u of [producer,reviewer])for(const action of ['WALLET_RULE_REVIEW','REDEMPTION_REVIEW','FINANCE_REVIEW','WALLET_REFUND_REVIEW'])await S.grant(u,action);
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';state.api_base=base;state.party_id=buyer.personal_party_id;
  async function call(url,u=buyer,{body,party=u.acting_party_id,version=null,operation=key(),schema=null}={}){
   assert(Date.now()<deadline,'Synthetic fixture deadline exceeded');
   const method=body===undefined?'GET':'POST',res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':operation}:{},...version!==null?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}}),value=await res.json();
   const kind=schema||(url.startsWith('/wallet/recharge-refunds')?'RechargeRefundResponse':url.startsWith('/wallet')?'WalletResponse':url.startsWith('/redemption')?'RedemptionResponse':url.endsWith('/balances')?'FinanceBalancesResponse':url.startsWith('/finance')?'FinanceRecordResponse':'TradeRecordResponse');
   fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?kind:'ErrorResponse',value});return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const post=async(url,u,body,version=null,party=u.acting_party_id)=>ok(await call(url,u,{body,version,party}));
  const custody=require('../src/modules/wallet/custody').createCustodyLedger(db),R=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(db,{resolvePrincipal:S.resolvePrincipal});
  const A=require('../src/modules/artists/context');
  async function offer(options={}){let saved;const stop=new Error('synthetic quote preparation only');await assert.rejects(S.newOrder({...options,beforeAccept:async x=>{saved=x;throw stop;}}),e=>e===stop);return saved;}
  async function quote(a,customer,ruleId,channel){return S.reviewTrade(await S.trade.quote(producer.ctx,{party_id:S.org.party_id,buyer_party_id:customer.personal_party_id,lines:[{line_id:'film',spec_id:a.spec.id,quantity:1}],installments:a.quote.data.installments,channel,transaction_model:'PLATFORM_PRINCIPAL',rule_id:ruleId,expires_at:'2099-01-01T00:00:00.000Z',payment_window_minutes:30,license_reservation_id:null,customization_source:{request_id:a.story.id,submission_id:a.story.submission.id,content_sha256:a.story.submission.content_sha256},operation_key:key()}));}
  let agreement,coupon,held,order,payment,spend,wr;
  const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'v1'},topups=[];
  const config={provider:'CUSTODY',environment:'SANDBOX',app_id:'synthetic.app',merchant_party_id:S.org.party_id,merchant_id:binding.merchant_id,config_revision:binding.revision,custody_binding:binding};
  async function topup(amount){const r=await db.withTransaction(tx=>custody.prepare(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,amount_minor:amount,operation_key:key()},binding));const proof={record_id:r.id,...binding,currency:'CNY',amount_minor:amount,transaction_id:'synthetic:'+r.id,occurred_at:await A.now(db),status:'SUCCEEDED'};const done=await custody.applyVerifiedReceipt(proof);assert.equal((await custody.applyVerifiedReceipt(proof)).object_version,done.object_version);topups.push(done);return done;}
  async function snapshot(label,cash,reserved=0,grantStatus='AVAILABLE'){
   const wallet=ok(await call('/wallet/summary')),income=ok(await call('/finance/agreements/'+agreement.id+'/balances')),grant=ok(await call('/redemption/grants/'+coupon.id));
   assert.equal(wallet.available_balance_minor,cash);assert.equal(wallet.reserved_balance_minor,reserved);assert.equal(wallet.recorded_balance_minor,cash+reserved);assert.equal(wallet.available_points,1000);assert.equal(wallet.qualifying_growth,0);assert.equal(wallet.withdrawal_enabled,false);
   assert.equal(income.customer_payment_separate,true);assert.equal(income.items.length,1);assert.equal(income.items[0].party_id,buyer.personal_party_id);assert.equal(income.items[0].accrued_minor,12000);assert.equal(income.items[0].paid_minor,0);assert.equal(income.items[0].available_minor,0);assert.equal(income.items[0].meaning,'PAYABLE_NOT_YET_TRANSFERRED');
   assert.equal(grant.current_status,grantStatus);assert.equal(grant.data.template.production.face_minor,5000);assert.equal(grant.data.cashable,false);assert.equal(grant.data.transferable,false);
   const lots=ok(await call('/wallet/records?kind=RECHARGE')).items;state.stages.push({label,wallet,income,grant_id:grant.id,grant_status:grant.current_status,lots:lots.map(x=>({id:x.id,amount_minor:x.data.amount_minor,refunded_minor:x.data.refunded_minor}))});return wallet;
  }
  await check('same personal account has a reviewed supplier payable and a separately opened consumer wallet',async()=>{
   const a=await offer({commissioner:outsider,unitMinor:200000,preview:'SCRIPT_BEFORE_INTERIM'}),rid=key();
   const rules={version:'synthetic-source-separation',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'Synthetic source isolation; payable is not consumer cash',lines:[{line_id:'film',shares:[{party_id:S.org.party_id,role:'PLATFORM',bps:8000},{party_id:buyer.personal_party_id,role:'SUPPLIER',bps:2000}],deductions:[]}]};
   const content=createRuleContent({id:rid,rule_key:'qa18.source.separation',version:'synthetic-v1',terms:{customization_finance:{model:'V5_SELF_OPERATED',platform_party_id:S.org.party_id,rounding:'HALF_UP_PLATFORM_REMAINDER',rules}}});
   // Explicit effective synthetic configuration, not production rule approval.
   await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[rid,'qa18.source.separation','synthetic-v1',JSON.stringify(content),'2020-01-01 00:00:00',producer.account_id]);
   const q=await quote(a,outsider,rid,'ALIPAY'),incoming=await S.trade.accept(outsider.ctx,{party_id:outsider.personal_party_id,record_id:q.id,expected_version:q.object_version,quote_sha256:q.content_sha256,operation_key:key()}),receipt=await S.pay(incoming,'first',outsider);assert.equal(receipt.data.amount_minor,60000);
   agreement=await post('/finance/agreements',producer,{source_type:'ORDER',source_id:incoming.id,previous_agreement_id:null,environment:'SANDBOX',rule_id:rid,rules,evidence_asset_id:S.proof.id});
   const review=async r=>post('/finance/records/'+r.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Independent synthetic source and amount review',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true}},r.object_version,null);
   const confirm=async r=>{for(const u of [producer,buyer,outsider])await post('/finance/records/'+r.id+'/confirmations',u,{content_sha256:r.content_sha256,decision:'APPROVED',reason:'Explicit synthetic exact allocation'},r.object_version);};
   agreement=await review(agreement);await confirm(agreement);let settlement=await post('/finance/agreements/'+agreement.id+'/settlements',producer,{period_reference:key(),note:'Separate original supplier accrual'},agreement.object_version);settlement=await review(settlement);await confirm(settlement);
   state.income={order_id:incoming.id,payment_id:receipt.id,agreement_id:agreement.id,settlement_id:settlement.id,supplier_payable_minor:12000,paid_minor:0,fulfillment:'Not completed; payable is accrued but cannot be paid or spent as wallet cash'};
   wr=await post('/wallet/rules',producer,{rule:{...require('./helpers/wallet-rule.cjs'),free_awards:{REGISTER:7000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}}},null,null);
   wr=await post('/wallet/rules/'+wr.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic isolation award fixture, not published award policy'},wr.object_version,null);
   await post('/wallet/accounts',buyer,{rule_id:wr.id,rule_sha256:wr.content_sha256});const w=ok(await call('/wallet/summary'));assert.equal(w.available_balance_minor,0);assert.equal(w.available_points,7000);assert.equal(w.qualifying_growth,0);state.wallet_rule_id=wr.id;
  });
  await check('reviewed 6000-point coupon and 12000-fen payable do not fund a 13500-fen cash payment',async()=>{
   const a=await offer({unitMinor:50000,preview:'SCRIPT_BEFORE_INTERIM'}),q=await quote(a,buyer,S.ruleId,'CUSTODY');
   const template={version:'synthetic-source-separation',source_ref:'original-6000-credit50-isolation',title:'Synthetic production credit50',kind:'PRODUCTION_CREDIT',valid_days:30,exchange_points:6000,capacity:5,available_until:'2099-01-01T00:00:00.000Z',terms:'Used coupon is not cash and is not restored by an order refund',production:{face_minor:5000,minimum_minor:50000,spec_ids:[a.spec.id]},interview:null,exposure:null};
   let stock=await post('/redemption/stock',producer,{template,evidence_asset_ids:[S.proof.id]});stock=await post('/redemption/stock/'+stock.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent exact coupon terms'},stock.object_version,null);coupon=await post('/redemption/exchanges',buyer,{stock_id:stock.id,template_sha256:digest(template)});
   await topup(6000);await snapshot('four-assets-before-hold',6000);
   held=await post('/redemption/grants/'+coupon.id+'/checkout',buyer,{quote_id:q.id},coupon.object_version);
   order=await post('/trade/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256,reward_selection:{hold_id:held.id,adjusted_quote_sha256:held.data.adjusted_quote_sha256}},q.object_version);
   assert.equal(order.data.quote.total_minor,45000);assert.deepEqual(order.data.quote.installments.map(x=>x.allocations[0].amount_minor),[13500,18000,13500]);
   state.payment_input={party_id:buyer.personal_party_id,order_id:order.id,installment_key:'first',operation_key:key()};
   await assert.rejects(S.trade.preparePayment(buyer.ctx,state.payment_input,config),{code:'WALLET_BALANCE_INSUFFICIENT'});
   assert.equal((await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND order_id=?",[order.id]))[0].length,0);
   const denied=await call('/trade/payments',buyer,{body:{order_id:order.id,installment_key:'first'}});assert.equal(denied.status,503);assert.equal(denied.error.code,'CUSTODY_PROVIDER_NOT_CONNECTED');
   await snapshot('insufficient-cash-no-asset-conversion',6000,0,'HELD');state.coupon={grant_id:coupon.id,hold_id:held.id,order_id:order.id};
  });
  await check('one payment consumes exactly two original recharge lots and uses its coupon only on verified receipt',async()=>{
   await clock(2);await topup(8000);payment=await S.trade.preparePayment(buyer.ctx,state.payment_input,config);assert.equal((await S.trade.preparePayment(buyer.ctx,state.payment_input,config)).id,payment.id);
   const items=ok(await call('/wallet/records?kind=CASH_SPEND')).items;assert.equal(items.length,1);spend=items[0];assert.deepEqual(spend.data.allocations,[{recharge_id:topups[0].id,amount_minor:6000,returned_minor:0},{recharge_id:topups[1].id,amount_minor:7500,returned_minor:0}]);
   await snapshot('cash-held-from-two-sources',500,13500,'HELD');const receipt={...config,payment_id:payment.id,currency:'CNY',amount_minor:13500,transaction_id:'synthetic:'+payment.id,status:'PENDING',product_id:null,app_account_token:null};await S.trade.applyPayment(receipt);await snapshot('pending-payment-retains-hold',500,13500,'HELD');
   await S.trade.applyPayment({...receipt,status:'SUCCEEDED'});await S.trade.applyPayment({...receipt,status:'SUCCEEDED'});await snapshot('verified-cash-payment-coupon-used',500,0,'USED');
   await clock(4);await topup(9000);await snapshot('later-recharge-is-a-separate-source',9500,0,'USED');state.payment_id=payment.id;state.spend_id=spend.id;state.topup_ids=topups.map(x=>x.id);
  });
  await check('partial and remaining order refunds restore only original lots, never cash out the coupon or add supplier payable',async()=>{
   const refunds=[];
   for(const[amount,total,walletAmount]of [[4000,4000,13500],[9500,13500,23000]]){
    let refund=await post('/trade/refunds',buyer,{payment_id:payment.id,allocations:[{line_id:'film',amount_minor:amount}],reason:'Synthetic pre-production original cash refund'});refund=await post('/trade/records/'+refund.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Independent exact original payment refund'},refund.object_version,null);await S.trade.claim(reviewer.ctx,refund.id,null,'REFUND');
    const receipt={...refund.data,refund_id:refund.id,status:'UNKNOWN'};await S.trade.applyRefund(refund.id,receipt);await snapshot('unknown-refund-'+amount,walletAmount-amount,0,'USED');
    await assert.rejects(S.trade.applyRefund(refund.id,{...receipt,status:'SUCCEEDED',payment_id:key()}),{code:'REFUND_PROOF_MISMATCH'});
    await S.trade.applyRefund(refund.id,{...receipt,status:'SUCCEEDED'});await S.trade.applyRefund(refund.id,{...receipt,status:'SUCCEEDED'});await snapshot('original-refund-'+total,walletAmount,0,'USED');
    const current=ok(await call('/wallet/records?kind=CASH_SPEND')).items.find(x=>x.id===spend.id);assert.deepEqual(current.data.allocations,[{recharge_id:topups[0].id,amount_minor:6000,returned_minor:Math.min(total,6000)},{recharge_id:topups[1].id,amount_minor:7500,returned_minor:Math.max(0,total-6000)}]);
    const actual=ok(await call('/trade/records/'+order.id));assert.equal(actual.data.financial.refunded_minor,total);assert.deepEqual(actual.data.contract,order.data.contract);refunds.push(refund.id);
   }
   const extra=await call('/trade/refunds',buyer,{body:{payment_id:payment.id,allocations:[{line_id:'film',amount_minor:1}],reason:'Excess must be denied'}});assert.equal(extra.status,409);assert.equal(extra.error.code,'REFUND_EXCEEDS_REMAINING');
   const cashRefunds=ok(await call('/wallet/records?kind=CASH_REFUND')).items;assert.equal(cashRefunds.length,2);assert.equal(cashRefunds.reduce((n,x)=>n+x.data.amount_minor,0),13500);assert.equal((await db.execute("SELECT id FROM trade_journal WHERE order_id=? AND direction='REFUND'",[order.id]))[0].length,2);state.order_refund_ids=refunds;
  });
  await check('withdrawal stays disabled while an independently approved mistaken recharge refunds the restored original source',async()=>{
   const evidence=await S.assets.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic mistaken recharge evidence'),operation_key:key()});
   let item=await post('/wallet/recharge-refunds',buyer,{recharge_id:topups[0].id,amount_minor:6000,reason:'Synthetic original mistaken recharge after purchase refund',evidence_asset_ids:[evidence.id]});
   const input={record_id:item.id,expected_version:item.object_version,decision:'APPROVE',amount_minor:6000,reason:'Independent original-source refund decision',checks:{identity_verified:true,source_verified:true,refund_basis_verified:true},operation_key:key()};item=await R.review(reviewer.ctx,input);await snapshot('original-recharge-refund-reserved',17000,6000,'USED');await R.claim(reviewer.ctx,{record_id:item.id},binding);
   const receipt={record_id:item.id,recharge_id:topups[0].id,...binding,original_transaction_id:topups[0].data.transaction_id,refund_transaction_id:'synthetic-refund:'+item.id,currency:'CNY',amount_minor:6000,occurred_at:await A.now(db),status:'SUCCEEDED'};await R.applyVerifiedReceipt(receipt);await R.applyVerifiedReceipt(receipt);await snapshot('original-recharge-refunded-once',17000,0,'USED');
   const lots=ok(await call('/wallet/records?kind=RECHARGE')).items;assert.deepEqual(topups.map(x=>lots.find(r=>r.id===x.id).data.refunded_minor),[6000,0,0]);const visible=ok(await call('/wallet/recharge-refunds/'+item.id));assert.equal(visible.current_status,'SUCCEEDED');state.recharge_refund_id=item.id;
  });
  await check('another account cannot read any of the four private asset classes or forge balances',async()=>{
   const wallet=await call('/wallet/summary',artist,{party:buyer.personal_party_id});assert.equal(wallet.status,403);
   const cash=await call('/wallet/records?kind=CASH_SPEND',artist,{party:buyer.personal_party_id});assert.equal(cash.status,403);
   const income=await call('/finance/agreements/'+agreement.id+'/balances',artist);assert.equal(income.status,404);
   const reward=await call('/redemption/grants/'+coupon.id,artist);assert.equal(reward.status,404);
   const forged=await call('/wallet/recharges',buyer,{body:{amount_minor:100,balance_minor:12000}});assert.equal(forged.status,400);assert.equal(forged.error.code,'INVALID_INPUT');
   await snapshot('final-four-ledgers-still-separated',17000,0,'USED');
  });
  state.complete=!failed&&state.checks.length===6;
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db){await db.execute('SET timestamp=0');await db.close();}
  if(created){assert(/^jx_test_qa18_sources_[a-f0-9]{20}$/.test(name));await control.query('DROP DATABASE '+mysql.escapeId(name));state.database_removed=true;}await control.end();state.services_stopped=true;state.finished_at=new Date().toISOString();
  const out=path.resolve(__dirname,'../../../..','.local');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'wallet-source-separation-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(out,'wallet-source-separation-records.json'),JSON.stringify(state,null,2));
 }
});
