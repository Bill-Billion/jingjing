'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('operator video categories, holiday collections and placements use reviewed stock through real HTTP',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_catalog_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const fixtures=[],records=[];
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);await migrate(db);
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,reviewer,outsider:author,seller}=S;
 const grant=require('../src/modules/governance/operator-access').maintainOperatorGrant;
 for(const u of [author,reviewer])await grant(db,{account_id:u.account_id,action:'CUSTOMIZATION_TEMPLATE_PUBLISH',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:catalog',reason:'isolated fixture'});
 for(const u of [author,seller])await grant(db,{account_id:u.account_id,action:'SUPPLY_REVIEW_CONTENT',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:catalog',reason:'isolated fixture'});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 async function call(method,url,{user=author,body,record,op=key(),headers={}}={}){const h={...(user?{Authorization:'Bearer '+user.token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(method==='POST'?{'Idempotency-Key':op}:{}),...(record?{'If-Match':'"'+record.object_version+'"'}:{}),...headers};const res=await fetch(base+url,{method,headers:h,...(body?{body:JSON.stringify(body)}:{})});const json=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?'ProductCatalogResponse':'ErrorResponse',value:json});assert.equal(res.headers.get('cache-control'),'no-store');return {status:res.status,...json};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,c)=>assert.equal(r.error?.code,c,JSON.stringify(r));
 const create=(kind,code,content,options={})=>call('POST','/product-catalog/records',{body:{kind,code,content},...options});
 const review=(r,options={})=>call('POST','/product-catalog/records/'+r.id+'/reviews',{user:reviewer,record:r,body:{decision:'APPROVE',checks:{sources_verified:true,content_reviewed:true,no_price_override:true},reason:'Independent synthetic review'},...options});
 const revise=(r,content,options={})=>call('POST','/product-catalog/records/'+r.id+'/revisions',{record:r,body:{content},...options});
 const withdraw=(r,options={})=>call('POST','/product-catalog/records/'+r.id+'/withdrawals',{record:r,body:{reason:'Synthetic withdrawal'},...options});
 const catalog=(kind,query='',options={})=>call('GET','/product-catalog/catalog?kind='+kind+query,{user:buyer,...options});
 const baseContent={title:'Synthetic festival video',description:'Synthetic manually prepared stock only',sort_order:2};
 const period={valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z'};
 let category,collection,placement,listing,listing2,order;
 await t.test('empty catalog invents no products; authentication, actor scope and operator permission are enforced',async()=>{
  assert.deepEqual(ok(await catalog('CATEGORY')).items,[]);
  assert.equal((await catalog('CATEGORY','',{user:null})).status,401);
  bad(await create('CATEGORY','denied',baseContent,{user:buyer}),'CATALOG_OPERATOR_FORBIDDEN');
  bad(await create('CATEGORY','party-not-operator',baseContent,{headers:{'X-Acting-Party':author.personal_party_id}}),'ACTING_PARTY_NOT_ALLOWED');
 });
 await t.test('configuration rejects executable fields, price overrides, invalid dates and duplicate codes',async()=>{
  assert.equal((await create('CATEGORY','script',{...baseContent,script:'alert(1)'})).status,400);
  bad(await create('CATEGORY','markup',{...baseContent,title:'<script>test</script>'}),'CATALOG_PLAIN_TEXT_REQUIRED');
  assert.equal((await create('CATEGORY','price',{...baseContent,unit_minor:1})).status,400);
  const op=key();category=ok(await create('CATEGORY','festival',baseContent,{op}));assert.equal(ok(await create('CATEGORY','festival',baseContent,{op})).id,category.id);
  bad(await create('CATEGORY','other',baseContent,{op}),'IDEMPOTENCY_CONFLICT');bad(await create('CATEGORY','festival',baseContent),'CATALOG_CODE_EXISTS');
  assert.deepEqual(ok(await catalog('CATEGORY')).items,[]);
 });
 await t.test('independent category publication exposes only reviewed content and never private author metadata',async()=>{
  bad(await review(category,{user:author}),'SELF_REVIEW_FORBIDDEN');
  assert.equal((await review(category,{record:null})).status,428);
  category=ok(await review(category));const list=ok(await catalog('CATEGORY'));assert.equal(list.items[0].entity_id,category.entity_id);assert.equal(list.items[0].created_by,undefined);assert.equal(list.items[0].references,undefined);
  const privateRead=await call('GET','/product-catalog/records/'+category.id,{user:buyer});bad(privateRead,'CATALOG_OPERATOR_FORBIDDEN');
 });
 await t.test('holiday collection binds reviewed stock prices, licences and offers; seller cannot approve their own recommendation',async()=>{
  listing=await S.listing();listing2=await S.listing();const content={...baseContent,...period,category_id:category.entity_id,collection_kind:'HOLIDAY',theme_code:'spring-festival',listing_ids:[listing.id,listing2.id]};
  bad(await create('COLLECTION','bad-window',{...content,valid_until:period.valid_from}),'CATALOG_PERIOD_INVALID');
  bad(await create('COLLECTION','duplicate-items',{...content,listing_ids:[listing.id,listing.id]}),'CATALOG_LISTINGS_INVALID');
  const draft=await S.stock.create(seller.ctx,{...S.listingInput,operation_key:key()});bad(await create('COLLECTION','unreviewed',{...content,listing_ids:[draft.id]}),'STOCK_NOT_LISTED');
  collection=ok(await create('COLLECTION','spring',content));assert.deepEqual(ok(await catalog('COLLECTION')).items,[]);bad(await review(collection,{user:seller}),'SELF_REVIEW_FORBIDDEN');
  collection=ok(await review(collection));const item=ok(await catalog('COLLECTION','&category_id='+category.entity_id)).items[0];assert.equal(item.items.length,2);assert.equal(item.items[0].unit_minor,100);assert.equal(item.items[0].offer_sha256,listing.content_sha256);assert.equal(item.items[0].license.scope,'PERSONAL_NONCOMMERCIAL');assert.equal(item.listing_ids,undefined);assert.equal(item.references,undefined);
  records.push({case:'HOLIDAY_PUBLICATION',category_id:category.entity_id,collection_id:collection.entity_id,listing_ids:item.items.map(x=>x.id),unit_minor:item.items[0].unit_minor});
 });
 await t.test('placement, code and category filters expose only the exact reviewed collection',async()=>{
  placement=ok(await create('PLACEMENT','home-spring',{...baseContent,...period,slot_code:'video-home',collection_id:collection.entity_id}));placement=ok(await review(placement));
  assert.equal(ok(await catalog('PLACEMENT','&slot_code=video-home')).items[0].collection.entity_id,collection.entity_id);
  assert.deepEqual(ok(await catalog('PLACEMENT','&slot_code=other')).items,[]);assert.deepEqual(ok(await catalog('COLLECTION','&code=unknown')).items,[]);
  bad(await catalog('CATEGORY','&slot_code=video-home'),'CATALOG_FILTER_INVALID');
  const detail=ok(await call('GET','/product-catalog/catalog/'+placement.entity_id,{user:buyer}));assert.equal(detail.collection.items[0].id,listing.id);
 });
 await t.test('catalog item buys through original stock checkout; removing recommendation preserves paid order and licensed download',async()=>{
  const item=ok(await catalog('COLLECTION')).items[0].items[0],response=await fetch(base+'/stock/checkout',{method:'POST',headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id,'Content-Type':'application/json','Idempotency-Key':key()},body:JSON.stringify({listing_id:item.id,offer_sha256:item.offer_sha256,channel:'ALIPAY'})}),json=await response.json();assert.equal(response.status,200,JSON.stringify(json));fixtures.push({method:'POST',path:'/api/v1/stock/checkout',schema:'TradeRecordResponse',value:json});order=json.data;await S.payment(order);
  const hash=digest(order.data.contract);placement=ok(await withdraw(placement));assert.deepEqual(ok(await catalog('PLACEMENT')).items,[]);
  assert.equal(digest((await S.trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id})).data.contract),hash);assert.equal((await S.stock.content(buyer.ctx,{order_id:order.id,party_id:buyer.personal_party_id})).id,S.file.id);
  records.push({case:'ORIGINAL_CHECKOUT_PRESERVED',order_id:order.id,contract_sha256:hash,paid_minor:100,withdrawn_placement_id:placement.id});
 });
 await t.test('new immutable versions require review; concurrent drafts cannot silently replace an intervening publication',async()=>{
  const old=collection,content={...collection.data.content,title:'Revised synthetic collection'};
  const first=ok(await revise(old,content)),second=ok(await revise(old,{...content,title:'Conflicting draft'}));assert.equal(ok(await catalog('COLLECTION')).items[0].record_id,old.id);
  collection=ok(await review(first));bad(await review(second),'CATALOG_BASE_CHANGED');
  const history=ok(await call('GET','/product-catalog/records/'+old.id));assert.equal(history.current_status,'REPLACED');assert.equal(history.data.content.title,old.data.content.title);
  assert.equal(ok(await catalog('COLLECTION')).items[0].record_id,first.id);bad(await revise(history,content),'CATALOG_REVISION_STALE');
  const rejected=ok(await review(second,{body:{decision:'REJECT',checks:null,reason:'Intervening version accepted'}}));assert.equal(rejected.current_status,'REJECTED');
 });
 await t.test('category revision invalidates dependent publication until freshly reviewed; withdrawn source can still be rejected',async()=>{
  const draft=ok(await revise(category,{...baseContent,title:'Updated category'}));category=ok(await review(draft));assert.deepEqual(ok(await catalog('COLLECTION')).items,[]);
  collection=ok(await review(ok(await revise(collection,collection.data.content))));assert.equal(ok(await catalog('COLLECTION')).items.length,1);
  const pending=ok(await revise(collection,{...collection.data.content,title:'Pending affected source'}));category=ok(await withdraw(category));bad(await review(pending),'CATALOG_SOURCE_NOT_PUBLISHED');
  const rejected=ok(await review(pending,{body:{decision:'REJECT',checks:null,reason:'Source is withdrawn'}}));assert.equal(rejected.current_status,'REJECTED');assert.deepEqual(ok(await catalog('COLLECTION')).items,[]);
  category=ok(await review(ok(await revise(category,category.data.content))));collection=ok(await review(ok(await revise(collection,collection.data.content))));
 });
 await t.test('source unlisting immediately hides affected product without inventing replacement prices or changing old orders',async()=>{
  listing=await S.stock.status(seller.ctx,{record_id:listing.id,party_id:seller.personal_party_id,expected_version:listing.object_version,action:'UNLIST',reason:'Synthetic stop sale',operation_key:key()});
  let list=ok(await catalog('COLLECTION'));assert.deepEqual(list.items[0].items.map(x=>x.id),[listing2.id]);
  listing2=await S.stock.status(seller.ctx,{record_id:listing2.id,party_id:seller.personal_party_id,expected_version:listing2.object_version,action:'UNLIST',reason:'Synthetic stop sale',operation_key:key()});assert.deepEqual(ok(await catalog('COLLECTION')).items,[]);
  assert.equal((await S.stock.content(buyer.ctx,{order_id:order.id,party_id:buyer.personal_party_id})).id,S.file.id);
 });
 await t.test('scheduled content stays hidden before start and cannot be reviewed after expiry',async()=>{
  const fresh=await S.listing(),content={...baseContent,category_id:category.entity_id,collection_kind:'TEMPLATE',theme_code:'future',listing_ids:[fresh.id],valid_from:'2098-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z'};
  const future=ok(await review(ok(await create('COLLECTION','future',content))));assert.deepEqual(ok(await catalog('COLLECTION','&code=future')).items,[]);
  const data={...future.data,content:{...future.data.content,valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2021-01-01T00:00:00.000Z'}};
  await db.execute('UPDATE product_catalog_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),future.id]);assert.deepEqual(ok(await catalog('COLLECTION','&code=future')).items,[]);
  bad(await create('COLLECTION','expired',{...content,valid_from:data.content.valid_from,valid_until:data.content.valid_until}),'CATALOG_NOT_OPEN');
  const pending=ok(await create('COLLECTION','expires-during-review',content)),expired={...pending.data,content:{...pending.data.content,valid_from:data.content.valid_from,valid_until:data.content.valid_until}};
  await db.execute('UPDATE product_catalog_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(expired),digest(expired),pending.id]);bad(await review(pending),'CATALOG_NOT_OPEN');assert.equal(ok(await review(pending,{body:{decision:'REJECT',checks:null,reason:'Expired before approval'}})).current_status,'REJECTED');
 });
 await t.test('actual source consent withdrawal immediately hides collection and placement and retains the paid contract',async()=>{
  const fresh=await S.listing(),r=ok(await review(ok(await create('COLLECTION','withdraw-rights',{...baseContent,...period,category_id:category.entity_id,collection_kind:'THEME',theme_code:'rights',listing_ids:[fresh.id]}))));
  await review(ok(await create('PLACEMENT','rights-placement',{...baseContent,...period,slot_code:'rights-slot',collection_id:r.entity_id})));
  assert.equal(ok(await catalog('PLACEMENT','&slot_code=rights-slot')).items.length,1);const contract=digest(order.data.contract);
  await S.artists.withdraw(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,record_id:S.consent.id,expected_version:S.consent.object_version,reason:'Synthetic consent revoked',operation_key:key()});
  assert.deepEqual(ok(await catalog('COLLECTION','&code=withdraw-rights')).items,[]);assert.deepEqual(ok(await catalog('PLACEMENT','&slot_code=rights-slot')).items,[]);
  await assert.rejects(S.stock.content(buyer.ctx,{order_id:order.id,party_id:buyer.personal_party_id}),e=>[403,404,409].includes(e.status));assert.equal(digest((await S.trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id})).data.contract),contract);
 });
 await t.test('concurrent replay creates one version, cursor cannot cross filters and changed request keys conflict',async()=>{
  const op=key(),results=await Promise.all([1,2,3].map(()=>create('CATEGORY','concurrent',{...baseContent,title:'Another category',sort_order:99},{op})));assert.ok(results.every(x=>x.status===200));assert.equal(new Set(results.map(x=>x.data.id)).size,1);
  await review(results[0].data);const first=ok(await catalog('CATEGORY','&limit=1'));assert.ok(first.next_cursor);assert.equal(first.items[0].sort_order,2);const second=ok(await catalog('CATEGORY','&limit=1&cursor='+first.next_cursor));assert.equal(second.items.length,1);assert.equal(second.items[0].sort_order,99);assert.notEqual(first.items[0].entity_id,second.items[0].entity_id);
  bad(await catalog('COLLECTION','&cursor='+first.next_cursor),'INVALID_CURSOR');
  const current=ok(await call('GET','/product-catalog/records/'+results[0].data.id)),a=ok(await revise(current,{...baseContent,title:'Concurrent version A'})),b=ok(await revise(current,{...baseContent,title:'Concurrent version B'}));
  const approvals=await Promise.all([review(a),review(b)]);assert.equal(approvals.filter(x=>x.status===200).length,1);assert.equal(approvals.filter(x=>x.error?.code==='CATALOG_BASE_CHANGED').length,1);assert.equal(ok(await catalog('CATEGORY','&code=concurrent')).items.length,1);
 });
 await t.test('audit failure rolls back publication and old-version retirement; retry uses the original key',async()=>{
  const old=ok(await review(ok(await create('CATEGORY','audit',baseContent)))),r=ok(await revise(old,{...baseContent,title:'Atomic replacement'})),op=key();await db.withConnection(c=>c.query("CREATE TRIGGER catalog_audit_fail BEFORE INSERT ON product_catalog_audit FOR EACH ROW BEGIN IF NEW.event_code='REVIEWED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END"));
  try{const failed=await review(r,{op});assert.equal(failed.status,503);bad(failed,'SERVICE_UNAVAILABLE');}finally{await db.withConnection(c=>c.query('DROP TRIGGER catalog_audit_fail'));}
  assert.equal(ok(await call('GET','/product-catalog/records/'+r.id)).current_status,'IN_REVIEW');assert.equal(ok(await call('GET','/product-catalog/records/'+old.id)).current_status,'PUBLISHED');assert.equal(ok(await catalog('CATEGORY','&code=audit')).items[0].record_id,old.id);assert.equal(ok(await review(r,{op})).current_status,'PUBLISHED');assert.equal(ok(await call('GET','/product-catalog/records/'+old.id)).current_status,'REPLACED');
 });
 await t.test('revoked operator cannot replay old success or read administration; public content remains available',async()=>{
  const history=ok(await call('GET','/product-catalog/records?kind=CATEGORY&limit=1'));assert.equal(history.items.length,1);assert.ok(history.next_cursor);bad(await call('GET','/product-catalog/records?kind=COLLECTION&cursor='+history.next_cursor),'INVALID_CURSOR');
  bad(await call('GET','/product-catalog/records?kind=CATEGORY',{user:buyer}),'CATALOG_OPERATOR_FORBIDDEN');
  const op=key(),r=ok(await create('CATEGORY','revoked-author',baseContent,{op}));await grant(db,{account_id:author.account_id,action:'CUSTOMIZATION_TEMPLATE_PUBLISH',enabled:false,expected_version:1,expires_at:null,authority_ref:'synthetic:revoked',reason:'isolated fixture'});
  bad(await create('CATEGORY','revoked-author',baseContent,{op}),'CATALOG_OPERATOR_FORBIDDEN');await grant(db,{account_id:author.account_id,action:'SUPPLY_REVIEW_CONTENT',enabled:false,expected_version:1,expires_at:null,authority_ref:'synthetic:revoked',reason:'isolated fixture'});
  bad(await call('GET','/product-catalog/records/'+r.id),'CATALOG_OPERATOR_FORBIDDEN');assert.ok(ok(await catalog('CATEGORY')).items.length);
 });
 const output=path.resolve(__dirname,'../../../..','.local/product-catalog-http-fixtures.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.resolve(__dirname,'../../../..','.local/product-catalog-records.json'),JSON.stringify({synthetic_only:true,real_services:false,records},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
