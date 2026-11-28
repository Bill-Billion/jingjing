'use strict';
// ACC-DEL-18.03: real HTTP reads of separately earned, source-bound 365-day lots.
// Only this disposable database's clock moves; no earning dates/balances are edited.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate}=require('../src/infrastructure/database/migrator');

test('wallet source batches expire independently at their own 365-day boundary',
 {skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_qa18_expiry_${randomBytes(10).toString('hex')}`;
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 const DAY=86400000,realStart=Date.now(),start=realStart-500*DAY,deadline=realStart+3600000;
 const fixtures=[],state={synthetic_only:true,database:name,real_started_at:new Date(realStart).toISOString(),clock_steps:[],orders:[],stages:[],complete:false};
 let db,server,created=false;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'1'});await migrate(db);
  async function clock(day){const ms=start+day*DAY;await db.execute('SET timestamp=?',[ms/1000]);const [[r]]=await db.execute('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 ms');assert(Math.abs(Number(r.ms)-ms)<5);state.clock_steps.push({day,at:new Date(ms).toISOString()});}
  await clock(0);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,buyer2,reviewer,outsider,stock}=S;
  // Provision only the five newly created synthetic sessions for one wall-clock hour.
  // Virtual business time must not turn them into expired authentication fixtures.
  for(const u of S.users)await db.execute('UPDATE auth_sessions SET expires_ms=? WHERE account_id=?',[deadline,u.account_id]);
  for(const u of [outsider,reviewer])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'WALLET_RULE_REVIEW',enabled:true,expected_version:0,expires_at:new Date(deadline).toISOString(),authority_ref:'synthetic:qa18-source-expiry',reason:'Independent isolated source-expiry rule review'});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';state.api_base=base;state.party_id=buyer.personal_party_id;
  async function call(method,url,user=buyer,body,party=user.personal_party_id,headers={}){
   assert(Date.now()<deadline,'Synthetic test deadline exceeded');
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json'}:{},...headers},...body!==undefined?{body:JSON.stringify(body)}:{}});
   const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?'WalletResponse':'ErrorResponse',value});return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const headers=(r,k=key())=>({'Idempotency-Key':k,...r?{'If-Match':'"'+r.object_version+'"'}:{}});
  const records=async()=>ok(await call('GET','/wallet/records?kind=EARNING')).items;
  const totals={version:'NET_ISSUED_V1',issued:20,withdrawn:0,net_issued:20};
  async function stage(label,available){const q=ok(await call('GET','/wallet/summary'));assert.equal(q.available_points,available);assert.deepEqual(q.cumulative_points,totals);assert.equal(q.qualifying_growth,20);const items=await records();state.stages.push({label,summary:q,earnings:items});return items;}
  let rule;
  await t.test('364-day and 366-day rules are rejected; only an independently approved 365-day rule opens the wallet',async()=>{
   for(const days of [364,366]){const r=await call('POST','/wallet/rules',outsider,{rule:{...require('./helpers/wallet-rule.cjs'),points_days:days}},null,headers());assert.equal(r.status,400);assert.equal(r.error.code,'WALLET_RULE_INVALID');}
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='RULE'"))[0].length,0);
   rule=ok(await call('POST','/wallet/rules',outsider,{rule:require('./helpers/wallet-rule.cjs')},null,headers()));
   rule=ok(await call('POST','/wallet/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent synthetic 365-day rule'},null,headers(rule)));
   ok(await call('POST','/wallet/accounts',buyer,{rule_id:rule.id,rule_sha256:rule.content_sha256},buyer.personal_party_id,headers()));state.rule_id=rule.id;
  });
  async function order(){const listing=await S.listing(),o=await S.checkout(listing),p=await S.payment(o);await stock.content(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id});await stock.observed(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id});const purchase=await stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id});await stock.accept(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,expected_version:purchase.object_version,operation_key:key()});const pending=ok(await call('POST','/wallet/earnings/sync',buyer,{order_id:o.id},buyer.personal_party_id,headers()));assert.equal(pending.current_status,'PENDING');assert.equal(pending.pending_reason,'AFTERCARE_WINDOW');assert.equal(pending.data.expires_at,null);const item={order_id:o.id,payment_id:p.payment.id,earning_id:pending.id};state.orders.push(item);return item;}
  async function issue(o){const r=ok(await call('POST','/wallet/earnings/sync',buyer,{order_id:o.order_id},buyer.personal_party_id,headers()));assert.equal(r.id,o.earning_id);assert.equal(r.current_status,'ISSUED');assert.equal(r.data.source_kind,'CONSUMPTION');assert.equal(r.data.points,10);assert.equal(r.data.rule_id,rule.id);assert.equal(Date.parse(r.data.expires_at)-Date.parse(r.data.issued_at),365*DAY);return r;}
  let old,newer;
  await t.test('two legitimate accepted orders issue on different dates with immutable source and rule snapshots',async()=>{
   const first=await order();await clock(8);old=await issue(first);
   await clock(30);const second=await order();await clock(38);newer=await issue(second);
   assert.notEqual(old.id,newer.id);assert.equal(Date.parse(newer.data.expires_at)-Date.parse(old.data.expires_at),30*DAY);
   const before=await stage('both-live',20);assert.equal(before.length,2);
   const replay=ok(await call('POST','/wallet/earnings/sync',buyer,{order_id:first.order_id},buyer.personal_party_id,headers()));assert.equal(replay.object_version,old.object_version);assert.deepEqual(replay.data,old.data);
  });
  const uses=new Map(),points=require('../src/modules/wallet/points').createPointsService(db,{resolveUse:async(tx,ctx,reference)=>uses.get(reference)});
  function use(n){const reference='synthetic:expiry-only:'+key();uses.set(reference,{party_id:buyer.personal_party_id,purpose:'VOTE',reference,points:n});return reference;}
  await t.test('the first exact expiry excludes only its old batch; processing is idempotent and newer points remain spendable',async()=>{
   await clock(373-1/DAY);await stage('one-millisecond-before-first-expiry',20);
   await clock(373);let lots=await stage('first-expiry-before-job',10);assert.equal(lots.find(r=>r.id===old.id).data.expired,0);
   assert.equal((await points.expireParty(buyer.personal_party_id)).changed,1);assert.equal((await points.expireParty(buyer.personal_party_id)).changed,0);
   lots=await stage('first-expiry-after-job',10);const a=lots.find(r=>r.id===old.id),b=lots.find(r=>r.id===newer.id);
   assert.deepEqual(a.data,{...old.data,expired:10});assert.deepEqual(b.data,newer.data);assert.equal(b.object_version,newer.object_version);
   await assert.rejects(points.reserve({},{reference:use(11)}),{code:'WALLET_POINTS_INSUFFICIENT'});
   const hold=await points.reserve({},{reference:use(5)});assert.deepEqual(hold.data.allocations,[{lot_id:newer.id,points:5}]);await stage('only-new-batch-held',5);
   await points.finish({},{hold_id:hold.id,decision:'RELEASE'});await stage('new-batch-released',10);state.hold_id=hold.id;
  });
  await t.test('the second batch keeps its own deadline and history survives expiry without erasing cumulative earnings',async()=>{
   await clock(403-1/DAY);await stage('one-millisecond-before-second-expiry',10);
   await clock(403);await stage('second-expiry-before-job',0);assert.equal((await points.expireParty(buyer.personal_party_id)).changed,1);assert.equal((await points.expireParty(buyer.personal_party_id)).changed,0);
   const lots=await stage('both-expired-history-retained',0);assert.equal(lots.length,2);assert.deepEqual(lots.find(r=>r.id===old.id).data,{...old.data,expired:10});assert.deepEqual(lots.find(r=>r.id===newer.id).data,{...newer.data,expired:10});
   await assert.rejects(points.reserve({},{reference:use(1)}),{code:'WALLET_POINTS_INSUFFICIENT'});
  });
  await t.test('ownership, server-controlled dates and unavailable recharge channels remain enforced',async()=>{
   const foreign=await call('GET','/wallet/records?kind=EARNING',buyer2,undefined,buyer.personal_party_id);assert.equal(foreign.status,403);assert.equal(foreign.error.code,'ARTIST_PARTY_FORBIDDEN');
   const forged=await call('POST','/wallet/earnings/sync',buyer,{order_id:state.orders[0].order_id,expires_at:'2099-01-01T00:00:00.000Z'},buyer.personal_party_id,headers());assert.equal(forged.status,400);assert.equal(forged.error.code,'INVALID_INPUT');
   const recharge=await call('POST','/wallet/recharges',buyer,{amount_minor:30000},buyer.personal_party_id,headers());assert.equal(recharge.status,503);assert.equal(recharge.error.code,'CUSTODY_PROVIDER_NOT_CONNECTED');
   const q=ok(await call('GET','/wallet/summary'));assert.deepEqual(q.custody,{enabled:false,reason:'CUSTODY_PROVIDER_NOT_CONNECTED'});assert.equal(q.recorded_balance_minor,0);assert.deepEqual(q.cumulative_points,totals);
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='RECHARGE'"))[0].length,0);
  });
  state.complete=true;
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(db){await db.execute('SET timestamp=0');await db.close();}
  if(created){assert(/^jx_test_qa18_expiry_[a-f0-9]{20}$/.test(name));await control.query('DROP DATABASE '+mysql.escapeId(name));state.database_removed=true;}await control.end();
  state.finished_at=new Date().toISOString();state.services_stopped=true;
  const out=path.resolve(__dirname,'../../../..','.local');await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'wallet-source-expiry-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.join(out,'wallet-source-expiry-records.json'),JSON.stringify(state,null,2));
 }
});
