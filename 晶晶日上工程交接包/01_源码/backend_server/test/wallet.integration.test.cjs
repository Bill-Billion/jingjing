 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
const A=require('../src/modules/artists/context'),C=require('../src/modules/wallet/context');
test('wallet ledger, custody boundary and order points in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  // The stock fixture is necessary to verify the actual order/payment/fulfillment/refund seam.
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,buyer2,reviewer,outsider,trade,stock}=S;
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal}),custody=require('../src/modules/wallet/custody').createCustodyLedger(db);
  for(const u of [outsider,reviewer])for(const action of ['WALLET_RULE_REVIEW','WALLET_QUALIFICATION_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:wallet',reason:'isolated fixture only'});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
  async function call(method,url,user=buyer,body,party=user.personal_party_id,headers={}){const h={Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...headers};if(body!==undefined)h['Content-Type']='application/json';const res=await fetch(base+url,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});const json=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?'WalletResponse':'ErrorResponse',value:json});return {status:res.status,data:json.data,error:json.error};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,c)=>assert.equal(r.error?.code,c,JSON.stringify(r)),headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
  const summary=()=>W.summary(buyer.ctx,{party_id:buyer.personal_party_id});let rule,account,order,pay,earning;
  await t.test('independent rule review, stale rule hash and client balance forgery rejected',async()=>{
   const body={rule:require('./helpers/wallet-rule.cjs')};bad(await call('POST','/wallet/rules',buyer,body,null,headers()),'WALLET_OPERATOR_FORBIDDEN');
   rule=ok(await call('POST','/wallet/rules',outsider,body,null,headers()));bad(await call('POST','/wallet/rules/'+rule.id+'/review',outsider,{decision:'APPROVE',reason:'self'},null,headers(rule)),'SELF_REVIEW_FORBIDDEN');
   rule=ok(await call('POST','/wallet/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'synthetic independent rules'},null,headers(rule)));
   const publicRules=ok(await call('GET','/wallet/rules',buyer,undefined,null));assert.equal(publicRules.items.length,1);assert.ok(!JSON.stringify(publicRules).includes(reviewer.account_id));assert.ok(!JSON.stringify(publicRules).includes('synthetic independent rules'));assert.ok(publicRules.items[0].rule);
   bad(await call('POST','/wallet/accounts',buyer,{rule_id:rule.id,rule_sha256:'0'.repeat(64)},buyer.personal_party_id,headers()),'WALLET_RULE_CHANGED');
   bad(await call('POST','/wallet/accounts',buyer,{rule_id:rule.id,rule_sha256:rule.content_sha256,balance:30000},buyer.personal_party_id,headers()),'INVALID_INPUT');
   const input={rule_id:rule.id,rule_sha256:rule.content_sha256},h=headers();account=ok(await call('POST','/wallet/accounts',buyer,input,buyer.personal_party_id,h));assert.equal(ok(await call('POST','/wallet/accounts',buyer,input,buyer.personal_party_id,h)).id,account.id);
  });
  await t.test('other accounts, organizations, revoked identity and unopened custody are blocked',async()=>{
   bad(await call('GET','/wallet/summary',buyer2,undefined,buyer.personal_party_id),'ARTIST_PARTY_FORBIDDEN');
   bad(await call('POST','/wallet/recharges',buyer,{amount_minor:30000},buyer.personal_party_id,headers()),'CUSTODY_PROVIDER_NOT_CONNECTED');
   const q=ok(await call('GET','/wallet/summary'));assert.equal(q.custody.enabled,false);assert.equal(q.recorded_balance_minor,0);assert.equal(q.available_points,0);
   const p=await S.person(outsider,false);bad(await call('POST','/wallet/accounts',outsider,{rule_id:rule.id,rule_sha256:rule.content_sha256},outsider.personal_party_id,headers()),'VERIFIED_ADULT_REQUIRED');
   assert.ok(p.id);
  });
  await t.test('only matching verified custody receipt credits balance once; topup yields zero growth',async()=>{
   const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'v1'},a={id:buyer.account_id,request_id:key()};
   const intent=await db.withTransaction(tx=>custody.prepare(tx,a,{party_id:buyer.personal_party_id,amount_minor:30000,operation_key:key()},binding));
   const proof={record_id:intent.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic:'+key(),occurred_at:new Date().toISOString(),status:'SUCCEEDED'};
   await assert.rejects(custody.applyVerifiedReceipt({...proof,amount_minor:29999}),{code:'CUSTODY_RECEIPT_MISMATCH'});
   const results=await Promise.all([custody.applyVerifiedReceipt(proof),custody.applyVerifiedReceipt(proof)]);assert.equal(results[0].id,results[1].id);
   let q=await summary();assert.equal(q.recorded_balance_minor,30000);assert.equal(q.available_points,0);assert.equal(q.qualifying_growth,0);assert.equal(q.membership.level,1);
   await assert.rejects(custody.applyVerifiedReceipt({...proof,transaction_id:'changed'}),{code:'CUSTODY_RECEIPT_MISMATCH'});
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='CASH_RECEIPT'"))[0].length,1);
  });
  await t.test('new order captures original rule and payment without fulfillment earns nothing',async()=>{
   order=await S.checkout(await S.listing());pay=await S.payment(order);
   earning=ok(await call('POST','/wallet/earnings/sync',buyer,{order_id:order.id},buyer.personal_party_id,headers()));assert.equal(earning.current_status,'PENDING');assert.equal(earning.pending_reason,'FULFILLMENT_PENDING');assert.equal((await summary()).available_points,0);
   assert.equal(earning.data.rule.points_per_yuan,10);assert.equal(earning.data.rule_id,rule.id);
   bad(await call('POST','/wallet/earnings/sync',buyer2,{order_id:order.id},buyer2.personal_party_id,headers()),'WALLET_NOT_FOUND');
  });
  await t.test('aftercare deadline and unresolved case block points; mature order credits exactly once',async()=>{
   const raw=(await db.execute('SELECT * FROM stock_purchases WHERE order_id=?',[order.id]))[0][0],d=A.parse(raw.data_json);d.accepted_at=new Date().toISOString();
   async function update(){await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(d),digest(d),order.id]);}
   await update();assert.equal((await W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,operation_key:key()})).pending_reason,'AFTERCARE_WINDOW');
   d.accepted_at=new Date(Date.now()-8*86400000).toISOString();d.current_case_id=key();await update();assert.equal((await W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,operation_key:key()})).pending_reason,'AFTERCARE_PENDING');
   d.current_case_id=null;await update();const result=await Promise.all([1,2].map(()=>W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,operation_key:key()})));assert.equal(result[0].id,result[1].id);earning=result[0];assert.equal(earning.current_status,'ISSUED');ok(await call('POST','/wallet/earnings/sync',buyer,{order_id:order.id},buyer.personal_party_id,headers()));assert.equal((await summary()).available_points,10);assert.equal((await summary()).qualifying_growth,10);
  });
  const uses=new Map(),points=require('../src/modules/wallet/points').createPointsService(db,{resolveUse:async(tx,ctx,reference)=>uses.get(reference)});
  const use=n=>{const reference='synthetic:'+key();uses.set(reference,{party_id:buyer.personal_party_id,purpose:'VOTE',reference,points:n});return reference;};
  await t.test('concurrent point reservations cannot overspend; exact replay and release are safe',async()=>{
   const first=use(7),second=use(7),result=await Promise.allSettled([points.reserve({}, {reference:first}),points.reserve({}, {reference:second})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'WALLET_POINTS_INSUFFICIENT');
   const hold=result.find(r=>r.status==='fulfilled').value;assert.equal((await points.reserve({},{reference:hold.data.reference})).id,hold.id);assert.equal((await summary()).available_points,3);
   await points.finish({},{hold_id:hold.id,decision:'RELEASE'});assert.equal((await summary()).available_points,10);
   const h=await points.reserve({},{reference:use(4)});await points.finish({},{hold_id:h.id,decision:'COMMIT'});await points.finish({},{hold_id:h.id,decision:'COMMIT'});assert.equal((await summary()).available_points,6);assert.equal((await summary()).qualifying_growth,10);
  });
  await t.test('verified refund continues even when points spent; growth reversed and shortage explicit',async()=>{
   let p=await stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});
   p=await stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'synthetic refund',operation_key:key()});
   p=await stock.resolveCase(reviewer.ctx,{order_id:order.id,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',reason:'synthetic independent decision',operation_key:key()});
   let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:pay.payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'approved synthetic case',operation_key:key()});
   refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'independent synthetic refund',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');await trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
   const q=ok(await call('GET','/wallet/summary'));assert.equal(q.available_points,0);assert.equal(q.qualifying_growth,0);assert.equal(q.points_block_reason,'POINTS_REVERSAL_PENDING');
   const row=await db.withTransaction(tx=>C.load(tx,earning.id));assert.equal(row.data.pending_shortfall,4);await assert.rejects(points.reserve({},{reference:use(1)}),{code:'POINTS_REVERSAL_PENDING'});
   assert.equal((await trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id})).current_status,'REFUNDED');
  });
  await t.test('future points first recover refund shortfall; recovered debt does not erase new consumption growth',async()=>{
   const next=await S.checkout(await S.listing());await S.payment(next);const raw=(await db.execute('SELECT * FROM stock_purchases WHERE order_id=?',[next.id]))[0][0],data=A.parse(raw.data_json);data.accepted_at=new Date(Date.now()-8*86400000).toISOString();await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(data),digest(data),next.id]);
   const issued=await W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:next.id,operation_key:key()});assert.equal(issued.data.debt_offset,4);assert.equal((await summary()).available_points,6);assert.equal((await summary()).qualifying_growth,10);assert.equal((await summary()).points_pending_reversal,0);
   const previous=await db.withTransaction(tx=>C.load(tx,earning.id));assert.equal(previous.data.debt_settled,4);assert.equal(previous.data.pending_shortfall,0);
   const hold=await points.reserve({},{reference:use(1)});assert.equal(hold.current_status,'HELD');await points.finish({},{hold_id:hold.id,decision:'RELEASE'});
  });
  await t.test('expired batches cannot be used; materialized expiry preserves earned growth',async()=>{
   // Independent batch fixture isolates expiry from the separate unresolved refund policy case above.
   const party=buyer2.personal_party_id;await W.open(buyer2.ctx,{party_id:party,rule_id:rule.id,rule_sha256:rule.content_sha256,operation_key:key()});
   const data={source_kind:'CONSUMPTION',points:100,reversed:0,growth_reversed:0,spent:30,expired:0,pending_shortfall:0,paid_minor:1000,expires_at:'2020-01-01T00:00:00.000Z'};
   const r=await db.withTransaction(tx=>C.insert(tx,{id:buyer2.account_id},'EARNING',party,null,'ISSUED',data,'synthetic-expiry:'+key()));
   assert.equal((await W.summary(buyer2.ctx,{party_id:party})).available_points,0);assert.equal((await points.expireParty(party)).changed,1);assert.equal((await points.expireParty(party)).changed,0);assert.equal((await W.summary(buyer2.ctx,{party_id:party})).qualifying_growth,100);
   assert.equal((await db.withTransaction(tx=>C.load(tx,r.id))).data.expired,70);
  });
  await t.test('expired adult verification preserves balance history but disables displayed membership',async()=>{
   const original=(await db.execute('SELECT identity_valid_until FROM artist_people WHERE id=?',[buyer.person.id]))[0][0].identity_valid_until;
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00' WHERE id=?",[buyer.person.id]);
   try{const q=ok(await call('GET','/wallet/summary'));assert.equal(q.recorded_balance_minor,30000);assert.equal(q.membership.active,false);assert.equal(q.membership.reason,'VERIFIED_ADULT_REQUIRED');await assert.rejects(points.reserve({},{reference:use(1)}),{code:'VERIFIED_ADULT_REQUIRED'});}finally{await db.execute('UPDATE artist_people SET identity_valid_until=? WHERE id=?',[original,buyer.person.id]);}
   assert.equal((await summary()).membership.active,true);
  });
  await t.test('sixth level requires private evidence and separate current operator review',async()=>{
   const proof=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic qualification only'),operation_key:key()});
   let r=ok(await call('POST','/wallet/level-six',buyer,{evidence_asset_ids:[proof.id],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic review'},buyer.personal_party_id,headers()));
   bad(await call('POST','/wallet/level-six/'+r.id+'/review',buyer,{decision:'APPROVE',reason:'self'},null,headers(r)),'WALLET_OPERATOR_FORBIDDEN');
   r=ok(await call('POST','/wallet/level-six/'+r.id+'/review',reviewer,{decision:'APPROVE',reason:'synthetic independent authority evidence'},null,headers(r)));assert.equal(r.current_status,'APPROVED');assert.equal((await summary()).membership.level,1);
   assert.equal(ok(await call('GET','/wallet/records?kind=LEVEL_REVIEW')).items.length,1);
  });

  await t.test('custody order reservation is atomic, unknown payments retain funds, refund restores original lots',async()=>{
   const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'v1'};
   const cfg={...S.config,provider:'CUSTODY',merchant_id:binding.merchant_id,config_revision:binding.revision,custody_binding:binding};
   let spec=await trade.createSpec(S.seller.ctx,{party_id:S.seller.personal_party_id,previous_spec_id:null,title:'synthetic cash video',provider_party_id:S.seller.personal_party_id,line_kind:'OTHER',unit_minor:20000,currency:'CNY',specification:S.spec.data.specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});
   spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic cash test',operation_key:key()});
   async function make(){let l=await stock.create(S.seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});l=await S.reviewListing(l,'RIGHTS');l=await S.reviewListing(l,'CONTENT');return trade.stockCheckout(buyer.ctx,{party_id:buyer.personal_party_id,listing_id:l.id,offer_sha256:l.content_sha256,channel:'CUSTODY',operation_key:key()});}
   const orders=await Promise.all([make(),make()]);const result=await Promise.allSettled(orders.map(o=>trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,installment_key:'stock',operation_key:key()},cfg)));
   assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'WALLET_BALANCE_INSUFFICIENT');
   const p=result.find(r=>r.status==='fulfilled').value;const heldSummary=ok(await call('GET','/wallet/summary'));assert.equal(heldSummary.available_balance_minor,10000);assert.equal(heldSummary.recorded_balance_minor,30000);assert.equal(heldSummary.reserved_balance_minor,20000);
   const proof={...cfg,payment_id:p.id,currency:'CNY',amount_minor:20000,transaction_id:'synthetic:'+p.id,status:'PENDING',product_id:null,app_account_token:null};
   await trade.applyPayment(proof);assert.equal((await summary()).available_balance_minor,10000);
   await assert.rejects(trade.applyPayment({...proof,status:'SUCCEEDED',amount_minor:1}),{code:'PAYMENT_PROOF_MISMATCH'});
   await Promise.all([trade.applyPayment({...proof,status:'SUCCEEDED'}),trade.applyPayment({...proof,status:'SUCCEEDED'})]);assert.equal((await summary()).available_balance_minor,10000);
   let purchase=await stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:p.order_id});purchase=await stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:p.order_id,expected_version:purchase.object_version,kind:'RIGHTS_DISPUTE',reason:'synthetic',operation_key:key()});await stock.resolveCase(reviewer.ctx,{order_id:p.order_id,expected_version:purchase.object_version,case_id:purchase.data.current_case_id,decision:'REFUND',reason:'synthetic independent',operation_key:key()});
   let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:p.id,allocations:[{line_id:'stock',amount_minor:20000}],reason:'synthetic original route',operation_key:key()});refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'synthetic refund',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');
   await Promise.all([trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'}),trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'})]);assert.equal((await summary()).recorded_balance_minor,30000);
   const spends=await W.records(buyer.ctx,{party_id:buyer.personal_party_id,kind:'CASH_SPEND'});assert.equal(spends.items.length,1);assert.equal(spends.items[0].data.allocations[0].returned_minor,20000);
   const next=orders.find(o=>o.id!==p.order_id),pending=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:next.id,installment_key:'stock',operation_key:key()},cfg);
   await trade.applyPayment({...proof,payment_id:pending.id,transaction_id:'synthetic:'+pending.id,status:'CLOSED'});assert.equal((await summary()).recorded_balance_minor,30000);
   await assert.rejects(trade.applyPayment({...proof,payment_id:pending.id,transaction_id:'synthetic:'+pending.id,status:'SUCCEEDED'}),{code:'CUSTODY_LATE_PAYMENT_REVIEW_REQUIRED'});
   const reconcile=require('../src/modules/wallet/cash').createCashReconciler(db),statement={party_id:buyer.personal_party_id,binding,statement_id:'synthetic:'+key(),available_minor:29999,occurred_at:new Date().toISOString()};
   const diff=await reconcile.observe(statement);assert.equal(diff.current_status,'DIFFERENCE');assert.equal((await reconcile.observe(statement)).id,diff.id);assert.equal((await summary()).recorded_balance_minor,30000);
   await assert.rejects(reconcile.observe({...statement,available_minor:30000}),{code:'CUSTODY_RECEIPT_MISMATCH'});

   const reviewedOrder=await make(),reviewed=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:reviewedOrder.id,installment_key:'stock',operation_key:key()},cfg);
   await trade.applyPayment({...proof,payment_id:reviewed.id,transaction_id:'synthetic:'+reviewed.id,status:'REVIEW_REQUIRED'});
   await trade.applyPayment({...proof,payment_id:reviewed.id,transaction_id:'synthetic:'+reviewed.id,status:'SUCCEEDED'});
   const held=(await W.records(buyer.ctx,{party_id:buyer.personal_party_id,kind:'CASH_SPEND'})).items.find(r=>r.parent_id===reviewed.id);assert.equal(held.current_status,'UNKNOWN');assert.equal((await trade.read(buyer.ctx,{record_id:reviewed.id,party_id:buyer.personal_party_id})).current_status,'REVIEW_REQUIRED');
   assert.equal((await db.execute('SELECT id FROM trade_journal WHERE order_id=?',[reviewedOrder.id]))[0].length,0);
   await assert.rejects(db.withTransaction(tx=>custody.prepare(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,amount_minor:100,operation_key:key()},{...binding,environment:'PRODUCTION'})),{code:'CUSTODY_ACCOUNT_MIGRATION_REQUIRED'});
   bad(await call('POST','/trade/payments',buyer,{order_id:reviewedOrder.id,installment_key:'stock'},buyer.personal_party_id,headers()),'CUSTODY_PROVIDER_NOT_CONNECTED');
   ok(await call('GET','/wallet/records?kind=CASH_SPEND'));ok(await call('GET','/wallet/records?kind=CASH_REFUND'));ok(await call('GET','/wallet/records?kind=CASH_RECONCILIATION'));
  });
  await t.test('wallet qualifies notices without adding duplicated legacy facts; old rights and reversal freeze remain',async()=>{
   const Q=require('../src/modules/wallet/qualification'),now=new Date().toISOString();
   const q=await db.withTransaction(tx=>Q.read(tx,buyer.personal_party_id,now));assert.equal(q.level,1);
   const nc=require('../src/modules/notices/context'),rule={data:{rule:{...require('./helpers/wallet-rule.cjs'),minimum_levels:{DRAMA:1,PERFORMANCE:1,COMMERCIAL:1,EVENT:3,RECRUITMENT:1,OFFICIAL:null}}}};
   const n=await db.withTransaction(tx=>nc.qualification(tx,buyer.personal_party_id,rule));assert.ok(n.types.includes('COMMERCIAL'));assert.ok(!n.types.includes('EVENT'));assert.ok(n.source_ids.includes(account.id));
   const legacy={active:true,level:3,valid_until:'2099-01-01T00:00:00.000Z',reason:null,source_ids:['legacy']};assert.equal(Q.choose(legacy,q),legacy);assert.equal(Q.choose({...legacy,active:false,level:0},q),q);assert.equal(Q.choose({...legacy,reason:'REFUND_REVIEW_REQUIRED'},q).reason,'REFUND_REVIEW_REQUIRED');
  });
  await t.test('automatic maintenance grants mature earnings; a lost lease cannot mutate points',async()=>{
   const next=await S.checkout(await S.listing());await S.payment(next);
   const row=(await db.execute('SELECT * FROM stock_purchases WHERE order_id=?',[next.id]))[0][0],d=A.parse(row.data_json);d.accepted_at=new Date(Date.now()-8*86400000).toISOString();await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(d),digest(d),next.id]);
   const jobs=require('../src/modules/wallet/jobs'),jr=require('../src/infrastructure/jobs/repository').createJobRepository(db);
   const scheduled=await db.withTransaction(tx=>jobs.schedule(tx,account,'2020-01-01T00:00:00.000Z'));const job=await jr.claim('synthetic-wallet-worker',60000);assert.equal(job.id,scheduled.id);
   const handler=jobs.createWalletHandlers(db).get('WALLET_MAINTENANCE');await assert.rejects(handler.execute({...job,lease_token:key()}),{code:'LEASE_LOST'});
   const before=(await summary()).qualifying_growth;const outcome=await handler.execute(job);await jr.finish(job,outcome);assert.equal((await summary()).qualifying_growth,before+10);
   const r=(await db.execute("SELECT * FROM wallet_records WHERE kind='EARNING' AND parent_id=?",[next.id]))[0][0];assert.equal(r.current_status,'ISSUED');
   await assert.rejects(handler.execute(job),{code:'LEASE_LOST'});
   assert.ok((await db.execute("SELECT id FROM platform_jobs WHERE task_type='WALLET_MAINTENANCE' AND status='PENDING'"))[0].length>0);
  });

  await t.test('each fulfillment adapter requires its own actual completion source, not a paid flag',async()=>{
   const E=require('../src/modules/wallet/earnings'),next=await S.checkout(await S.listing()),project=key(),final=key(),at='2026-01-01T00:00:00.000Z';
   async function check(quote){return db.withTransaction(tx=>E.fulfillment(tx,{...next,data:{...next.data,quote}}));}
   let q={...next.data.quote,stock_video:undefined,customization:{}};assert.equal((await check(q)).at,null);
   const projectData={current:{FINAL:final},accepted:{FINAL:final}};
   await db.execute("INSERT INTO production_records(id,kind,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'PROJECT',?,?,'ACCEPTED',?,?)",[project,next.id,buyer.account_id,JSON.stringify(projectData),digest(projectData)]);
   let flow={completion:{at},state:'DELIVERED',cancellation:null};await db.execute('INSERT INTO production_fulfillments(project_id,order_id,data_json,data_sha256) VALUES (?,?,?,?)',[project,next.id,JSON.stringify(flow),digest(flow)]);
   assert.equal((await check(q)).at,at);flow.cancellation={reason:'synthetic pending dispute'};await db.execute('UPDATE production_fulfillments SET data_json=?,data_sha256=? WHERE project_id=?',[JSON.stringify(flow),digest(flow),project]);assert.equal((await check(q)).disputed,true);
   q={...next.data.quote,stock_video:undefined,audition:{}};assert.equal((await check(q)).at,null);
   const booking=await db.withTransaction(tx=>require('../src/modules/auditions/context').insert(tx,{id:buyer.account_id},'BOOKING',buyer.personal_party_id,S.seller.personal_party_id,null,'FULFILLED',{fulfilled_at:at,dispute:null}));await db.execute('INSERT INTO audition_orders(order_id,booking_id) VALUES (?,?)',[next.id,booking.id]);assert.equal((await check(q)).at,at);
   q={...next.data.quote,stock_video:undefined,commercial:{}};await db.execute('INSERT INTO production_order_lines(order_id,line_id,project_id) VALUES (?,?,?)',[next.id,'stock',project]);assert.equal((await check(q)).at,null);
   const feedback={version_id:final,decision:'ACCEPT',stage:'FINAL'};await db.execute("INSERT INTO production_records(id,kind,project_id,order_id,created_by,current_status,data_json,data_sha256,created_at) VALUES (?,'FEEDBACK',?,?,?,'RECORDED',?,?,'2026-01-01 00:00:00')",[key(),project,next.id,buyer.account_id,JSON.stringify(feedback),digest(feedback)]);assert.equal((await check(q)).at,at);
   await db.execute("UPDATE production_records SET current_status='PAUSED' WHERE id=?",[project]);assert.equal((await check(q)).disputed,true);assert.equal((await check(q)).at,null);
  });
  await t.test('free awards require published amounts and real events; concurrent check-in awards once without growth',async()=>{
   bad(await call('POST','/wallet/check-in',buyer,{},buyer.personal_party_id,headers()),'WALLET_FREE_REWARD_NOT_ENABLED');
   let rule2=await W.createRule(outsider.ctx,{rule:{...rule.data.rule,version:'synthetic-free',free_awards:{REGISTER:2,DAILY_CHECKIN:3,REVIEW:null,SHARE:null}},operation_key:key()});rule2=await W.reviewRule(reviewer.ctx,{record_id:rule2.id,expected_version:rule2.object_version,decision:'APPROVE',reason:'synthetic configured rewards',operation_key:key()});
   await W.open(S.seller.ctx,{party_id:S.seller.personal_party_id,rule_id:rule2.id,rule_sha256:rule2.content_sha256,operation_key:key()});
   const checks=await Promise.all([1,2].map(()=>W.checkIn(S.seller.ctx,{party_id:S.seller.personal_party_id,operation_key:key()})));assert.equal(checks[0].id,checks[1].id);
   const q=await W.summary(S.seller.ctx,{party_id:S.seller.personal_party_id});assert.equal(q.available_points,5);assert.equal(q.qualifying_growth,0);assert.equal(q.membership.active,false);
   ok(await call('POST','/wallet/check-in',S.seller,{},S.seller.personal_party_id,headers()));
   await assert.rejects(require('../src/modules/wallet/rewards').createRewardService(db).award({},{reference:'synthetic:forgery'}),{code:'WALLET_REWARD_EVENT_NOT_VERIFIED'});
  });
  await t.test('audit failure rolls back rule creation; stored digest corruption fails closed',async()=>{
   const trigger='wallet_test_audit_fail';await db.withConnection(c=>c.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON wallet_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'`));
   try{await assert.rejects(W.createRule(outsider.ctx,{rule:{...rule.data.rule,version:'rollback'},operation_key:key()}),/synthetic audit failure/);}finally{await db.withConnection(c=>c.query('DROP TRIGGER '+trigger));}
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='RULE'"))[0].length,2);
   await db.execute('UPDATE wallet_records SET data_sha256=? WHERE id=?',['0'.repeat(64),account.id]);await assert.rejects(summary(),{code:'STORED_CONTENT_MISMATCH'});
   await db.execute('UPDATE wallet_records SET data_sha256=? WHERE id=?',[account.content_sha256,account.id]);
  });
  const out=process.env.WALLET_HTTP_FIXTURES_OUT||path.resolve(__dirname,'../../..','..','.local/wallet-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
