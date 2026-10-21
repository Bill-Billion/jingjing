'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context'),C=require('../src/modules/redemption/context');
test('fixed redemption through actual HTTP and isolated MySQL transactions',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');
 const name='jx_test_redemption_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
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
  let stock,grant;
  await t.test('independent stock approval, private evidence and unauthorized queue rejected',async()=>{
   stock=await call('createStock',seller,stockInput());await assert.rejects(review(stock,seller),{code:'SELF_REVIEW_FORBIDDEN'});
   await assert.rejects(exchange(stock),{code:'REWARD_STOCK_UNAVAILABLE'});stock=await review(stock);
   await assert.rejects(call('queue',buyer,{kind:'STOCK'}),{code:'REDEMPTION_OPERATOR_FORBIDDEN'});
   const catalog=await call('catalog',buyer);assert.equal(catalog.items.length,1);assert.equal(catalog.items[0].evidence_asset_ids,undefined);
  });
  await t.test('repeated exchange spends once; changed key payload rejected; another user cannot read',async()=>{
   const operation_key=key();grant=await exchange(stock,buyer,{operation_key});assert.equal((await exchange(stock,buyer,{operation_key})).id,grant.id);assert.equal((await balance(buyer)).available_points,94000);
   await assert.rejects(exchange(stock,buyer,{operation_key,template_sha256:'0'.repeat(64)}),{code:'IDEMPOTENCY_CONFLICT'});
   await assert.rejects(get(grant,buyer2),{code:'REDEMPTION_NOT_FOUND'});assert.equal((await call('myGrants',buyer,{party_id:buyer.personal_party_id})).items.length,1);
  });
  await t.test('last inventory races: exactly one grant, one debit, no overselling',async()=>{
   const one=await review(await call('createStock',seller,stockInput({capacity:1}))),before=(await balance(buyer)).available_points;
   const results=await Promise.allSettled([exchange(one),exchange(one)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'REWARD_STOCK_UNAVAILABLE');assert.equal((await balance(buyer)).available_points,before-6000);
  });
  await t.test('insufficient balance and underage gate roll back grant and stock together',async()=>{
   const costly=await review(await call('createStock',seller,stockInput({exchange_points:1000000,capacity:1})));
   await assert.rejects(exchange(costly),{code:'WALLET_POINTS_INSUFFICIENT'});
   assert.equal((await call('catalog',buyer)).items.find(x=>x.id===costly.id).remaining,1);
   await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[buyer2.person.id]);await assert.rejects(exchange(stock,buyer2),{code:'VERIFIED_ADULT_REQUIRED'});await db.execute("UPDATE artist_people SET age_band='ADULT' WHERE id=?",[buyer2.person.id]);
  });
  await t.test('retired inventory prevents new exchange but preserves prior entitlement',async()=>{
   const current=(await call('queue',reviewer,{kind:'STOCK',limit:100})).items.find(x=>x.id===stock.id);await review(current,reviewer,'RETIRE');await assert.rejects(exchange(stock),{code:'REWARD_STOCK_UNAVAILABLE'});assert.equal((await get(grant)).current_status,'AVAILABLE');
  });
  await t.test('service failure refund returns original points exactly once',async()=>{
   const before=(await balance(buyer)).available_points;let remedy=await call('requestRemedy',buyer,{record_id:grant.id,party_id:buyer.personal_party_id,expected_version:grant.object_version,reason:'synthetic no slot available'});
   remedy=await call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'RETURN_POINTS',reason:'synthetic verified unfulfilled',evidence_asset_id:proof.id});assert.equal((await balance(buyer)).available_points,before+6000);assert.equal((await get(grant)).current_status,'POINTS_RETURNED');
   await assert.rejects(call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'RETURN_POINTS',reason:'again',evidence_asset_id:proof.id}),{code:'REVIEW_NOT_PENDING'});
  });
  await t.test('exposure binds real public artist, independently schedules and requires holder confirmation',async()=>{
   const s=await review(await call('createStock',seller,stockInput()));grant=await exchange(s,seller);
   const E=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal}),profile=await E.rankingProfile(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic',category:'synthetic',opt_in:true,operation_key:key()});
   await assert.rejects(call('bind',seller,{record_id:grant.id,party_id:seller.personal_party_id,expected_version:grant.object_version,person_id:buyer.person.id,avatar_id:S.avatar.id,profile_id:profile.id,cast:null}),{code:'REWARD_OWNER_CHANGED'});
   grant=await call('bind',seller,{record_id:grant.id,party_id:seller.personal_party_id,expected_version:grant.object_version,person_id:seller.person.id,avatar_id:S.avatar.id,profile_id:profile.id,cast:null});
   const starts_at=new Date(Date.now()+60000).toISOString(),ends_at=new Date(Date.parse(starts_at)+7*86400000).toISOString();let schedule=await call('proposeDelivery',outsider,{record_id:grant.id,expected_version:grant.object_version,starts_at,ends_at,reference:'synthetic placement receipt',evidence_asset_id:proof.id});
   await assert.rejects(call('reviewDelivery',outsider,{record_id:schedule.id,expected_version:schedule.object_version,decision:'APPROVE',reason:'self'}),{code:'SELF_REVIEW_FORBIDDEN'});
   await call('reviewDelivery',reviewer,{record_id:schedule.id,expected_version:schedule.object_version,decision:'APPROVE',reason:'synthetic independent slot review'});
   grant=await get(grant,seller);assert.equal((await call('exposures',buyer,{city:'synthetic-city'})).items.length,0);
   grant=await call('acknowledge',seller,{record_id:grant.id,party_id:seller.personal_party_id,expected_version:grant.object_version,accepted:true});
   await assert.rejects(call('finish',outsider,{record_id:grant.id,expected_version:grant.object_version,outcome:'EXPOSURE_COMPLETED',reason:'too early',evidence_asset_id:proof.id}),{code:'REWARD_DELIVERY_NOT_DUE'});
   await patch(grant,{delivery:{...grant.data.delivery,starts_at:new Date(Date.now()-60000).toISOString()}});
   assert.equal((await call('exposures',buyer,{city:'synthetic-city'})).items.length,1);
   await E.rankingProfile(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic',category:'synthetic',opt_in:false,operation_key:key()});assert.equal((await call('exposures',buyer,{city:'synthetic-city'})).items.length,0);
  });

  await t.test('fulfilled exposure records proof and cannot be redeemed twice',async()=>{
   const E=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});await E.rankingProfile(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic',category:'synthetic',opt_in:true,operation_key:key()});
   await patch(grant,{delivery:{...grant.data.delivery,starts_at:new Date(Date.now()-8*86400000).toISOString(),ends_at:new Date(Date.now()-86400000).toISOString()}});
   grant=await get(grant,seller);grant=await call('finish',reviewer,{record_id:grant.id,expected_version:grant.object_version,outcome:'EXPOSURE_COMPLETED',reason:'synthetic evidence verified',evidence_asset_id:proof.id});assert.equal(grant.current_status,'FULFILLED');assert.equal(grant.data.performance_rights_granted,false);
   await assert.rejects(call('finish',reviewer,{record_id:grant.id,expected_version:grant.object_version,outcome:'EXPOSURE_COMPLETED',reason:'duplicate',evidence_asset_id:proof.id}),{code:'REWARD_DELIVERY_NOT_DUE'});
  });
  await t.test('verified production credit gets correct price; unrelated existing stock video cannot authorize template',async()=>{
   const credit={...template,kind:'PRODUCTION_CREDIT',valid_days:30,production:{face_minor:5000,minimum_minor:50000,spec_ids:[S.spec.id]},exposure:null};
   const bad=await call('createStock',seller,stockInput(credit));await assert.rejects(review(bad),{code:'REWARD_SPEC_NOT_AVAILABLE'});
   let spec=await S.trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'synthetic custom service',provider_party_id:seller.personal_party_id,line_kind:'PRODUCTION',unit_minor:50000,currency:'CNY',specification:{version:'synthetic',service_tier:'synthetic',sample_seconds:0,final_seconds:10,revision_limit:1,deliverables:['synthetic service'],terms:'not a live product'},product_profile:{version:'V5',type:'PRIVATE_CUSTOMIZATION'},operation_key:key()});spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic independent product',operation_key:key()});
   const good=await review(await call('createStock',seller,stockInput({...credit,production:{...credit.production,spec_ids:[spec.id]}})));const g=await exchange(good);assert.equal(g.data.template.exchange_points,6000);assert.equal(g.data.template.production.face_minor,5000);assert.equal(g.current_status,'AVAILABLE');
   await patch(g,{expires_at:'2020-01-01T00:00:00.000Z'});assert.equal((await get(g)).effective_status,'EXPIRED');
  });
  await t.test('interview belongs to self, requires authorized materials, extension once and actual interview result never grants role',async()=>{
   const repo=S.artists,person=seller.person,avatar=await repo.createAvatar(seller.ctx,{party_id:seller.personal_party_id,person_id:person.id,display_name:'synthetic interview avatar',operation_key:key()});
   const materialStore=require('../src/modules/works/assets').createSupplyAssets({db,repository:require('../src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});const material=await materialStore.upload(seller.ctx,{person_id:person.id,party_id:seller.personal_party_id,purpose:'AVATAR_MATERIAL',media_type:'text/plain',body:Buffer.from('synthetic material'),operation_key:key()});
   const consent=async purposes=>{let r=await repo.declareConsent(seller.ctx,{party_id:seller.personal_party_id,person_id:person.id,avatar_id:avatar.id,consent:{features:['FACE'],purposes,grantee_party_id:seller.personal_party_id,territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic scope',evidence_asset_ids:[S.evidence.id]},operation_key:key()});return repo.review(reviewer.ctx,{person_id:person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});};
   const personal=await consent(['PRIVATE_ARCHIVE']),production=await consent(['PROJECT_PRODUCTION']);
   const look=await repo.createVariant(seller.ctx,{party_id:seller.personal_party_id,person_id:person.id,avatar_id:avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'synthetic look',material_asset_ids:[material.id],consent_id:personal.id},operation_key:key()});
   const works=require('../src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal:S.resolvePrincipal});
   await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action:'SUPPLY_REVIEW_CONSENT',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:r11',reason:'isolated only'});
   let legacy=await works.createConsent(seller.ctx,{consent:{avatar_id:avatar.id,subject_party_id:seller.personal_party_id,features:['FACE'],purposes:['PRIVATE'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic interview consent',evidence_asset_ids:[S.evidence.id]},operation_key:key()});legacy=await works.reviewConsent(reviewer.ctx,{record_id:legacy.id,expected_version:legacy.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});
   const cast={person_id:person.id,avatar_id:avatar.id,supply_consent_id:legacy.id,artist_consent_ids:[production.id],look_version_id:look.id,voice_version_id:null,usage:'EXISTING_MATERIAL'};
   const stock=await review(await call('createStock',seller,stockInput({kind:'INTERVIEW',valid_days:90,exposure:null,interview:{channel:'OPEN',project_ref:'synthetic production',batch_ref:'synthetic batch',min_halo:1,purpose:'PRIVATE',territory:'CN',extension_days:30,fallback_points:300}})));let g=await exchange(stock,seller);
   await assert.rejects(call('bind',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,person_id:person.id,avatar_id:avatar.id,cast:{...cast,artist_consent_ids:[]},profile_id:null}),{code:'INVALID_CUSTOMIZATION_CAST'});
   g=await call('bind',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,person_id:person.id,avatar_id:avatar.id,cast,profile_id:null});
   let remedy=await call('requestRemedy',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,reason:'synthetic no matching batch'});await call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'EXTEND_ONCE',reason:'synthetic published extension',evidence_asset_id:proof.id});g=await get(g,seller);assert.equal(g.data.extension_used,true);
   remedy=await call('requestRemedy',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,reason:'synthetic still unavailable'});await assert.rejects(call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'EXTEND_ONCE',reason:'cannot extend twice',evidence_asset_id:proof.id}),{code:'REWARD_EXTENSION_NOT_AVAILABLE'});await call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'REJECT',reason:'synthetic batch available now',evidence_asset_id:proof.id});g=await get(g,seller);
   const starts_at=new Date(Date.now()+60000).toISOString(),ends_at=new Date(Date.now()+120000).toISOString();const schedule=await call('proposeDelivery',outsider,{record_id:g.id,expected_version:g.object_version,starts_at,ends_at,reference:'synthetic actual batch appointment',evidence_asset_id:proof.id});await call('reviewDelivery',reviewer,{record_id:schedule.id,expected_version:schedule.object_version,decision:'APPROVE',reason:'synthetic independent slot approval'});g=await get(g,seller);g=await call('acknowledge',seller,{record_id:g.id,party_id:seller.personal_party_id,expected_version:g.object_version,accepted:true});
   await patch(g,{delivery:{...g.data.delivery,starts_at:new Date(Date.now()-120000).toISOString(),ends_at:new Date(Date.now()-60000).toISOString()}});g=await get(g,seller);g=await call('finish',reviewer,{record_id:g.id,expected_version:g.object_version,outcome:'NOT_SELECTED',reason:'synthetic assessed, no role granted',evidence_asset_id:proof.id});assert.equal(g.current_status,'FULFILLED');assert.equal(g.data.performance_rights_granted,false);
   let blocked=await exchange(stock,seller);await db.execute("UPDATE artist_records SET current_status='WITHDRAWN' WHERE id=?",[production.id]);await assert.rejects(call('bind',seller,{record_id:blocked.id,party_id:seller.personal_party_id,expected_version:blocked.object_version,person_id:person.id,avatar_id:avatar.id,cast,profile_id:null}),{code:'ARTIST_CONSENT_REQUIRED'});
  });

  await t.test('points pending reversal blocks new exchange; remedy clears original debt before any available balance',async()=>{
   const stock=await review(await call('createStock',seller,stockInput()));const g=await exchange(stock,buyer2),Wc=require('../src/modules/wallet/context');
   let lot=await db.withTransaction(async tx=>(await Wc.rows(tx,buyer2.personal_party_id,'EARNING'))[0]);
   const data={...lot.data,pending_shortfall:6000,reversed:94000};await db.execute("UPDATE wallet_records SET current_status='REVERSAL_PENDING',data_json=?,data_sha256=? WHERE id=?",[JSON.stringify(data),digest(data),lot.id]);
   await assert.rejects(exchange(stock,buyer2),{code:'POINTS_REVERSAL_PENDING'});
   const remedy=await call('requestRemedy',buyer2,{record_id:g.id,party_id:buyer2.personal_party_id,expected_version:g.object_version,reason:'synthetic unavailable after original purchase refund'});await call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'RETURN_POINTS',reason:'synthetic return against original debt',evidence_asset_id:proof.id});
   lot=await db.withTransaction(tx=>Wc.load(tx,lot.id,'EARNING'));assert.equal(lot.data.pending_shortfall,0);assert.equal(lot.data.reversed,100000);assert.equal(lot.data.spent,0);assert.equal((await balance(buyer2)).available_points,0);
  });
  await t.test('returning expired original points does not mint a fresh year of validity',async()=>{
   const stock=await review(await call('createStock',seller,stockInput())),g=await exchange(stock),Wc=require('../src/modules/wallet/context');
   let lot=await db.withTransaction(async tx=>(await Wc.rows(tx,buyer.personal_party_id,'EARNING'))[0]);const data={...lot.data,expires_at:'2020-01-01T00:00:00.000Z'};
   await db.execute('UPDATE wallet_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),lot.id]);
   const remedy=await call('requestRemedy',buyer,{record_id:g.id,party_id:buyer.personal_party_id,expected_version:g.object_version,reason:'synthetic expired original points'});await call('reviewRemedy',reviewer,{record_id:remedy.id,expected_version:remedy.object_version,decision:'RETURN_POINTS',reason:'synthetic original batch return',evidence_asset_id:proof.id});
   lot=await db.withTransaction(tx=>Wc.load(tx,lot.id,'EARNING'));assert.equal(lot.data.expires_at,data.expires_at);assert.equal((await balance(buyer)).available_points,0);
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/redemption-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
