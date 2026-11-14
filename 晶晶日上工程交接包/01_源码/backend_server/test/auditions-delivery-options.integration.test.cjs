'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('booking scoped delivery options preserve person recipient and live permissions',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_delivery_options_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,created=false;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/auditions-seed.cjs').seedAuditions(db),{seller,buyer,reviewer,outsider,auditions:R}=S;
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let offer=await R.createOffer(seller.ctx,{party_id:seller.personal_party_id,offer:{...S.offer,mode:'ONLINE_MATERIALS'},operation_key:key()});offer=await R.reviewOffer(reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});
  let booking=await R.book(buyer.ctx,{party_id:buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:{...S.appointment,mode:'ONLINE_MATERIALS'},operation_key:key()});
  booking=await R.reviewBooking(reviewer.ctx,{record_id:booking.id,expected_version:booking.object_version,decision:'APPROVE',reason:'synthetic',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},operation_key:key()});
  const order=await S.trade.auditionCheckout(buyer.ctx,{party_id:buyer.personal_party_id,booking_id:booking.id,booking_sha256:booking.content_sha256,operation_key:key()});
  async function query(kind,u=seller,extra='',party=u.personal_party_id){const url='/api/v1/auditions/bookings/'+booking.id+'/delivery-options?kind='+kind+extra,res=await fetch('http://127.0.0.1:'+server.address().port+url,{headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{}}}),value=await res.json();fixtures.push({method:'GET',path:url.split('?')[0],schema:res.status===200?'AuditionDeliveryOptionsResponse':'ErrorResponse',value});return {status:res.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.error));return r.data;};
  await t.test('unpaid booking cannot browse delivery materials',async()=>assert.equal((await query('PHOTO')).error.code,'AUDITION_NOT_DELIVERABLE'));
  await S.payment(order);booking=await R.read(buyer.ctx,{record_id:booking.id,party_id:buyer.personal_party_id});booking=await R.decide(seller.ctx,{record_id:booking.id,party_id:seller.personal_party_id,expected_version:booking.object_version,decision:'ACCEPT',reason:'synthetic',operation_key:key()});
  await t.test('six linked photos paginate once; video separate; no storage paths or private evidence',async()=>{
   let cursor='',all=[];do{const d=ok(await query('PHOTO',seller,'&limit=2'+(cursor?'&cursor='+cursor:'')));assert.equal(d.person_id,seller.person.id);all.push(...d.items);cursor=d.next_cursor;}while(cursor);
   assert.deepEqual(all.map(x=>x.id).sort(),[...S.delivery.photos].sort());assert.equal(new Set(all.map(x=>x.id)).size,6);
   assert.deepEqual(ok(await query('VIDEO')).items.map(x=>x.id),S.delivery.videos);
   assert(all.every(x=>!('object_key'in x)&&!('created_by'in x)&&x.media_type==='image/jpeg'));
  });
  await t.test('consent matches booking person avatar purpose and recipient; foreign and other-avatar consents excluded',async()=>{
   for(const change of [{grantee_party_id:outsider.personal_party_id},{avatar_id:(await S.artists.createAvatar(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,display_name:'other synthetic avatar',operation_key:key()})).id}]){
    const {avatar_id=S.avatar.id,...terms}=change;let c=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id,consent:{features:['FACE'],purposes:['AUDITION_SAMPLES'],grantee_party_id:buyer.personal_party_id,territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic negative fixture',evidence_asset_ids:[S.evidence.id],...terms},operation_key:key()});await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:c.id,expected_version:c.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});
   }
   const d=ok(await query('CONSENT'));assert.deepEqual(d.items.map(x=>x.id),[S.sampleConsent.id]);assert(!JSON.stringify(d).includes(S.evidence.id));
  });
  await t.test('buyer operator stranger spoofed identity and missing identity cannot enumerate',async()=>{
   for(const [u,p] of [[buyer,buyer.personal_party_id],[reviewer,reviewer.personal_party_id],[outsider,outsider.personal_party_id],[buyer,seller.personal_party_id],[seller,null]])assert.notEqual((await query('PHOTO',u,'',p)).status,200);
  });
  await t.test('invalid types limits and caller-selected person rejected',async()=>{
   for(const [kind,extra] of [['ALL',''],['PHOTO','&limit=101'],['PHOTO','&cursor=bad'],['PHOTO','&person_id='+buyer.person.id]])assert.equal((await query(kind,seller,extra)).status,400);
  });
  await t.test('unlinked same-owner upload and another persons linked upload excluded',async()=>{
   await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'image/jpeg',body:Buffer.from('synthetic unlinked'),operation_key:key()});
   const assets=require('../src/modules/works/assets').createSupplyAssets({db,repository:require('../src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});
   const other=await assets.upload(buyer.ctx,{person_id:buyer.person.id,party_id:buyer.personal_party_id,purpose:'AVATAR_MATERIAL',media_type:'image/jpeg',body:Buffer.from('synthetic other owner'),operation_key:key()});
   const d=ok(await query('PHOTO'));assert.equal(d.items.length,6);assert(!d.items.some(x=>x.id===other.id));
  });
  let privacy,privacyRequest,erasure;
  await t.test('unused linked material can be reviewed for deletion before any audition delivery uses it',async()=>{
   const {createRuleContent}=require('../src/modules/governance/content');
   async function rule(rule_key,terms){const id=key(),c=createRuleContent({id,rule_key,version:id,terms});await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[id,rule_key,id,JSON.stringify(c),'2020-01-01 00:00:00',reviewer.account_id,'EFFECTIVE']);return id;}
   const retention=await rule('privacy.retention',{privacy_retention:{categories:[{scope:'TRANSACTIONS',basis:'synthetic pending delivery review',max_review_days:30}]}});
   const policy=await rule('privacy.execution',{privacy_execution:{actions:['FILE_ERASURE'],basis:'synthetic not formal policy',contact_reference:'synthetic:contact',backup_strategy:'REAPPLY_ERASURE_REGISTER_BEFORE_ACCESS',retention_rule_id:retention}});
   for(const action of ['PRIVACY_HANDLE','PRIVACY_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:review',reason:'isolated test'});
   privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal,storageFactory:()=>({...S.storageFactory(),identity:{provider_code:'aliyun-oss',environment:'SANDBOX'},inspect:()=>({implemented:true,configured:true,config_revision:'synthetic-audition'})})});
   privacyRequest=await privacy.create(seller.ctx,{request:{type:'DELETE',scopes:['ARTIST_MATERIALS'],details:'Synthetic unused original material'},operation_key:key()});
   const before=await privacy.fileOptions(seller.ctx,{request_id:privacyRequest.id,kind:'FILE',limit:100});assert.equal(before.items.find(x=>x.id===S.delivery.photos[0]).disposition,'READY_FOR_REVIEW');
   erasure=await privacy.proposeExecution(seller.ctx,{request_id:privacyRequest.id,expected_version:privacyRequest.object_version,action:'FILE_ERASURE',target_id:S.delivery.photos[0],policy_rule_id:policy,details:{reason:'Synthetic deletion before delivery'},operations:false,operation_key:key()});
   erasure=await privacy.reviewExecution(reviewer.ctx,{request_id:privacyRequest.id,execution_id:erasure.id,expected_version:erasure.object_version,proposal_sha256:erasure.proposal_sha256,decision:'APPROVE',reason:'Synthetic independent review',scope_verified:true,retention_verified:true,operation_key:key()});
  });
  await t.test('actual submission still validates chosen options and cannot reuse selection during review',async()=>{
   booking=await R.deliver(seller.ctx,{record_id:booking.id,party_id:seller.personal_party_id,expected_version:booking.object_version,delivery:S.delivery,operation_key:key()});assert.equal(booking.current_status,'DELIVERY_REVIEW');assert.equal((await query('PHOTO')).error.code,'AUDITION_NOT_DELIVERABLE');
  });
  await t.test('submitted audition materials disclose retention reason without private booking data',async()=>{
   const d=await privacy.fileOptions(seller.ctx,{request_id:privacyRequest.id,kind:'FILE',limit:100});
   for(const asset of [...S.delivery.photos,...S.delivery.videos]){const item=d.items.find(x=>x.id===asset);assert.equal(item.disposition,'DEPENDENCY_REVIEW');assert(item.dependencies.some(x=>x.code==='AUDITION_DELIVERY'));}
   assert(!JSON.stringify(d).includes(booking.id));assert(!JSON.stringify(d).includes(buyer.account_id));
  });
  await t.test('prior approved deletion is refused after delivery references the asset and leaves the file intact',async()=>{
   await assert.rejects(privacy.execute(seller.ctx,{request_id:privacyRequest.id,execution_id:erasure.id,expected_version:erasure.object_version,confirmed:true,operations:false,operation_key:key()}),e=>e.code==='PRIVACY_FILE_RETENTION_REVIEW_REQUIRED');
   assert.equal((await db.execute('SELECT current_status FROM supply_assets WHERE id=?',[S.delivery.photos[0]]))[0][0].current_status,'READY');
   assert.equal((await privacy.executions(seller.ctx,{request_id:privacyRequest.id,limit:20})).items[0].current_status,'APPROVED');
   assert.equal((await db.execute('SELECT COUNT(*) n FROM privacy_tombstones WHERE asset_id=?',[S.delivery.photos[0]]))[0][0].n,'0');
  });
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();
  const out=path.resolve(__dirname,'../../../../.local/audition-delivery-options-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }
});
