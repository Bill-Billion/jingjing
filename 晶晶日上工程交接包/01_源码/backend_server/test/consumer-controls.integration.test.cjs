'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {digest}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context');
test('self-service monthly limits constrain actual orders and custody attempts without changing financial facts',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name='jx_test_controls_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 const fixtures=[];
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,buyer2,reviewer,outsider,trade}=S;
 const R=require('../src/modules/wallet/consumer-controls').createConsumerControls(db,{resolvePrincipal:S.resolvePrincipal});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/wallet/consumer-controls';
 async function call(method,suffix='',u=buyer,body,version,operation=key(),party=u.personal_party_id){const response=await fetch(base+suffix,{method,headers:{Authorization:'Bearer '+u.token,'X-Acting-Party':party,...(body?{'Content-Type':'application/json','Idempotency-Key':operation}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();fixtures.push({method,path:new URL(base+suffix).pathname,schema:response.status===200?(suffix.startsWith('/history')?'ConsumerControlHistoryResponse':'ConsumerControlResponse'):'ErrorResponse',value});return {status:response.status,...value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r));
 const get=(u=buyer)=>R.get(u.ctx,{party_id:u.personal_party_id});
 async function change(value,kind='PAYMENT',u=buyer){const r=await get(u);return R.change(u.ctx,{party_id:u.personal_party_id,kind,monthly_limit_minor:value,expected_version:r.object_version,operation_key:key()});}
 async function expirePending(u=buyer,kind='PAYMENT'){const r=await get(u),raw=(await db.execute('SELECT * FROM wallet_records WHERE id=?',[r.id]))[0][0],d=A.parse(raw.data_json);d.pending[kind].confirm_after=new Date(Date.now()-1000).toISOString();await db.execute('UPDATE wallet_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(d),digest(d),r.id]);return r;}
 async function confirm(u=buyer,kind='PAYMENT'){const r=await get(u);return R.confirm(u.ctx,{party_id:u.personal_party_id,kind,expected_version:r.object_version,operation_key:key()});}
 const listing=await S.listing();let first,second,paid;
 await t.test('settings work before wallet opening; private and versioned, duplicate retry changes once',async()=>{
  const r=ok(await call('GET'));assert.equal(r.limits.PAYMENT,null);assert.equal(r.usage.PAYMENT.used_minor,0);
  bad(await call('GET','',buyer2,undefined,undefined,key(),buyer.personal_party_id),'ARTIST_PARTY_FORBIDDEN');
  bad(await call('POST','',buyer,{kind:'PAYMENT',monthly_limit_minor:150}),'EXPECTED_VERSION_REQUIRED');
  const op=key(),body={kind:'PAYMENT',monthly_limit_minor:150};const n=ok(await call('POST','',buyer,body,r.object_version,op));assert.equal(n.limits.PAYMENT,150);
  assert.deepEqual(ok(await call('POST','',buyer,body,r.object_version,op)),n);
  bad(await call('POST','',buyer,{...body,monthly_limit_minor:100},r.object_version,op),'IDEMPOTENCY_CONFLICT');
  bad(await call('POST','',buyer,{...body,monthly_limit_minor:100},r.object_version),'VERSION_CONFLICT');
  bad(await call('POST','',buyer,{...body,monthly_limit_minor:-1},n.object_version),'WALLET_AMOUNT_INVALID');
 });
 await t.test('concurrent purchases cannot exceed cap; failure rolls back payment and request key',async()=>{
  first=await S.checkout(listing);second=await S.checkout(await S.listing());
  const results=await Promise.allSettled([S.payment(first,buyer,false),S.payment(second,buyer,false)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'CONSUMER_MONTHLY_LIMIT_EXCEEDED');
  paid=results.find(x=>x.status==='fulfilled').value;assert.equal((await get()).usage.PAYMENT.used_minor,100);
  assert.equal((await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND buyer_party_id=?",[buyer.personal_party_id]))[0].length,1);
 });
 await t.test('lowering takes effect before unsent dispatch; unknown provider result stays reserved',async()=>{
  let r=await change(0);assert.equal(r.usage.PAYMENT.over_limit,true);
  await assert.rejects(trade.claim(buyer.ctx,paid.payment.id,buyer.personal_party_id,'PAYMENT'),{code:'CONSUMER_MONTHLY_LIMIT_EXCEEDED'});
  r=ok(await call('POST','',buyer,{kind:'PAYMENT',monthly_limit_minor:150},r.object_version));assert.equal(r.limits.PAYMENT,0);assert(r.pending.PAYMENT);
  bad(await call('POST','/confirm',buyer,{kind:'PAYMENT'},r.object_version),'CONSUMER_LIMIT_COOLING_PERIOD');
  await expirePending();r=ok(await call('POST','/confirm',buyer,{kind:'PAYMENT'},r.object_version));assert.equal(r.limits.PAYMENT,150);
  const dispatch=await trade.claim(buyer.ctx,paid.payment.id,buyer.personal_party_id,'PAYMENT');assert.equal(dispatch.dispatch,true);await trade.dispatchResult(paid.payment.id,null,true);
  await assert.rejects(S.payment(paid.payment.order_id===first.id?second:first,buyer,false),{code:'CONSUMER_MONTHLY_LIMIT_EXCEEDED'});
  assert.equal((await get()).usage.PAYMENT.pending_minor,100);
  await trade.applyPayment(paid.proof);await trade.applyPayment(paid.proof);assert.equal((await get()).usage.PAYMENT.pending_minor,0);assert.equal((await get()).usage.PAYMENT.used_minor,100);
 });
 await t.test('raise/removal need cooling, cancellation preserves active limit and history is immutable',async()=>{
  let r=await change(null);assert.equal(r.limits.PAYMENT,150);assert.equal(r.pending.PAYMENT.monthly_limit_minor,null);
  r=ok(await call('POST','/cancel',buyer,{kind:'PAYMENT'},r.object_version));assert.equal(r.pending.PAYMENT,null);assert.equal(r.limits.PAYMENT,150);
  const h=ok(await call('GET','/history?limit=2'));assert.equal(h.items.length,2);assert(h.next_cursor);assert.equal(h.items[0].kind,'CONSUMER_LIMIT_EVENT');
  const page=ok(await call('GET','/history?limit=100&cursor='+h.next_cursor));assert(page.items.length>0);assert(!page.items.some(x=>h.items.some(y=>x.id===y.id)));
  bad(await call('POST','/confirm',buyer,{kind:'PAYMENT'},r.object_version),'CONSUMER_LIMIT_CHANGE_NOT_PENDING');
  await change(300);const old=await get();r=await change(100);assert.equal(r.pending.PAYMENT,null);
  bad(await call('POST','/confirm',buyer,{kind:'PAYMENT'},old.object_version),'VERSION_CONFLICT');
 });
 await t.test('refund returns money by existing rules, but does not reset gross spending budget',async()=>{
  const orderId=paid.payment.order_id;let p=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:orderId});
  p=await S.stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:orderId,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'Synthetic rights dispute',operation_key:key()});
  await S.stock.resolveCase(reviewer.ctx,{order_id:orderId,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',reason:'Independent synthetic review',operation_key:key()});
  let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:paid.payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'Approved refund',operation_key:key()});refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'Independent',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');await trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
  assert.equal((await get()).usage.PAYMENT.used_minor,100);assert.equal((await trade.read(buyer.ctx,{record_id:orderId,party_id:buyer.personal_party_id})).data.financial.net_minor,0);
 });
 await t.test('closed unpaid attempt releases budget; cancelled order and idempotent retries never mint money',async()=>{
  await change(100,'PAYMENT',buyer2);const order=await S.checkout(listing,buyer2),input={party_id:buyer2.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()};
  const p=await trade.preparePayment(buyer2.ctx,input,S.config);assert.equal((await trade.preparePayment(buyer2.ctx,input,S.config)).id,p.id);assert.equal((await get(buyer2)).usage.PAYMENT.used_minor,100);
  await trade.cancel(buyer2.ctx,{record_id:order.id,party_id:buyer2.personal_party_id,expected_version:order.object_version,reason:'Cancel before sending',operation_key:key()});assert.equal((await get(buyer2)).usage.PAYMENT.used_minor,0);
  const next=await S.checkout(listing,buyer2);await S.payment(next,buyer2,false);assert.equal((await get(buyer2)).usage.PAYMENT.used_minor,100);
 });
 await t.test('custody topups obey separate personal cap and existing platform rule; actual service stays disabled',async()=>{
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal}),custody=require('../src/modules/wallet/custody').createCustodyLedger(db),C=require('../src/modules/wallet/context');
  const rule={...require('./helpers/wallet-rule.cjs'),topup_limits:{single_minor:100,daily_minor:150,monthly_minor:300,cooling_minutes:0}};
  await db.withTransaction(tx=>C.insert(tx,{id:buyer.account_id},'ACCOUNT',buyer.personal_party_id,null,'ACTIVE',{rule,rule_id:key(),rule_sha256:'0'.repeat(64)},buyer.personal_party_id));
  await change(150,'RECHARGE');const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'test'},a={id:buyer.account_id,request_id:key()};
  const prep=(amount=100,op=key())=>db.withTransaction(tx=>custody.prepare(tx,a,{party_id:buyer.personal_party_id,amount_minor:amount,operation_key:op},binding));
  const op=key(),first=await prep(100,op);assert.equal((await prep(100,op)).id,first.id);
  await assert.rejects(prep(101),{code:'WALLET_SINGLE_LIMIT'});await assert.rejects(prep(100),{code:'WALLET_DAILY_LIMIT'});
  await change(120,'RECHARGE');await assert.rejects(prep(30),{code:'CONSUMER_MONTHLY_LIMIT_EXCEEDED'});assert.equal((await get()).usage.RECHARGE.used_minor,100);
  await custody.applyVerifiedReceipt({record_id:first.id,...binding,currency:'CNY',amount_minor:100,transaction_id:'synthetic:'+key(),occurred_at:await require('../src/modules/artists/context').now(db),status:'SUCCEEDED'});
  assert.equal((await get()).usage.RECHARGE.pending_minor,0);await assert.rejects(W.recharge(buyer.ctx,{party_id:buyer.personal_party_id,amount_minor:10,operation_key:key()}),{code:'CUSTODY_PROVIDER_NOT_CONNECTED'});
 });
 await t.test('cancelling an unsent custody payment releases reserved cash atomically; cap denial leaves no cash hold',async()=>{
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const config={provider:'CUSTODY',environment:'SANDBOX',app_id:'synthetic-custodian',merchant_id:'synthetic-merchant',merchant_party_id:S.seller.personal_party_id,config_revision:'test',custody_binding:{provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'test'}};
  const l=await S.listing(),order=await trade.stockCheckout(buyer.ctx,{party_id:buyer.personal_party_id,listing_id:l.id,offer_sha256:l.content_sha256,channel:'CUSTODY',operation_key:key()});
  const request={party_id:buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()};
  await assert.rejects(trade.preparePayment(buyer.ctx,request,config),{code:'CONSUMER_MONTHLY_LIMIT_EXCEEDED'});
  let q=await W.summary(buyer.ctx,{party_id:buyer.personal_party_id});assert.equal(q.available_balance_minor,100);assert.equal(q.reserved_balance_minor,0);
  await change(200);await expirePending();await confirm();await trade.preparePayment(buyer.ctx,request,config);
  q=await W.summary(buyer.ctx,{party_id:buyer.personal_party_id});assert.equal(q.available_balance_minor,0);assert.equal(q.reserved_balance_minor,100);
  const cancel={record_id:order.id,party_id:buyer.personal_party_id,expected_version:order.object_version,reason:'Cancel unsent custody payment',operation_key:key()};await trade.cancel(buyer.ctx,cancel);await trade.cancel(buyer.ctx,cancel);
  q=await W.summary(buyer.ctx,{party_id:buyer.personal_party_id});assert.equal(q.available_balance_minor,100);assert.equal(q.reserved_balance_minor,0);assert.equal((await get()).usage.PAYMENT.used_minor,100);
 });
 await t.test('month boundary retains older unknown attempts and late receipts without double counting',async()=>{
  await change(null,'PAYMENT',buyer2);await expirePending(buyer2);await confirm(buyer2);
  const order=await S.checkout(await S.listing(),buyer2),p=await S.payment(order,buyer2,false);
  const prior=new Date(Date.parse((await get(buyer2)).period.starts_at)-86400000).toISOString().slice(0,23).replace('T',' ');
  await db.execute('UPDATE trade_records SET created_at=? WHERE id=?',[prior,p.payment.id]);
  assert.equal((await get(buyer2)).usage.PAYMENT.used_minor,200);
  await trade.applyPayment(p.proof);assert.equal((await get(buyer2)).usage.PAYMENT.used_minor,200);
  await db.execute("UPDATE trade_journal SET created_at=? WHERE source_id=? AND direction='RECEIPT'",[prior,p.payment.id]);
  assert.equal((await get(buyer2)).usage.PAYMENT.used_minor,100);
 });
 await t.test('old orders count when user first sets a limit; suspension and tampering cannot bypass privacy',async()=>{
  const r=await get(buyer2);assert.equal(r.usage.PAYMENT.used_minor,100);await change(0,'PAYMENT',buyer2);assert.equal((await get(buyer2)).usage.PAYMENT.over_limit,true);
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer2.account_id,buyer2.personal_party_id]);bad(await call('GET','',buyer2),'ARTIST_PARTY_FORBIDDEN');await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer2.account_id,buyer2.personal_party_id]);
  await db.execute("UPDATE wallet_records SET data_sha256=? WHERE id=?",['0'.repeat(64),r.id]);await assert.rejects(get(buyer2),{code:'STORED_CONTENT_MISMATCH'});
 });
 const path=require('node:path'),out=process.env.CONSUMER_CONTROLS_FIXTURES||path.resolve(__dirname,'../../../..','.local/consumer-controls-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
