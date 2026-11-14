(function(require,__dirname){
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('organization publishing requires the actual actor identity independently of the adult artist',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
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
  await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation,actions:['SUBMIT_LISTING','MANAGE_AVATARS'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'synthetic existing authority'},operation_key:key()});
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
  const op=key();let listed;
  await t.test('unverified organization actor cannot publish another adult artist',async()=>{
   const r=await call('POST','/stock/listings',input);assert.ok([403,409].includes(r.status),'expected identity refusal, actual HTTP '+r.status);records.push({case:'unverified',status:r.status});
  });
  await t.test('unverified organization actor cannot create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic delegated avatar'});assert.ok([403,409].includes(r.status),'expected identity refusal for avatar, actual HTTP '+r.status);
  });
  await identity('ADULT');
  await t.test('same valid request succeeds after trusted adult identity verification',async()=>{
   const r=await call('POST','/stock/listings',input,org.party_id,op);assert.equal(r.status,200,JSON.stringify(r));listed=r.data;records.push({case:'adult',status:r.status,listing_id:listed.id});
  });
  await t.test('verified organization actor may create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic valid delegated avatar'});assert.equal(r.status,200,JSON.stringify(r));
  });
  await t.test('expired personal identity blocks both new publishing and original successful replay',async()=>{
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00' WHERE id=?",[person.id]);
   for(const operation of [key(),op]){const r=await call('POST','/stock/listings',input,org.party_id,operation);assert.ok([403,409].includes(r.status),'expected expired identity refusal, actual HTTP '+r.status);}
  });
  await t.test('expired personal identity cannot create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic expired delegated avatar'});assert.ok([403,409].includes(r.status),'expected expired identity refusal for avatar, actual HTTP '+r.status);
  });
  await t.test('rejected personal identity verification does not authorize organization publishing',async()=>{
   await identity('UNKNOWN','REJECTED');const r=await call('POST','/stock/listings',input);assert.ok([403,409].includes(r.status),'expected rejected identity refusal, actual HTTP '+r.status);
  });
  await t.test('rejected personal identity cannot create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic rejected delegated avatar'});assert.ok([403,409].includes(r.status),'expected rejected identity refusal for avatar, actual HTTP '+r.status);
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/unverified-actor-probe-v2-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2)+'\n');
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/unverified-actor-probe-v2-records.json'),JSON.stringify({synthetic_only:true,real_services:false,records},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});

})(require('node:module').createRequire("D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test\\minor-business-actor.integration.test.cjs"),"D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test");
