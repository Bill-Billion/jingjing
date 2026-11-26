'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');

test('audition fixed total rejects separate fee inputs and booking visibility preserves the same public artist',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_fixed_audition_'+randomBytes(6).toString('hex');
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const cases=[];
 const out=process.env.JX_AUDITION_FIXED_PRICE_FIXTURES||path.resolve(__dirname,'../../../../.local/auditions-fixed-price-visibility-http.json');
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  // Existing explicitly synthetic adult/manual-certification fixture; no real provider or certification claim.
  const S=await require('./helpers/auditions-seed.cjs').seedAuditions(db),{seller,buyer,reviewer}=S;
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyEnv:{ARTIST_CONTRACT_POLICY:'CONTRACT_20261029'},supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,{user=buyer,party=null,body,op=key(),version}={}){
   const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const value=await response.json();cases.push({method,path:url,status:response.status,schema:response.ok?(url==='/auditions/checkout'?'TradeRecordResponse':url.startsWith('/artists/')?'ArtistResponse':'AuditionResponse'):'ErrorResponse',value});return {status:response.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const invalid=r=>{assert.equal(r.status,400,JSON.stringify(r));assert.equal(r.error.code,'INVALID_INPUT');};
  const create=(offer,op=key(),extra={})=>call('POST','/auditions/offers',{user:seller,party:seller.personal_party_id,body:{offer,...extra},op});
  const count=async(table)=>Number((await db.execute('SELECT COUNT(*) n FROM '+mysql.escapeId(table)))[0][0].n);
  let offer,booking,order,publicListing;
  await t.test('fee and fixed makeup menus cannot become an offer or reserve its operation key',async()=>{
   const before={records:await count('audition_records'),commands:await count('audition_commands')},op=key();
   for(const patch of [{transport_fee:2000},{transport_fee_minor:2000},{makeup_fee:1000},{makeup_menu:[{name:'fixed makeup',unit_minor:1000}]}]){
    invalid(await create({...S.offer,...patch},op));invalid(await create(S.offer,op,patch));
    assert.deepEqual({records:await count('audition_records'),commands:await count('audition_commands')},before);
   }
   offer=ok(await create(S.offer,op));assert.equal(ok(await create(S.offer,op)).id,offer.id);
   offer=ok(await call('POST','/auditions/offers/'+offer.id+'/reviews',{user:reviewer,body:{decision:'APPROVE',reason:'Independent synthetic fixed-price review'},version:offer.object_version}));
   const listed=ok(await call('GET','/auditions/catalog')).items;assert.equal(listed.length,1);assert.equal(listed[0].unit_minor,10000);
  });
  await t.test('appointment and checkout fee injections cannot change the frozen 10000 total or 22 percent allocation',async()=>{
   const request={offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:S.appointment},op=key(),before=await count('audition_records');
   for(const patch of [{transport_fee:2000},{makeup_fee:1000},{unit_minor:1}]){
    invalid(await call('POST','/auditions/bookings',{party:buyer.personal_party_id,body:{...request,...patch},op}));
    invalid(await call('POST','/auditions/bookings',{party:buyer.personal_party_id,body:{...request,appointment:{...S.appointment,...patch}},op}));
    assert.equal(await count('audition_records'),before);
   }
   booking=ok(await call('POST','/auditions/bookings',{party:buyer.personal_party_id,body:request,op}));
   booking=ok(await call('POST','/auditions/bookings/'+booking.id+'/reviews',{user:reviewer,body:{decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'Independent synthetic venue review'},version:booking.object_version}));
   const checkout={booking_id:booking.id,booking_sha256:booking.content_sha256},checkoutKey=key(),orders=await count('trade_records');
   for(const patch of [{transport_fee:2000},{makeup_fee:1000},{total_minor:1},{marketplace_finance:{platform_bps:0}}]){
    invalid(await call('POST','/auditions/checkout',{party:buyer.personal_party_id,body:{...checkout,...patch},op:checkoutKey}));
    assert.equal(await count('trade_records'),orders);
   }
   order=ok(await call('POST','/auditions/checkout',{party:buyer.personal_party_id,body:checkout,op:checkoutKey}));
   assert.equal(ok(await call('POST','/auditions/checkout',{party:buyer.personal_party_id,body:checkout,op:checkoutKey})).id,order.id);
   assert.equal(order.data.quote.total_minor,10000);assert.equal(order.data.quote.marketplace_finance.allocation.platform_bps,2200);
   assert.equal(order.data.quote.lines.length,1);assert.equal(order.data.quote.installments.length,1);
   assert.equal(order.data.financial.received_minor,0);assert.equal(await count('trade_journal'),0);
   assert(!JSON.stringify(order.data.quote).includes('transport_fee'));assert(!JSON.stringify(order.data.quote).includes('makeup_fee'));
  });
  await t.test('closing public booking keeps the same independently approved public artist readable',async()=>{
   await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action:'ARTIST_REVIEW_CONTENT',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:fixed-audition',reason:'Isolated independent public-profile reviewer'});
   const scope={person_id:seller.person.id,party_id:seller.personal_party_id};
   const review=r=>S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'Independent synthetic public profile',operation_key:key()});
   await review(await S.artists.requestHalo(seller.ctx,{...scope,level:1,ownership_promise:true,evidence_asset_ids:[S.evidence.id],operation_key:key()}));
   const consent=await review(await S.artists.declareConsent(seller.ctx,{...scope,avatar_id:S.avatar.id,consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:seller.personal_party_id,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic public profile only, no audition resale',evidence_asset_ids:[S.evidence.id]},operation_key:key()}));
   const material=await S.upload('image/png');
   const look=await S.artists.createVariant(seller.ctx,{...scope,avatar_id:S.avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'Synthetic public look',material_asset_ids:[material.id],consent_id:consent.id},operation_key:key()});
   const free=ok(await call('POST','/artists/people/'+seller.person.id+'/free-services',{user:seller,party:seller.personal_party_id,body:{avatar_id:S.avatar.id,kind:'AVATAR_HOSTING',rule_version:'CONTRACT_20261029'}}));assert.equal(free.data.price_minor,0);
   publicListing=await review(await S.artists.submitListing(seller.ctx,{...scope,avatar_id:S.avatar.id,listing:{display_name:'Synthetic independent public artist',city:'synthetic-city',introduction:'Public profile remains with no open booking',tags:['synthetic'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:true,preview_asset_ids:[material.id]},operation_key:key()}));
   const detail='/artists/catalog/'+publicListing.id,before=ok(await call('GET',detail));assert.equal(before.person_id,seller.person.id);
   const version=offer.object_version,op=key(),body={public_booking:false,public_price:false};
   offer=ok(await call('POST','/auditions/offers/'+offer.id+'/visibility',{user:seller,party:seller.personal_party_id,body,version,op}));
   assert.deepEqual(ok(await call('POST','/auditions/offers/'+offer.id+'/visibility',{user:seller,party:seller.personal_party_id,body,version,op})),offer);
   assert.equal(ok(await call('GET','/auditions/catalog')).items.length,0);
   assert.deepEqual(ok(await call('GET',detail)),before);
   assert(ok(await call('GET','/artists/catalog')).items.some(x=>x.listing_id===publicListing.id&&x.person_id===seller.person.id));
   const denied=await call('POST','/auditions/bookings',{party:buyer.personal_party_id,body:{offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:S.appointment}});assert.equal(denied.status,400);assert.equal(denied.error.code,'INVALID_ID'); // Closed offers require a matching accepted invitation; none supplied.
   assert.deepEqual(ok(await call('GET','/trade/records/'+order.id,{party:buyer.personal_party_id})).data.quote,order.data.quote);
  });
 }finally{
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,database:name,cases},null,2)+'\n');
  if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
