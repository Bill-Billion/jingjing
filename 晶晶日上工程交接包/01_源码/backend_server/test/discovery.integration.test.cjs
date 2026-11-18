'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('unified public search via HTTP and isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_discovery_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/directory-seed.cjs').seedDirectory(db);
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function get(url,user=S.buyer,party=null,schema=null){const response=await fetch(base+url,{headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...(party?{'X-Acting-Party':party}:{})}}),value=await response.json();fixtures.push({method:'GET',path:new URL(base+url).pathname,schema:response.status===200?(schema|| (url.startsWith('/discovery/cities')?'DiscoveryCitiesResponse':'DiscoverySearchResponse')):'ErrorResponse',value});return {status:response.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const search=(input,user=S.buyer)=>get('/discovery/search?'+new URLSearchParams(input),user);
  let notices=[];const journey=[];
  await t.test('city source and strict authentication, identity and parameter validation',async()=>{
   const cities=ok(await get('/discovery/cities'));assert.equal(cities.items.length,6);assert.equal(cities.scope,'QUICK_CHOICES');assert.equal(cities.allows_custom_city,true);
   assert.equal((await get('/discovery/cities',null)).status,401);assert.equal((await get('/discovery/cities',S.buyer,S.buyer.personal_party_id)).status,400);
   for(const query of ['kind=PRIVATE','kind=STOCK&limit=0','kind=STOCK&limit=1&limit=2','kind=STOCK&q=','kind=STOCK&q=a&q=b','kind=STOCK&city=a&city=b','kind=STOCK&cursor=','kind=STOCK&extra=1'])assert.equal((await get('/discovery/search?'+query)).status,400,query);
  });
  await t.test('published notices use full server search, aliases and stable pagination',async()=>{
   for(let n=0;n<4;n++){
    let row=await S.notices.createNotice(S.buyer.ctx,{party_id:S.buyer.personal_party_id,rule_id:S.rule.id,notice:{...S.body,title:n===3?'unrelated':'城市故事 '+n,city:n%2?'北京':'北京市'},operation_key:key()});
    row=await S.notices.review(S.reviewer.ctx,{record_id:row.id,expected_version:row.object_version,decision:'APPROVE',reason:'synthetic search check',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});notices.push(row);
   }
   let cursor,found=[];do{const page=ok(await search({kind:'NOTICE',q:'城市故事',city:'beijing',limit:1,...(cursor?{cursor}:{})}));found.push(...page.items.map(i=>i.id));cursor=page.next_cursor;}while(cursor);
   assert.deepEqual(found,notices.slice(0,3).map(i=>i.id).sort());
   const first=ok(await search({kind:'NOTICE',city:'北京',limit:1}));assert.ok(first.next_cursor);
   assert.equal((await search({kind:'NOTICE',city:'上海',cursor:first.next_cursor})).status,400);
   assert.equal((await search({kind:'NOTICE',city:'北京',cursor:first.next_cursor},S.outsider)).status,400);
   assert.equal(ok(await search({kind:'NOTICE',city:'北京市',cursor:first.next_cursor,limit:2})).items.length,2);
   assert.deepEqual(ok(await search({kind:'NOTICE',q:'%',city:'北京'})).items,[]);
   assert.deepEqual(ok(await search({kind:'NOTICE',q:notices[0].id})).items,[]);
  });
  await t.test('manual city browsing uses no coordinates and refuses unsupported location parameters without losing public results',async()=>{
   const before=ok(await search({kind:'ARTIST',city:'synthetic-city'}));assert.equal(before.items[0].listing_id,S.publicListing.id);
   for(const field of ['latitude','longitude','distance','location_consent'])assert.equal((await get('/discovery/search?kind=ARTIST&city=synthetic-city&'+field+'=1')).status,400);
   const after=ok(await search({kind:'ARTIST',city:'synthetic-city'}));assert.deepEqual(after,before);for(const item of after.items)for(const field of ['latitude','longitude','distance','distance_meters'])assert.equal(Object.hasOwn(item,field),false);
   journey.push({name:'manual city without coordinates; unsupported distance not silently calculated',result:'PASS',listing_id:S.publicListing.id,city:after.city,distance_supported:false});
  });
  await t.test('closed public audition retains the same public artist detail and a scoped invitation context',async()=>{
   const page=ok(await search({kind:'ARTIST',city:'synthetic-city'})),item=page.items.find(x=>x.listing_id===S.publicListing.id);assert.equal(item.audition_public,false);
   const detail=ok(await get('/artists/catalog/'+item.listing_id,S.buyer,null,'ArtistCatalogueItemResponse'));assert.equal(detail.listing_id,item.listing_id);assert.equal(detail.audition_public,false);
   const context=ok(await get('/notices/invitation-context?'+new URLSearchParams({listing_id:item.listing_id,rule_id:S.rule.id}),S.buyer,S.buyer.personal_party_id,'NoticeInvitationContextResponse'));assert.equal(context.person_id,item.person_id);assert.equal(context.listing_id,item.listing_id);
   assert.equal((await get('/notices/invitation-context?'+new URLSearchParams({listing_id:item.listing_id,rule_id:S.rule.id}),S.outsider,S.buyer.personal_party_id)).status,403);
   journey.push({name:'public audition disabled does not remove public detail or scoped invitation',result:'PASS',listing_id:item.listing_id,person_id:item.person_id,invitation_context:context});
  });
  await t.test('closed notice and revoked artist authorization disappear on next search',async()=>{
   const row=notices[0];await S.notices.close(S.buyer.ctx,{party_id:S.buyer.personal_party_id,record_id:row.id,expected_version:row.object_version,reason:'synthetic withdrawal',operation_key:key()});
   assert.ok(!ok(await search({kind:'NOTICE',q:'城市故事'})).items.some(i=>i.id===row.id));
   assert.equal(ok(await search({kind:'ARTIST',q:'PUBLIC',city:'synthetic-city'})).items[0].listing_id,S.publicListing.id);
   assert.deepEqual(ok(await search({kind:'ARTIST',q:S.evidence.id})).items,[]);
   await S.artists.withdraw(S.seller.ctx,{person_id:S.seller.person.id,party_id:S.seller.personal_party_id,record_id:S.publicConsent.id,expected_version:S.publicConsent.object_version,reason:'synthetic public withdrawal',operation_key:key()});
   assert.deepEqual(ok(await search({kind:'ARTIST',q:'public'})).items,[]);
  });
  await t.test('stock and audition repositories are connected and return actual empty catalogues',async()=>{
   for(const kind of ['STOCK','AUDITION'])assert.deepEqual(ok(await search({kind,q:'synthetic'})).items,[]);
  });
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/discovery-intent-result.json'),JSON.stringify({result:'PASS',checks:journey,limits:['No location permission/GPS distance feature implemented; manual city only','No frontend/device permission execution']},null,2)+'\n');
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/discovery-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
for(const kind of ['STOCK','AUDITION'])test('public '+kind+' search preserves visibility and private price',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async()=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_discovery_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=kind==='STOCK'?await require('./helpers/stock-seed.cjs').seedStock(db):await require('./helpers/auditions-seed.cjs').seedAuditions(db);
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  async function search(q){const url='/api/v1/discovery/search?'+new URLSearchParams({kind,q});const r=await fetch('http://127.0.0.1:'+server.address().port+url,{headers:{Authorization:'Bearer '+S.buyer.token}}),value=await r.json();assert.equal(r.status,200,JSON.stringify(value));fixtures.push({method:'GET',path:'/api/v1/discovery/search',schema:'DiscoverySearchResponse',value});return value.data.items;}
  if(kind==='STOCK'){
   const row=await S.listing();assert.equal((await search('synthetic'))[0].id,row.id);assert.deepEqual(await search(S.evidence.id),[]);
   await S.artists.withdraw(S.seller.ctx,{person_id:S.seller.person.id,party_id:S.seller.personal_party_id,record_id:S.consent.id,expected_version:S.consent.object_version,reason:'synthetic withdrawal',operation_key:key()});
   assert.deepEqual(await search('synthetic'),[]);
  }else{
   let row=await S.auditions.createOffer(S.seller.ctx,{party_id:S.seller.personal_party_id,offer:S.offer,operation_key:key()});
   assert.deepEqual(await search(S.offer.title),[]);
   row=await S.auditions.reviewOffer(S.reviewer.ctx,{record_id:row.id,expected_version:row.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
   assert.equal((await search(S.offer.title))[0].id,row.id);
   row=await S.auditions.offerStatus(S.seller.ctx,{record_id:row.id,party_id:S.seller.personal_party_id,expected_version:row.object_version,public_booking:true,public_price:false,operation_key:key()});
   assert.equal((await search(S.offer.title))[0].unit_minor,null);
   await S.auditions.offerStatus(S.seller.ctx,{record_id:row.id,party_id:S.seller.personal_party_id,expected_version:row.object_version,public_booking:false,public_price:false,operation_key:key()});
   assert.deepEqual(await search(S.offer.title),[]);
  }
  const output=path.resolve(__dirname,'../../../../.local/discovery-http-fixtures.json'),all=JSON.parse(await fs.readFile(output,'utf8'));all.cases.push(...fixtures);await fs.writeFile(output,JSON.stringify(all,null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
