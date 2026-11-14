(function(require,__dirname){
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('adjacent artist and stock operations require current actor identity',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
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
  await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation,actions:['SUBMIT_LISTING','MANAGE_AVATARS','MANAGE_MATERIALS','READ_PROFILE'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'synthetic existing authority'},operation_key:key()});
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
   const value=await res.json();if(res.status>=400)fixtures.push({method,path:new URL(base+url).pathname,schema:'ErrorResponse',value});else if(url.startsWith('/stock/')&&url!=='/stock/checkout')fixtures.push({method,path:new URL(base+url).pathname,schema:'StockResponse',value});else if(url==='/me')fixtures.push({method,path:new URL(base+url).pathname,schema:'AccountResponse',value});
   if(res.status===200&&url.startsWith('/artists/'))fixtures.push({method,path:new URL(base+url).pathname,schema:'ArtistResponse',value});
   if(res.status===200&&url==='/privacy/requests')fixtures.push({method,path:new URL(base+url).pathname,schema:'PrivacyRequestResponse',value});
   if(res.status===200&&url==='/stock/checkout')fixtures.push({method,path:new URL(base+url).pathname,schema:'TradeRecordResponse',value});
   if(res.status===200&&url.startsWith('/supply/'))fixtures.push({method,path:new URL(base+url).pathname,schema:'SupplyRecordResponse',value});
   return {status:res.status,...value};
  }

  person=await S.person(outsider); // Trusted synthetic adult; no paid artist halo.
  let ownConsent=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id:S.avatar.id,consent:{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:seller.personal_party_id,territories:['WORLDWIDE'],valid_from:data.valid_from,valid_until:data.valid_until,terms:'synthetic artist-owned archive and public rights',evidence_asset_ids:[S.evidence.id]},operation_key:key()});
  ownConsent=await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:ownConsent.id,expected_version:ownConsent.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
  const artistAssets=require('../src/modules/works/assets').createSupplyAssets({db,repository:require('../src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});
  const material=await artistAssets.upload(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:Buffer.from('synthetic material only'),operation_key:key()});
  await require('../src/modules/artists/services').createArtistServices(db,{resolvePrincipal:S.resolvePrincipal,merchantPartyId:org.party_id,contractPolicy:'CONTRACT_20261029'}).requestFree(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id:S.avatar.id,kind:'AVATAR_HOSTING',rule_version:'CONTRACT_20261029',operation_key:key()});
  const legacyMaterial=await S.supply.upload(outsider.ctx,{party_id:org.party_id,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:Buffer.from('synthetic legacy material only'),operation_key:key()});
  const variantPath='/artists/people/'+seller.person.id+'/variants',listingPath='/artists/people/'+seller.person.id+'/listings';
  const variantInput=previous=>({avatar_id:S.avatar.id,kind:'LOOK',variant:{previous_version_id:previous,display_name:'synthetic look',material_asset_ids:[material.id],consent_id:ownConsent.id}});
  const variantKey=key(),firstVariant=variantInput(null),listingKey=key(),legacyKey=key();
  let look,listing,legacy;
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const denied=r=>{assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');};
  await t.test('verified delegated actor can create an artist-owned look',async()=>{look=ok(await call('POST',variantPath,firstVariant,org.party_id,variantKey));assert.equal(look.person_id,seller.person.id);});
  // Fail fast on a broken positive fixture instead of running meaningless negative cases.
  assert.ok(look);
  const listingInput={avatar_id:S.avatar.id,listing:{display_name:'synthetic public artist',city:'synthetic',introduction:'synthetic only',tags:['synthetic'],consent_id:ownConsent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[material.id]}};
  const legacyInput={display_name:'synthetic legacy org avatar',material_asset_ids:[legacyMaterial.id]};
  await t.test('verified delegated actor can submit a public listing',async()=>{listing=ok(await call('POST',listingPath,listingInput,org.party_id,listingKey));});assert.ok(listing);
  await t.test('verified organization actor can use compatible legacy creation',async()=>{legacy=ok(await call('POST','/supply/avatars',legacyInput,org.party_id,legacyKey));});assert.ok(legacy);
  async function latestLook(){const [rows]=await db.execute("SELECT id FROM artist_records WHERE person_id=? AND avatar_id=? AND kind='LOOK' ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.revision')) AS UNSIGNED) DESC LIMIT 1",[seller.person.id,S.avatar.id]);return rows[0].id;}
  const initialCount=Number((await db.execute("SELECT COUNT(*) n FROM supply_records WHERE kind='AVATAR'"))[0][0].n);
  for(const [state,field,value,restore] of [['unverified','identity_status','UNVERIFIED','VERIFIED'],['expired','identity_valid_until','2020-01-01 00:00:00.000','2099-01-01 00:00:00.000'],['rejected','identity_status','REJECTED','VERIFIED']]){
   await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[value,person.id]);
   try{
    const next=variantInput(await latestLook());
    for(const [label,url,body,op] of [['new look',variantPath,next,key()],['look replay',variantPath,firstVariant,variantKey],['new public listing',listingPath,listingInput,key()],['public listing replay',listingPath,listingInput,listingKey],['new legacy avatar','/supply/avatars',legacyInput,key()],['legacy avatar replay','/supply/avatars',legacyInput,legacyKey]])await t.test(state+' actor rejects '+label,async()=>{denied(await call('POST',url,body,org.party_id,op));});
    await t.test(state+' actor retains existing artist reads',async()=>{const r=ok(await call('GET','/artists/people/'+seller.person.id,undefined,org.party_id));assert.equal(r.person.id,seller.person.id);});
   }finally{await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[restore,person.id]);}
  }
  await t.test('identity recovery returns original results without extra avatars',async()=>{assert.deepEqual(ok(await call('POST',variantPath,firstVariant,org.party_id,variantKey)),look);assert.deepEqual(ok(await call('POST',listingPath,listingInput,org.party_id,listingKey)),listing);assert.deepEqual(ok(await call('POST','/supply/avatars',legacyInput,org.party_id,legacyKey)),legacy);assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM supply_records WHERE kind='AVATAR'"))[0][0].n),initialCount);});
  // The stock buyer has no connection to the publishing organization.
  const sale=await S.listing(),buyer=S.buyer,buyerKey=key(),checkoutBody={listing_id:sale.id,offer_sha256:sale.content_sha256,channel:'ALIPAY'};
  async function buyerCall(method,url,body,op=key()){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id,'Content-Type':'application/json','Idempotency-Key':op},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?'TradeRecordResponse':'ErrorResponse',value});return {status:res.status,...value};
  }
  let order;
  await t.test('verified stock buyer can place and replay one order',async()=>{order=ok(await buyerCall('POST','/stock/checkout',checkoutBody,buyerKey));assert.equal(ok(await buyerCall('POST','/stock/checkout',checkoutBody,buyerKey)).id,order.id);});assert.ok(order);
  for(const [state,field,value,restore] of [['unverified','identity_status','UNVERIFIED','VERIFIED'],['expired','identity_valid_until','2020-01-01 00:00:00.000','2099-01-01 00:00:00.000'],['rejected','identity_status','REJECTED','VERIFIED']]){
   await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[value,buyer.person.id]);
   try{
    for(const [label,op] of [['new request',key()],['successful replay',buyerKey]])await t.test(state+' buyer rejects stock '+label,async()=>{denied(await buyerCall('POST','/stock/checkout',checkoutBody,op));});
    await t.test(state+' buyer retains original order read',async()=>{assert.equal(ok(await buyerCall('GET','/trade/records/'+order.id)).id,order.id);});
   }finally{await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[restore,buyer.person.id]);}
  }
  await t.test('buyer identity recovery preserves the original order and contract',async()=>{assert.deepEqual(ok(await buyerCall('POST','/stock/checkout',checkoutBody,buyerKey)),order);});
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/identity-adjacent-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});

})(require("node:module").createRequire("D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test\\identity-admission.integration.test.cjs"),"D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test");
