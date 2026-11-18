'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context'),C=require('../src/modules/redemption/context');
test('reward remedy preserves one grant and all pending schedules across invalid binding',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');
 const name='jx_test_remedy_lifecycle_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'4'});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2,reviewer,outsider}=S,W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
  for(const u of [seller,outsider,reviewer])for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW','ENGAGEMENT_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:r11',reason:'isolated test only'});
  const descriptors=require('../src/http/redemption-routes'),fixtures=[];
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,u,input={}){
   const post=descriptors.posts.find(x=>x[1]===method),d=post||descriptors.gets.find(x=>x[1]===method);assert.ok(d);
   let route='/redemption'+d[0].replace(':record_id',input.record_id||'');const body=Object.fromEntries(d[2].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
   const headers={Authorization:'Bearer '+u.token,...input.party_id?{'X-Acting-Party':input.party_id}:{},...post?{'Content-Type':'application/json','Idempotency-Key':input.operation_key||key()}:{},...d[4]?{'If-Match':'"'+input.expected_version+'"'}:{}};
   if(!post&&Object.keys(body).length)route+='?'+new URLSearchParams(body);
   const response=await fetch(base+route,{method:post?'POST':'GET',headers,...post?{body:JSON.stringify(body)}:{}}),json=await response.json();fixtures.push({method:post?'POST':'GET',path:new URL(base+route).pathname,schema:response.status===200?'RedemptionResponse':'ErrorResponse',value:json});
   if(response.status!==200)throw Object.assign(new Error(json.error?.code||JSON.stringify(json)),{code:json.error?.code,status:response.status});return json.data;
  }
  const review=(r,u=reviewer,decision='APPROVE')=>call('reviewStock',u,{record_id:r.id,expected_version:r.object_version,decision,reason:'independent synthetic review'});
  const proof=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic inventory / fulfillment evidence; no real prize'),operation_key:key()});
  let walletRule=await W.createRule(outsider.ctx,{rule:{...require('./helpers/wallet-rule.cjs'),free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});walletRule=await W.reviewRule(reviewer.ctx,{record_id:walletRule.id,expected_version:walletRule.object_version,decision:'APPROVE',reason:'isolated synthetic rule',operation_key:key()});
  for(const u of [seller,buyer,buyer2])await W.open(u.ctx,{party_id:u.personal_party_id,rule_id:walletRule.id,rule_sha256:walletRule.content_sha256,operation_key:key()});
  const balance=u=>W.summary(u.ctx,{party_id:u.personal_party_id});
  const template={version:'synthetic-r11',source_ref:'synthetic:no-live-approval',title:'synthetic seven day exposure',kind:'EXPOSURE',valid_days:30,exchange_points:6000,capacity:10,available_until:'2099-01-01T00:00:00.000Z',terms:'synthetic scheduled exposure; service failure returns original points, original expiry retained',production:null,interview:null,exposure:{placement:'synthetic-slot',duration_days:7}};
  const stockInput=(v={})=>({party_id:seller.personal_party_id,template:{...template,...v},evidence_asset_ids:[proof.id]});
  const exchange=(stock,u=buyer,extra={})=>call('exchange',u,{party_id:u.personal_party_id,stock_id:stock.id,template_sha256:digest(stock.data.template),...extra});
  const get=(g,u=buyer)=>call('grant',u,{record_id:g.id,party_id:u.personal_party_id});
  async function patch(r,fields){const raw=(await db.execute('SELECT * FROM redemption_records WHERE id=?',[r.id]))[0][0],data={...A.parse(raw.data_json),...fields};await db.execute('UPDATE redemption_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),r.id]);}

  const E=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const profileInput={party_id:seller.personal_party_id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic',category:'synthetic',opt_in:true};
  const profile=await E.rankingProfile(seller.ctx,{...profileInput,operation_key:key()});
  async function interviewCast(){
   const repo=S.artists,person=seller.person,avatar=await repo.createAvatar(seller.ctx,{party_id:seller.personal_party_id,person_id:person.id,display_name:'synthetic interview avatar',operation_key:key()});
   const materialStore=require('../src/modules/works/assets').createSupplyAssets({db,repository:require('../src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});const material=await materialStore.upload(seller.ctx,{person_id:person.id,party_id:seller.personal_party_id,purpose:'AVATAR_MATERIAL',media_type:'text/plain',body:Buffer.from('synthetic material'),operation_key:key()});
   const consent=async purposes=>{let r=await repo.declareConsent(seller.ctx,{party_id:seller.personal_party_id,person_id:person.id,avatar_id:avatar.id,consent:{features:['FACE'],purposes,grantee_party_id:seller.personal_party_id,territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic scope',evidence_asset_ids:[S.evidence.id]},operation_key:key()});return repo.review(reviewer.ctx,{person_id:person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});};
   const personal=await consent(['PRIVATE_ARCHIVE']),production=await consent(['PROJECT_PRODUCTION']);
   const look=await repo.createVariant(seller.ctx,{party_id:seller.personal_party_id,person_id:person.id,avatar_id:avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'synthetic look',material_asset_ids:[material.id],consent_id:personal.id},operation_key:key()});
   const works=require('../src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal:S.resolvePrincipal});
   await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action:'SUPPLY_REVIEW_CONSENT',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:r11',reason:'isolated only'});
   let legacy=await works.createConsent(seller.ctx,{consent:{avatar_id:avatar.id,subject_party_id:seller.personal_party_id,features:['FACE'],purposes:['PRIVATE'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic interview consent',evidence_asset_ids:[S.evidence.id]},operation_key:key()});legacy=await works.reviewConsent(reviewer.ctx,{record_id:legacy.id,expected_version:legacy.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});
   const cast={person_id:person.id,avatar_id:avatar.id,supply_consent_id:legacy.id,artist_consent_ids:[production.id],look_version_id:look.id,voice_version_id:null,usage:'EXISTING_MATERIAL'};

   return {avatar,cast};
  }
  const interview=await interviewCast(),journeys=[];
  async function create(kind='EXPOSURE'){
   const extra=kind==='INTERVIEW'?{kind,valid_days:90,exposure:null,interview:{channel:'OPEN',project_ref:'synthetic',batch_ref:'synthetic',min_halo:1,purpose:'PRIVATE',territory:'CN',extension_days:30,fallback_points:300}}:{};
   const stock=await review(await call('createStock',seller,stockInput(extra)));
   let g=await exchange(stock,seller);
   g=await call('bind',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,person_id:seller.person.id,avatar_id:kind==='INTERVIEW'?interview.avatar.id:S.avatar.id,profile_id:kind==='INTERVIEW'?null:profile.id,cast:kind==='INTERVIEW'?interview.cast:null});
   await call('submitDeliveryEvidence',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,asset_id:proof.id,purpose:'SCHEDULE'});
   return g;
  }
  const propose=g=>{const start=Date.now()+3600000;return call('proposeDelivery',outsider,{record_id:g.id,expected_version:g.object_version,starts_at:new Date(start).toISOString(),ends_at:new Date(start+7*86400000).toISOString(),reference:'synthetic future slot',evidence_asset_id:proof.id});};
  const remedy=g=>call('requestRemedy',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,reason:'synthetic unavailable slot or binding'});
  const resolve=(c,decision,op=key(),u=reviewer)=>call('reviewRemedy',u,{record_id:c.id,expected_version:c.object_version,decision,reason:'synthetic independent remedy evidence',evidence_asset_id:proof.id,operation_key:op});
  const schedule=id=>db.withTransaction(tx=>C.load(tx,id,'SCHEDULE'));
  const approve=s=>call('reviewDelivery',reviewer,{record_id:s.id,expected_version:s.object_version,decision:'APPROVE',reason:'synthetic independent slot review'});
  const confirm=(g,accepted,op=key())=>call('acknowledge',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,accepted,operation_key:op});
  await t.test('return original points cancels the still-pending schedule atomically; rejection and replay cannot resurrect it',async()=>{
   const g=await create(),s=await propose(g),before=(await balance(seller)).available_points,c=await remedy(g),op=key();
   await assert.rejects(resolve(c,'RETURN_POINTS',key(),seller),{code:'SELF_REVIEW_FORBIDDEN'});
   await resolve(c,'RETURN_POINTS',op);await resolve(c,'RETURN_POINTS',op);
   assert.equal((await get(g,seller)).current_status,'POINTS_RETURNED');
   assert.equal((await schedule(s.id)).current_status,'CANCELLED');
   assert.equal((await balance(seller)).available_points,before+6000);
   await assert.rejects(approve(s),{code:'VERSION_CONFLICT'});await assert.rejects(approve(await schedule(s.id)),{code:'REVIEW_NOT_PENDING'});
   journeys.push({case:'pending_return',grant:g.id,schedule:s.id,remedy:c.id,points_returned:6000});
  });
  await t.test('one-time interview extension cancels old pending slot and permits a fresh schedule',async()=>{
   let g=await create('INTERVIEW');const s=await propose(g),before=(await balance(seller)).available_points,c=await remedy(g),op=key();
   await resolve(c,'EXTEND_ONCE',op);await resolve(c,'EXTEND_ONCE',op);
   g=await get(g,seller);assert.equal(g.current_status,'BOUND');assert.equal(g.data.extension_used,true);
   assert.equal((await schedule(s.id)).current_status,'CANCELLED');
   const next=await propose(g);assert.notEqual(next.id,s.id);await assert.rejects(approve(s),{code:'VERSION_CONFLICT'});await assert.rejects(approve(await schedule(s.id)),{code:'REVIEW_NOT_PENDING'});
   assert.equal((await balance(seller)).available_points,before);
   journeys.push({case:'pending_extend',grant:g.id,old_schedule:s.id,new_schedule:next.id,remedy:c.id});
  });
  await t.test('rejected remedy preserves pending slot; stale and changed commands cannot change the outcome',async()=>{
   const g=await create(),s=await propose(g),c=await remedy(g),before=(await balance(seller)).available_points,op=key();
   await assert.rejects(resolve({...c,object_version:c.object_version+1},'RETURN_POINTS'),{status:412});
   await resolve(c,'REJECT',op);await assert.rejects(resolve(c,'RETURN_POINTS',op),{code:'IDEMPOTENCY_CONFLICT'});
   assert.equal((await get(g,seller)).current_status,'BOUND');assert.equal((await schedule(s.id)).current_status,'IN_REVIEW');
   await approve(s);assert.equal((await get(g,seller)).current_status,'SCHEDULED');assert.equal((await balance(seller)).available_points,before);
   journeys.push({case:'rejection_preserves_slot',grant:g.id,schedule:s.id,remedy:c.id});
  });
  await t.test('withdrawn public participation blocks acceptance but permits declining the original future slot',async()=>{
   let g=await create();const s=await propose(g);await approve(s);g=await get(g,seller);
   await E.rankingProfile(seller.ctx,{...profileInput,opt_in:false,operation_key:key()});
   try{
    await assert.rejects(confirm(g,true),{code:'PUBLIC_ARTIST_NOT_AVAILABLE'});
    const op=key(),declined=await confirm(g,false,op);assert.equal(declined.current_status,'BOUND');
    assert.equal((await confirm(g,false,op)).object_version,declined.object_version);
    assert.equal((await schedule(s.id)).current_status,'DECLINED');
    await assert.rejects(propose(declined),{code:'PUBLIC_ARTIST_NOT_AVAILABLE'});
    const before=(await balance(seller)).available_points,c=await remedy(declined);await resolve(c,'RETURN_POINTS');
    assert.equal((await balance(seller)).available_points,before+6000);
    journeys.push({case:'invalid_binding_decline',grant:g.id,schedule:s.id,remedy:c.id});
   }finally{await E.rankingProfile(seller.ctx,{...profileInput,operation_key:key()});}
  });
  await t.test('confirmed but no longer public award cannot finish; remedy cancels its approved slot once',async()=>{
   let g=await create();const s=await propose(g);await approve(s);g=await confirm(await get(g,seller),true);
   const elapsed=Date.now();await patch(g,{delivery:{...g.data.delivery,starts_at:new Date(elapsed-8*86400000).toISOString(),ends_at:new Date(elapsed-86400000).toISOString()}});
   g=await get(g,seller);await E.rankingProfile(seller.ctx,{...profileInput,opt_in:false,operation_key:key()});
   try{
    await assert.rejects(call('finish',reviewer,{record_id:g.id,expected_version:g.object_version,outcome:'EXPOSURE_COMPLETED',reason:'must not claim restricted exposure',evidence_asset_id:proof.id}),{code:'PUBLIC_ARTIST_NOT_AVAILABLE'});
    const c=await remedy(g),before=(await balance(seller)).available_points,op=key();await resolve(c,'RETURN_POINTS',op);await resolve(c,'RETURN_POINTS',op);
    assert.equal((await schedule(s.id)).current_status,'CANCELLED');assert.equal((await balance(seller)).available_points,before+6000);
    journeys.push({case:'confirmed_invalid_binding_return',grant:g.id,schedule:s.id,remedy:c.id});
   }finally{await E.rankingProfile(seller.ctx,{...profileInput,operation_key:key()});}
  });

  await t.test('withdrawn interview production consent still permits refusal and remedy with a private own-record copy',async()=>{
   let g=await create('INTERVIEW');const s=await propose(g);await approve(s);g=await get(g,seller);
   const consent=await db.withTransaction(tx=>A.load(tx,interview.cast.artist_consent_ids[0],'CONSENT'));
   await S.artists.withdraw(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id,record_id:consent.id,expected_version:consent.object_version,reason:'synthetic production consent withdrawal',operation_key:key()});
   await assert.rejects(confirm(g,true),e=>e.status===409);
   g=await confirm(g,false);assert.equal((await schedule(s.id)).current_status,'DECLINED');
   const c=await remedy(g);await resolve(c,'RETURN_POINTS');g=await get(g,seller);assert.equal(g.current_status,'POINTS_RETURNED');
   const privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
   const own=await privacy.create(seller.ctx,{request:{type:'COPY',scopes:['TRANSACTIONS'],details:'synthetic same remedy copy'},operation_key:key()});
   const route='/privacy/requests/'+own.id+'/account-data?section=REWARD_FULFILLMENT&limit=100';
   const read=async who=>{const response=await fetch(base+route,{headers:{Authorization:'Bearer '+who.token}}),value=await response.json();fixtures.push({method:'GET',path:new URL(base+route).pathname,schema:response.ok?'PrivacyAccountCopyPageResponse':'ErrorResponse',value});return {status:response.status,value};};
   const copy=await read(seller);assert.equal(copy.status,200);
   assert.equal(copy.value.data.items.find(x=>x.id===s.id).current_status,'DECLINED');
   assert.equal(copy.value.data.items.find(x=>x.id===c.id).data.resolution.decision,'RETURN_POINTS');
   assert.ok(!JSON.stringify(copy.value).includes(proof.id));assert.ok(!JSON.stringify(copy.value).includes(reviewer.account_id));
   assert.equal((await read(buyer)).status,404);
   journeys.push({case:'withdrawn_interview_consent',grant:g.id,schedule:s.id,remedy:c.id,copy_request:own.id});
  });
  const output=path.resolve(__dirname,'../../../../.local');await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'reward-remedy-lifecycle-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.join(output,'reward-remedy-lifecycle-journey.json'),JSON.stringify({synthetic_only:true,journeys,limits:['actual loopback HTTP and disposable database','exchange grants reuse same fulfillment as lottery; not a new draw verification','historical due date is synthetic; no actual exposure or money','no frontend']},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
