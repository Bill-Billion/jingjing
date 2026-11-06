"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('commercial stock independent product, scoped personal rights, business buyer and original order in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');assert.equal(env.MYSQL_PORT,'33316');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const old=process.env.STOCK_COMMERCIAL_LICENSE_ENABLED;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,reviewer,outsider,stock,trade}=S;
 const lic={scope:'COMMERCIAL_LIMITED',exclusive:false,territory:'CN',duration:'FIXED_TERM',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2035-01-01T00:00:00.000Z',commercial_uses:['BRAND_PROMOTION'],personal_social_sharing:false,acceptance_hours:48,aftercare_terms:'Synthetic rights and failed delivery full-refund review.'};
 let spec=await trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic separately priced business-use video',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:50000,currency:'CNY',specification:{version:'commercial-v1',stock_license:lic,terms:'Synthetic business use only; no resale, no copyright transfer.'},product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});
 spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'Independent synthetic review',operation_key:key()});await S.publishSales(seller.personal_party_id,spec.id);
 const parties=require('../src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal}),org=await parties.createOrganization(buyer.ctx,{display_name:'Synthetic brand buyer',operation_key:key()});
 let consent,listing,order;const input={...S.listingInput,spec_id:spec.id};
 await t.test('old personal authorization rejected for commercial listing',async()=>{await assert.rejects(stock.create(seller.ctx,{...input,operation_key:key()}),{code:'STOCK_COMMERCIAL_CONSENT_REQUIRED'});});
 await t.test('new scoped personal consent selected, dual review requires explicit commercial check',async()=>{
  const raw=Object.fromEntries(['features','grantee_party_id','valid_from','valid_until','terms','evidence_asset_ids'].map(k=>[k,S.consent.data[k]]));
  consent=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id:S.avatar.id,consent:{...raw,purposes:['STOCK_LICENSE','PUBLIC_DISPLAY','STOCK_COMMERCIAL'],territories:['CN'],stock_commercial_uses:['BRAND_PROMOTION']},operation_key:key()});
  consent=await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:consent.id,expected_version:consent.object_version,decision:'APPROVE',reason:'Independent scoped consent',operation_key:key()});
  const options=await stock.participantOptions(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id});assert(options.items.some(x=>x.consent_id===consent.id&&x.territories.includes('CN')&&x.stock_commercial_uses.includes('BRAND_PROMOTION')));
  input.participants=[{person_id:seller.person.id,avatar_id:S.avatar.id,consent_id:consent.id}];listing=await stock.create(seller.ctx,{...input,operation_key:key()});
  await assert.rejects(S.reviewListing(listing,'RIGHTS'),{code:'STOCK_REVIEW_INCOMPLETE'});
  listing=await stock.review(reviewer.ctx,{record_id:listing.id,expected_version:listing.object_version,channel:'RIGHTS',decision:'APPROVED',reason:'Explicit business rights',verification:{rights_verified:true,all_people_authorized:true,seller_qualified:true,commercial_use_verified:true,source_sha256:listing.data.files.full_sha256},operation_key:key()});listing=await S.reviewListing(listing,'CONTENT');
 });
 await t.test('new commercial offers are off until an explicit rollout, personal offers unchanged',async()=>{
  delete process.env.STOCK_COMMERCIAL_LICENSE_ENABLED;assert(!(await stock.catalog(buyer.ctx,{})).items.some(x=>x.id===listing.id));await assert.rejects(stock.offer(buyer.ctx,{record_id:listing.id}),{code:'STOCK_COMMERCIAL_NOT_ENABLED'});
  const personal=await S.listing();assert.equal((await stock.offer(buyer.ctx,{record_id:personal.id})).license.scope,'PERSONAL_NONCOMMERCIAL');
  await assert.rejects(trade.stockCheckout(buyer.ctx,{party_id:org.party_id,listing_id:personal.id,offer_sha256:personal.content_sha256,channel:'ALIPAY',operation_key:key()}),{code:'STOCK_PERSONAL_BUYER_REQUIRED'});
  process.env.STOCK_COMMERCIAL_LICENSE_ENABLED='true';assert.equal((await stock.offer(buyer.ctx,{record_id:listing.id})).license.territory,'CN');
 });
 const request=()=>({party_id:org.party_id,listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY',operation_key:key()});
 await t.test('organization needs reviewed buyer capability and an authorized real adult operator',async()=>{
  await assert.rejects(trade.stockCheckout(buyer.ctx,request()),{code:'STOCK_COMMERCIAL_BUYER_REQUIRED'});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'BRAND_CLIENT','ACTIVE')",[org.party_id]);
  await assert.rejects(trade.stockCheckout(outsider.ctx,request()),{code:'TRADE_PARTY_FORBIDDEN'});
  const r=request();order=await trade.stockCheckout(buyer.ctx,r);assert.equal((await trade.stockCheckout(buyer.ctx,r)).id,order.id);assert.equal(order.buyer_party_id,org.party_id);assert.equal(order.data.quote.total_minor,50000);assert.deepEqual(order.data.quote.stock_video.license.commercial_uses,['BRAND_PROMOTION']);
  await assert.rejects(trade.stockCheckout(buyer.ctx,request()),{code:'STOCK_ORDER_ALREADY_EXISTS'});
 });
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:{TRADE_REQUIRE_V5_PRODUCTS:'true'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
 async function get(url,party=org.party_id,user=buyer){const r=await fetch(base+url,{headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{})}});if(!r.headers.get('content-type')?.includes('json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};const j=await r.json();fixtures.push({method:'GET',path:new URL(base+url).pathname,schema:r.status===200?'StockResponse':'ErrorResponse',value:j});return {status:r.status,...j};}
 let pay;
 await t.test('payment activates the original business license; actual controlled bytes match and strangers cannot read',async()=>{
  pay=await trade.preparePayment(buyer.ctx,{party_id:org.party_id,order_id:order.id,installment_key:'stock',operation_key:key()},S.config);
  await trade.applyPayment({...S.config,payment_id:pay.id,currency:'CNY',amount_minor:50000,transaction_id:'synthetic.'+pay.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
  let r=await get('/stock/purchases/'+order.id);assert.equal(r.data.data.license.scope,'COMMERCIAL_LIMITED');assert.equal(r.data.data.status,'ACTIVE');
  r=await get('/stock/purchases/'+order.id+'/content');assert.equal(r.status,200);assert.equal(require('node:crypto').createHash('sha256').update(r.bytes).digest('hex'),S.file.content_sha256);
  assert.notEqual((await get('/stock/purchases/'+order.id+'/content',outsider.personal_party_id,outsider)).status,200);
  assert.notEqual((await get('/stock/purchases/'+order.id+'/content',buyer.personal_party_id)).status,200);
  assert.equal((await get('/stock/catalog/'+listing.id,null)).data.license.scope,'COMMERCIAL_LIMITED');
  assert.equal((await get('/stock/sales-publications',seller.personal_party_id,seller)).status,200);
  assert.equal((await get('/stock/participant-options?person_id='+seller.person.id,seller.personal_party_id,seller)).status,200);
 });
 await t.test('consent withdrawal stops downloads, restoration does not silently expand the license',async()=>{
  await db.execute("UPDATE artist_records SET current_status='WITHDRAWN' WHERE id=?",[consent.id]);assert.equal((await get('/stock/purchases/'+order.id+'/content')).error.code,'STOCK_SALE_CONSENT_REQUIRED');
  await db.execute("UPDATE artist_records SET current_status='APPROVED' WHERE id=?",[consent.id]);
  const purchase=await stock.purchased(buyer.ctx,{party_id:org.party_id,order_id:order.id});assert.deepEqual(purchase.data.license.commercial_uses,['BRAND_PROMOTION']);
 });
 await t.test('time-limited purchased license expires even while the original listing remains active',async()=>{
  const [rows]=await db.execute('SELECT * FROM stock_purchases WHERE order_id=?',[order.id]),original=typeof rows[0].data_json==='string'?JSON.parse(rows[0].data_json):rows[0].data_json;const changed=structuredClone(original);changed.license.valid_until='2021-01-01T00:00:00.000Z';
  await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(changed),digest(changed),order.id]);assert.equal((await get('/stock/purchases/'+order.id+'/content')).error.code,'STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE');
  await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(original),digest(original),order.id]);
 });
 await t.test('independent aftercare and verified refund revoke purchased commercial permission, not rewrite history',async()=>{
  let p=await stock.purchased(buyer.ctx,{party_id:org.party_id,order_id:order.id}),hash=p.contract_sha256;
  p=await stock.openCase(buyer.ctx,{party_id:org.party_id,order_id:order.id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'Synthetic issue',operation_key:key()});
  p=await stock.resolveCase(reviewer.ctx,{order_id:order.id,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',reason:'Independent synthetic decision',operation_key:key()});
  let refund=await trade.requestRefund(buyer.ctx,{party_id:org.party_id,payment_id:pay.id,allocations:[{line_id:'stock',amount_minor:50000}],reason:'Approved rights issue',operation_key:key()});refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'Independent refund',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');await trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
  p=await stock.purchased(buyer.ctx,{party_id:org.party_id,order_id:order.id});assert.equal(p.data.status,'REVOKED');assert.equal(p.contract_sha256,hash);assert.equal((await get('/stock/purchases/'+order.id+'/content')).error.code,'STOCK_LICENSE_NOT_ACTIVE');
 });
 const out=require('node:path').resolve(__dirname,'../../../..','.local/stock-commercial-http-fixtures.json');await fs.mkdir(require('node:path').dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(old===undefined)delete process.env.STOCK_COMMERCIAL_LICENSE_ENABLED;else process.env.STOCK_COMMERCIAL_LICENSE_ENABLED=old;if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
