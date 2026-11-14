'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('known minor business actor cannot bypass age restriction by acting for an adult artist organization',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const fixtures=[],records=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,reviewer,outsider,trade}=S;
  const parties=require('../src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const org=await parties.createOrganization(outsider.ctx,{display_name:'synthetic organization actor',operation_key:key()});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);
  const relation=key(),data={valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',accepted_by:seller.account_id};
  await db.execute("INSERT INTO gig_records(id,kind,owner_party_id,counterparty_id,created_by,current_status,data_json,data_sha256) VALUES (?,'RELATION',?,?,?,'ACTIVE',?,?)",[relation,org.party_id,seller.personal_party_id,outsider.account_id,JSON.stringify(data),digest(data)]);
  await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation,actions:['SUBMIT_LISTING'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'synthetic existing authority'},operation_key:key()});
  let consent=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id:S.avatar.id,consent:{features:['FACE','VOICE'],purposes:['STOCK_LICENSE','PUBLIC_DISPLAY'],grantee_party_id:org.party_id,territories:['WORLDWIDE'],valid_from:data.valid_from,valid_until:data.valid_until,terms:'synthetic organization rights',evidence_asset_ids:[S.evidence.id]},operation_key:key()});
  consent=await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:consent.id,expected_version:consent.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
  let spec=await trade.createSpec(outsider.ctx,{party_id:org.party_id,previous_spec_id:null,...Object.fromEntries(['title','line_kind','unit_minor','currency','specification','product_profile'].map(k=>[k,S.spec.data[k]])),provider_party_id:org.party_id,operation_key:key()});
  spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});await S.publishSales(org.party_id,spec.id);
  const upload=(purpose,text)=>S.supply.upload(outsider.ctx,{party_id:org.party_id,purpose,media_type:purpose==='WORK_CONTENT'?'video/mp4':'text/plain',body:Buffer.from(text),operation_key:key()});
  const full=await upload('WORK_CONTENT','synthetic organization full'),preview=await upload('WORK_CONTENT','synthetic organization preview'),proof=await upload('RIGHTS_EVIDENCE','synthetic rights');
  const person=await S.artists.createPerson(outsider.ctx,{party_id:outsider.personal_party_id,display_name:'synthetic organization actor',operation_key:key()}),fingerprint=randomBytes(32).toString('hex');
  async function identity(age,status='VERIFIED'){
   const r=await S.artists.prepareIdentity(outsider.ctx,{party_id:outsider.personal_party_id,person_id:person.id,session_ref:'synthetic:'+key(),operation_key:key()});
   if(status==='UNKNOWN'){await S.artists.applyIdentity(r.id,null);return r;}
   await S.artists.applyIdentity(r.id,{request_key:r.data.request_key,person_id:person.id,status,issuer:'synthetic-age-provider',subject_fingerprint:fingerprint,age_band:age,valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:age',liveness_verified:true,phone_verified:true});return r;
  }
  await identity('ADULT');
  const identityProviderFactory=()=>({assertReady:async()=>{},verify:async data=>({request_key:data.request_key,person_id:data.person_id,status:'VERIFIED',issuer:'synthetic-age-provider',subject_fingerprint:fingerprint,age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:age',liveness_verified:true,phone_verified:true})});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:{TRADE_REQUIRE_V5_PRODUCTS:'true'},artistIdentityProviderFactory:identityProviderFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,body,party=org.party_id,operation=key()){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+outsider.token,...(party?{'X-Acting-Party':party}:{}),...(method!=='GET'?{'Content-Type':'application/json','Idempotency-Key':operation}: {})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const value=await res.json();if(res.status>=400)fixtures.push({method,path:new URL(base+url).pathname,schema:'ErrorResponse',value});else if(url.startsWith('/stock/'))fixtures.push({method,path:new URL(base+url).pathname,schema:'StockResponse',value});else if(url==='/me')fixtures.push({method,path:new URL(base+url).pathname,schema:'AccountResponse',value});
   if(res.status===200&&url.startsWith('/artists/'))fixtures.push({method,path:new URL(base+url).pathname,schema:'ArtistResponse',value});
   if(res.status===200&&url==='/privacy/requests')fixtures.push({method,path:new URL(base+url).pathname,schema:'PrivacyRequestResponse',value});
   return {status:res.status,...value};
  }
  const input={...S.listingInput,party_id:org.party_id,spec_id:spec.id,file_id:full.id,preview_file_id:preview.id,participants:[{person_id:seller.person.id,avatar_id:S.avatar.id,consent_id:consent.id}],rights_evidence_ids:[proof.id]};delete input.operation_key;delete input.party_id;
  let listed;const op=key();
  await t.test('adult organization owner can create the valid adult artist listing through HTTP',async()=>{
   const r=await call('POST','/stock/listings',input,org.party_id,op);assert.equal(r.status,200,JSON.stringify(r));listed=r.data;
   records.push({organization_party_id:org.party_id,actor_account_id:outsider.account_id,actor_person_id:person.id,artist_person_id:seller.person.id,listing_id:listed.id,operation_key:op});
  });
  await identity('MINOR');assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM guardian_records WHERE child_account_id=?",[outsider.account_id]))[0][0].n),0);
  await t.test('known minor without a guardian link cannot create or replay organization business',async()=>{
   const before=Number((await db.execute('SELECT COUNT(*) n FROM stock_listings'))[0][0].n);
   for(const operation of [key(),op]){const r=await call('POST','/stock/listings',input,org.party_id,operation);assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.error.code,'MINOR_OPERATION_RESTRICTED');}
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM stock_listings'))[0][0].n),before);
  });
  await t.test('known minor still reads own account and existing authorized record',async()=>{
   assert.equal((await call('GET','/me',undefined,null)).status,200);
   const r=await call('GET','/stock/listings/'+listed.id);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.id,listed.id);
  });
  await t.test('direct recharge audition draw and vote requests are age-blocked before business dispatch',async()=>{
   // These prove HTTP dispatch rejection, not complete checkout flows for each product.
   for(const url of ['/wallet/recharges','/auditions/bookings','/redemption/draws','/engagement/votes']){
    const r=await call('POST',url,{},outsider.personal_party_id);assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.error.code,'MINOR_OPERATION_RESTRICTED');
   }
  });
  await t.test('known minor may request a personal copy without opening business authority',async()=>{
   const r=await call('POST','/privacy/requests',{type:'COPY',scopes:['PROFILE'],details:'Synthetic personal age record request'},null);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.current_status,'RECEIVED');
  });
  await t.test('expired identity and unknown reverification retain the last known age',async()=>{
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00' WHERE id=?",[person.id]);
   let r=await call('POST','/stock/listings',input);assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.error.code,'MINOR_OPERATION_RESTRICTED');
   const pending=await identity('UNKNOWN','UNKNOWN');r=await call('POST','/stock/listings',input);assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.error.code,'MINOR_OPERATION_RESTRICTED');
   await S.artists.applyIdentity(pending.id,{request_key:pending.data.request_key,person_id:person.id,status:'REJECTED',issuer:'synthetic-age-provider',subject_fingerprint:fingerprint,age_band:'UNKNOWN',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:age',liveness_verified:true,phone_verified:true});
  });
  await t.test('failed reverification cannot erase the known minor restriction',async()=>{
   await identity('UNKNOWN','REJECTED');
   const r=await call('POST','/stock/listings',input);assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.error.code,'MINOR_OPERATION_RESTRICTED');
  });
  await t.test('trusted adult correction restores valid business without rewriting prior listing',async()=>{
   const identityResult=await call('POST','/artists/people/'+person.id+'/identity',{session_ref:'synthetic:correction'},outsider.personal_party_id);assert.equal(identityResult.status,200,JSON.stringify(identityResult));assert.equal(identityResult.data.current_status,'VERIFIED');
   const r=await call('POST','/stock/listings',input,org.party_id,op);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.id,listed.id);assert.equal(r.data.content_sha256,listed.content_sha256);
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/minor-business-actor-http.json'),JSON.stringify(fixtures,null,2)+'\n');
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/minor-business-actor-records.json'),JSON.stringify({synthetic_only:true,real_services:false,records},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});

