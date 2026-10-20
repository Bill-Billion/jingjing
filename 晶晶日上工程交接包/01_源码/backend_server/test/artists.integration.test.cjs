"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {createArtistRepository}=require('../src/modules/artists/repository'),{createAccountApi}=require('../src/http/account-api');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{digest}=require('../src/modules/governance/content');
test('artist rights and delegated access in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal}),repo=createArtistRepository(db,{resolvePrincipal});
 const secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret}),people=[];
 for(const display_name of ['artist','stranger','agency','reviewer','minor','duplicate']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});const p={ctx,...await parties.registerAccount(ctx,{display_name}),token:randomBytes(32).toString('base64url')};people.push(p);await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
 const [artist,stranger,agency,reviewer,minor,duplicate]=people,org=await parties.createOrganization(agency.ctx,{display_name:'synthetic agency',operation_key:key()});
 for(const action of ['ARTIST_REVIEW_RIGHTS','ARTIST_REVIEW_HALO','ARTIST_REVIEW_CONTENT','ARTIST_SERVICE_REVIEW','TRADE_REVIEW','TRADE_REFUND'])await maintainOperatorGrant(db,{account_id:reviewer.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:artists',reason:'isolated test only'});
 const bytes=new Map(),storageFactory=()=>({put:async i=>{bytes.set(i.key,i.body);return {key:i.key,sha256:createHash('sha256').update(i.body).digest('hex'),size:i.body.length};},getBuffer:async key=>bytes.get(key)});
 server=createAccountApi({db,secret,supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:org.party_id},supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/artists',fixtures=[];
 async function call(method,url,user=artist,body,party=user.personal_party_id,headers={}){const h={Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...headers};if(body!==undefined&&!Buffer.isBuffer(body))h['Content-Type']='application/json';const res=await fetch(base+url,{method,headers:h,...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});const json=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.startsWith('/../trade/')?'TradeRecordResponse':'ArtistResponse'):'ErrorResponse',value:json});return {status:res.status,data:json.data,error:json.error};}
 function ok(r){assert.equal(r.status,200,JSON.stringify(r));return r.data;}function bad(r,code){assert.equal(r.error?.code,code,JSON.stringify(r));return r;}
 const headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
 let person,avatar,material,evidence,consent,look,halo,listing,delegation,relation;
 const from=new Date(Date.now()-60000).toISOString(),until=new Date(Date.now()+86400000*30).toISOString();
 async function verify(user,p,age='ADULT',fingerprint='a'.repeat(64)){const r=await repo.prepareIdentity(user.ctx,{person_id:p.id,party_id:user.personal_party_id,session_ref:'synthetic:'+key(),operation_key:key()});return repo.applyIdentity(r.id,{request_key:r.data.request_key,person_id:p.id,status:'VERIFIED',issuer:'synthetic-provider',subject_fingerprint:fingerprint,age_band:age,valid_until:until,evidence_ref:'synthetic:identity',liveness_verified:true,phone_verified:true});}

 const trade=require('../src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal}),ruleId=key(),rule=require('../src/modules/governance/content').createRuleContent({id:ruleId,rule_key:'artists.synthetic',version:'1',terms:{explicit:'synthetic service terms'}});
 await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'artists.synthetic','1',JSON.stringify(rule),'2020-01-01 00:00:00',agency.account_id,'EFFECTIVE']);
 async function serviceOrder(kind,{pay=true,haloLevel=null}={}){
  const price=kind==='AVATAR_CREATION'?6000:kind==='AVATAR_HOSTING'?2900:1000;
  const specification={version:'synthetic-v1',service_tier:'synthetic',service:{kind,unit:kind==='AVATAR_CREATION'?'PERSON_FIRST':kind==='AVATAR_HOSTING'?'AVATAR_MONTH':'HALO_APPLICATION',rule_version:'V5-20261013',source_ref:'synthetic:test',retry_limit:kind==='AVATAR_CREATION'?1:0,hosting_months:kind==='AVATAR_HOSTING'?1:null,halo_level:haloLevel,failure_policy:'REFUND_UNDELIVERED'},deliverables:['synthetic archive or service'],terms:'synthetic service only'};
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
 await t.test('real person creation is personal only, idempotent, and never verified by client flags',async()=>{const k=key(),input={display_name:'合成艺人'};person=ok(await call('POST','/people',artist,input,artist.personal_party_id,headers(null,k)));assert.equal(person.identity_status,'UNVERIFIED');assert.deepEqual(ok(await call('POST','/people',artist,input,artist.personal_party_id,headers(null,k))),person);bad(await call('POST','/people',agency,input,org.party_id,headers()),'ARTIST_PERSONAL_CONFIRMATION_REQUIRED');bad(await call('POST','/people',stranger,{...input,identity_status:'VERIFIED'},stranger.personal_party_id,headers()),'INVALID_INPUT');bad(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'a'},artist.personal_party_id,headers()),'ARTIST_IDENTITY_REQUIRED');});
 await t.test('provider not enabled is visible and creates no fake identity result',async()=>{const services=ok(await call('GET','/services',artist,undefined,null));assert.equal(services.identity.current_status,'NOT_ENABLED');bad(await call('POST','/people/'+person.id+'/identity',artist,{session_ref:'synthetic:not-enabled'},artist.personal_party_id,headers()),'SERVICE_UNAVAILABLE');assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM artist_records'))[0][0].n),0);});
 await t.test('trusted verification binds a real person; duplicate identity does not transfer ownership',async()=>{assert.equal((await verify(artist,person)).current_status,'VERIFIED');const other=ok(await call('POST','/people',duplicate,{display_name:'duplicate'},duplicate.personal_party_id,headers()));assert.equal((await verify(duplicate,other)).current_status,'DUPLICATE_PERSON');assert.equal(ok(await call('GET','/people/'+other.id,duplicate)).person.identity_status,'DUPLICATE_PERSON');});
 await t.test('service purchase rejects a personal party mistakenly configured as platform merchant',async()=>{const invalid=require('../src/modules/artists/services').createArtistServices(db,{resolvePrincipal,merchantPartyId:artist.personal_party_id});await assert.rejects(invalid.request(artist.ctx,{person_id:person.id,party_id:artist.personal_party_id,avatar_id:null,spec_id:key(),renewal_reminder:false,operation_key:key()}),e=>e.code==='ARTIST_PLATFORM_MERCHANT_INVALID');});
 await t.test('minor actual materials and avatar creation are blocked without guardian policy',async()=>{const p=ok(await call('POST','/people',minor,{display_name:'synthetic minor'},minor.personal_party_id,headers()));await verify(minor,p,'MINOR','b'.repeat(64));bad(await call('POST','/people/'+p.id+'/avatars',minor,{display_name:'child'},minor.personal_party_id,headers()),'MINOR_OPERATION_RESTRICTED');});
 await t.test('one person can own multiple avatars; neither claims a long-lived model exists',async()=>{avatar=ok(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'synthetic avatar'},artist.personal_party_id,headers()));const second=ok(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'another look'},artist.personal_party_id,headers()));assert.equal(second.person_id,person.id);assert.equal(second.data.long_lived_model_status,'NOT_ENABLED');assert.equal(ok(await call('GET','/people/'+person.id)).avatars.length,2);bad(await call('GET','/people/'+person.id,stranger),'ARTIST_NOT_FOUND');});
 await t.test('private materials belong to person and cannot be fetched by another account',async()=>{material=ok(await upload('AVATAR_MATERIAL'));evidence=ok(await upload('CONSENT_EVIDENCE'));assert.equal(material.owner_party_id,artist.personal_party_id);bad(await call('GET','/assets/'+material.id,stranger),'ARTIST_NOT_FOUND');});
 await t.test('consent needs independent review; rejected and withdrawn rights cannot create versions',async()=>{consent=ok(await call('POST','/people/'+person.id+'/consents',artist,{avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:artist.personal_party_id,territories:['CN'],valid_from:from,valid_until:until,terms:'synthetic terms only',evidence_asset_ids:[evidence.id]}},artist.personal_party_id,headers()));const variant={previous_version_id:null,display_name:'look 1',material_asset_ids:[material.id],consent_id:consent.id};bad(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind:'LOOK',variant},artist.personal_party_id,headers()),'ARTIST_CONSENT_REQUIRED');consent=ok(await review(consent));look=ok(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind:'LOOK',variant},artist.personal_party_id,headers()));bad(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind:'LOOK',variant},artist.personal_party_id,headers()),'VARIANT_PREVIOUS_VERSION_MISMATCH');});

 let hosted,creation;
 await t.test('paid hosting is linked to one avatar; duplicate sync never extends the paid term',async()=>{
  hosted=await serviceOrder('AVATAR_HOSTING');assert.equal(hosted.service.current_status,'DELIVERED');assert.equal(hosted.service.data.auto_debit_enabled,false);assert.equal(hosted.service.avatar_id,avatar.id);
  const again=ok(await call('POST','/people/'+person.id+'/services/'+hosted.service.id+'/sync',artist,{},artist.personal_party_id,headers()));assert.deepEqual(again.data.hosting_period,hosted.service.data.hosting_period);assert.ok(hosted.order.data.contract.rule_contents.length);
 });
 await t.test('unpaid creation cannot be delivered and a second avatar cannot double-charge first creation',async()=>{
  creation=await serviceOrder('AVATAR_CREATION',{pay:false});bad(await call('POST','/people/'+person.id+'/services/'+creation.service.id+'/sync',artist,{},artist.personal_party_id,headers()),'ARTIST_SERVICE_PAYMENT_REQUIRED');
  bad(await call('POST','/people/'+person.id+'/services',artist,{avatar_id:avatar.id,spec_id:creation.spec.id,renewal_reminder:false},artist.personal_party_id,headers()),'ARTIST_FIRST_CREATION_ALREADY_RESERVED');
  bad(await call('POST','/people/'+person.id+'/services/'+creation.service.id+'/results',reviewer,{outcome:'ARCHIVE_DELIVERED',archive_asset_id:material.id,reason:'cannot deliver unpaid'},null,headers(creation.service)),'ARTIST_SERVICE_NOT_READY');
  const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:org.party_id,config_revision:'test'};
  creation.payment=await trade.preparePayment(artist.ctx,{party_id:artist.personal_party_id,order_id:creation.order.id,installment_key:'all',operation_key:key()},config);
  await trade.applyPayment({...config,payment_id:creation.payment.id,currency:'CNY',amount_minor:6000,transaction_id:'synthetic.'+creation.payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
  creation.service=ok(await call('POST','/people/'+person.id+'/services/'+creation.service.id+'/sync',artist,{},artist.personal_party_id,headers()));
 });
 await t.test('creation retries use the purchased limit; failure leaves a refund obligation, never a fake refund',async()=>{
  for(let n=0;n<2;n++)creation.service=ok(await call('POST','/people/'+person.id+'/services/'+creation.service.id+'/results',reviewer,{outcome:'ATTEMPT_FAILED',archive_asset_id:null,reason:'synthetic supplier failure'},null,headers(creation.service)));
  assert.equal(creation.service.current_status,'REFUND_REQUIRED');assert.equal(creation.service.data.refund.amount_minor,6000);
  const still=ok(await call('GET','/people/'+person.id+'/services/'+creation.service.id));assert.equal(still.order.financial.refunded_minor,0);
  let refund=await trade.requestRefund(artist.ctx,{party_id:artist.personal_party_id,payment_id:creation.payment.id,allocations:[{line_id:'service',amount_minor:6000}],reason:'synthetic failed creation',operation_key:key()});
  refund=await trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'synthetic verified',operation_key:key()});await trade.claim(reviewer.ctx,refund.id,null,'REFUND');
  await trade.applyRefund(refund.id,{provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',refund_id:refund.id,payment_id:creation.payment.id,transaction_id:'synthetic.'+creation.payment.id,currency:'CNY',amount_minor:6000,status:'SUCCEEDED'});
  creation.service=ok(await call('POST','/people/'+person.id+'/services/'+creation.service.id+'/sync',artist,{},artist.personal_party_id,headers()));assert.equal(creation.service.current_status,'REFUNDED');
 });
 await t.test('L1 and public directory need identity and reviewed independent public consent',async()=>{halo=ok(await call('POST','/people/'+person.id+'/halos',artist,{level:1,ownership_promise:true,evidence_asset_ids:[evidence.id]},artist.personal_party_id,headers()));halo=ok(await review(halo));listing=ok(await call('POST','/people/'+person.id+'/listings',artist,{avatar_id:avatar.id,listing:{display_name:'公开合成名',city:'郑州',introduction:'合成简介',tags:['测试'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[material.id]}},artist.personal_party_id,headers()));assert.equal(ok(await call('GET','/catalog',stranger,undefined,null)).items.length,0);listing=ok(await review(listing));const catalog=ok(await call('GET','/catalog?city='+encodeURIComponent('郑州'),stranger,undefined,null));assert.equal(catalog.items.length,1);assert.equal(catalog.items[0].evidence_asset_ids,undefined);assert.equal(catalog.items[0].material_asset_ids,undefined);assert.equal(ok(await call('GET','/catalog?audition=true',stranger,undefined,null)).items.length,0);});

 await t.test('L2 fee binds one application; supplemental review is same case and does not sell another fee',async()=>{
  const paid=await serviceOrder('HALO_REVIEW',{haloLevel:2});let h=ok(await call('POST','/people/'+person.id+'/halos',artist,{level:2,ownership_promise:true,evidence_asset_ids:[evidence.id],service_id:paid.service.id},artist.personal_party_id,headers()));
  h=ok(await call('POST','/people/'+person.id+'/records/'+h.id+'/reviews',reviewer,{decision:'NEEDS_MATERIAL',reason:'synthetic supplemental professional evidence'},null,headers(h)));
  h=ok(await call('POST','/people/'+person.id+'/records/'+h.id+'/supplements',artist,{evidence_asset_ids:[evidence.id],note:'synthetic extra proof'},artist.personal_party_id,headers(h)));
  h=ok(await review(h));assert.equal(h.current_status,'APPROVED');assert.equal(ok(await call('GET','/people/'+person.id+'/services/'+paid.service.id)).current_status,'DELIVERED');
  bad(await call('POST','/people/'+person.id+'/halos',artist,{level:2,ownership_promise:true,evidence_asset_ids:[evidence.id],service_id:paid.service.id},artist.personal_party_id,headers()),'HALO_PAID_REVIEW_REQUIRED');
  assert.equal(ok(await call('GET','/people/'+person.id)).halo_level,2);
 });
 await t.test('review inbox and owner record list restore actual work; stranger has no review access',async()=>{
  assert.ok(ok(await call('GET','/people/'+person.id+'/records?kind=CONSENT')).items.some(x=>x.id===consent.id));
  ok(await call('GET','/reviews?kind=CONSENT',reviewer,undefined,null));bad(await call('GET','/reviews?kind=CONSENT',stranger,undefined,null),'ARTIST_REVIEW_FORBIDDEN');
 });
 await t.test('archive material consent stays tied to the exact latest submitted versions',async t=>{
  const paid=await serviceOrder('AVATAR_CREATION');
  const declare=async()=>{
   let r=ok(await call('POST','/people/'+person.id+'/consents',artist,{avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE'],grantee_party_id:artist.personal_party_id,territories:['CN'],valid_from:from,valid_until:until,terms:'synthetic archive-only consent',evidence_asset_ids:[evidence.id]}},artist.personal_party_id,headers()));
   return ok(await review(r));
  };
  const variant=async(c,previous,file,kind='LOOK')=>ok(await call('POST','/people/'+person.id+'/variants',artist,{avatar_id:avatar.id,kind,variant:{previous_version_id:previous,display_name:'explicit replacement',material_asset_ids:[file.id],consent_id:c.id}},artist.personal_party_id,headers()));
  const withdraw=async r=>ok(await call('POST','/people/'+person.id+'/records/'+r.id+'/withdrawals',artist,{reason:'stop this material use'},artist.personal_party_id,headers(r)));
  const deliver=file=>call('POST','/people/'+person.id+'/services/'+paid.service.id+'/results',reviewer,{outcome:'ARCHIVE_DELIVERED',archive_asset_id:file.id,reason:'synthetic archive independently checked'},null,headers(paid.service));
  const fetchMaterial=async file=>fetch(base+'/people/'+person.id+'/records/'+paid.service.id+'/assets/'+file.id+'/content',{headers:{Authorization:'Bearer '+reviewer.token}});
  const originalConsent=await declare(),oldFile=ok(await upload('AVATAR_MATERIAL'));
  const oldVersion=await variant(originalConsent,look.id,oldFile);
  let newConsent,newFile,newVersion,voiceConsent,voice;
  await t.test('operator can read an authorized current material before withdrawal',async()=>{
   const response=await fetchMaterial(oldFile);assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0);
  });
  await t.test('withdrawal blocks reads and delivery despite another valid consent',async()=>{
   await withdraw(originalConsent);
   const response=await fetchMaterial(oldFile);assert.equal(response.status,409);assert.equal((await response.json()).error.code,'ARTIST_CONSENT_REQUIRED');
   bad(await deliver(oldFile),'ARTIST_CONSENT_REQUIRED');
   const unchanged=ok(await call('GET','/people/'+person.id+'/services/'+paid.service.id));assert.equal(unchanged.current_status,'READY');assert.equal(unchanged.data.delivery,null);assert.equal(unchanged.order.financial.net_minor,6000);
  });
  await t.test('new consent alone cannot reauthorize the old version; explicit replacement can',async()=>{
   newConsent=await declare();bad(await deliver(oldFile),'ARTIST_CONSENT_REQUIRED');
   newFile=ok(await upload('AVATAR_MATERIAL'));newVersion=await variant(newConsent,oldVersion.id,newFile);
   assert.equal((await fetchMaterial(oldFile)).status,404);assert.equal((await fetchMaterial(newFile)).status,200);
   bad(await deliver(oldFile),'ARCHIVE_VERSION_REQUIRED');
  });
  await t.test('voice uses its own original authorization, not the face consent',async()=>{
   voiceConsent=await declare();voice=await variant(voiceConsent,null,newFile,'VOICE');await withdraw(voiceConsent);
   bad(await deliver(newFile),'ARTIST_CONSENT_REQUIRED');assert.equal((await fetchMaterial(newFile)).status,409);
   voice=await variant(newConsent,voice.id,newFile,'VOICE');
  });
  await t.test('expiry or missing material fails closed without falling back to history',async()=>{
   const row=(await db.execute('SELECT data_json FROM artist_records WHERE id=?',[newConsent.id]))[0][0],original=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;
   const expired={...original,valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2020-02-01T00:00:00.000Z'};
   await db.execute('UPDATE artist_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(expired),digest(expired),newConsent.id]);
   try {bad(await deliver(newFile),'ARTIST_CONSENT_REQUIRED');}finally{await db.execute('UPDATE artist_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(original),digest(original),newConsent.id]);}
   await db.execute("UPDATE supply_assets SET current_status='FAILED' WHERE id=?",[newFile.id]);
   try {bad(await deliver(newFile),'PRIVATE_MATERIAL_NOT_READY');}finally{await db.execute("UPDATE supply_assets SET current_status='READY' WHERE id=?",[newFile.id]);}
  });
  await t.test('delivery contains only current explicitly authorized versions and keeps the old record',async()=>{
   const delivered=ok(await deliver(newFile));assert.equal(delivered.data.delivery.type,'DIGITAL_ARCHIVE');
   assert.deepEqual(delivered.data.delivery.archive.versions.map(v=>v.id),[newVersion.id,voice.id]);
   assert.equal(ok(await call('GET','/people/'+person.id+'/records/'+oldVersion.id)).data.consent_id,originalConsent.id);
   const info=ok(await call('GET','/people/'+person.id)).avatars.find(x=>x.id===avatar.id);assert.equal(info.data.archive_status,'DELIVERED');assert.equal(info.data.long_lived_model_status,'NOT_ENABLED');
  });
  await t.test('withdrawal during file transfer prevents response bytes from reaching the operator',async()=>{
   const guarded=require('../src/modules/works/assets').createSupplyAssets({db,repository:{assetAccess:(ctx,asset_id)=>repo.reviewAsset(ctx,{person_id:person.id,record_id:paid.service.id,asset_id})},storageFactory:()=>({getBuffer:async objectKey=>{await withdraw(newConsent);return bytes.get(objectKey);}})});
   await assert.rejects(guarded.download(reviewer.ctx,newFile.id),{code:'ARTIST_CONSENT_REQUIRED'});
   assert.equal(ok(await call('GET','/people/'+person.id+'/services/'+paid.service.id)).current_status,'DELIVERED');
   ok(await call('GET','/assets/'+newFile.id)); // Subject still owns the historical file; no false physical-deletion claim.
  });
 });
 await t.test('versioned updates reject stale changes and audit failure rolls back both data and request key',async()=>{
  const stale=await call('POST','/people/'+person.id+'/services/'+hosted.service.id+'/reminder',artist,{enabled:true},artist.personal_party_id,headers({object_version:1}));bad(stale,'VERSION_CONFLICT');
  const before=Number((await db.execute('SELECT COUNT(*) n FROM artist_records'))[0][0].n);
  await db.withConnection(c=>c.query("CREATE TRIGGER artist_audit_fail BEFORE INSERT ON artist_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'"));
  try{bad(await call('POST','/people/'+person.id+'/avatars',artist,{display_name:'must roll back'},artist.personal_party_id,headers()),'SERVICE_UNAVAILABLE');assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM artist_records'))[0][0].n),before);}finally{await db.withConnection(c=>c.query('DROP TRIGGER artist_audit_fail'));}
 });

 await t.test('creator identity is not agency identity; verified service result is tied to the request and recovery uses same key',async()=>{
  let attempts=0,seen=[];const provider={assertReady:async()=>{},readiness:async()=>({current_status:'SERVICE_READY',reason_code:null}),verify:async input=>{attempts++;seen.push(input.request_key);if(attempts===1)throw Object.assign(Error('synthetic lost response'),{code:'PROVIDER_OUTCOME_UNKNOWN',status:503});return {request_key:input.request_key,person_id:input.person_id,status:'VERIFIED',issuer:'synthetic-provider',subject_fingerprint:'a'.repeat(64),age_band:'ADULT',valid_until:until,evidence_ref:'synthetic:recover',liveness_verified:true,phone_verified:true};}};
  const app=createAccountApi({db,secret,artistIdentityProviderFactory:()=>provider}).listen(0,'127.0.0.1');await new Promise(r=>app.once('listening',r));const url='http://127.0.0.1:'+app.address().port+'/api/v1/artists/people/'+person.id+'/identity',k=key();
  try{for(const expected of [503,200]){const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+artist.token,'X-Acting-Party':artist.personal_party_id,'Content-Type':'application/json','Idempotency-Key':k},body:JSON.stringify({session_ref:'synthetic:verified-session'})});const value=await res.json();assert.equal(res.status,expected,JSON.stringify(value));fixtures.push({method:'POST',path:new URL(url).pathname,schema:expected===200?'ArtistRecordResponse':'ErrorResponse',value});}assert.equal(seen[0],seen[1]);}
  finally{await new Promise(r=>app.close(r));}
 });
 await t.test('concurrent duplicate avatar commands create one archive identifier',async()=>{
  const k=key(),body={display_name:'same concurrent request'};const both=await Promise.all([call('POST','/people/'+person.id+'/avatars',artist,body,artist.personal_party_id,headers(null,k)),call('POST','/people/'+person.id+'/avatars',artist,body,artist.personal_party_id,headers(null,k))]);assert.equal(ok(both[0]).id,ok(both[1]).id);assert.ok(ok(await call('GET','/people')).items.some(x=>x.id===person.id));
 });
 await t.test('only selected public preview bytes and attached reviewer evidence are downloadable',async()=>{
  async function read(url,user,party=null){const res=await fetch(base+url,{headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{})}});return {status:res.status,bytes:Buffer.from(await res.arrayBuffer()),cache:res.headers.get('cache-control')};}
  for(const [url,user,party] of [['/assets/'+material.id+'/content',artist,artist.personal_party_id],['/catalog/'+listing.id+'/assets/'+material.id+'/content',stranger,null],['/people/'+person.id+'/records/'+consent.id+'/assets/'+evidence.id+'/content',reviewer,null]]){const r=await read(url,user,party);assert.equal(r.status,200);assert.equal(r.bytes.toString(),'synthetic material only');assert.equal(r.cache,'no-store');}
  assert.equal((await read('/catalog/'+listing.id+'/assets/'+evidence.id+'/content',stranger)).status,404);
  assert.equal((await read('/people/'+person.id+'/records/'+consent.id+'/assets/'+evidence.id+'/content',stranger)).status,403);
 });
 await t.test('ranking listen reads authorized audio bytes before counting and deduplicates',async()=>{
 const audio=ok(await call('POST','/people/'+person.id+'/assets?purpose=AVATAR_MATERIAL&media_type=audio/wav',artist,Buffer.from('synthetic audio fixture bytes'),artist.personal_party_id,{...headers(),'Content-Type':'application/octet-stream'}));
 let audioListing=ok(await call('POST','/people/'+person.id+'/listings',artist,{avatar_id:avatar.id,listing:{display_name:'synthetic audio preview',city:'test-city',introduction:'synthetic',tags:['test'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[audio.id]}},artist.personal_party_id,headers()));audioListing=ok(await review(audioListing));
 const engagement=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal}),profile=await engagement.rankingProfile(artist.ctx,{party_id:artist.personal_party_id,person_id:person.id,city:'test-city',district:'test-district',category:'test-category',opt_in:true,operation_key:key()}),url=base.replace('/artists','/engagement')+'/profiles/'+profile.id+'/listen/'+audioListing.id+'/';
 for(let n=0;n<2;n++){const r=await fetch(url+audio.id+'?device_id='+stranger.account_id,{headers:{Authorization:'Bearer '+stranger.token,'Idempotency-Key':key()}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type').split(';')[0],'audio/wav');assert.equal(await r.text(),'synthetic audio fixture bytes');}
 assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='INTERACTION' AND parent_id=?",[profile.id]))[0][0].n),1);
 const denied=await fetch(url+evidence.id+'?device_id='+stranger.account_id,{headers:{Authorization:'Bearer '+stranger.token,'Idempotency-Key':key()}});assert.equal(denied.status,404);assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='INTERACTION' AND parent_id=?",[profile.id]))[0][0].n),1);
 });
 await t.test('renewal reminder can be cancelled; unpaid service cancellation requires cancelling its real order',async()=>{
  let h=ok(await call('POST','/people/'+person.id+'/services/'+hosted.service.id+'/reminder',artist,{enabled:true},artist.personal_party_id,headers(hosted.service)));h=ok(await call('POST','/people/'+person.id+'/services/'+h.id+'/reminder',artist,{enabled:false},artist.personal_party_id,headers(h)));assert.equal(h.data.renewal_reminder,false);assert.equal(h.data.auto_debit_enabled,false);
  const pending=await serviceOrder('AVATAR_HOSTING',{pay:false});bad(await call('POST','/people/'+person.id+'/services/'+pending.service.id+'/cancel',artist,{reason:'changed mind'},artist.personal_party_id,headers(pending.service)),'ARTIST_ORDER_CANCEL_OR_REFUND_REQUIRED');
  await trade.cancel(artist.ctx,{record_id:pending.order.id,party_id:artist.personal_party_id,expected_version:pending.order.object_version,reason:'synthetic cancel',operation_key:key()});
  assert.equal(ok(await call('POST','/people/'+person.id+'/services/'+pending.service.id+'/cancel',artist,{reason:'synthetic cancel'},artist.personal_party_id,headers(pending.service))).current_status,'CANCELLED');
 });
 await t.test('appeal records a challenge without silently reversing original decision or granting rights',async()=>{
  let next=ok(await call('POST','/people/'+person.id+'/listings',artist,{avatar_id:avatar.id,listing:{display_name:'second synthetic',city:'test',introduction:'test',tags:['test'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[material.id]}},artist.personal_party_id,headers()));
  next=ok(await call('POST','/people/'+person.id+'/records/'+next.id+'/reviews',reviewer,{decision:'REJECT',reason:'synthetic rejection'},null,headers(next)));
  const appeal=ok(await call('POST','/people/'+person.id+'/records/'+next.id+'/appeals',artist,{reason:'synthetic appeal',evidence_asset_ids:[evidence.id]},artist.personal_party_id,headers()));assert.equal(appeal.data.target_id,next.id);assert.equal(ok(await call('GET','/people/'+person.id+'/records/'+next.id)).current_status,'REJECTED');
 });
 await t.test('agency cannot claim person and only artist can authorize finite actions',async()=>{await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);relation=key();const data={valid_from:from,valid_until:until,accepted_by:artist.account_id};await db.execute("INSERT INTO gig_records(id,kind,owner_party_id,counterparty_id,created_by,current_status,data_json,data_sha256) VALUES (?,'RELATION',?,?,?,'ACTIVE',?,?)",[relation,org.party_id,artist.personal_party_id,agency.account_id,JSON.stringify(data),digest(data)]);const body={organization_party_id:org.party_id,relation_id:relation,actions:['READ_PROFILE','MANAGE_AVATARS','MANAGE_MATERIALS'],valid_from:from,valid_until:until,evidence_asset_ids:[evidence.id],terms:'synthetic scoped delegation'};bad(await call('POST','/people/'+person.id+'/delegations',agency,{delegation:body},org.party_id,headers()),'ARTIST_DELEGATION_REQUIRED');delegation=ok(await call('POST','/people/'+person.id+'/delegations',artist,{delegation:body},artist.personal_party_id,headers()));assert.equal(ok(await call('GET','/people/'+person.id,agency,undefined,org.party_id)).person.owner_party_id,artist.personal_party_id);bad(await call('POST','/people/'+person.id+'/delegations',artist,{delegation:body},artist.personal_party_id,headers()),'ARTIST_PRIMARY_AGENCY_EXISTS');bad(await call('GET','/assets/'+evidence.id,agency,undefined,org.party_id),'ARTIST_PERSONAL_CONFIRMATION_REQUIRED');});
 await t.test('agency upload stays artist-owned; withdrawal denies new and replayed agency operations',async()=>{const uploaded=ok(await upload('AVATAR_MATERIAL',agency,org.party_id));assert.equal(uploaded.owner_party_id,artist.personal_party_id);const op=key(),body={display_name:'agency managed avatar'};ok(await call('POST','/people/'+person.id+'/avatars',agency,body,org.party_id,headers(null,op)));delegation=ok(await call('POST','/people/'+person.id+'/records/'+delegation.id+'/withdrawals',artist,{reason:'end delegation'},artist.personal_party_id,headers(delegation)));bad(await call('GET','/assets/'+uploaded.id,agency,undefined,org.party_id),'ARTIST_DELEGATION_REQUIRED');bad(await call('POST','/people/'+person.id+'/avatars',agency,body,org.party_id,headers(null,op)),'ARTIST_DELEGATION_REQUIRED');ok(await call('GET','/assets/'+uploaded.id));});

 await t.test('expired hosting removes new listing eligibility but retains delivered archive and owned files',async()=>{
  const row=(await db.execute('SELECT data_json FROM artist_records WHERE id=?',[hosted.service.id]))[0][0];const original=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;const expired={...original,hosting_period:{valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2020-02-01T00:00:00.000Z'}};
  await db.execute('UPDATE artist_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(expired),digest(expired),hosted.service.id]);
  assert.equal(ok(await call('GET','/catalog',stranger,undefined,null)).items.length,0);ok(await call('GET','/assets/'+material.id));assert.equal(ok(await call('GET','/people/'+person.id)).avatars.find(x=>x.id===avatar.id).data.archive_status,'DELIVERED');
  await db.execute('UPDATE artist_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(original),digest(original),hosted.service.id]);
 });
 await t.test('withdrawing public consent hides directory immediately but keeps historical records and files',async()=>{consent=ok(await call('POST','/people/'+person.id+'/records/'+consent.id+'/withdrawals',artist,{reason:'withdraw new use'},artist.personal_party_id,headers(consent)));assert.equal(ok(await call('GET','/catalog',stranger,undefined,null)).items.length,0);await assert.rejects(db.withTransaction(tx=>require('../src/modules/artists/eligibility').checkAvatarUse(tx,{avatar_id:avatar.id,purpose:'PRIVATE_ARCHIVE',grantee_party_id:artist.personal_party_id})),{code:'ARTIST_CONSENT_REQUIRED'});ok(await call('GET','/assets/'+material.id));assert.equal(ok(await call('GET','/people/'+person.id+'/records/'+look.id)).current_status,'RECORDED');});

 await t.test('registered artist cannot bypass new identity/material rules through old supply entry',async()=>{
  const old=require('../src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal});await assert.rejects(old.createAvatar(artist.ctx,{party_id:artist.personal_party_id,display_name:'bypass',material_asset_ids:[material.id],operation_key:key()}),{code:'USE_ARTIST_AVATAR_FLOW'});
  await assert.rejects(old.reserveAsset(minor.ctx,{party_id:minor.personal_party_id,purpose:'AVATAR_MATERIAL',media_type:'text/plain',body:Buffer.from('not allowed'),operation_key:key()}),{code:'USE_ARTIST_MATERIAL_FLOW'});
  await assert.rejects(db.withTransaction(tx=>require('../src/modules/artists/eligibility').checkAvatarUse(tx,{avatar_id:key(),purpose:'NEW_GENERATION',grantee_party_id:artist.personal_party_id,requireLink:true})),{code:'ARTIST_VERIFIED_LINK_REQUIRED'});
 });
 await t.test('stored content tampering is rejected, not silently returned',async()=>{await db.execute("UPDATE artist_records SET data_sha256=? WHERE id=?",['0'.repeat(64),look.id]);bad(await call('GET','/people/'+person.id+'/records/'+look.id),'SERVICE_UNAVAILABLE');});
 const out=process.env.JX_ARTIST_HTTP_FIXTURES||path.resolve(__dirname,'../../../..','.local/artists-http-fixtures.json');if(out){await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));}
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
