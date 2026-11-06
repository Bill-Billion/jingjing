"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {createArtistRepository}=require('../src/modules/artists/repository'),{createAccountApi}=require('../src/http/account-api');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{digest}=require('../src/modules/governance/content');
test('new artist contract, classified review and free services in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,modernServer;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal}),repo=createArtistRepository(db,{resolvePrincipal});
 const secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret}),people=[];
 for(const display_name of ['artist','stranger','agency','reviewer','minor','duplicate']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});const p={ctx,...await parties.registerAccount(ctx,{display_name}),token:randomBytes(32).toString('base64url')};people.push(p);await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
 const [artist,stranger,agency,reviewer,minor,duplicate]=people,org=await parties.createOrganization(agency.ctx,{display_name:'synthetic agency',operation_key:key()});
 for(const action of ['ARTIST_REVIEW_RIGHTS','ARTIST_REVIEW_HALO','ARTIST_REVIEW_CONTENT','ARTIST_SERVICE_REVIEW','TRADE_REVIEW','TRADE_REFUND'])await maintainOperatorGrant(db,{account_id:reviewer.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:artists',reason:'isolated test only'});
 const bytes=new Map(),storageFactory=()=>({put:async i=>{bytes.set(i.key,i.body);return {key:i.key,sha256:createHash('sha256').update(i.body).digest('hex'),size:i.body.length};},getBuffer:async key=>bytes.get(key)});
 server=createAccountApi({db,secret,supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:org.party_id},supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let base='http://127.0.0.1:'+server.address().port+'/api/v1/artists',fixtures=[];
 async function call(method,url,user=artist,body,party=user.personal_party_id,headers={}){const h={Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...headers};if(body!==undefined&&!Buffer.isBuffer(body))h['Content-Type']='application/json';const res=await fetch(base+url,{method,headers:h,...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});const json=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.startsWith('/../trade/')?'TradeRecordResponse':url.startsWith('/../notices/')?'NoticeResponse':url.endsWith('/media')?'ArtistPublicMediaResponse':/^\/catalog\/[0-9a-f-]{36}$/.test(url)?'ArtistCatalogueItemResponse':'ArtistResponse'):'ErrorResponse',value:json});return {status:res.status,data:json.data,error:json.error};}
 function ok(r){assert.equal(r.status,200,JSON.stringify(r));return r.data;}function bad(r,code){assert.equal(r.error?.code,code,JSON.stringify(r));return r;}
 const headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
 let person,avatar,material,evidence,consent,look,halo,listing,delegation,relation;
 const from=new Date(Date.now()-60000).toISOString(),until=new Date(Date.now()+86400000*30).toISOString();
 async function verify(user,p,age='ADULT',fingerprint='a'.repeat(64)){const r=await repo.prepareIdentity(user.ctx,{person_id:p.id,party_id:user.personal_party_id,session_ref:'synthetic:'+key(),operation_key:key()});return repo.applyIdentity(r.id,{request_key:r.data.request_key,person_id:p.id,status:'VERIFIED',issuer:'synthetic-provider',subject_fingerprint:fingerprint,age_band:age,valid_until:until,evidence_ref:'synthetic:identity',liveness_verified:true,phone_verified:true});}

 const trade=require('../src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal}),ruleId=key(),rule=require('../src/modules/governance/content').createRuleContent({id:ruleId,rule_key:'artists.synthetic',version:'1',terms:{explicit:'synthetic service terms'}});
 await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'artists.synthetic','1',JSON.stringify(rule),'2020-01-01 00:00:00',agency.account_id,'EFFECTIVE']);
 async function serviceOrder(kind,{pay=true,haloLevel=null,modern=false}={}){
  const price=kind==='AVATAR_CREATION'?6000:kind==='AVATAR_HOSTING'?2900:1000;
  const specification={version:'synthetic-v1',service_tier:'synthetic',service:{kind,unit:kind==='AVATAR_CREATION'?'PERSON_FIRST':kind==='AVATAR_HOSTING'?'AVATAR_MONTH':'HALO_APPLICATION',rule_version:modern?'CONTRACT_20261029':'V5-20261013',source_ref:'synthetic:test',retry_limit:kind==='AVATAR_CREATION'?1:0,hosting_months:kind==='AVATAR_HOSTING'?1:null,halo_level:haloLevel,failure_policy:modern?'REVIEW_FEE_NON_REFUNDABLE':'REFUND_UNDELIVERED'},deliverables:['synthetic archive or service'],terms:'synthetic service only'};
  let spec=ok(await call('POST','/../trade/specifications',agency,{previous_spec_id:null,title:'synthetic '+kind,provider_party_id:org.party_id,line_kind:'OTHER',unit_minor:price,currency:'CNY',specification,product_profile:{version:'V5',type:kind}},org.party_id,headers()));
  spec=ok(await call('POST','/../trade/records/'+spec.id+'/reviews',reviewer,{decision:'APPROVED',reason:'independent synthetic'},null,headers(spec)));
  let service=ok(await call('POST','/people/'+person.id+'/services',artist,{avatar_id:kind==='HALO_REVIEW'?null:avatar.id,spec_id:spec.id,renewal_reminder:false},artist.personal_party_id,headers()));
  let quote=ok(await call('POST','/../trade/quotes',agency,{buyer_party_id:artist.personal_party_id,lines:[{line_id:'service',spec_id:spec.id,quantity:1}],installments:[{key:'all',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'service',amount_minor:price}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'PLATFORM_PRINCIPAL',rule_id:ruleId,expires_at:until,payment_window_minutes:30,license_reservation_id:null,artist_service_source:{service_id:service.id}},org.party_id,headers()));
  quote=ok(await call('POST','/../trade/records/'+quote.id+'/reviews',reviewer,{decision:'APPROVED',reason:'independent synthetic'},null,headers(quote)));
  const order=ok(await call('POST','/../trade/quotes/'+quote.id+'/acceptance',artist,{quote_sha256:quote.content_sha256},artist.personal_party_id,headers(quote)));
  let payment=null;
  if(pay){const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:org.party_id,config_revision:'test'};
   payment=await trade.preparePayment(artist.ctx,{party_id:artist.personal_party_id,order_id:order.id,installment_key:'all',operation_key:key()},config);
   await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:price,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   service=ok(await call('POST','/people/'+person.id+'/services/'+service.id+'/sync',artist,{},artist.personal_party_id,headers()));
  }
  return {spec,service,quote,order,payment};
 }
 const upload=(purpose,user=artist,party=artist.personal_party_id)=>call('POST','/people/'+person.id+'/assets?purpose='+purpose+'&media_type=text/plain',user,Buffer.from('synthetic material only'),party,{...headers(),'Content-Type':'application/octet-stream'});
 const review=r=>call('POST','/people/'+person.id+'/records/'+r.id+'/reviews',reviewer,{decision:'APPROVE',reason:'synthetic independent review'},null,headers(r));

 person=ok(await call('POST','/people',artist,{display_name:'synthetic contract artist'},artist.personal_party_id,headers()));await verify(artist,person);
 avatar=ok(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'synthetic free avatar'},artist.personal_party_id,headers()));
 material=ok(await call('POST','/people/'+person.id+'/assets?purpose=AVATAR_MATERIAL&media_type=image/png',artist,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=','base64'),artist.personal_party_id,{...headers(),'Content-Type':'application/octet-stream'}));evidence=ok(await upload('CONSENT_EVIDENCE'));
 consent=ok(await call('POST','/people/'+person.id+'/consents',artist,{avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:artist.personal_party_id,territories:['CN'],valid_from:from,valid_until:until,terms:'synthetic independent consent',evidence_asset_ids:[evidence.id]}},artist.personal_party_id,headers()));consent=ok(await review(consent));
 halo=ok(await call('POST','/people/'+person.id+'/halos',artist,{level:1,ownership_promise:true,evidence_asset_ids:[evidence.id]},artist.personal_party_id,headers()));halo=ok(await review(halo));
 const legacy=await serviceOrder('AVATAR_HOSTING'),legacyCreation=await serviceOrder('AVATAR_CREATION',{pay:false}),legacyReview=await serviceOrder('HALO_REVIEW',{haloLevel:2});
 const legacyBase=base;
 modernServer=createAccountApi({db,secret,supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:org.party_id,ARTIST_CONTRACT_POLICY:'CONTRACT_20261029'},supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>modernServer.once('listening',r));base='http://127.0.0.1:'+modernServer.address().port+'/api/v1/artists';
 const modernBase=base,freeInput=kind=>({avatar_id:avatar.id,kind,rule_version:'CONTRACT_20261029'}),freeRequest=(kind,k=key(),user=artist)=>call('POST','/people/'+person.id+'/free-services',user,freeInput(kind),user.personal_party_id,headers(null,k));
 let freeHosting,freeCreation;
 await t.test('cutover exposes free options, filters old offers and blocks old new purchases',async()=>{
  const offers=ok(await call('GET','/services',artist,undefined,null));assert.equal(offers.offers.contract_policy,'CONTRACT_20261029');assert.equal(offers.offers.free_services.length,2);assert.equal(offers.offers.items.length,0);assert.equal(offers.long_lived_model.current_status,'NOT_ENABLED');
  bad(await call('POST','/people/'+person.id+'/services',artist,{avatar_id:avatar.id,spec_id:legacy.spec.id,renewal_reminder:false},artist.personal_party_id,headers()),'ARTIST_SERVICE_IS_FREE');
  bad(await call('POST','/people/'+person.id+'/services',artist,{avatar_id:null,spec_id:legacyReview.spec.id,renewal_reminder:false},artist.personal_party_id,headers()),'ARTIST_CONTRACT_SPEC_REQUIRED');
  base=legacyBase;try{bad(await freeRequest('AVATAR_HOSTING'),'ARTIST_CONTRACT_NOT_ENABLED');}finally{base=modernBase;}
 });
 await t.test('pending historical creation is not silently replaced and can finish its original payment',async()=>{
  bad(await freeRequest('AVATAR_CREATION'),'ARTIST_EXISTING_SERVICE_REQUIRES_RESOLUTION');
  const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:org.party_id,config_revision:'test'};
  const payment=await trade.preparePayment(artist.ctx,{party_id:artist.personal_party_id,order_id:legacyCreation.order.id,installment_key:'all',operation_key:key()},config);await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:6000,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
  const ready=ok(await call('POST','/people/'+person.id+'/services/'+legacyCreation.service.id+'/sync',artist,{},artist.personal_party_id,headers()));assert.equal(ready.current_status,'READY');assert.equal(ready.data.price_minor,6000);assert.deepEqual(ready.data.specification,legacyCreation.service.data.specification);
  // New avatar keeps the original paid request separate, rather than rewriting its obligations.
  avatar=ok(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'new free target'},artist.personal_party_id,headers()));
 });
 await t.test('free hosting is perpetual and deduplicates simultaneous requests without money records',async()=>{
  const before=Number((await db.execute('SELECT COUNT(*) n FROM trade_records'))[0][0].n);
  const pair=await Promise.all([freeRequest('AVATAR_HOSTING'),freeRequest('AVATAR_HOSTING')]);freeHosting=ok(pair[0]);assert.equal(ok(pair[1]).id,freeHosting.id);assert.equal(freeHosting.data.price_minor,0);assert.equal(freeHosting.data.hosting_period.valid_until,null);assert.equal(freeHosting.data.hosting_period.perpetual,true);assert.equal(freeHosting.data.payment_requirement,'NONE');
  const detail=ok(await call('GET','/people/'+person.id+'/services/'+freeHosting.id));assert.equal(detail.order,null);assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM trade_records'))[0][0].n),before);
  await db.withTransaction(async tx=>{const p=await require('../src/modules/artists/context').person(tx,person.id);assert.equal((await require('../src/modules/artists/services').hosting(tx,p,avatar.id,'2099-01-01T00:00:00.000Z')).id,freeHosting.id);});
  bad(await call('POST','/people/'+person.id+'/services/'+freeHosting.id+'/reminder',artist,{enabled:true},artist.personal_party_id,headers(freeHosting)),'FREE_HOSTING_RENEWAL_NOT_REQUIRED');bad(await freeRequest('AVATAR_HOSTING',key(),stranger),'ARTIST_NOT_FOUND');
 });
 await t.test('free creation failure records no refund, requires independent operator and is retryable',async()=>{
  const k=key();freeCreation=ok(await freeRequest('AVATAR_CREATION',k));assert.equal(ok(await freeRequest('AVATAR_CREATION',k)).id,freeCreation.id);assert.equal(freeCreation.current_status,'READY');
  bad(await call('POST','/people/'+person.id+'/services/'+freeCreation.id+'/results',artist,{outcome:'UNDELIVERABLE',archive_asset_id:null,reason:'self review'},null,headers(freeCreation)),'ARTIST_REVIEW_FORBIDDEN');
  freeCreation=ok(await call('POST','/people/'+person.id+'/services/'+freeCreation.id+'/results',reviewer,{outcome:'UNDELIVERABLE',archive_asset_id:null,reason:'synthetic local failure'},null,headers(freeCreation)));assert.equal(freeCreation.current_status,'FAILED');assert.equal(freeCreation.data.refund,null);const retry=ok(await freeRequest('AVATAR_CREATION'));assert.notEqual(retry.id,freeCreation.id);freeCreation=retry;
 });

 await t.test('free archive needs owned files and both face and voice; never enables a provider model',async()=>{
  let c=ok(await call('POST','/people/'+person.id+'/consents',artist,{avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE'],grantee_party_id:artist.personal_party_id,territories:['CN'],valid_from:from,valid_until:until,terms:'synthetic free consent',evidence_asset_ids:[evidence.id]}},artist.personal_party_id,headers()));c=ok(await review(c));
  const variant={previous_version_id:null,display_name:'synthetic version',material_asset_ids:[material.id],consent_id:c.id};ok(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind:'LOOK',variant},artist.personal_party_id,headers()));
  const result=()=>call('POST','/people/'+person.id+'/services/'+freeCreation.id+'/results',reviewer,{outcome:'ARCHIVE_DELIVERED',archive_asset_id:material.id,reason:'synthetic archive review'},null,headers(freeCreation));bad(await result(),'FREE_ARCHIVE_FACE_VOICE_REQUIRED');
  const wrong=ok(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind:'VOICE',variant},artist.personal_party_id,headers()));bad(await result(),'FREE_ARCHIVE_MEDIA_TYPE_REQUIRED');
  const wave=Buffer.alloc(204);wave.write('RIFF');wave.writeUInt32LE(196,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(160,40);
  const audio=ok(await call('POST','/people/'+person.id+'/assets?purpose=AVATAR_MATERIAL&media_type=audio/wav',artist,wave,artist.personal_party_id,{...headers(),'Content-Type':'application/octet-stream'}));ok(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind:'VOICE',variant:{...variant,previous_version_id:wrong.id,material_asset_ids:[audio.id]}},artist.personal_party_id,headers()));freeCreation=ok(await result());assert.equal(freeCreation.current_status,'DELIVERED');assert.equal(freeCreation.data.delivery.type,'DIGITAL_ARCHIVE');assert.equal(ok(await call('GET','/people/'+person.id)).avatars.find(v=>v.id===avatar.id).data.long_lived_model_status,'NOT_ENABLED');
 });
 await t.test('free routes still enforce minor restrictions and cancellation does not create money',async()=>{
  const p=ok(await call('POST','/people',minor,{display_name:'synthetic minor'},minor.personal_party_id,headers()));await verify(minor,p,'MINOR','b'.repeat(64));bad(await call('POST','/people/'+p.id+'/free-services',minor,{avatar_id:avatar.id,kind:'AVATAR_HOSTING',rule_version:'CONTRACT_20261029'},minor.personal_party_id,headers()),'MINOR_OPERATION_RESTRICTED');
  const nextAvatar=ok(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'cancelled free target'},artist.personal_party_id,headers()));let service=ok(await call('POST','/people/'+person.id+'/free-services',artist,{avatar_id:nextAvatar.id,kind:'AVATAR_CREATION',rule_version:'CONTRACT_20261029'},artist.personal_party_id,headers()));service=ok(await call('POST','/people/'+person.id+'/services/'+service.id+'/cancel',artist,{reason:'changed mind'},artist.personal_party_id,headers(service)));assert.equal(service.current_status,'CANCELLED');assert.equal(ok(await call('GET','/people/'+person.id+'/services/'+service.id)).order,null);
 });
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=','base64');
 const uploadPhoto=()=>call('POST','/people/'+person.id+'/assets?purpose=REVIEW_EVIDENCE&media_type=image/png',artist,png,artist.personal_party_id,{...headers(),'Content-Type':'application/octet-stream'});
 const card=ok(await uploadPhoto()),life=ok(await uploadPhoto()),full=ok(await uploadPhoto()),replacement=ok(await uploadPhoto());
 const classified={model_card_asset_id:card.id,lifestyle_asset_ids:[life.id],full_body_asset_ids:[full.id],personal_introduction:'synthetic personal introduction',resume:'synthetic resume'};
 const paid=await serviceOrder('HALO_REVIEW',{haloLevel:2,modern:true});
 const apply=(extra={})=>call('POST','/people/'+person.id+'/halos',artist,{level:2,ownership_promise:true,evidence_asset_ids:[evidence.id],service_id:paid.service.id,...extra},artist.personal_party_id,headers());let application;
 await t.test('new certification refuses missing categories, wrong files and another owner assets',async()=>{
  bad(await apply(),'HALO_CLASSIFIED_MATERIALS_REQUIRED');bad(await apply({certification_materials:{...classified,resume:''}}),'INVALID_DISPLAY_NAME');
  bad(await apply({certification_materials:{...classified,model_card_asset_id:evidence.id}}),'PRIVATE_MATERIAL_NOT_READY');
  const text=ok(await upload('REVIEW_EVIDENCE'));bad(await apply({certification_materials:{...classified,full_body_asset_ids:[text.id]}}),'HALO_MATERIAL_MEDIA_TYPE_INVALID');
  await db.execute('UPDATE supply_assets SET owner_party_id=? WHERE id=?',[stranger.personal_party_id,card.id]);bad(await apply({certification_materials:classified}),'PRIVATE_MATERIAL_NOT_READY');await db.execute('UPDATE supply_assets SET owner_party_id=? WHERE id=?',[artist.personal_party_id,card.id]);
  application=ok(await apply({certification_materials:classified}));assert.equal(application.data.rule_version,'CONTRACT_20261029');assert.ok(application.data.evidence_asset_ids.includes(card.id));assert.equal(application.current_status,'SUBMITTED');
 });
 await t.test('supplement replaces classified snapshot, preserves original evidence and consumes one fee',async()=>{
  const count=Number((await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='PAYMENT'"))[0][0].n);
  application=ok(await call('POST','/people/'+person.id+'/records/'+application.id+'/reviews',reviewer,{decision:'NEEDS_MATERIAL',reason:'replace full body image'},null,headers(application)));
  const next={...classified,full_body_asset_ids:[replacement.id]};application=ok(await call('POST','/people/'+person.id+'/records/'+application.id+'/supplements',artist,{evidence_asset_ids:[replacement.id],note:'updated body image',certification_materials:next},artist.personal_party_id,headers(application)));
  assert.deepEqual(application.data.certification_materials,next);assert.deepEqual(application.data.supplements[0].previous_certification_materials,classified);assert.ok(application.data.evidence_asset_ids.includes(full.id));
  for(const asset of [full,replacement]){const res=await fetch(base+'/people/'+person.id+'/records/'+application.id+'/assets/'+asset.id+'/content',{headers:{Authorization:'Bearer '+reviewer.token}});assert.equal(res.status,200);assert.deepEqual(Buffer.from(await res.arrayBuffer()),png);}
  application=ok(await review(application));assert.equal(application.current_status,'APPROVED');assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='PAYMENT'"))[0][0].n),count);assert.equal(ok(await call('GET','/people/'+person.id+'/services/'+paid.service.id)).current_status,'DELIVERED');
 });
 await t.test('new fee cannot be refunded; previous contract remains refundable',async()=>{
  await assert.rejects(trade.requestRefund(artist.ctx,{party_id:artist.personal_party_id,payment_id:paid.payment.id,allocations:[{line_id:'service',amount_minor:1000}],reason:'new fee',operation_key:key()}),{code:'HALO_REVIEW_FEE_NON_REFUNDABLE'});
  const r=await trade.requestRefund(artist.ctx,{party_id:artist.personal_party_id,payment_id:legacyReview.payment.id,allocations:[{line_id:'service',amount_minor:1000}],reason:'old frozen agreement',operation_key:key()});assert.equal(r.current_status,'REQUESTED');
 });
 await t.test('withdrawing a new application consumes its review, keeps evidence and grants no certification',async()=>{
  const p=await serviceOrder('HALO_REVIEW',{haloLevel:2,modern:true});let a=ok(await call('POST','/people/'+person.id+'/halos',artist,{level:2,ownership_promise:true,evidence_asset_ids:[evidence.id],service_id:p.service.id,certification_materials:classified},artist.personal_party_id,headers()));
  a=ok(await call('POST','/people/'+person.id+'/records/'+a.id+'/withdrawals',artist,{reason:'synthetic withdrawal'},artist.personal_party_id,headers(a)));assert.equal(a.current_status,'WITHDRAWN');assert.equal(a.data.valid_from,null);const service=ok(await call('GET','/people/'+person.id+'/services/'+p.service.id));assert.equal(service.data.delivery.decision,'WITHDRAW');assert.equal(service.order.financial.net_minor,1000);
  await assert.rejects(trade.requestRefund(artist.ctx,{party_id:artist.personal_party_id,payment_id:p.payment.id,allocations:[{line_id:'service',amount_minor:1000}],reason:'withdrawn review',operation_key:key()}),{code:'HALO_REVIEW_FEE_NON_REFUNDABLE'});
 });
 const out=process.env.JX_ARTIST_CONTRACT_HTTP_FIXTURES||path.resolve(__dirname,'../../../..','.local/artist-contract-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(modernServer)await new Promise(r=>modernServer.close(r));if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
