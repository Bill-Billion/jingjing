'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');

test('same account buys and supplies with distinct parties; new avatar preserves person wallet and paid cast; MCN consent selection is exact',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_subject_avatar_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const cases=[],records={};
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  // Existing synthetic identity/manual-review fixture; no actual identity, provider or human certification claim.
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2,reviewer,outsider}=S;
  const parties=require('../src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const G=require('../src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal:S.resolvePrincipal});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,{user=buyer,party=user.personal_party_id,body,op=key(),version}={}){
   const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':op}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const value=await response.json(),schema=!response.ok?'ErrorResponse':url==='/stock/checkout'||url.startsWith('/trade/')?'TradeRecordResponse':url.startsWith('/artists/')?'ArtistResponse':url.startsWith('/wallet/')?'WalletResponse':'StockResponse';
   cases.push({method,path:new URL(base+url).pathname,status:response.status,schema,value});return {status:response.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const reject=(r,code,status=409)=>{assert.equal(r.status,status,JSON.stringify(r));assert.equal(r.error.code,code);};
  const count=async table=>Number((await db.execute('SELECT COUNT(*) n FROM '+mysql.escapeId(table)))[0][0].n);
  const originalListing=await S.listing(),buyKey=key(),buyInput={listing_id:originalListing.id,offer_sha256:originalListing.content_sha256,channel:'ALIPAY'};
  const bought=ok(await call('POST','/stock/checkout',{body:buyInput,op:buyKey}));await S.payment(bought);
  const purchased=ok(await call('GET','/stock/purchases/'+bought.id));assert.equal(purchased.data.status,'ACTIVE');
  const beforeOrder=(await db.execute('SELECT buyer_party_id,merchant_party_id,data_json FROM trade_records WHERE id=?',[bought.id]))[0][0];
  const beforeCast=purchased.data.listing_snapshot.participants;assert.equal(beforeCast[0].avatar_id,S.avatar.id);
  const org=await parties.createOrganization(buyer.ctx,{display_name:'Synthetic buyer also operates supplier',operation_key:key()});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]); // Pre-reviewed synthetic organization capability only.
  const proof=await S.supply.upload(buyer.ctx,{party_id:org.party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic direct artist cooperation'),operation_key:key()});
  let relation=await G.relation(buyer.ctx,{party_id:org.party_id,artist_party_id:seller.personal_party_id,scope:'COMMERCIAL',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:false,terms:'Synthetic cooperation, not personal consent',commission:{platform_bps:1800,mcn_bps:0},v5_terms:{version:'V5',supply_share_bps:2000},evidence_asset_ids:[proof.id],operation_key:key()});
  relation=await G.relationDecision(seller.ctx,{party_id:seller.personal_party_id,record_id:relation.id,expected_version:relation.object_version,decision:'ACCEPT',reason:'Synthetic artist accepts cooperation',operation_key:key()});
  await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation.id,actions:['READ_PROFILE','SUBMIT_LISTING'],valid_from:relation.data.valid_from,valid_until:relation.data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'Synthetic limited management'},operation_key:key()});
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
  for(const u of [outsider,reviewer])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'WALLET_RULE_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:avatar-wallet',reason:'Isolated rule review only'});
  let rule=await W.createRule(outsider.ctx,{rule:require('./helpers/wallet-rule.cjs'),operation_key:key()});rule=await W.reviewRule(reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'Independent synthetic rule',operation_key:key()});
  const wallet=await W.open(seller.ctx,{party_id:seller.personal_party_id,rule_id:rule.id,rule_sha256:rule.content_sha256,operation_key:key()});
  const walletBefore=ok(await call('GET','/wallet/summary',{user:seller}));assert.equal(walletBefore.account_id,wallet.id);
  let avatar;
  await t.test('a second avatar keeps one original person and wallet and leaves the paid original cast untouched',async()=>{
   const counts={people:await count('artist_people'),accounts:await count('identity_accounts'),wallets:await count('wallet_records')},op=key();
   const body={display_name:'Synthetic second look, same person'};
   avatar=ok(await call('POST','/artists/people/'+seller.person.id+'/avatars',{user:seller,body,op}));
   assert.equal(ok(await call('POST','/artists/people/'+seller.person.id+'/avatars',{user:seller,body,op})).id,avatar.id);
   assert.equal(avatar.person_id,seller.person.id);assert.notEqual(avatar.id,S.avatar.id);
   assert.deepEqual({people:await count('artist_people'),accounts:await count('identity_accounts'),wallets:await count('wallet_records')},counts);
   const person=ok(await call('GET','/artists/people/'+seller.person.id,{user:seller}));assert.deepEqual(new Set(person.avatars.map(a=>a.id)),new Set([S.avatar.id,avatar.id]));
   assert.deepEqual(ok(await call('GET','/wallet/summary',{user:seller})),walletBefore);
   assert.deepEqual(ok(await call('GET','/stock/purchases/'+bought.id)).data.listing_snapshot.participants,beforeCast);
  });
  const consent=async purposes=>{let c=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes,grantee_party_id:org.party_id,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic separately selected exact-avatar permission',evidence_asset_ids:[S.evidence.id]},operation_key:key()});return S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:c.id,expected_version:c.object_version,decision:'APPROVE',reason:'Independent exact purpose review',operation_key:key()});};
  const fullConsent=await consent(['STOCK_LICENSE','PUBLIC_DISPLAY']),displayOnly=await consent(['PUBLIC_DISPLAY']);
  let spec=await S.trade.createSpec(buyer.ctx,{party_id:org.party_id,previous_spec_id:null,...Object.fromEntries(['title','line_kind','unit_minor','currency','specification','product_profile'].map(k=>[k,S.spec.data[k]])),provider_party_id:org.party_id,operation_key:key()});
  spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'Independent synthetic supplier specification',operation_key:key()});await S.publishSales(org.party_id,spec.id);
  const upload=(purpose,text)=>S.supply.upload(buyer.ctx,{party_id:org.party_id,purpose,media_type:purpose==='WORK_CONTENT'?'video/mp4':'text/plain',body:Buffer.from(text),operation_key:key()});
  const full=await upload('WORK_CONTENT','Synthetic second full bytes NOT PLAYABLE'),preview=await upload('WORK_CONTENT','Synthetic second preview NOT PLAYABLE'),rights=await upload('RIGHTS_EVIDENCE','Synthetic rights evidence');
  const {party_id:unused,...originalInput}=S.listingInput;
  const input={...originalInput,spec_id:spec.id,file_id:full.id,preview_file_id:preview.id,rights_evidence_ids:[rights.id],participants:[{person_id:seller.person.id,avatar_id:avatar.id,consent_id:fullConsent.id}]};let supplied;
  await t.test('first MCN listing refuses wrong avatar and display-only consent without reserving a failed key',async()=>{
   assert.equal(ok(await call('GET','/stock/listings',{party:org.party_id})).items.length,0);
   const options=ok(await call('GET','/stock/participant-options?person_id='+seller.person.id,{party:org.party_id}));assert(options.items.some(c=>c.consent_id===fullConsent.id));assert(!options.items.some(c=>c.consent_id===displayOnly.id));
   const before={listings:await count('stock_listings'),commands:await count('stock_commands')},op=key();
   for(const [participant,code,status]of [[{...input.participants[0],avatar_id:S.avatar.id},'STOCK_SALE_CONSENT_REQUIRED',409],[{...input.participants[0],consent_id:displayOnly.id},'STOCK_SALE_CONSENT_REQUIRED',409]]){
    reject(await call('POST','/stock/listings',{party:org.party_id,body:{...input,participants:[participant]},op}),code,status);
    assert.deepEqual({listings:await count('stock_listings'),commands:await count('stock_commands')},before);
   }
   supplied=ok(await call('POST','/stock/listings',{party:org.party_id,body:input,op}));assert.equal(ok(await call('POST','/stock/listings',{party:org.party_id,body:input,op})).id,supplied.id);
   supplied=await S.reviewListing(supplied,'RIGHTS');supplied=await S.reviewListing(supplied,'CONTENT');
  });
  await t.test('one account buys personally and supplies through its organization; switching party never rewrites either paid order',async()=>{
   const saleKey=key(),body={listing_id:supplied.id,offer_sha256:supplied.content_sha256,channel:'ALIPAY'};
   const sale=ok(await call('POST','/stock/checkout',{user:buyer2,body,op:saleKey}));assert.equal(ok(await call('POST','/stock/checkout',{user:buyer2,body,op:saleKey})).id,sale.id);
   const config={...S.config,merchant_party_id:org.party_id};
   const payment=await S.trade.preparePayment(buyer2.ctx,{party_id:buyer2.personal_party_id,order_id:sale.id,installment_key:'stock',operation_key:key()},config);
   await S.trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   const sold=ok(await call('GET','/stock/purchases/'+sale.id,{user:buyer2}));assert.equal(sold.data.status,'ACTIVE');assert.equal(sold.data.listing_snapshot.participants[0].avatar_id,avatar.id);
   const selling=ok(await call('GET','/trade/records/'+sale.id,{party:org.party_id}));assert.equal(selling.merchant_party_id,org.party_id);assert.equal(selling.buyer_party_id,buyer2.personal_party_id);
   assert.equal(ok(await call('GET','/trade/records/'+bought.id)).buyer_party_id,buyer.personal_party_id);
   assert.notEqual((await call('GET','/trade/records/'+bought.id,{party:org.party_id})).status,200);
   assert.notEqual((await call('GET','/trade/records/'+sale.id)).status,200);
   assert.equal(ok(await call('POST','/stock/checkout',{body:buyInput,op:buyKey})).id,bought.id);
   assert.deepEqual((await db.execute('SELECT buyer_party_id,merchant_party_id,data_json FROM trade_records WHERE id=?',[bought.id]))[0][0],beforeOrder);
   assert.deepEqual(ok(await call('GET','/stock/purchases/'+bought.id)).data.listing_snapshot.participants,beforeCast);
   assert.deepEqual(ok(await call('GET','/wallet/summary',{user:seller})),walletBefore);
   assert.equal((await db.execute("SELECT id FROM wallet_records WHERE kind='ACCOUNT' AND owner_party_id=?",[seller.personal_party_id]))[0].length,1);
   assert.equal((await db.execute("SELECT id FROM trade_records WHERE kind='ORDER'",[]))[0].length,2);
   assert.equal((await db.execute("SELECT id FROM trade_journal WHERE direction='RECEIPT'",[]))[0].length,2);
   Object.assign(records,{dual_role_account_id:buyer.account_id,personal_buyer_party_id:buyer.personal_party_id,supplier_party_id:org.party_id,person_id:seller.person.id,wallet_id:wallet.id,original_avatar_id:S.avatar.id,new_avatar_id:avatar.id,original_order_id:bought.id,supplied_order_id:sale.id});
  });
 }finally{
  const out=path.resolve(__dirname,'../../../../.local/subject-avatar-stock-boundaries-http.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,database:name,records,cases},null,2)+'\n');
  if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
