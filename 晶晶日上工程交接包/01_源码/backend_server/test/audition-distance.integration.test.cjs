'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('declared public audition area and ephemeral distance search',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_audition_distance_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const cases=[],journey=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/auditions-seed.cjs').seedAuditions(db),{seller,buyer,outsider,reviewer}=S;
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  const consent={purpose:'PUBLIC_AUDITION_DISTANCE',notice_version:'audition-distance-v1',accepted:true},origin={latitude_grid:3000,longitude_grid:12000};
  async function call(method,url,{user=buyer,party=null,body,version,op=key()}={}){const res=await fetch(base+url,{method,headers:{...user?{Authorization:'Bearer '+user.token}:{},...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json',...op?{'Idempotency-Key':op}:{}}:{},...version!==undefined?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}}),value=await res.json();const schema=res.ok?(url.startsWith('/privacy/')?'PrivacyAccountCopyPageResponse':url.includes('/distance-location')?(method==='GET'?'AuditionDistanceLocationResponse':'AuditionDistanceUpdateResponse'):url.includes('/auditions/distance')?'AuditionDistanceSearchResponse':url.startsWith('/discovery/')?'DiscoverySearchResponse':'AuditionCatalogueResponse'):'ErrorResponse';cases.push({method,path:new URL(base+url).pathname,schema,value});return {status:res.status,cache:res.headers.get('cache-control'),...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r));
  const query=(extra={},options={})=>call('POST','/discovery/auditions/distance',{body:{origin,consent,max_distance_km:100,...extra},...options});
  const route=r=>'/auditions/offers/'+r.id+'/distance-location';
  const set=(r,point=origin,version=0,options={})=>call('POST',route(r),{user:seller,party:seller.personal_party_id,version,body:{enabled:true,grid:point,consent},...options});
  async function offer(n,extra={}){let r=await S.auditions.createOffer(seller.ctx,{party_id:seller.personal_party_id,offer:{...S.offer,title:'Synthetic area '+n,...extra},operation_key:key()});return S.auditions.reviewOffer(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});}
  const first=await offer(1),second=await offer(2),unknown=await offer(3),online=await offer(4,{mode:'ONLINE_MATERIALS'});let location,originalKey;
  await t.test('location is optional; ownership and separate purpose cannot be replaced by operator or another party',async()=>{
   assert.equal(ok(await call('GET',route(first),{user:seller,party:seller.personal_party_id})).object_version,0);
   assert.equal((await set(first,origin,0,{user:buyer,party:buyer.personal_party_id})).status,404);
   assert.equal((await set(first,origin,0,{user:reviewer,party:seller.personal_party_id})).status,403);
   assert.equal((await set(first,origin,0,{user:null})).status,401);
   bad(await set(first,origin,0,{body:{enabled:true,grid:origin,consent:{...consent,accepted:false}}}),'DISTANCE_CONSENT_REQUIRED');
   bad(await set(online),'AUDITION_DISTANCE_NOT_PUBLIC');
   bad(await set(first,{latitude_grid:30.123,longitude_grid:12000}),'INVALID_DISTANCE_GRID');
   bad(await set(first,{...origin,latitude:30.123456}),'INVALID_INPUT');
   assert.ok(ok(await call('GET','/discovery/search?kind=AUDITION')).items.some(x=>x.id===unknown.id));
   assert.deepEqual(ok(await query()).items,[]);
  });
  await t.test('concurrent consent records one version without changing offer or copying the point to commands and audit',async()=>{
   originalKey=key();const all=await Promise.all([set(first,origin,0,{op:originalKey}),set(first,origin,0,{op:originalKey}),set(first,origin,0,{op:originalKey})]);location=ok(all[0]);for(const r of all)assert.deepEqual(ok(r),location);assert.equal(location.object_version,1);
   const current=await S.auditions.read(seller.ctx,{record_id:first.id,party_id:seller.personal_party_id});assert.equal(current.content_sha256,first.content_sha256);assert.equal(current.object_version,first.object_version);
   const commands=(await db.execute("SELECT result_json FROM audition_commands WHERE result_json LIKE '%notice_version%'")).at(0);assert.equal(commands.length,1);assert.ok(!JSON.stringify(commands).includes('latitude_grid'));
   assert.equal((await db.execute("SELECT id FROM audition_audit WHERE record_id=? AND event_code='AUDITION_DISTANCE_CONSENTED'",[first.id]))[0].length,1);
   await set(second,{latitude_grid:3010,longitude_grid:12000});
   const own=ok(await call('GET',route(first),{user:seller,party:seller.personal_party_id}));assert.deepEqual(own.grid,origin);
   journey.push({name:'owner separately declares coarse service area once; original offer unchanged',result:'PASS',offer_id:first.id,location_version:location.object_version,offer_sha256:first.content_sha256});
  });
  await t.test('search returns honest rounded area distances and no position, keeps private prices and scopes pagination',async()=>{
   const page=ok(await query({limit:1}));assert.equal(page.items[0].offer.id,first.id);assert.equal(page.items[0].distance_km,0);assert.ok(page.next_cursor);
   const next=ok(await query({limit:1,cursor:page.next_cursor}));assert.equal(next.items[0].offer.id,second.id);assert.equal(next.items[0].distance_km,12);assert.equal(next.next_cursor,null);
   assert.ok(!JSON.stringify(page).includes('latitude_grid'));assert.ok(!Buffer.from(page.next_cursor.split('.')[0],'base64url').toString().includes('origin'));
   for(const extra of [{origin:{...origin,latitude_grid:3001}},{max_distance_km:99},{city:'another-city'},{q:'other'}])bad(await query({...extra,cursor:page.next_cursor}),'INVALID_CURSOR');
   bad(await query({cursor:page.next_cursor},{user:outsider}),'INVALID_CURSOR');
   assert.deepEqual(ok(await query({max_distance_km:11})).items.map(x=>x.offer.id),[first.id]);
   await S.auditions.offerStatus(seller.ctx,{record_id:second.id,party_id:seller.personal_party_id,expected_version:second.object_version,public_booking:true,public_price:false,operation_key:key()});
   assert.equal(ok(await query()).items.find(x=>x.offer.id===second.id).offer.unit_minor,null);
   assert.equal((await query({}, {op:null})).cache,'no-store');
   journey.push({name:'approximate service area distance, price visibility and query-bound pagination',result:'PASS',offer_ids:[first.id,second.id],distances_km:[0,12]});
  });
  await t.test('missing consent and URL positions are rejected without storing query input or blocking city browsing',async()=>{
   const before=Number((await db.execute('SELECT COUNT(*) n FROM audition_commands'))[0][0].n),audit=Number((await db.execute('SELECT COUNT(*) n FROM audition_audit'))[0][0].n);
   bad(await query({consent:{...consent,notice_version:'old'}}),'DISTANCE_CONSENT_REQUIRED');bad(await query({origin:{...origin,longitude_grid:18000}}),'INVALID_DISTANCE_GRID');
   bad(await call('POST','/discovery/auditions/distance?latitude=30',{body:{origin,consent,max_distance_km:10}}),'INVALID_INPUT');
   assert.equal((await query({}, {party:buyer.personal_party_id})).status,400);assert.equal((await query({}, {user:null})).status,401);
   for(const extra of [{limit:0},{max_distance_km:501},{max_distance_km:1.5},{origin:{latitude_grid:null,longitude_grid:12000}},{nearby_people:true}])assert.equal((await query(extra)).status,400);
   ok(await query({origin:{latitude_grid:3123,longitude_grid:12345}}));
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM audition_commands'))[0][0].n),before);assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM audition_audit'))[0][0].n),audit);
   assert.ok(ok(await call('GET','/discovery/search?kind=AUDITION&city=synthetic-city')).items.some(x=>x.id===unknown.id));
  });
  await t.test('audit failure rolls location and idempotency back together',async()=>{
   const op=key();await db.withConnection(c=>c.query("CREATE TRIGGER distance_audit_failure BEFORE INSERT ON audition_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'"));
   try{assert.equal((await set(first,{latitude_grid:3002,longitude_grid:12000},1,{op})).status,503);assert.equal(ok(await call('GET',route(first),{user:seller,party:seller.personal_party_id})).object_version,1);}finally{await db.withConnection(c=>c.query('DROP TRIGGER distance_audit_failure'));}
   const current=ok(await set(first,origin,1,{op}));assert.equal(current.object_version,2);location=current;
  });
  await t.test('same-request personal copy includes own declaration only and retains scope restrictions',async()=>{
   const R=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
   const own=await R.create(seller.ctx,{request:{type:'COPY',scopes:['ALL'],details:'synthetic coarse declared area copy'},operation_key:key()}),other=await R.create(buyer.ctx,{request:{type:'COPY',scopes:['ALL'],details:'synthetic own copy'},operation_key:key()}),restricted=await R.create(seller.ctx,{request:{type:'COPY',scopes:['CONTRACTS'],details:'synthetic contracts only'},operation_key:key()});
   const page=r=>'/privacy/requests/'+r.id+'/account-data?section=AUDITION_DISTANCE_LOCATIONS';
   const data=ok(await call('GET',page(own),{user:seller}));assert.equal(data.items.length,2);assert.deepEqual(data.items.find(x=>x.offer_id===first.id).grid,origin);assert.equal(data.request_completion,'NOT_CONFIRMED');
   assert.deepEqual(ok(await call('GET',page(other),{user:buyer})).items,[]);assert.equal((await call('GET',page(own),{user:buyer})).status,404);assert.equal((await call('GET',page(restricted),{user:seller})).status,409);
   assert.equal((await call('GET',page(other)+'&cursor='+first.id,{user:buyer})).status,400);
   journey.push({name:'same privacy request returns only own current declared areas, not query location or another account',result:'PASS',request_id:own.id,offer_id:first.id});
  });
  await t.test('withdrawal clears stored grid; stale version fails and original consent key cannot resurrect it',async()=>{
   bad(await set(first,origin,0),'VERSION_CONFLICT');
   const withdrawn=ok(await call('POST',route(first),{user:seller,party:seller.personal_party_id,version:2,body:{enabled:false}}));assert.equal(withdrawn.object_version,3);assert.equal(withdrawn.enabled,false);
   assert.deepEqual(ok(await set(first,origin,0,{op:originalKey})),withdrawn);
   assert.equal(ok(await call('GET',route(first),{user:seller,party:seller.personal_party_id})).grid,null);
   const row=(await db.execute('SELECT * FROM audition_distance_locations WHERE offer_id=?',[first.id]))[0][0];assert.equal(row.latitude_grid,null);assert.equal(row.longitude_grid,null);
   assert.ok(!ok(await query()).items.some(x=>x.offer.id===first.id));
   journey.push({name:'withdrawal clears current grid; old key returns withdrawn status',result:'PASS',offer_id:first.id,version:3});
  });
  await t.test('filtered empty pages keep a cursor and current publication, qualification and authorization are rechecked',async()=>{
   // Eleven public declarations all fail keyword filtering: bounded scan retains continuation.
   for(let n=0;n<11;n++){const r=await offer('filtered '+n);ok(await set(r,{latitude_grid:3001,longitude_grid:12000}));}
   const filtered=ok(await query({limit:1,q:'absent keyword'}));assert.deepEqual(filtered.items,[]);assert.ok(filtered.next_cursor);assert.equal(ok(await query({limit:1,q:'absent keyword',cursor:filtered.next_cursor})).next_cursor,null);
   const current=await S.auditions.read(seller.ctx,{record_id:second.id,party_id:seller.personal_party_id});await S.auditions.offerStatus(seller.ctx,{record_id:second.id,party_id:seller.personal_party_id,expected_version:current.object_version,public_booking:false,public_price:false,operation_key:key()});assert.ok(!ok(await query()).items.some(x=>x.offer.id===second.id));
   await db.execute("UPDATE artist_records SET current_status='REJECTED' WHERE id=?",[S.haloId]);assert.deepEqual(ok(await query()).items,[]);await db.execute("UPDATE artist_records SET current_status='APPROVED' WHERE id=?",[S.haloId]);
   await S.artists.withdraw(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,record_id:S.publicConsent.id,expected_version:S.publicConsent.object_version,reason:'synthetic withdrawal',operation_key:key()});assert.deepEqual(ok(await query()).items,[]);
   // Loss of publication consent must never prevent removal of a location.
   ok(await call('POST',route(second),{user:seller,party:seller.personal_party_id,version:1,body:{enabled:false}}));
   journey.push({name:'closed offers and revoked qualification/consent disappear; owner can still remove area',result:'PASS',offer_id:second.id});
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/audition-distance-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases},null,2));await fs.writeFile(path.resolve(__dirname,'../../../../.local/audition-distance-result.json'),JSON.stringify({result:'PASS',checks:journey,limits:['Synthetic deliberately public coarse service areas, not device GPS or real consent','No frontend, real location collection or real map service','Approximate grid straight-line distance, not navigation']},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
test('grid distance handles date line, poles and invalid precise inputs',()=>{const P=require('../src/modules/auditions/distance-policy');assert.equal(P.distance({latitude_grid:0,longitude_grid:-18000},{latitude_grid:0,longitude_grid:17999}),2);assert.equal(P.distance({latitude_grid:9000,longitude_grid:100},{latitude_grid:9000,longitude_grid:-100}),0);assert.throws(()=>P.grid({latitude_grid:9001,longitude_grid:0}));assert.throws(()=>P.grid({latitude_grid:3000.1,longitude_grid:0}));});
