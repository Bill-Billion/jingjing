'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('lottery actual HTTP: immutable odds, independent review, stock and atomic points',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');
 const name='jx_test_lottery_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'4'});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider}=S.people;await S.actorCast(buyer);
  for(const u of [producer,reviewer,outsider])for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW','FINANCE_REVIEW'])await S.grant(u,action);
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});let wr=await W.createRule(producer.ctx,{rule:{...require('./helpers/wallet-rule.cjs'),free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});wr=await W.reviewRule(reviewer.ctx,{record_id:wr.id,expected_version:wr.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});await W.open(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
  async function request(route,u,{body=null,party=true,version=null,operation=key()}={}){const response=await fetch(base+route,{method:body===null?'GET':'POST',headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':u.acting_party_id}:{},...body!==null?{'Content-Type':'application/json','Idempotency-Key':operation}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!==null?{body:JSON.stringify(body)}:{}}),json=await response.json();fixtures.push({method:body===null?'GET':'POST',path:new URL(base+route).pathname,schema:response.status===200?(route.startsWith('/redemption')?'RedemptionResponse':route.startsWith('/wallet')?'WalletResponse':'TradeRecordResponse'):'ErrorResponse',value:json});if(response.status!==200)throw Object.assign(new Error(json.error?.code||JSON.stringify(json)),{code:json.error?.code});return json.data;}

  const evidence=await S.upload(producer,'REVIEW_EVIDENCE');
  async function freeStock(capacity=20){let saved;const stop=new Error('synthetic quote only');await assert.rejects(S.newOrder({unitMinor:50000,beforeAccept:async d=>{saved=d;throw stop;}}),e=>e===stop);
   const template={version:'synthetic-free',source_ref:'synthetic-only',title:'synthetic reviewed film',kind:'PRODUCTION_FREE',valid_days:30,exchange_points:null,capacity,available_until:'2099-01-01T00:00:00.000Z',terms:'exact reviewed film, consume on start',production:{face_minor:50000,minimum_minor:50000,spec_ids:[saved.spec.id]},interview:null,exposure:null};
   let r=await request('/redemption/stock',producer,{body:{template,evidence_asset_ids:[S.proof.id]}});return request('/redemption/stock/'+r.id+'/review',reviewer,{party:false,version:r.object_version,body:{decision:'APPROVE',reason:'synthetic stock'}});
  }
  const config=prizes=>({version:'synthetic lottery v1',algorithm:'NINE_THEN_CONDITIONAL_TENTH_V1',single_points:300,ten_points:2700,prizes});
  const create=(stock,prizes=[{key:'free',kind:'PRODUCTION_FREE',weight:10000,estimated_cost_minor:50000}])=>request('/redemption/pools',producer,{body:{config:config(prizes),bindings:prizes.map(p=>({key:p.key,stock_id:p.key==='free'?stock.id:null,point_back:p.kind==='POINT_BACK'?10:0})),starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2099-01-01T00:00:00.000Z',terms:'synthetic; actual finite prizes; ten draw conditional guarantee',cost_limit_single_minor:50000,cost_limit_ten_minor:500000,evidence_asset_ids:[evidence.id]}});
  const review=(pool,who,channel)=>request('/redemption/pools/'+pool.id+'/review',who,{party:false,version:pool.object_version,body:{channel,decision:'APPROVE',reason:'synthetic independent',evidence_asset_id:evidence.id}});
  const draw=(pool,count=10,operation=key(),who=buyer)=>request('/redemption/draws',who,{operation,body:{pool_id:pool.id,rules_sha256:pool.data.rules_sha256,count}});
  let pool,stock;
  await t.test('creator cannot approve; rules and finance require separate reviewers; unpublished draw denied',async()=>{
   stock=await freeStock();pool=await create(stock);await assert.rejects(draw(pool),{code:'LOTTERY_NOT_OPEN'});await assert.rejects(review(pool,producer,'RULES'),{code:'SELF_REVIEW_FORBIDDEN'});
   pool=await review(pool,reviewer,'RULES');await assert.rejects(review(pool,reviewer,'FINANCE'),{code:'INDEPENDENT_FINANCE_REVIEW_REQUIRED'});pool=await review(pool,outsider,'FINANCE');assert.equal(pool.current_status,'PUBLISHED');assert.equal(pool.data.prize_promises[0].template.production.face_minor,50000);
   const visible=await request('/redemption/pools/'+pool.id,buyer,{party:false});assert.equal(visible.distribution.prizes[0].single_probability,'1.000000000000000');assert.equal(visible.reviews,undefined);assert.equal(visible.evidence_asset_ids,undefined);
  });
  await t.test('reviewers can actually inspect linked evidence; owner, unrelated file and corruption are rejected',async()=>{
   async function evidenceRead(who,asset=evidence.id){return fetch(base+'/redemption/records/'+pool.id+'/evidence/'+asset,{headers:{Authorization:'Bearer '+who.token}});}
   let response=await evidenceRead(reviewer);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'synthetic REVIEW_EVIDENCE');assert.equal((await evidenceRead(producer)).status,403);assert.equal((await evidenceRead(buyer)).status,403);assert.equal((await evidenceRead(outsider)).status,200);
   const other=await S.upload(producer,'REVIEW_EVIDENCE');assert.equal((await evidenceRead(reviewer,other.id)).status,404);
   const [[row]]=await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[evidence.id]);const original=S.files.get(row.object_key);S.files.set(row.object_key,Buffer.from('synthetic corrupt'));assert.equal((await evidenceRead(reviewer)).status,503);S.files.set(row.object_key,original);
  });
  await t.test('retry keeps same winners; concurrent last ten stock succeeds only once; no stock no charge',async()=>{
   const op=key(),a=await draw(pool,10,op);assert.equal(a.data.results.length,10);assert.equal(new Set(a.data.results.map(x=>x.grant_id)).size,10);assert.equal(a.data.points,2700);assert.equal(a.current_status,'SETTLED');assert.deepEqual(await draw(pool,10,op),a);
   await assert.rejects(draw(pool,1,op),{code:'IDEMPOTENCY_CONFLICT'});
   const results=await Promise.allSettled([draw(pool),draw(pool)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'LOTTERY_STOCK_NOT_READY');
   await assert.rejects(draw(pool,1),{code:'LOTTERY_STOCK_NOT_READY'});assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM redemption_records WHERE kind='DRAW' AND parent_id=?",[pool.id]))[0][0].n),2);
   assert.equal(Number((await db.execute("SELECT SUM(JSON_EXTRACT(data_json,'$.points')) n FROM wallet_records WHERE kind='POINT_HOLD' AND owner_party_id=? AND current_status='SPENT'",[buyer.personal_party_id]))[0][0].n),5400);
   await assert.rejects(request('/redemption/draws/'+a.id,outsider),{code:'REDEMPTION_NOT_FOUND'});const mine=await request('/redemption/draws',buyer);assert.equal(mine.items.length,2);
  });
  await t.test('insufficient points rolls back draw, stock and command; retired version preserves old results',async()=>{
   stock=await freeStock();let p=await create(stock);p=await review(p,reviewer,'RULES');p=await review(p,outsider,'FINANCE');
   const poor=await S.registerActor('synthetic insufficient');await S.actorCast(poor);await W.open(poor.ctx,{party_id:poor.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});
   // Consume seeded test points through the normal points service, leaving 100.
   const use=require('../src/modules/wallet/points').createPointsService(db,{resolveUse:async()=>({party_id:poor.personal_party_id,purpose:'REDEMPTION',reference:'synthetic:spend',points:99900})});const held=await use.reserve(poor.ctx,{reference:'synthetic:spend'});await use.finish(poor.ctx,{hold_id:held.id,decision:'COMMIT'});
   await assert.rejects(draw(p,10,key(),poor),{code:'WALLET_POINTS_INSUFFICIENT'});assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM redemption_records WHERE kind='DRAW' AND parent_id=?",[p.id]))[0][0].n),0);
   const current=(await request('/redemption/queue?kind=STOCK',reviewer,{party:false})).items.find(x=>x.id===stock.id);assert.equal(current.data.issued,0);
   pool=await request('/redemption/pools/'+pool.id+'/retirement',reviewer,{party:false,version:pool.object_version,body:{reason:'synthetic retire'}});await assert.rejects(draw(pool),{code:'LOTTERY_NOT_OPEN'});assert.equal((await request('/redemption/draws',buyer)).items.length,2);
  });
  await t.test('ten guarantee survives mostly no-win pool and records actual conditional draws',async()=>{
   stock=await freeStock(100);let p=await create(stock,[{key:'free',kind:'PRODUCTION_FREE',weight:1,estimated_cost_minor:50000},{key:'points',kind:'POINT_BACK',weight:4999,estimated_cost_minor:0},{key:'none',kind:'NONE',weight:5000,estimated_cost_minor:0}]);p=await review(p,reviewer,'RULES');p=await review(p,outsider,'FINANCE');const d=await draw(p);assert.ok(d.data.results.some(x=>x.kind==='PRODUCTION_FREE'));assert.equal(d.data.rule_snapshot.rules_sha256,p.data.rules_sha256);assert.equal(d.data.results.length,10);const earnings=(await request('/wallet/records?kind=EARNING',buyer)).items;assert.equal(earnings.filter(x=>x.data.event_kind==='REWARD').length,d.data.results.filter(x=>x.point_earning_id).length);await request('/wallet/summary',buyer);
  });
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/redemption-lottery-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
