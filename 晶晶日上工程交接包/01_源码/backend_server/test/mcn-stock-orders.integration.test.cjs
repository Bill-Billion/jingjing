'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('MCN actual multi-artist stock sale, assignment, batch and same-order refund',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_mcn_stock_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db,{marketplaceFinance:{}}),{seller,buyer,buyer2:coartist,reviewer,outsider}=S;
  const parties=require('../src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal}),G=require('../src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const org=await parties.createOrganization(outsider.ctx,{display_name:'Synthetic multi-artist agency',operation_key:key()});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]); // Synthetic reviewed organizational qualification, not real certification.
  const employees=[];for(let n=0;n<2;n++){
   const ctx={};S.principals.set(ctx,{subject_ref:'synthetic:'+key()});const u={ctx,...await parties.registerAccount(ctx,{display_name:'Synthetic employee '+n}),token:randomBytes(32).toString('base64url')};
   const auth=require('../src/modules/auth/repository').createAuthRepository(db,{secret:S.secret});await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',u.token),u.account_id]);
   const invite=await parties.inviteMember(outsider.ctx,{party_id:org.party_id,invitee_account_id:u.account_id,expires_at:'2099-01-01T00:00:00.000Z',operation_key:key()});await parties.respondInvitation(ctx,{party_id:org.party_id,invitation_id:invite.invitation_id,expected_version:1,decision:'ACCEPT',operation_key:key()});employees.push(u);
  }
  const [staff,other]=employees,relations=[],delegations=[];
  const evidence=await S.supply.upload(outsider.ctx,{party_id:org.party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic direct MCN terms'),operation_key:key()});
  for(const artist of [seller,coartist]){
   let r=await G.relation(outsider.ctx,{party_id:org.party_id,artist_party_id:artist.personal_party_id,scope:'COMMERCIAL',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:false,terms:'Synthetic direct cooperation',commission:{platform_bps:1800,mcn_bps:0},v5_terms:{version:'V5',supply_share_bps:2000},evidence_asset_ids:[evidence.id],operation_key:key()});
   r=await G.relationDecision(artist.ctx,{party_id:artist.personal_party_id,record_id:r.id,expected_version:r.object_version,decision:'ACCEPT',reason:'Artist accepts',operation_key:key()});relations.push(r);
   const proof=await S.supply.upload(artist.ctx,{party_id:artist.personal_party_id,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic explicit artist delegation'),operation_key:key()});
   const d=await S.artists.createDelegation(artist.ctx,{party_id:artist.personal_party_id,person_id:artist.person.id,delegation:{organization_party_id:org.party_id,relation_id:r.id,actions:['READ_PROFILE','SUBMIT_LISTING'],valid_from:r.data.valid_from,valid_until:r.data.valid_until,evidence_asset_ids:[proof.id],terms:'Synthetic listing management and profile access'},operation_key:key()});delegations.push(d);
  }
  const proof=await S.supply.upload(coartist.ctx,{party_id:coartist.personal_party_id,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic co-artist stock rights'),operation_key:key()});
  let halo=await S.artists.requestHalo(coartist.ctx,{person_id:coartist.person.id,party_id:coartist.personal_party_id,level:1,ownership_promise:true,evidence_asset_ids:[proof.id],service_id:null,operation_key:key()});
  await S.artists.review(reviewer.ctx,{person_id:coartist.person.id,record_id:halo.id,expected_version:halo.object_version,decision:'APPROVE',reason:'Independent synthetic ownership statement',operation_key:key()});
  // Manual certification is an isolated pre-reviewed fixture; authorization and transactions below use actual business methods/HTTP.
  const talent={...S.talentData};await db.execute("INSERT INTO artist_records(id,person_id,kind,created_by,current_status,data_json,data_sha256) VALUES (?,?,'HALO',?,'APPROVED',?,?)",[key(),coartist.person.id,reviewer.account_id,JSON.stringify(talent),digest(talent)]);
  const avatar=await S.artists.createAvatar(coartist.ctx,{party_id:coartist.personal_party_id,person_id:coartist.person.id,display_name:'Synthetic co-artist avatar',operation_key:key()});
  let consent=await S.artists.declareConsent(coartist.ctx,{party_id:coartist.personal_party_id,person_id:coartist.person.id,avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes:['STOCK_LICENSE','PUBLIC_DISPLAY'],grantee_party_id:seller.personal_party_id,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Explicit synthetic co-artist sale permission',evidence_asset_ids:[proof.id]},operation_key:key()});
  consent=await S.artists.review(reviewer.ctx,{person_id:coartist.person.id,record_id:consent.id,expected_version:consent.object_version,decision:'APPROVE',reason:'Independent synthetic rights review',operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[],records=[];
  async function call(method,url,user,body,party=user.personal_party_id,version,operation=key()){
   const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':operation}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}});
   if(!response.headers.get('content-type')?.includes('json'))return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
   const json=await response.json(),schema=response.status!==200?'ErrorResponse':url==='/stock/checkout'||url.startsWith('/trade/')?'TradeRecordResponse':url.startsWith('/engagement/mcn/batches')?'OrganizationBatchResponse':url.startsWith('/engagement/')?'EngagementResponse':'StockResponse';
   fixtures.push({method,path:new URL(base+url).pathname,schema,value:json});return {status:response.status,...json};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r));
  const grant=(u,people,actions=['READ_INCOME','MANAGE_LISTINGS'])=>call('POST','/engagement/mcn/staff',outsider,{account_id:u.account_id,person_ids:people,actions,valid_until:'2099-01-01T00:00:00.000Z'},org.party_id);
  const assign=(u,op=key())=>call('POST','/engagement/mcn/assignments',outsider,{order_id:order.id,account_id:u.account_id},org.party_id,undefined,op);
  const dashboard=(u=outsider,person)=>call('GET','/engagement/mcn/dashboard?order_id='+order.id+(person?'&person_id='+person:''),u,undefined,org.party_id);
  const people=[seller.person.id,coartist.person.id].sort();let listing,order,payment,assignment,secondGrant,batch,requestKey;
  await t.test('both artists authorize an actual two-person listing which is independently reviewed and purchased',async()=>{
   const {party_id,...input}=S.listingInput;
   listing=ok(await call('POST','/stock/listings',seller,{...input,participants:[...input.participants,{person_id:coartist.person.id,avatar_id:avatar.id,consent_id:consent.id}]}));
   for(const channel of ['RIGHTS','CONTENT'])listing=ok(await call('POST','/stock/listings/'+listing.id+'/reviews',reviewer,{channel,decision:'APPROVED',reason:'Independent synthetic '+channel,verification:channel==='RIGHTS'?{rights_verified:true,all_people_authorized:true,seller_qualified:true,source_sha256:listing.data.files.full_sha256}:{content_verified:true,preview_watermark_verified:true,ai_labels_verified:true,source_sha256:listing.data.files.full_sha256}},null,listing.object_version));
   order=ok(await call('POST','/stock/checkout',buyer,{listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'}));assert.equal(order.data.quote.marketplace_finance.allocation.mcn_party_id,org.party_id);
   const config={...S.config,environment:'PRODUCTION'};payment=await S.trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()},config);
   await S.trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic-local:'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   for(const person of [undefined,...people]){const v=ok(await dashboard(outsider,person));assert.equal(v.orders.length,1);assert.deepEqual(v.orders[0].person_ids,people);assert.equal(v.total_order_received_minor,100);assert.equal(v.total_accrual_minor,16);assert.equal(v.orders[0].contract_sha256,digest(order.data.contract));}
   records.push({case:'ACTUAL_MULTI_ARTIST_PURCHASE',order_id:order.id,listing_id:listing.id,person_ids:people,received_minor:100,mcn_accrual_minor:16,synthetic_payment_proof:true});
  });
  await t.test('single-person and read-only employees cannot receive a multi-artist order',async()=>{
   ok(await grant(staff,[seller.person.id]));bad(await assign(staff),'MCN_EMPLOYEE_SCOPE_REQUIRED');assert.deepEqual(ok(await dashboard(staff)).orders,[]);
   ok(await grant(other,people,['READ_INCOME']));bad(await assign(other),'MCN_EMPLOYEE_SCOPE_REQUIRED');
   secondGrant=ok(await grant(staff,[coartist.person.id]));requestKey=key();assignment=ok(await assign(staff,requestKey));assert.deepEqual(assignment.data.person_ids,people);assert.equal(assignment.data.person_id,null);
   assert.equal(ok(await assign(staff,requestKey)).object_version,assignment.object_version);const v=ok(await dashboard(staff));assert.equal(v.orders.length,1);assert.equal(v.assignments.length,1);assert.equal(v.total_order_received_minor,100);
  });
  await t.test('batch dispatch returns per-item results and repeated successful dispatch never doubles money',async()=>{
   const op=key(),body={items:[{key:'same-order',action:'MCN_ASSIGNMENT',input:{order_id:order.id,account_id:staff.account_id}},{key:'missing-order',action:'MCN_ASSIGNMENT',input:{order_id:key(),account_id:staff.account_id}}]};
   batch=ok(await call('POST','/engagement/mcn/batches',outsider,body,org.party_id,undefined,op));assert.equal(batch.current_status,'PARTIAL');assert.equal(batch.items[0].status,'SUCCEEDED');assert.equal(batch.items[1].status,'UNAVAILABLE');assert.equal(batch.items[1].error_code,'GIG_NOT_FOUND');
   assert.deepEqual(ok(await call('POST','/engagement/mcn/batches',outsider,body,org.party_id,undefined,op)),batch);
   const v=ok(await dashboard(staff));assert.equal(v.orders.length,1);assert.equal(v.assignments.length,1);assert.equal(v.total_accrual_minor,16);
  });
  await t.test('reassignment changes the current employee, while replaying an old key cannot reclaim the order',async()=>{
   ok(await grant(other,people));const next=ok(await assign(other));assert.equal(next.id,assignment.id);assert.deepEqual(ok(await dashboard(staff)).orders,[]);assert.equal(ok(await dashboard(other)).orders.length,1);
   assert.equal(ok(await assign(staff,requestKey)).object_version,assignment.object_version);assert.deepEqual(ok(await dashboard(staff)).orders,[]);assert.equal(ok(await dashboard(other)).orders.length,1);
   assignment=ok(await assign(staff));
  });
  await t.test('failed assignment audit rolls back both the reassignment and command; original key can retry',async()=>{
   const op=key();await db.withConnection(c=>c.query("CREATE TRIGGER mcn_stock_audit_failure BEFORE INSERT ON engagement_audit FOR EACH ROW BEGIN IF NEW.event_code='ORDER_REASSIGNED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit unavailable'; END IF; END"));
   try{bad(await assign(other,op),'SERVICE_UNAVAILABLE');assert.equal(ok(await dashboard(staff)).orders.length,1);assert.deepEqual(ok(await dashboard(other)).orders,[]);}
   finally{await db.withConnection(c=>c.query('DROP TRIGGER mcn_stock_audit_failure'));}
   const moved=ok(await assign(other,op));assert.equal(moved.id,assignment.id);assert.equal(ok(await dashboard(other)).orders.length,1);assignment=ok(await assign(staff));
  });
  await t.test('another MCN cannot dispatch an order whose frozen agreement names this institution',async()=>{
   const stranger=await parties.createOrganization(outsider.ctx,{display_name:'Synthetic other institution',operation_key:key()});await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[stranger.party_id]);
   bad(await call('POST','/engagement/mcn/assignments',outsider,{order_id:order.id,account_id:staff.account_id},stranger.party_id),'ENGAGEMENT_NOT_FOUND');
  });
  await t.test('revoking one participant scope hides the whole order and refuses command replay',async()=>{
   ok(await call('POST','/engagement/mcn/staff/'+secondGrant.id+'/revoke',outsider,{reason:'Remove one artist'},org.party_id,secondGrant.object_version));
   const v=ok(await dashboard(staff));assert.deepEqual(v.orders,[]);assert.deepEqual(v.assignments,[]);assert.equal(v.total_order_received_minor,0);bad(await assign(staff,requestKey),'MCN_EMPLOYEE_SCOPE_REQUIRED');
   secondGrant=ok(await grant(staff,[coartist.person.id]));assert.equal(ok(await dashboard(staff)).orders.length,1);
  });
  await t.test('closed artists and suspended personal parties reject dispatch and replay but do not erase owner history',async()=>{
   for(const [table,column,value,code] of [['artist_people','id',coartist.person.id,'ARTIST_NOT_ACTIVE'],['parties','id',coartist.personal_party_id,'PARTY_NOT_ACTIVE']]){
    await db.execute('UPDATE '+table+" SET current_status=? WHERE "+column+'=?',[table==='parties'?'SUSPENDED':'CLOSED',value]);
    try{
     bad(await assign(staff,requestKey),code);assert.deepEqual(ok(await dashboard(staff)).orders,[]);assert.equal(ok(await dashboard()).orders.length,1);
     const b=ok(await call('GET','/engagement/mcn/batches/'+batch.id,outsider,undefined,org.party_id));assert.equal(b.items[0].status,'UNAVAILABLE');assert.equal(b.items[0].error_code,code);
    }finally{await db.execute('UPDATE '+table+" SET current_status='ACTIVE' WHERE "+column+'=?',[value]);}
   }
  });
  async function refund(amount,license){
   let p=ok(await call('GET','/stock/purchases/'+order.id,buyer));p=ok(await call('POST','/stock/purchases/'+order.id+'/cases',buyer,{kind:'RIGHTS_DISPUTE',reason:'Synthetic same-order refund'},buyer.personal_party_id,p.object_version));
   p=ok(await call('POST','/stock/purchases/'+order.id+'/case-resolution',reviewer,{case_id:p.data.current_case_id,decision:'REFUND',reason:'Independent case decision',refund_minor:amount,license_action:license},null,p.object_version));
   let r=ok(await call('POST','/trade/refunds',buyer,{payment_id:payment.id,allocations:[{line_id:'stock',amount_minor:amount}],reason:'Reviewed same-order refund'}));
   r=ok(await call('POST','/trade/records/'+r.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Independent synthetic finance review'},null,r.object_version));
   await S.trade.claim(reviewer.ctx,r.id,null,'REFUND');await S.trade.applyRefund(r.id,{...r.data,refund_id:r.id,status:'SUCCEEDED'});await S.trade.applyRefund(r.id,{...r.data,refund_id:r.id,status:'SUCCEEDED'});return r;
  }
  await t.test('same actual order partially refunds with retained licence and recalculated agency income',async()=>{
   const r=await refund(40,'KEEP'),v=ok(await dashboard(staff));assert.equal(v.orders.length,1);assert.equal(v.total_order_received_minor,100);assert.equal(v.total_order_refunded_minor,40);assert.equal(v.total_order_net_minor,60);assert.equal(v.total_accrual_minor,10);assert.equal(v.orders[0].contract_sha256,digest(order.data.contract));
   const content=await call('GET','/stock/purchases/'+order.id+'/content',buyer);assert.equal(content.status,200);assert.ok(content.bytes.length>0);assert.equal(createHash('sha256').update(content.bytes).digest('hex'),S.file.content_sha256);
   records.push({case:'PARTIAL_REFUND_KEEP',order_id:order.id,refund_id:r.id,refunded_minor:40,net_minor:60,mcn_accrual_minor:10,download_status:content.status});
  });
  await t.test('ending cooperation revokes staff reads and replays while retaining owner history and original refund terms',async()=>{
   await G.relationDecision(seller.ctx,{party_id:seller.personal_party_id,record_id:relations[0].id,expected_version:relations[0].object_version,decision:'END',reason:'Artist ends synthetic cooperation',operation_key:key()});
   assert.deepEqual(ok(await dashboard(staff)).orders,[]);bad(await assign(staff,requestKey),'ARTIST_DELEGATION_INACTIVE');
   const read=ok(await call('GET','/engagement/mcn/batches/'+batch.id,outsider,undefined,org.party_id));assert.equal(read.items[0].status,'UNAVAILABLE');
   const r=await refund(60,'REVOKE'),v=ok(await dashboard());assert.equal(v.orders.length,1);assert.equal(v.total_order_received_minor,100);assert.equal(v.total_order_refunded_minor,100);assert.equal(v.total_accrual_minor,0);assert.deepEqual(v.orders[0].person_ids,people);assert.equal(v.orders[0].contract_sha256,digest(order.data.contract));
   bad(await call('GET','/stock/purchases/'+order.id+'/content',buyer),'STOCK_LICENSE_NOT_ACTIVE');
   records.push({case:'ENDED_RELATION_FULL_REFUND',order_id:order.id,refund_id:r.id,refunded_minor:100,mcn_accrual_minor:0,contract_sha256:digest(order.data.contract)});
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/mcn-stock-orders-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/mcn-stock-orders-records.json'),JSON.stringify({synthetic_only:true,real_services:false,frontend_run:false,records},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
