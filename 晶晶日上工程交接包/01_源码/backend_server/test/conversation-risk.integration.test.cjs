'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
for(const domain of ['COMMERCIAL','AUDITION'])test(domain+' message rejection is audited without content or recipient notification',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_message_risk_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const cases=[],journey=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=domain==='COMMERCIAL'?await require('./helpers/notices-seed.cjs').seedNotices(db):await require('./helpers/auditions-seed.cjs').seedAuditions(db),{buyer,seller,reviewer,outsider}=S;
  let source,order,trade,open;
  if(domain==='COMMERCIAL'){
   const original=await S.commercialQuote();trade=original.trade;order=await trade.accept(buyer.ctx,{record_id:original.quote.id,party_id:buyer.personal_party_id,expected_version:original.quote.object_version,quote_sha256:original.quote.content_sha256,operation_key:key()});source=order.id;
   open=async()=>{const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'synthetic-risk'},p=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'full',operation_key:key()},config);await trade.applyPayment({...config,payment_id:p.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic.'+p.id,status:'SUCCEEDED',product_id:null,app_account_token:null});};
  }else{
   trade=S.trade;let offer=await S.auditions.createOffer(seller.ctx,{party_id:seller.personal_party_id,offer:S.offer,operation_key:key()});offer=await S.auditions.reviewOffer(reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});
   let booking=await S.auditions.book(buyer.ctx,{party_id:buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:S.appointment,operation_key:key()});booking=await S.auditions.reviewBooking(reviewer.ctx,{record_id:booking.id,expected_version:booking.object_version,decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'synthetic',operation_key:key()});order=await trade.auditionCheckout(buyer.ctx,{party_id:buyer.personal_party_id,booking_id:booking.id,booking_sha256:booking.content_sha256,operation_key:key()});source=booking.id;
   open=async()=>{await S.payment(order);booking=await S.auditions.read(buyer.ctx,{record_id:source,party_id:buyer.personal_party_id});await S.auditions.decide(seller.ctx,{record_id:source,party_id:seller.personal_party_id,expected_version:booking.object_version,decision:'ACCEPT',reason:'synthetic accepted',operation_key:key()});};
  }
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',root=domain==='COMMERCIAL'?'/gigs/orders/'+source+'/conversation':'/auditions/bookings/'+source;
  async function call(method,url,{user=buyer,party=user?.personal_party_id,body,op=key(),version}={}){const res=await fetch(base+url,{method,headers:{...user?{Authorization:'Bearer '+user.token}:{},...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{},...version!==undefined?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}}),value=await res.json();cases.push({method,path:new URL(base+url).pathname,schema:res.ok?(url.startsWith('/privacy/')?'PrivacyAccountCopyPageResponse':url.includes('/message-risk')?'ConversationRiskEventsResponse':domain==='COMMERCIAL'?'CommercialConversationResponse':'AuditionResponse'):'ErrorResponse',value});return {status:res.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r));
  const send=(body,op=key(),user=buyer)=>call('POST',root+'/messages',{user,body:{kind:'TEXT',body},op});
  const risk=(options={},suffix='')=>call('GET',root+'/message-risk'+suffix,{user:reviewer,party:null,...options});
  const count=async(table,where='',args=[])=>Number((await db.execute('SELECT COUNT(*) n FROM '+table+' '+where,args))[0][0].n);
  const blocked='https://offsite.example/private-'+key();let blockedKey=key(),eventId,normal;
  await t.test('unpaid and unauthorized attempts cannot create fabricated risk evidence',async()=>{
   assert.equal((await send(blocked)).status,409);assert.equal(await count('conversation_message_attempts'),0);await open();
   assert.notEqual((await send(blocked,key(),outsider)).status,200);assert.equal(await count('conversation_message_attempts'),0);
   assert.equal((await call('POST',root+'/messages',{user:null,body:{kind:'TEXT',body:blocked}})).status,401);assert.equal(await count('conversation_message_attempts'),0);
  });
  await t.test('concurrent refused send records one event and no text, message or recipient event',async()=>{
   // Initialize the commercial conversation before counting its existing lifecycle event.
   ok(await call('GET',root+'/messages'));const events=await count('ops_events');
   for(const r of await Promise.all([send(blocked,blockedKey),send(blocked,blockedKey),send(blocked,blockedKey)]))bad(r,'MESSAGE_REQUIRES_MODERATION');
   assert.equal(await count('conversation_message_attempts',"WHERE outcome='REJECTED'"),1);assert.equal(await count('ops_events'),events);
   assert.equal(ok(await call('GET',root+'/messages')).items.length,0);
   const rows=(await db.execute('SELECT * FROM conversation_message_attempts'))[0];assert.ok(!JSON.stringify(rows).includes(blocked));const page=ok(await risk());assert.equal(page.content_retained,false);assert.equal(page.items.length,1);eventId=page.items[0].id;assert.equal(page.items[0].reason_code,'OFF_PLATFORM_CONTACT_OR_PAYMENT');assert.ok(!JSON.stringify(page).includes(blocked));assert.ok(!JSON.stringify(page).includes('fingerprint'));
   journey.push({name:'same refused request has one minimal audit and no public message or notification',result:'PASS',domain,source_id:source,risk_id:eventId});
  });
  await t.test('the refused key cannot send changed text; successful retries also cannot change payload or revive a legacy key',async()=>{
   bad(await send('ordinary changed payload',blockedKey),'IDEMPOTENCY_CONFLICT');
   const op=key(),body='Please confirm the agreed public venue';const results=await Promise.all([send(body,op),send(body,op)]);normal=ok(results[0]);assert.equal(ok(results[1]).id,normal.id);bad(await send(blocked,op),'IDEMPOTENCY_CONFLICT');
   await db.execute("DELETE FROM conversation_message_attempts WHERE domain=? AND outcome='ALLOWED'",[domain]);bad(await send(blocked,op),'IDEMPOTENCY_CONFLICT');assert.equal(ok(await send(body,op)).id,normal.id);
   const notificationDomain=domain==='COMMERCIAL'?'GIG_MESSAGE':'AUDITION_MESSAGE';assert.equal(await count('ops_events','WHERE domain=? AND record_id=?',[notificationDomain,normal.id]),1);
   journey.push({name:'same key cannot switch rejected/accepted payload; original accepted retry has one message event',result:'PASS',domain,source_id:source,message_id:normal.id});
  });
  await t.test('audit write failure rolls back and the original request can retry once',async()=>{
   const op=key();await db.withConnection(c=>c.query("CREATE TRIGGER risk_attempt_abort BEFORE INSERT ON conversation_message_attempts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic risk rollback'"));
   try{assert.equal((await send(blocked+'-second',op)).status,503);assert.equal(await count('conversation_message_attempts',"WHERE outcome='REJECTED'"),1);}finally{await db.withConnection(c=>c.query('DROP TRIGGER risk_attempt_abort'));}
   bad(await send(blocked+'-second',op),'MESSAGE_REQUIRES_MODERATION');bad(await send(blocked+'-second',op),'MESSAGE_REQUIRES_MODERATION');assert.equal(await count('conversation_message_attempts',"WHERE outcome='REJECTED'"),2);
  });
  await t.test('independent audit permission, exact cursor and revocation prevent deep-link leakage',async()=>{
   assert.equal((await risk({user:buyer})).status,403);assert.equal((await risk({user:reviewer,party:reviewer.personal_party_id})).status,400);
   const p=ok(await risk({},'?limit=1'));assert.equal(p.items.length,1);assert.ok(p.next_cursor);const q=ok(await risk({},'?limit=1&cursor='+p.next_cursor));assert.equal(q.items.length,1);assert.equal(q.next_cursor,null);
   for(const suffix of ['?limit=0','?limit=101','?limit=1&limit=2','?extra=1','?cursor='+key()])assert.equal((await risk({},suffix)).status,400);
   const action=domain==='COMMERCIAL'?'GIG_REVIEW':'AUDITION_REVIEW';const row=(await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[reviewer.account_id,action]))[0][0];const args={account_id:reviewer.account_id,action,expires_at:null,authority_ref:'synthetic-risk',reason:'isolated revocation'};const G=require('../src/modules/governance/operator-access');await G.maintainOperatorGrant(db,{...args,enabled:false,expected_version:row.object_version});try{assert.equal((await risk()).status,403);}finally{await G.maintainOperatorGrant(db,{...args,enabled:true,expected_version:row.object_version+1});}
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);try{assert.equal((await send(blocked,blockedKey)).status,403);assert.notEqual((await call('GET',root+'/messages')).status,200);}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);}
   journey.push({name:'risk audit and old message deep links recheck independent role and current membership',result:'PASS',domain,source_id:source});
  });
  await t.test('same privacy request returns only the actors own decision metadata',async()=>{
   const R=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
   const make=(u,scopes)=>R.create(u.ctx,{request:{type:'COPY',scopes,details:'synthetic message decisions copy'},operation_key:key()});
   const mine=await make(buyer,['PROFILE']),other=await make(seller,['PROFILE']),narrow=await make(buyer,['CONTRACTS']);
   const url=r=>'/privacy/requests/'+r.id+'/account-data?section=MESSAGE_DECISIONS';
   const page=ok(await call('GET',url(mine),{party:null}));assert.equal(page.items.length,3);assert.ok(page.items.every(x=>x.actor_account_id===buyer.account_id));assert.ok(!JSON.stringify(page).includes(blocked));assert.ok(!JSON.stringify(page).includes('fingerprint'));assert.equal(page.request_completion,'NOT_CONFIRMED');
   assert.equal(ok(await call('GET',url(other),{user:seller,party:null})).items.length,0);assert.notEqual((await call('GET',url(mine),{user:seller,party:null})).status,200);bad(await call('GET',url(narrow),{party:null}),'PRIVACY_ACTION_SCOPE_MISMATCH');
   const first=ok(await call('GET',url(mine)+'&limit=1',{party:null}));assert.ok(first.next_cursor);assert.equal(ok(await call('GET',url(mine)+'&limit=1&cursor='+first.next_cursor,{party:null})).items.length,1);
   assert.equal((await call('GET',url(other)+'&cursor='+first.next_cursor,{user:seller,party:null})).status,400);
   journey.push({name:'own decision metadata belongs to the same scoped privacy request; no refused body',result:'PASS',request_id:mine.id});
  });
  await t.test('message read reuses the existing notification event without exposing refused content',async()=>{
   const body=domain==='COMMERCIAL'?{message_id:normal.id}:{message_ids:[normal.id]},url=domain==='COMMERCIAL'?root+'/read':root+'/messages/read';ok(await call('POST',url,{user:seller,body}));
   const events=(await db.execute('SELECT id FROM ops_events WHERE domain=? AND record_id=?',[domain==='COMMERCIAL'?'GIG_MESSAGE':'AUDITION_MESSAGE',normal.id]))[0];assert.equal(events.length,1);assert.equal(await count('ops_reads','WHERE event_id=? AND account_id=? AND party_id=?',[events[0].id,seller.account_id,seller.personal_party_id]),1);
   const messages=ok(await call('GET',root+'/messages',{user:seller}));assert.equal(messages.items.length,1);assert.ok(!JSON.stringify(messages).includes(blocked));
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local/conversation-risk'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/conversation-risk/'+domain+'.json'),JSON.stringify({synthetic_only:true,cases},null,2));await fs.writeFile(path.resolve(__dirname,'../../../../.local/conversation-risk/'+domain+'-records.json'),JSON.stringify({result:'PASS',checks:journey,limits:['Synthetic paid records and users, no real payment or moderation provider','No frontend or device notification delivery','Risk records retain decision metadata only, not refused content']},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
