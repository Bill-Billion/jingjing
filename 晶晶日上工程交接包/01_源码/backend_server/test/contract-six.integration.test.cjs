'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest,createRuleContent}=require('../src/modules/governance/content');
test('20261029 contract rights tools use real isolated transactions and authenticated HTTP',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 const old=process.env.ACCEPTANCE_CONTRACT_POLICY,oldClock=process.env.PRIVACY_CLOSURE_POLICY;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,reviewer,outsider,buyer2}=S;
 const grants=require('../src/modules/governance/operator-access').maintainOperatorGrant;
 for(const u of [reviewer,outsider])for(const action of ['SUPPORT_HANDLE','PRIVACY_HANDLE','PRIVACY_REVIEW'])await grants(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:contract-six',reason:'isolated test only'});
 const evidence=async u=>S.supply.upload(u.ctx,{party_id:u.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('SYNTHETIC private evidence '+u.account_id),operation_key:key()});
 const be=await evidence(buyer),oe=await evidence(outsider),re=await evidence(reviewer);
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
 async function call(method,url,user,body,{party=null,version=null,operation=key()}={}){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{},...version?{'If-Match':'"'+version+'"'}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':operation}:{}},...body===undefined?{}:{body:JSON.stringify(body)}});const json=r.headers.get('content-type')?.includes('json');if(!json)return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};const value=await r.json();fixtures.push({method,path:new URL(base+url).pathname,schema:r.ok?(url.includes('/infringement/')?'InfringementResponse':url.includes('/guardians/')?'GuardianResponse':url.includes('/privacy/')?'PrivacyClosureClockResponse':'StockResponse'):'ErrorResponse',value});return {status:r.status,...value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const err=(r,code)=>{assert.equal(r.error?.code,code,JSON.stringify(r));};
 const rule=async(rule_key,terms)=>{const id=key(),c=createRuleContent({id,rule_key,version:'synthetic-v1',terms});await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[id,rule_key,c.version,JSON.stringify(c),'2020-01-01 00:00:00',reviewer.account_id]);return id;};
 let listing=await S.listing();
 await t.test('48h policy starts at original order creation, paid files only; old 72h snapshots remain',async()=>{
  const legacyOrder=await S.checkout(listing,buyer2);
  process.env.ACCEPTANCE_CONTRACT_POLICY='CONTRACT_20261029';
  assert(!(await S.stock.catalog(buyer.ctx,{})).items.some(x=>x.id===listing.id));
  await assert.rejects(S.stock.offer(buyer.ctx,{record_id:listing.id}),{code:'ACCEPTANCE_CONTRACT_MISMATCH'});
  await S.payment(legacyOrder,buyer2);const oldPurchase=await S.stock.purchased(buyer2.ctx,{party_id:buyer2.personal_party_id,order_id:legacyOrder.id});assert.equal(oldPurchase.data.license.acceptance_hours,72);assert.equal(oldPurchase.data.job_id,null);
  const specification=structuredClone(S.spec.data.specification);specification.stock_license.acceptance_hours=48;specification.stock_license.acceptance_policy='CONTRACT_20261029';
  let spec=await S.trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic 48h order',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:100,currency:'CNY',specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});
  spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic independent',operation_key:key()});await S.publishSales(seller.personal_party_id,spec.id);
  let fresh=await S.stock.create(seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});fresh=await S.reviewListing(fresh,'RIGHTS');fresh=await S.reviewListing(fresh,'CONTENT');
  const order=await S.checkout(fresh);let purchase=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});assert.equal(purchase.data.job_id,null);
  await S.payment(order);purchase=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});assert.equal(Date.parse(purchase.data.deadline_at)-Date.parse(purchase.data.acceptance_started_at),48*3600000);assert.equal(purchase.data.acceptance_started_at,order.data.contract.created_at);assert(purchase.data.job_id);assert.equal(purchase.data.accepted_at,null);
  delete process.env.ACCEPTANCE_CONTRACT_POLICY;
 });
 await t.test('notice/counter-notice protects evidence, freezes access and independently restores only this hold',async()=>{
  let c=ok(await call('POST','/infringement/cases',buyer,{target_kind:'STOCK_LISTING',target_id:listing.id,statement:'SYNTHETIC claim; private contact stays secret',contact:'SYNTHETIC private contact',evidence_asset_ids:[be.id]},{party:buyer.personal_party_id}));
  const original=c.id;
  assert.equal((await call('GET','/infringement/operations/cases',reviewer)).status,200);
  assert.equal((await call('GET','/infringement/operations/cases/'+c.id,reviewer)).status,200);
  assert.equal((await call('GET','/infringement/operations/cases/'+c.id+'/files/'+be.id,reviewer)).status,200);
  assert.equal((await call('GET','/infringement/cases/'+c.id+'/files/'+be.id,buyer,undefined,{party:buyer.personal_party_id})).status,200);

  err(await call('GET','/infringement/cases/'+c.id,seller,undefined,{party:seller.personal_party_id}),'INFRINGEMENT_NOT_FOUND');
  const act=async(user,action,extra={},ops=true)=>{const url='/infringement/'+(ops?'operations/':'')+'cases/'+c.id+'/actions';c=ok(await call('POST',url,user,{action,reason:'SYNTHETIC internal private reason',...extra},{party:ops?null:user.personal_party_id,version:c.object_version}));return c;};
  await act(reviewer,'REQUEST_INFO',{reason:'请补充权属证明'});
  assert.equal(ok(await call('GET','/infringement/cases/'+c.id,buyer,undefined,{party:buyer.personal_party_id})).information_request.reason,'请补充权属证明');
  await act(buyer,'SUPPLEMENT',{statement:'SYNTHETIC supplemented notice',evidence_asset_ids:[be.id]},false);
  await act(reviewer,'FREEZE');await assert.rejects(S.stock.offer(buyer.ctx,{record_id:listing.id}),{code:'CONTENT_RESTRICTED'});
  await act(reviewer,'DELIVER_NOTICE',{statement:'SYNTHETIC redacted claim',disclosed_asset_ids:[]});
  let publicCase=ok(await call('GET','/infringement/cases/'+c.id,seller,undefined,{party:seller.personal_party_id}));assert.equal(publicCase.notice.contact,undefined);assert(!JSON.stringify(publicCase).includes('internal private reason'));assert.deepEqual(publicCase.notice.evidence_asset_ids,[]);
  err(await call('GET','/infringement/cases/'+c.id+'/files/'+be.id,seller,undefined,{party:seller.personal_party_id}),'INFRINGEMENT_NOT_FOUND');
  await act(seller,'ACK_DELIVERY',{},false);assert(c.deliveries.notice.read_at);
  await act(seller,'COUNTER',{statement:'SYNTHETIC response',contact:'secret respondent',evidence_asset_ids:[S.evidence.id]},false);
  publicCase=ok(await call('GET','/infringement/cases/'+c.id,buyer,undefined,{party:buyer.personal_party_id}));assert.equal(publicCase.counter,null);
  await act(reviewer,'DELIVER_COUNTER',{statement:'SYNTHETIC redacted response',disclosed_asset_ids:[S.evidence.id]});
  assert.equal((await call('GET','/infringement/cases/'+c.id+'/files/'+S.evidence.id,buyer,undefined,{party:buyer.personal_party_id})).status,200);
  await act(reviewer,'PROPOSE',{decision:'RESTORE'});
  err(await call('POST','/infringement/operations/cases/'+c.id+'/actions',reviewer,{action:'REVIEW',decision:'APPROVE',reason:'self'},{version:c.object_version}),'INDEPENDENT_RIGHTS_REVIEW_REQUIRED');
  const second=ok(await call('POST','/infringement/cases',buyer,{target_kind:'STOCK_LISTING',target_id:listing.id,statement:'SYNTHETIC separate case',contact:'private',evidence_asset_ids:[be.id]},{party:buyer.personal_party_id}));
  ok(await call('POST','/infringement/operations/cases/'+second.id+'/actions',reviewer,{action:'FREEZE',reason:'separate basis'},{version:second.object_version}));
  await act(outsider,'REVIEW',{decision:'APPROVE'});assert.equal(c.restriction_active,false);assert.equal(c.id,original);
  await assert.rejects(S.stock.offer(buyer.ctx,{record_id:listing.id}),{code:'CONTENT_RESTRICTED'});
  assert((ok(await call('GET','/infringement/cases',buyer,undefined,{party:buyer.personal_party_id}))).items.length===2);
  // Complete the second complaint withdrawal through the same independent review.
  c=ok(await call('GET','/infringement/cases/'+second.id,buyer,undefined,{party:buyer.personal_party_id}));
  await act(buyer,'WITHDRAW',{},false);await act(reviewer,'PROPOSE',{decision:'RESTORE'});await act(outsider,'REVIEW',{decision:'APPROVE'});
  assert.equal((await S.stock.offer(buyer.ctx,{record_id:listing.id})).id,listing.id);
 });
 await t.test('closure reply deadline and verified execution deadline remain distinct; extensions need independent evidence',async()=>{
  const privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const request=await privacy.create(buyer.ctx,{request:{type:'CLOSE_ACCOUNT',scopes:['ALL'],details:'SYNTHETIC closure'},operation_key:key()});
  let c=ok(await call('GET','/privacy/requests/'+request.id+'/closure-clock',buyer));assert.equal(c.status,'NOT_VERIFIED');
  const propose=async(kind,due_on=null)=>{c=ok(await call('POST','/privacy/operations/requests/'+request.id+'/closure-clock/proposals',reviewer,{kind,reason:'SYNTHETIC verified identity and ownership',due_on,evidence_asset_ids:[re.id]},{version:c.object_version}));};
  const review=async()=>{c=ok(await call('POST','/privacy/operations/requests/'+request.id+'/closure-clock/reviews',outsider,{decision:'APPROVE',reason:'Independent synthetic check'},{version:c.object_version}));};
  await propose('VERIFY');
  assert.equal(ok(await call('GET','/privacy/operations/requests/'+request.id+'/closure-clock',reviewer)).status,'VERIFICATION_PENDING');
  assert.equal(ok(await call('GET','/privacy/operations/closure-clocks?filter=PENDING',reviewer)).items.length,1);

  err(await call('POST','/privacy/operations/requests/'+request.id+'/closure-clock/reviews',reviewer,{decision:'APPROVE',reason:'self'},{version:c.object_version}),'INDEPENDENT_CLOSURE_REVIEW_REQUIRED');
  await review();assert.equal(c.status,'TRACKING');assert(c.verified_at);assert.equal(c.response_due_on,request.response_due_on);const original=c.original_due_on;
  assert.equal(ok(await call('GET','/privacy/operations/closure-clocks?filter=OVERDUE',reviewer)).items.length,0);
  const A=require('../src/modules/artists/context'),actualNow=A.now;A.now=async()=>'2090-01-01T04:00:00.000Z';
  try{assert.equal(ok(await call('GET','/privacy/operations/closure-clocks?filter=OVERDUE',reviewer)).items.length,1);}finally{A.now=actualNow;}

  err(await call('POST','/privacy/operations/requests/'+request.id+'/closure-clock/proposals',reviewer,{kind:'COMPLETE',reason:'not actually closed',due_on:null,evidence_asset_ids:[re.id]},{version:c.object_version}),'ACCOUNT_CLOSURE_NOT_EXECUTED');
  err(await call('POST','/privacy/operations/requests/'+request.id+'/closure-clock/proposals',reviewer,{kind:'EXTEND',reason:'bad date',due_on:'2099-02-30',evidence_asset_ids:[re.id]},{version:c.object_version}),'INVALID_EXTENSION_DATE');
  await propose('EXTEND','2099-02-28');await review();assert.equal(c.original_due_on,original);assert.equal(c.extensions.length,1);assert.equal(c.due_on,'2099-02-28');
  const strangers=await call('GET','/privacy/requests/'+request.id+'/closure-clock',seller);err(strangers,'PRIVACY_REQUEST_NOT_FOUND');
 });
 await t.test('new referral rates enforce 10-15 percent without rewriting historical five-percent rules',async()=>{
  for(const u of [reviewer,outsider])await grants(db,{account_id:u.account_id,action:'ENGAGEMENT_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:referral',reason:'isolated test'});
  const R=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal}),oldRule=require('./helpers/engagement-rule.cjs');
  let historical=await R.createRule(outsider.ctx,{rule:oldRule,operation_key:key()});
  historical=await R.reviewRule(reviewer.ctx,{record_id:historical.id,expected_version:historical.object_version,decision:'APPROVE',reason:'synthetic old rule',operation_key:key()});
  const old=process.env.REFERRAL_CONTRACT_POLICY;process.env.REFERRAL_CONTRACT_POLICY='CONTRACT_20261029';
  try{
   await assert.rejects(R.createRule(outsider.ctx,{rule:oldRule,operation_key:key()}),{code:'REFERRAL_CONTRACT_POLICY_REQUIRED'});
   for(const rate of [0,500,1600])await assert.rejects(R.createRule(outsider.ctx,{rule:{...oldRule,referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:rate,AUDITION:rate,CUSTOMIZATION:rate,COMMERCIAL:rate}},operation_key:key()}),{code:'REFERRAL_CONTRACT_RATE_MISMATCH'});
   for(const rate of [1000,1500]){let r=await R.createRule(outsider.ctx,{rule:{...oldRule,referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:rate,AUDITION:rate,CUSTOMIZATION:rate,COMMERCIAL:rate}},operation_key:key()});r=await R.reviewRule(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic new rule',operation_key:key()});assert.equal(r.current_status,'EFFECTIVE');}
   assert.equal((await R.read(reviewer.ctx,{record_id:historical.id})).data.rule.referral_bps.STOCK,500);
  }finally{if(old===undefined)delete process.env.REFERRAL_CONTRACT_POLICY;else process.env.REFERRAL_CONTRACT_POLICY=old;}
 });
 await t.test('new audition clock starts on reviewed delivery; actual material availability still gates timeout',async()=>{
  const Q=await require('./helpers/auditions-seed.cjs').seedAuditions(db),R=Q.auditions;
  const id=key(),content=createRuleContent({id,rule_key:'audition.contract.synthetic',version:'1',terms:{audition:{...Q.rules,acceptance_policy:'CONTRACT_20261029'},marketplace_finance:{model:'V5_TWO_LAYER',product_type:'AUDITION',fee_base:'NET_PAID',platform_party_id:Q.outsider.personal_party_id,platform_bps:2200,referral_bps:1000,rounding:'HALF_UP_PLATFORM_REMAINDER'}}});
  await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[id,content.rule_key,'1',JSON.stringify(content),'2020-01-01 00:00:00',Q.reviewer.account_id]);
  process.env.ACCEPTANCE_CONTRACT_POLICY='CONTRACT_20261029';
  try{
   await assert.rejects(R.createOffer(Q.seller.ctx,{party_id:Q.seller.personal_party_id,offer:Q.offer,operation_key:key()}),{code:'ACCEPTANCE_CONTRACT_MISMATCH'});
   let offer=await R.createOffer(Q.seller.ctx,{party_id:Q.seller.personal_party_id,offer:{...Q.offer,rule_id:id},operation_key:key()});
   offer=await R.reviewOffer(Q.reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
   let r=await R.book(Q.buyer.ctx,{party_id:Q.buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:Q.appointment,operation_key:key()});
   r=await R.reviewBooking(Q.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'synthetic',operation_key:key()});
   const o=await Q.trade.auditionCheckout(Q.buyer.ctx,{party_id:Q.buyer.personal_party_id,booking_id:r.id,booking_sha256:r.content_sha256,operation_key:key()});await Q.payment(o);
   r=await R.read(Q.buyer.ctx,{record_id:r.id,party_id:Q.buyer.personal_party_id});
   r=await R.decide(Q.seller.ctx,{record_id:r.id,party_id:Q.seller.personal_party_id,expected_version:r.object_version,decision:'ACCEPT',reason:'synthetic',operation_key:key()});
   const d={...r.data,appointment:{...r.data.appointment,starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2020-01-01T01:00:00.000Z'}};
   await db.execute('UPDATE audition_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(d),digest(d),r.id]);
   r=await R.travel(Q.seller.ctx,{record_id:r.id,party_id:Q.seller.personal_party_id,expected_version:r.object_version,action:'ARRIVE',evidence_asset_ids:[Q.arrival.id],operation_key:key()});
   r=await R.deliver(Q.seller.ctx,{record_id:r.id,party_id:Q.seller.personal_party_id,expected_version:r.object_version,delivery:Q.delivery,operation_key:key()});assert.equal(r.data.job_id,null);
   r=await R.reviewDelivery(Q.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',checks:{content_reviewed:true,files_viewable:true,consent_verified:true},reason:'synthetic',operation_key:key()});
   assert.equal(Date.parse(r.data.deadline_at)-Date.parse(r.data.acceptance_started_at),48*3600000);assert.equal(r.data.receipt_at,null);
   const token=key(),job={id:r.data.job_id,payload_ref:r.id,lease_owner:'synthetic-worker',lease_token:token};
   await db.execute("UPDATE platform_jobs SET status='RUNNING',lease_owner=?,lease_token=?,lease_until=TIMESTAMPADD(SECOND,60,CURRENT_TIMESTAMP(6)) WHERE id=?",[job.lease_owner,token,job.id]);
   await assert.rejects(R.finishTimeout(job,true),{code:'AUDITION_ACCEPTANCE_NOT_DUE'});
   const due={...r.data,deadline_at:'2020-01-01T00:00:00.000Z'};await db.execute('UPDATE audition_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(due),digest(due),r.id]);
   r=await R.finishTimeout(job,false);assert.equal(r.current_status,'DELIVERED');assert.equal(r.data.fulfilled_at,null);assert.equal(r.data.job_id,null);
  }finally{delete process.env.ACCEPTANCE_CONTRACT_POLICY;}
 });
 await t.test('guardian controls verify three parties, block actual minor transactions, isolate private data and run reviewed refunds',async()=>{
  // A historical synthetic payment is made before marking this account as a minor.
  const order=await S.checkout(listing);const paid=await S.payment(order);
  await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[buyer.person.id]);
  const ruleId=await rule('guardian.protection',{guardian_protection:{version:'CONTRACT_20261029',daily_minutes:30,rest_minutes:15,single_minor:1000,daily_minor:2000,night_start:22,night_end:8,terms:'SYNTHETIC reviewed limits, not a client approved numeric default'}});
  let link=ok(await call('POST','/guardians/links',seller,{child_account_id:buyer.account_id,relationship:'SYNTHETIC guardian',evidence_asset_ids:[S.evidence.id],rule_id:ruleId,valid_until:'2099-01-01T00:00:00.000Z'}));
  const decide=async(u,decision,ops=false,extra={})=>{link=ok(await call('POST','/guardians/'+(ops?'operations/':'')+'records/'+link.id+'/decisions',u,{decision,reason:'SYNTHETIC verified relationship',...extra},{version:link.object_version}));};
  err(await call('GET','/guardians/records/'+link.id,buyer2),'GUARDIAN_NOT_FOUND');
  await decide(buyer,'ACCEPT');await decide(reviewer,'APPROVE',true,{age_band:'AGE_14_17',identity_checked:true,relationship_checked:true});
  assert.equal((await call('GET','/guardians/records',seller)).status,200);
  assert.equal((await call('GET','/guardians/operations/records',reviewer)).status,200);
  assert.equal((await call('GET','/guardians/operations/records/'+link.id,reviewer)).status,200);
  assert.equal((await call('GET','/guardians/links/'+link.id+'/information?category=PROFILE',seller)).status,200);
  assert.notEqual((await call('GET','/guardians/links/'+link.id+'/information?category=PRIVATE_STORY',seller)).status,200);
  const view=ok(await call('GET','/guardians/records/'+link.id,buyer));assert.equal(view.data.evidence_asset_ids,undefined);
  const A=require('../src/modules/artists/context'),now=A.now;A.now=async()=> '2026-11-02T04:00:00.000Z';
  try{
   const poolOld=process.env.GUARDIAN_CONTENT_POOL_ENABLED;
   const op=key(),session=ok(await call('POST','/guardians/links/'+link.id+'/sessions',buyer,{}, {operation:op}));
   assert.equal(session.seconds_reserved,60);assert.deepEqual(ok(await call('POST','/guardians/links/'+link.id+'/sessions',buyer,{}, {operation:op})),session);
   err(await call('GET','/stock/catalog',buyer),'MINOR_CONTENT_POOL_NOT_ENABLED');
   const poolPath='/guardians/links/'+link.id+'/content';
   err(await call('GET',poolPath,buyer),'MINOR_CONTENT_POOL_NOT_ENABLED');
   await rule('guardian.content-pool',{guardian_content_pool:{version:'CONTRACT_20261029',terms:'SYNTHETIC reviewed child-suitable preview only',items:[{listing_id:listing.id,title:'Synthetic reviewed preview',suitability_reviewed:true}]}});
   process.env.GUARDIAN_CONTENT_POOL_ENABLED='true';
   try{
    const pool=ok(await call('GET',poolPath,buyer));assert.equal(pool.items.length,1);assert.equal(pool.real_purchases_enabled,false);
    const preview=await call('GET',poolPath+'/'+listing.id+'/preview',buyer);assert.equal(preview.status,200);assert.equal(require('node:crypto').createHash('sha256').update(preview.bytes).digest('hex'),S.preview.content_sha256);
    err(await call('GET',poolPath+'/'+key()+'/preview',buyer),'GUARDIAN_CONTENT_NOT_FOUND');
    err(await call('GET',poolPath,buyer2),'GUARDIAN_NOT_FOUND');
   }finally{if(poolOld===undefined)delete process.env.GUARDIAN_CONTENT_POOL_ENABLED;else process.env.GUARDIAN_CONTENT_POOL_ENABLED=poolOld;}

   err(await call('POST','/trade/quotes',buyer,{}, {party:buyer.personal_party_id}),'MINOR_REAL_SERVICE_NOT_ENABLED');
   const consent=ok(await call('POST','/guardians/links/'+link.id+'/spending-consents',seller,{amount_minor:100,purpose:'SYNTHETIC proposed purchase'}));assert.equal(consent.data.real_payment_allowed,false);
   err(await call('POST','/guardians/links/'+link.id+'/spending-consents',seller,{amount_minor:1001,purpose:'over limit'}),'MINOR_SPEND_NOT_ALLOWED');
   const usage=ok(await call('GET','/guardians/links/'+link.id+'/usage',seller));assert.equal(usage.spend_reserved_minor,100);
   link=ok(await call('PUT','/guardians/links/'+link.id+'/controls',seller,{controls:{enabled:false,daily_minutes:10,single_minor:100,daily_minor:200}},{version:link.object_version}));
   err(await call('GET','/stock/catalog',buyer),'GUARDIAN_DISABLED');
   assert.equal((await call('GET','/guardians/records/'+link.id,buyer)).status,200);
  }finally{A.now=now;}
  const query=ok(await call('POST','/guardians/links/'+link.id+'/privacy-requests',seller,{type:'QUERY',details:'SYNTHETIC query'}));
  assert.equal(ok(await call('GET','/guardians/records/'+query.id,seller)).data.actual_privacy_status,'RECEIVED');
  let refund=ok(await call('POST','/guardians/links/'+link.id+'/refund-requests',seller,{payment_id:paid.payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'SYNTHETIC unauthorized minor purchase',evidence_asset_ids:[S.evidence.id]}));
  err(await call('POST','/guardians/records/'+refund.id+'/refund',seller,{}, {version:refund.object_version}),'GUARDIAN_REFUND_APPROVAL_REQUIRED');
  refund=ok(await call('POST','/guardians/operations/records/'+refund.id+'/decisions',reviewer,{decision:'APPROVE',identity_checked:true,relationship_checked:true,reason:'SYNTHETIC independent minor refund verification'},{version:refund.object_version}));
  refund=ok(await call('POST','/guardians/records/'+refund.id+'/refund',seller,{}, {version:refund.object_version}));assert(refund.data.refund_id);assert.equal(refund.current_status,'REFUND_REQUESTED');
  assert.equal(ok(await call('GET','/guardians/records/'+refund.id,seller)).data.actual_refund_status,'REQUESTED');
  // Guardian controls do not mint a success payment/refund.
  const [[money]]=await db.execute('SELECT current_status FROM trade_records WHERE id=?',[refund.data.refund_id]);assert.equal(money.current_status,'REQUESTED');
  const real=await S.trade.read(reviewer.ctx,{record_id:refund.data.refund_id});
  const checked=await S.trade.review(reviewer.ctx,{record_id:real.id,expected_version:real.object_version,decision:'APPROVED',reason:'Independent original payment refund review',operation_key:key()});
  await S.trade.claim(reviewer.ctx,checked.id,null,'REFUND');await S.trade.applyRefund(checked.id,{...checked.data,refund_id:checked.id,status:'SUCCEEDED'});
  const finalRefund=ok(await call('GET','/guardians/records/'+refund.id,seller));assert.equal(finalRefund.data.actual_refund_status,'SUCCEEDED');
  const purchase=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});assert.equal(purchase.data.status,'REVOKED');

  await decide(seller,'REVOKE');
  err(await call('GET','/guardians/links/'+link.id+'/information?category=PROFILE',seller),'GUARDIAN_LINK_NOT_ACTIVE');
 });
 const path=require('node:path').resolve(__dirname,'../../../..','.local/contract-six-http-fixtures.json');await fs.mkdir(require('node:path').dirname(path),{recursive:true});await fs.writeFile(path,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(old===undefined)delete process.env.ACCEPTANCE_CONTRACT_POLICY;else process.env.ACCEPTANCE_CONTRACT_POLICY=old;if(oldClock===undefined)delete process.env.PRIVACY_CLOSURE_POLICY;else process.env.PRIVACY_CLOSURE_POLICY=oldClock;if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
