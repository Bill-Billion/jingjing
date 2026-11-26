'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('contract pool retains disabled source item and historical snapshots',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');
 const name='jx_test_lottery_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const fixtures=[],records={};
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'4'});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider}=S.people;await S.actorCast(buyer);
  for(const u of [producer,reviewer,outsider])for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW','FINANCE_REVIEW'])await S.grant(u,action);
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});let wr=await W.createRule(producer.ctx,{rule:{...require('./helpers/wallet-rule.cjs'),free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});wr=await W.reviewRule(reviewer.ctx,{record_id:wr.id,expected_version:wr.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});await W.open(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function request(route,u,{body=null,party=true,version=null,operation=key()}={}){const response=await fetch(base+route,{method:body===null?'GET':'POST',headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':u.acting_party_id}:{},...body!==null?{'Content-Type':'application/json','Idempotency-Key':operation}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!==null?{body:JSON.stringify(body)}:{}}),json=await response.json();fixtures.push({method:body===null?'GET':'POST',path:new URL(base+route).pathname,schema:response.status===200?(route.startsWith('/redemption')?'RedemptionResponse':route.startsWith('/wallet')?'WalletResponse':'TradeRecordResponse'):'ErrorResponse',value:json});if(response.status!==200)throw Object.assign(new Error(json.error?.code||JSON.stringify(json)),{code:json.error?.code});return json.data;}

  let offer;const stop=new Error('Synthetic reviewed quote only');await assert.rejects(S.newOrder({unitMinor:50000,beforeAccept:async d=>{offer=d;throw stop;}}),e=>e===stop);
  const prepared=await require('../../../../scripts/test-fixtures/qa18-contract-lottery.cjs')(db,S,offer),evidence=await S.upload(producer,'REVIEW_EVIDENCE');
  const input={config:prepared.config,bindings:prepared.bindings,starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2026-12-20T00:00:00.000Z',terms:'Synthetic original twelve source items, eleven active; no real activity',cost_limit_single_minor:100,cost_limit_ten_minor:1000,evidence_asset_ids:[evidence.id]},operation=key();
  let pool=await request('/redemption/pools',producer,{body:input,operation});records.pool_id=pool.id;
  function catalog(value){assert(value,'SOURCE_CATALOG_MISSING');assert.equal(value.version,'CONTRACT_20261029_FIRST_PHASE');assert.equal(value.items.length,12);assert.equal(new Set(value.items.map(x=>x.key)).size,12);assert.equal(value.items.filter(x=>x.enabled).length,11);assert.deepEqual(value.items.find(x=>x.key==='final'),{key:'final',kind:'INTERVIEW_FINAL',enabled:false,weight:0});assert.equal(value.items.reduce((n,x)=>n+x.weight,0),10000);assert.deepEqual(value.items.filter(x=>x.enabled).map(x=>[x.key,x.kind,x.weight]),prepared.config.prizes.map(x=>[x.key,x.kind,x.weight]));}
  await t.test('new draft stores twelve original source items while only eleven can be drawn',async()=>{
   catalog(pool.data.source_catalog);assert.equal(pool.data.config.prizes.length,11);assert(!pool.data.bindings.some(x=>x.key==='final'));
   const repeated=await request('/redemption/pools',producer,{body:input,operation});assert.equal(repeated.id,pool.id);assert.deepEqual(repeated.data.source_catalog,pool.data.source_catalog);
   await assert.rejects(request('/redemption/pools',producer,{body:{...input,config:{...input.config,source_catalog:{version:'CLIENT_CONTROLLED'}}}}));
   const invalid=structuredClone(input);invalid.config.prizes[0].kind='INTERVIEW_FINAL';await assert.rejects(request('/redemption/pools',producer,{body:invalid}),{code:'LOTTERY_PRIZE_INVALID'});
  });
  async function publish(p){p=await request('/redemption/pools/'+p.id+'/review',reviewer,{party:false,version:p.object_version,body:{channel:'RULES',decision:'APPROVE',reason:'Independent synthetic rules',evidence_asset_id:evidence.id}});return request('/redemption/pools/'+p.id+'/review',outsider,{party:false,version:p.object_version,body:{channel:'FINANCE',decision:'APPROVE',reason:'Different synthetic finance reviewer',evidence_asset_id:evidence.id}});}
  await t.test('published, drawn and retired snapshots retain the disabled item without minting its grant',async()=>{
   pool=await publish(pool);const visible=await request('/redemption/pools/'+pool.id,buyer,{party:false});catalog(visible.source_catalog);assert.deepEqual(visible.source_catalog,pool.data.source_catalog);
   assert.equal(visible.distribution.prizes.length,11);assert(!visible.distribution.prizes.some(x=>x.kind==='INTERVIEW_FINAL'));assert.equal(visible.evidence_asset_ids,undefined);
   // Advance publication timestamps only in this disposable fixture; production has no bypass.
   const P=require('../src/modules/redemption/lottery-policy'),data={...pool.data,publication_notice:P.publicationNotice(new Date(Date.now()-8*86400000).toISOString(),pool.data.ends_at)};data.rules_sha256=P.rulesHash(data);
   const modified={...data,source_catalog:structuredClone(data.source_catalog)};modified.source_catalog.items[0].enabled=true;assert.notEqual(P.rulesHash(modified),data.rules_sha256);
   await db.execute('UPDATE redemption_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),pool.id]);
   const op=key(),body={pool_id:pool.id,rules_sha256:data.rules_sha256,count:10},before=(await W.summary(buyer.ctx,{party_id:buyer.personal_party_id})).available_points,draw=await request('/redemption/draws',buyer,{body,operation:op});records.draw_id=draw.id;
   catalog(draw.data.rule_snapshot.source_catalog);assert(draw.data.results.every(x=>x.kind!=='INTERVIEW_FINAL'));const balance=(await W.summary(buyer.ctx,{party_id:buyer.personal_party_id})).available_points;assert.equal(balance,before-2700+draw.data.results.reduce((n,x)=>n+x.point_back,0));
   pool=await request('/redemption/pools/'+pool.id,buyer,{party:false});await request('/redemption/pools/'+pool.id+'/retire',reviewer,{party:false,version:pool.object_version,body:{reason:'Synthetic retirement preserves history'}});
   const retired=await request('/redemption/pools/'+pool.id,buyer,{party:false});assert.equal(retired.current_status,'RETIRED');catalog(retired.source_catalog);assert.equal(retired.rules_sha256,data.rules_sha256);
   const replay=await request('/redemption/draws',buyer,{body,operation:op});assert.equal(replay.id,draw.id);assert.deepEqual(replay.data.rule_snapshot,draw.data.rule_snapshot);assert.equal((await W.summary(buyer.ctx,{party_id:buyer.personal_party_id})).available_points,balance);
  });
  await t.test('legacy pool without source catalog keeps its exact stored history on read and retirement',async()=>{
   let legacy=await publish(await request('/redemption/pools',producer,{body:input}));const data=structuredClone(legacy.data);delete data.source_catalog;data.rules_sha256=require('../src/modules/redemption/lottery-policy').rulesHash(data);
   // Explicit import of the previously valid shape; no migration rewrites existing business rows.
   await db.execute('UPDATE redemption_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),legacy.id]);records.legacy_pool_id=legacy.id;
   const snapshot=(await db.execute('SELECT data_sha256 FROM redemption_records WHERE id=?',[legacy.id]))[0][0].data_sha256;
   const read=await request('/redemption/pools/'+legacy.id,buyer,{party:false});assert.equal(read.source_catalog,undefined);assert.equal(read.rules_sha256,data.rules_sha256);assert.deepEqual(read.config,data.config);assert.equal((await db.execute('SELECT data_sha256 FROM redemption_records WHERE id=?',[legacy.id]))[0][0].data_sha256,snapshot);
   legacy=await request('/redemption/pools/'+legacy.id+'/retire',reviewer,{party:false,version:legacy.object_version,body:{reason:'Synthetic legacy retirement'}});assert.equal(legacy.data.source_catalog,undefined);assert.equal(legacy.data.rules_sha256,data.rules_sha256);assert.deepEqual(legacy.data.config,data.config);
  });
 }finally{
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/redemption-source-catalog-http.json'),JSON.stringify({synthetic_only:true,database:name,records,cases:fixtures},null,2));
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
