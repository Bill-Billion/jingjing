(function(require,__dirname){
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('publishing and delegated avatar creation require the actual actor current identity',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
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
  await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation,actions:['SUBMIT_LISTING','MANAGE_AVATARS','READ_PROFILE'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'synthetic existing authority'},operation_key:key()});
  let consent=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id:S.avatar.id,consent:{features:['FACE','VOICE'],purposes:['STOCK_LICENSE','PUBLIC_DISPLAY'],grantee_party_id:org.party_id,territories:['WORLDWIDE'],valid_from:data.valid_from,valid_until:data.valid_until,terms:'synthetic organization rights',evidence_asset_ids:[S.evidence.id]},operation_key:key()});
  consent=await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:consent.id,expected_version:consent.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
  let spec=await trade.createSpec(outsider.ctx,{party_id:org.party_id,previous_spec_id:null,...Object.fromEntries(['title','line_kind','unit_minor','currency','specification','product_profile'].map(k=>[k,S.spec.data[k]])),provider_party_id:org.party_id,operation_key:key()});
  spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});await S.publishSales(org.party_id,spec.id);
  const upload=(purpose,text)=>S.supply.upload(outsider.ctx,{party_id:org.party_id,purpose,media_type:purpose==='WORK_CONTENT'?'video/mp4':'text/plain',body:Buffer.from(text),operation_key:key()});
  const full=await upload('WORK_CONTENT','synthetic organization full'),preview=await upload('WORK_CONTENT','synthetic organization preview'),proof=await upload('RIGHTS_EVIDENCE','synthetic rights');
  let person;const fingerprint=randomBytes(32).toString('hex');
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
  const stockOp=key(),avatarOp=key(),avatarInput={display_name:'synthetic delegated avatar'},avatarPath='/artists/people/'+seller.person.id+'/avatars';
  let listed,avatar;
  function denied(r){assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');}
  async function counts(){return {listings:Number((await db.execute('SELECT COUNT(*) n FROM stock_listings'))[0][0].n),avatars:Number((await db.execute('SELECT COUNT(*) n FROM artist_avatar_links WHERE person_id=?',[seller.person.id]))[0][0].n)};}
  const initialCounts=await counts();
  await t.test('organization actor without a personal identity record cannot submit stock',async()=>{denied(await call('POST','/stock/listings',input));});
  await t.test('organization actor without a personal identity record cannot create delegated avatar',async()=>{denied(await call('POST',avatarPath,avatarInput));});
  person=await S.artists.createPerson(outsider.ctx,{party_id:outsider.personal_party_id,display_name:'synthetic organization actor',operation_key:key()});
  await t.test('unverified personal identity cannot submit stock',async()=>{denied(await call('POST','/stock/listings',input));});
  await t.test('unverified personal identity cannot create delegated avatar',async()=>{denied(await call('POST',avatarPath,avatarInput));});
  await identity('ADULT');
  await t.test('valid actor identity allows stock listing without adding artist certification fees',async()=>{
   const r=await call('POST','/stock/listings',input,org.party_id,stockOp);assert.equal(r.status,200,JSON.stringify(r));listed=r.data;
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM artist_records WHERE person_id=? AND kind='HALO'",[person.id]))[0][0].n),0);
  });
  await t.test('valid actor identity allows delegated avatar while keeping adult artist ownership',async()=>{
   const r=await call('POST',avatarPath,avatarInput,org.party_id,avatarOp);assert.equal(r.status,200,JSON.stringify(r));avatar=r.data;assert.equal(avatar.owner_party_id,seller.personal_party_id);
  });
  const validCounts=await counts();
  await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00' WHERE id=?",[person.id]);
  for(const [name,url,body,operation] of [['new stock','/stock/listings',input,key()],['stock successful replay','/stock/listings',input,stockOp],['new avatar',avatarPath,avatarInput,key()],['avatar successful replay',avatarPath,avatarInput,avatarOp]]){
   await t.test('expired actor identity rejects '+name,async()=>{denied(await call('POST',url,body,org.party_id,operation));});
  }
  await t.test('expired actor retains authorized existing listing and profile reads',async()=>{
   const r=await call('GET','/stock/listings/'+listed.id);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.id,listed.id);
   const p=await call('GET','/artists/people/'+seller.person.id,undefined,org.party_id);assert.equal(p.status,200,JSON.stringify(p));
  });
  await identity('UNKNOWN','REJECTED');
  for(const [name,url,body,operation] of [['new stock','/stock/listings',input,key()],['stock successful replay','/stock/listings',input,stockOp],['new avatar',avatarPath,avatarInput,key()],['avatar successful replay',avatarPath,avatarInput,avatarOp]]){
   await t.test('rejected actor identity rejects '+name,async()=>{denied(await call('POST',url,body,org.party_id,operation));});
  }
  await t.test('direct stock repository also checks actor identity before a successful replay',async()=>{
   await assert.rejects(S.stock.create(outsider.ctx,{...input,party_id:org.party_id,operation_key:stockOp}),{code:'VERIFIED_ADULT_REQUIRED'});
  });
  await t.test('direct avatar repository also checks actor identity before a successful replay',async()=>{
   await assert.rejects(S.artists.createAvatar(outsider.ctx,{person_id:seller.person.id,party_id:org.party_id,...avatarInput,operation_key:avatarOp}),{code:'VERIFIED_ADULT_REQUIRED'});
  });
  await t.test('denied identity transitions cannot create extra listings or digital people',async()=>{assert.deepEqual(await counts(),validCounts);assert.deepEqual(validCounts,{listings:initialCounts.listings+1,avatars:initialCounts.avatars+1});});
  await t.test('client cannot use identity recovery to verify another artist or submit its own age verdict',async()=>{
   const other=await call('POST','/artists/people/'+seller.person.id+'/identity',{session_ref:'synthetic:other'},outsider.personal_party_id);assert.equal(other.status,404,JSON.stringify(other));
   const forged=await call('POST','/artists/people/'+person.id+'/identity',{session_ref:'synthetic:forged',age_band:'ADULT'},outsider.personal_party_id);assert.equal(forged.status,400,JSON.stringify(forged));assert.equal(forged.error.code,'INVALID_INPUT');
   assert.equal((await db.execute('SELECT identity_status FROM artist_people WHERE id=?',[person.id]))[0][0].identity_status,'REJECTED');
  });
  await t.test('trusted personal identity recovery restores both original successful operations without changing records',async()=>{
   const corrected=await call('POST','/artists/people/'+person.id+'/identity',{session_ref:'synthetic:correction'},outsider.personal_party_id);assert.equal(corrected.status,200,JSON.stringify(corrected));
   const st=await call('POST','/stock/listings',input,org.party_id,stockOp);assert.equal(st.status,200,JSON.stringify(st));assert.equal(st.data.id,listed.id);assert.equal(st.data.content_sha256,listed.content_sha256);
   const av=await call('POST',avatarPath,avatarInput,org.party_id,avatarOp);assert.equal(av.status,200,JSON.stringify(av));assert.deepEqual(av.data,avatar);assert.deepEqual(await counts(),validCounts);
   records.push({actor_account_id:outsider.account_id,actor_person_id:person.id,artist_person_id:seller.person.id,organization_party_id:org.party_id,listing_id:listed.id,avatar_id:avatar.id,stock_operation_key:stockOp,avatar_operation_key:avatarOp});
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/identity-admission-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2)+'\n');
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/identity-admission-records.json'),JSON.stringify({synthetic_only:true,frontend_run:false,real_services:false,records},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});

})(require('node:module').createRequire("D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test\\minor-business-actor.integration.test.cjs"),"D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test");
