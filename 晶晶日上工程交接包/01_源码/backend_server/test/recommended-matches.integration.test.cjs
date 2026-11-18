'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('recommended matching combines actual stock rights and budget with consented purchases and browsing',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const cases=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),options={resolvePrincipal:S.resolvePrincipal,secret:S.secret};
  const privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,options),collections=require('../src/modules/collections/repository').createCollectionsRepository(db,options);
  const listings=[];for(const city of ['alpha','beta','gamma']){let r=await S.stock.create(S.seller.ctx,{...S.listingInput,city,operation_key:key()});r=await S.reviewListing(r,'RIGHTS');listings.push(await S.reviewListing(r,'CONTENT'));}
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function get(q={},who=S.buyer,route='recommended-matches',party=null){const url='/discovery/'+route+'?'+new URLSearchParams({kind:'STOCK',...q}),res=await fetch(base+url,{headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{}}}),value=await res.json();cases.push({method:'GET',path:'/api/v1/discovery/'+route,schema:res.status===200?{ 'recommended-matches':'DiscoveryRecommendedMatchesResponse',recommendations:'DiscoveryRecommendationsResponse',matches:'DiscoveryMatchesResponse'}[route]:'ErrorResponse',value});return {status:res.status,cache:res.headers.get('cache-control'),...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const pref=async value=>{const p=await privacy.preferences(S.buyer.ctx);return privacy.savePreferences(S.buyer.ctx,{preferences:{personalization:value,marketing:false,rest_reminder_minutes:0},expected_version:p.object_version,operation_key:key()});};
  const history=async value=>{const p=await collections.preferences(S.buyer.ctx);return collections.changePreferences(S.buyer.ctx,{history_enabled:value,expected_version:p.object_version,operation_key:key()});};
  let ordered,order,pay;
  await t.test('default matching and original filter order remain equal; strict inputs and no-store',async()=>{
   const response=await get({max_price_minor:100}),p=ok(response);assert.equal(response.cache,'no-store');assert.equal(p.personalized,false);assert.equal(p.algorithm_version,'EXPLICIT_FILTERS_CITY_ACTIVITY_V1');assert.equal(p.items.length,3);ordered=p.items.map(x=>x.item.id);
   assert.deepEqual(ordered,ok(await get({max_price_minor:100},S.buyer,'matches')).items.map(x=>x.item.id));
   for(const q of [{max_price_minor:'-1'},{max_price_minor:'1.5'},{min_halo:1},{extra:'x'},{limit:0}])assert.equal((await get(q)).status,400);
   assert.equal((await get({},S.buyer,'recommended-matches',S.buyer.personal_party_id)).status,400);
  });
  const byId=id=>listings.find(x=>x.id===id),browsed=byId(ordered?.[1]),purchased=byId(ordered?.[2]);
  await t.test('browsing consent alone does not activate personalization; explicit opt-in ranks the browsed city',async()=>{
   assert.ok(browsed&&purchased);const h=await history(true);await collections.visit(S.buyer.ctx,{kind:'STOCK',target_id:browsed.id,expected_version:h.object_version,operation_key:key()});
   assert.deepEqual(ok(await get()).items.map(x=>x.item.id),ordered);await pref(true);const p=ok(await get({max_price_minor:100}));assert.equal(p.items[0].item.id,browsed.id);assert.ok(p.items[0].reasons.includes('RECENT_BROWSING_CITY'));assert.ok(p.items.every(x=>x.item.unit_minor===100));
  });
  await t.test('unpaid order does not rank; actual synthetic payment outranks browsing without changing rights or price',async()=>{
   order=await S.checkout(purchased);assert.equal(ok(await get()).items[0].item.id,browsed.id);pay=await S.payment(order);const p=ok(await get({purpose:'PERSONAL_NONCOMMERCIAL',max_price_minor:100}));assert.equal(p.items[0].item.id,purchased.id);assert.ok(p.items[0].reasons.includes('RECENT_PURCHASE_CITY'));assert.ok(p.items[0].reasons.includes('LICENSE_MATCH'));assert.ok(p.items.every(x=>x.item.unit_minor===100));assert.equal(p.price_personalized,false);assert.equal(p.requires_business_validation,true);
   assert.equal(ok(await get({max_price_minor:99})).items.length,0);assert.equal(ok(await get({purpose:'COMMERCIAL_LIMITED',commercial_use:'BRAND_PROMOTION'})).items.length,0);
   assert.equal(ok(await get({city:browsed.data.city})).items[0].item.id,browsed.id);
  });
  await t.test('cursor cannot move across accounts, conditions, legacy endpoint or changed preferences',async()=>{
   const q={max_price_minor:100,limit:1},p=ok(await get(q));assert.ok(p.next_cursor);
   assert.equal((await get({...q,cursor:p.next_cursor},S.buyer2)).status,409);assert.equal((await get({...q,max_price_minor:101,cursor:p.next_cursor})).status,409);
   assert.equal((await get({cursor:p.next_cursor},S.buyer,'recommendations')).status,409);
   await pref(false);assert.equal((await get({...q,cursor:p.next_cursor})).status,409);const off=ok(await get({max_price_minor:100}));assert.equal(off.personalized,false);assert.deepEqual(off.items.map(x=>x.item.id),ordered);assert.ok(off.items.every(x=>!x.reasons.some(v=>v.startsWith('RECENT_'))));await pref(true);
  });
  await t.test('approved refund is not repayment; completed refund removes purchase influence and invalidates prior cursor',async()=>{
   const old=ok(await get({limit:1}));let p=await S.stock.purchased(S.buyer.ctx,{party_id:S.buyer.personal_party_id,order_id:order.id});
   p=await S.stock.openCase(S.buyer.ctx,{party_id:S.buyer.personal_party_id,order_id:order.id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'synthetic matching refund',operation_key:key()});
   p=await S.stock.resolveCase(S.reviewer.ctx,{order_id:order.id,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',reason:'synthetic independent full refund',operation_key:key()});
   let refund=await S.trade.requestRefund(S.buyer.ctx,{party_id:S.buyer.personal_party_id,payment_id:pay.payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'approved case',operation_key:key()});refund=await S.trade.review(S.reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'synthetic independent review',operation_key:key()});
   assert.equal(ok(await get()).items[0].item.id,purchased.id);await S.trade.claim(S.reviewer.ctx,refund.id,null,'REFUND');await S.trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
   const result=ok(await get());assert.equal(result.items[0].item.id,browsed.id);assert.ok(!result.items.some(x=>x.reasons.includes('RECENT_PURCHASE_CITY')));assert.equal((await get({cursor:old.next_cursor})).status,409);
  });
  await t.test('history off clears browsing influence; source withdrawn after selection is not returned or purchasable',async()=>{
   const old=ok(await get({limit:1}));await history(false);assert.equal((await get({cursor:old.next_cursor})).status,409);assert.ok(ok(await get()).items.every(x=>!x.reasons.some(v=>v.startsWith('RECENT_'))));
   await S.stock.status(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:browsed.id,expected_version:browsed.object_version,action:'UNLIST',reason:'synthetic withdrawal',operation_key:key()});assert.ok(!ok(await get()).items.some(x=>x.item.id===browsed.id));await assert.rejects(S.checkout(browsed,S.buyer2),{code:'STOCK_NOT_LISTED'});
  });
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/recommended-matches-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
