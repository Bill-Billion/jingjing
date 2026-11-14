'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context');
test('reviewed consumer protection binds real operations, preserves recovery and controls queued notifications',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_risk_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,buyer2,reviewer,seller,trade}=S,fixtures=[];
 for(const u of [seller,reviewer])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'WALLET_RULE_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:protection',reason:'isolated test only'});
 const R=require('../src/modules/wallet/risk').createConsumerRisk(db,{resolvePrincipal:S.resolvePrincipal}),privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 async function call(method,url,u=buyer,body,version,party=null,schema='WalletResponse',operation=key()){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version===undefined?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?schema:'ErrorResponse',value});return {status:res.status,...value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const rule={version:'SYNTHETIC_ONLY',source_ref:'synthetic:37',message:'Synthetic read and confirm',window_seconds:3600,trigger_count:2,large_recharge_minor:100,night:null,confirmation_seconds:600,lottery_window_max_draws:10,lottery_daily_points:3000};
 const preview=target=>R.preview(buyer.ctx,{party_id:buyer.personal_party_id,target});
 const confirm=async(target,op=key())=>{const p=await preview(target);return R.confirm(buyer.ctx,{party_id:buyer.personal_party_id,target,preview_sha256:p.preview_sha256,read_confirmed:true,operation_key:op});};
 const prepare=(order,op)=>trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:op},S.config);
 let active,payment,order;
 await t.test('no policy is explicitly unconfigured; self-review and foreign identities denied',async()=>{
  assert.equal(ok(await call('GET','/wallet/consumer-risk/status',buyer,undefined,undefined,null,'ConsumerRiskStatusResponse')).configured,false);
  let r=ok(await call('POST','/wallet/consumer-risk/rules',seller,{rule}));
  assert.equal((await call('POST','/wallet/consumer-risk/rules/'+r.id+'/review',seller,{decision:'APPROVE',reason:'self'},r.object_version)).error.code,'SELF_REVIEW_FORBIDDEN');
  active=ok(await call('POST','/wallet/consumer-risk/rules/'+r.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent synthetic thresholds'},r.object_version));
  ok(await call('GET','/wallet/consumer-risk/rules',reviewer,undefined,undefined,null,'WalletResponse'));
  assert.equal(ok(await call('GET','/wallet/consumer-risk/status',buyer,undefined,undefined,null,'ConsumerRiskStatusResponse')).configured,true);
  assert.equal((await call('GET','/wallet/consumer-risk/preview?kind=RECHARGE&amount_minor=100&request_key=test',buyer2,undefined,undefined,buyer.personal_party_id)).error.code,'ARTIST_PARTY_FORBIDDEN');
 });
 await t.test('second real payment requires reviewed message; denial rolls back payment and operation key',async()=>{
  const first=await S.checkout(await S.listing());await prepare(first,key());order=await S.checkout(await S.listing());const op=key(),target={kind:'PAYMENT',order_id:order.id,installment_key:'stock',request_key:op};
  await assert.rejects(prepare(order,op),{code:'CONSUMER_RISK_CONFIRMATION_REQUIRED'});
  assert.equal((await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND order_id=?",[order.id]))[0].length,0);
  const v=ok(await call('GET','/wallet/consumer-risk/preview?'+new URLSearchParams(target),buyer,undefined,undefined,buyer.personal_party_id,'ConsumerRiskPreviewResponse'));
  assert.deepEqual(v.reasons,['FREQUENT_CASH_REQUESTS']);assert.equal(v.target.amount_minor,100);
  const body={target,preview_sha256:v.preview_sha256,read_confirmed:true},ackKey=key();
  const ack=ok(await call('POST','/wallet/consumer-risk/confirm',buyer,body,undefined,buyer.personal_party_id,'WalletResponse',ackKey));
  assert.equal(ok(await call('POST','/wallet/consumer-risk/confirm',buyer,body,undefined,buyer.personal_party_id,'WalletResponse',ackKey)).id,ack.id);
  await assert.rejects(prepare(order,key()),{code:'CONSUMER_RISK_CONFIRMATION_REQUIRED'});
  payment=await prepare(order,op);assert.equal((await prepare(order,op)).id,payment.id);
  assert.equal((await trade.claim(buyer.ctx,payment.id,buyer.personal_party_id,'PAYMENT')).dispatch,true);
 });
 await t.test('two confirmed operations cannot reuse a stale activity snapshot concurrently',async()=>{
  const orders=[await S.checkout(await S.listing()),await S.checkout(await S.listing())],ops=[key(),key()];
  for(let n=0;n<2;n++)await confirm({kind:'PAYMENT',order_id:orders[n].id,installment_key:'stock',request_key:ops[n]});
  const result=await Promise.allSettled(orders.map((o,n)=>prepare(o,ops[n])));assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.code,'CONSUMER_RISK_CONFIRMATION_REQUIRED');
 });
 await t.test('policy replacement and expiry require fresh explicit confirmation; unknown provider result is not resent',async()=>{
  const o=await S.checkout(await S.listing()),op=key(),target={kind:'PAYMENT',order_id:o.id,installment_key:'stock',request_key:op};await confirm(target);
  const r=await R.createRule(seller.ctx,{rule:{...rule,version:'SYNTHETIC_V2'},operation_key:key()});await R.reviewRule(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'Synthetic replacement',operation_key:key()});
  await assert.rejects(prepare(o,op),{code:'CONSUMER_RISK_CONFIRMATION_REQUIRED'});let ack=await confirm(target);const data={...ack.data,expires_at:'2020-01-01T00:00:00.000Z'};await db.execute('UPDATE wallet_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),ack.id]);
  await assert.rejects(prepare(o,op),{code:'CONSUMER_RISK_CONFIRMATION_EXPIRED'});await confirm(target);const p=await prepare(o,op);await trade.claim(buyer.ctx,p.id,buyer.personal_party_id,'PAYMENT');await trade.dispatchResult(p.id,null,true);assert.equal((await trade.claim(buyer.ctx,p.id,buyer.personal_party_id,'PAYMENT')).dispatch,false);
 });
 await t.test('prepared payment can recover by record id after policy changed, without a second payment',async()=>{
  const o=await S.checkout(await S.listing()),op=key(),target={kind:'PAYMENT',order_id:o.id,installment_key:'stock',request_key:op};await confirm(target);const p=await prepare(o,op);
  let r=await R.createRule(seller.ctx,{rule:{...rule,version:'SYNTHETIC_V3'},operation_key:key()});await R.reviewRule(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'Synthetic replacement',operation_key:key()});
  await assert.rejects(trade.claim(buyer.ctx,p.id,buyer.personal_party_id,'PAYMENT'),{code:'CONSUMER_RISK_CONFIRMATION_REQUIRED'});
  await confirm({kind:'PAYMENT_RECORD',payment_id:p.id});assert.equal((await trade.claim(buyer.ctx,p.id,buyer.personal_party_id,'PAYMENT')).dispatch,true);
  assert.equal((await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND order_id=?",[o.id]))[0].length,1);
 });
 await t.test('late verified payment and approved refund remain executable after consumer rule changes',async()=>{
  const proof={...S.config,payment_id:payment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic:'+key(),status:'SUCCEEDED',product_id:null,app_account_token:null};await trade.applyPayment(proof);await trade.applyPayment(proof);
  let p=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});p=await S.stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'Synthetic rights dispute',operation_key:key()});await S.stock.resolveCase(reviewer.ctx,{order_id:order.id,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',reason:'Independent synthetic review',operation_key:key()});
  let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'Approved refund',operation_key:key()});refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'Independent',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');await trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
  assert.equal((await trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id})).data.financial.net_minor,0);
 });
 await t.test('recharge guard rolls back cash attempt, original request resumes after confirmation',async()=>{
  const C=require('../src/modules/wallet/context'),custody=require('../src/modules/wallet/custody').createCustodyLedger(db);await db.withTransaction(tx=>C.insert(tx,{id:buyer.account_id},'ACCOUNT',buyer.personal_party_id,null,'ACTIVE',{rule:require('./helpers/wallet-rule.cjs'),rule_id:key(),rule_sha256:'0'.repeat(64)},buyer.personal_party_id));
  const op=key(),binding={provider:'synthetic',environment:'SANDBOX',merchant_id:'synthetic',revision:'1'},input={party_id:buyer.personal_party_id,amount_minor:100,operation_key:op},prep=()=>db.withTransaction(tx=>custody.prepare(tx,{id:buyer.account_id,request_id:key()},input,binding));
  await assert.rejects(prep(),{code:'CONSUMER_RISK_CONFIRMATION_REQUIRED'});await confirm({kind:'RECHARGE',amount_minor:100,request_key:op});const r=await prep();assert.equal((await prep()).id,r.id);
 });
 const pref=async patch=>{const p=await privacy.preferences(buyer.ctx);const {object_version,...v}=p;return privacy.savePreferences(buyer.ctx,{preferences:{...v,...patch},expected_version:object_version,operation_key:key()});};
 const push=require('../src/modules/operations/push-delivery');let sends=0;const provider={environment:'SANDBOX',send:async()=>{sends++;return {status:'ACCEPTED',receipt_id:'synthetic:'+key()};},query:async()=>({status:'ACCEPTED',receipt_id:'synthetic:recovered'})};
 const dispatcher=push.createPushDelivery(db,{provider,environment:'test'}),enqueue=()=>db.withTransaction(tx=>push.enqueue(tx,{account_id:buyer.account_id,category:'MARKETING',source_ref:'synthetic:'+key()}));
 await t.test('preference HTTP and old clients preserve new settings; night reminders do not require usage tracking',async()=>{
  let p=ok(await call('GET','/privacy/preferences',buyer,undefined,undefined,null,'PrivacyPreferencesResponse'));assert.equal(p.push_enabled,false);
  p=ok(await call('PATCH','/privacy/preferences',buyer,{personalization:false,marketing:true,rest_reminder_minutes:0,push_enabled:true,night_reminder_enabled:true,quiet_hours:{enabled:false,start_minute:1320,end_minute:480}},p.object_version,null,'PrivacyPreferencesResponse'));
  p=ok(await call('PATCH','/privacy/preferences',buyer,{personalization:false,marketing:true,rest_reminder_minutes:0},p.object_version,null,'PrivacyPreferencesResponse'));assert.equal(p.push_enabled,true);assert.equal(p.night_reminder_enabled,true);
  assert.equal(ok(await call('GET','/privacy/usage',buyer,undefined,undefined,null,'PersonalUsageResponse')).night_reminder.enabled,true);
 });
 await t.test('unconfigured sender reports unavailable; opt-out after enqueue suppresses send',async()=>{
  const r=await enqueue();assert.equal((await push.createPushDelivery(db).dispatch(r.id)).status,'PROVIDER_NOT_CONFIGURED');await pref({marketing:false});assert.equal((await dispatcher.dispatch(r.id)).reason,'MARKETING_OPTED_OUT');assert.equal(sends,0);
 });
 await t.test('queue respects current quiet hours and does not revive a deferred item after opt-out',async()=>{
  const at=await A.now(db),local=new Date(Date.parse(at)+8*3600000),m=local.getUTCHours()*60+local.getUTCMinutes();await pref({marketing:true,quiet_hours:{enabled:true,start_minute:(m+1439)%1440,end_minute:(m+10)%1440}});
  const r=await enqueue(),result=await dispatcher.dispatch(r.id);assert.equal(result.status,'DEFERRED');assert(result.retry_at);assert.equal(sends,0);
  await pref({marketing:false,quiet_hours:{enabled:false,start_minute:1320,end_minute:480}});assert.equal((await dispatcher.dispatch(r.id)).reason,'MARKETING_OPTED_OUT');assert.equal(sends,0);
 });
 await t.test('concurrent workers send once; marketing daily restraint also serializes separate messages',async()=>{
  await pref({marketing:true});const r=await enqueue();await Promise.all([dispatcher.dispatch(r.id),dispatcher.dispatch(r.id)]);assert.equal(sends,1);
  const r2=await enqueue();assert.equal((await dispatcher.dispatch(r2.id)).reason,'MARKETING_DAILY_LIMIT');assert.equal(sends,1);
 });
 await t.test('business notifications enter real outbox, recheck permissions and retain station inbox when push closes',async()=>{
  await pref({push_enabled:true});
  const fresh=await S.checkout(await S.listing());const queued=(await db.execute("SELECT * FROM notification_deliveries WHERE account_id=? AND category='BUSINESS' AND current_status='PENDING' ORDER BY created_at DESC",[buyer.account_id]))[0];assert(queued.length>0);
  const inboxBefore=Number((await db.execute('SELECT COUNT(*) n FROM ops_recipients WHERE party_id=?',[buyer.personal_party_id]))[0][0].n);await pref({push_enabled:false});assert.equal((await dispatcher.dispatch(queued[0].id)).reason,'PUSH_DISABLED');assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM ops_recipients WHERE party_id=?',[buyer.personal_party_id]))[0][0].n),inboxBefore);
  await pref({push_enabled:true});const another=await S.checkout(await S.listing());const q=(await db.execute("SELECT n.* FROM notification_deliveries n JOIN ops_events e ON e.id=n.event_id WHERE n.account_id=? AND e.record_id=?",[buyer.account_id,another.id]))[0][0];assert(q);await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);assert.equal((await dispatcher.dispatch(q.id)).reason,'ACCESS_REVOKED');await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);
 });
 await t.test('unknown push response is queried using original key, never automatically resent',async()=>{
  await db.execute("UPDATE notification_deliveries SET dispatched_at='2020-01-01' WHERE account_id=?",[buyer.account_id]);const r=await enqueue();let calls=0;const d=push.createPushDelivery(db,{environment:'test',provider:{...provider,send:async()=>{calls++;throw Error('lost response');}}});assert.equal((await d.dispatch(r.id)).status,'UNKNOWN');assert.equal((await d.dispatch(r.id)).status,'UNKNOWN');assert.equal(calls,1);assert.equal((await d.reconcile(r.id)).status,'ACCEPTED');assert.equal(calls,1);
 });
 await t.test('late unknown send result returns the accepted status already established by reconciliation',async()=>{
  await db.execute("UPDATE notification_deliveries SET dispatched_at='2020-01-01' WHERE account_id=?",[buyer.account_id]);
  const r=await enqueue();let release,started,calls=0;const entered=new Promise(resolve=>{started=resolve;}),pending=new Promise(resolve=>{release=resolve;});
  const d=push.createPushDelivery(db,{environment:'test',provider:{...provider,send:async()=>{calls++;started();return pending;}}});
  const sending=d.dispatch(r.id);await entered;
  try{await db.execute("UPDATE notification_deliveries SET dispatched_at='2020-01-01' WHERE id=?",[r.id]);assert.equal((await d.reconcile(r.id)).status,'ACCEPTED');}
  finally{release(null);}
  assert.equal((await sending).status,'ACCEPTED');assert.equal((await d.dispatch(r.id)).status,'ACCEPTED');assert.equal(calls,1);
 });
 const out=path.resolve(__dirname,'../../../..','.local/consumer-risk-http-fixtures.json');await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
