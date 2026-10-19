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
  await t.test('audit failure rolls back rule creation; stored digest corruption fails closed',async()=>{
   const trigger='wallet_test_audit_fail';await db.withConnection(c=>c.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON wallet_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'`));
   try{await assert.rejects(W.createRule(outsider.ctx,{rule:{...rule.data.rule,version:'rollback'},operation_key:key()}),/synthetic audit failure/);}finally{await db.withConnection(c=>c.query('DROP TRIGGER '+trigger));}
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='RULE'"))[0].length,1);
   await db.execute('UPDATE wallet_records SET data_sha256=? WHERE id=?',['0'.repeat(64),account.id]);await assert.rejects(summary(),{code:'STORED_CONTENT_MISMATCH'});
   await db.execute('UPDATE wallet_records SET data_sha256=? WHERE id=?',[account.content_sha256,account.id]);
  });
  const out=process.env.WALLET_HTTP_FIXTURES_OUT||path.resolve(__dirname,'../../..','..','.local/wallet-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
