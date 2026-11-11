'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('received stock orders, refunds and returned rewards preserve original point debts',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const[k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_benefit_flow_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,created=false,failed=false;
 const result={synthetic_only:true,database:name,checks:[],requests:[],limits:['API chain, not page/native acceptance','Approved seller and media review are synthetic fixtures; media protocol bytes are not playable','Payments/refunds are synthetic trusted receipts; no real money','Only isolated DB connection clock advances; business fulfillment rows are never patched']},fixtures=[];
 const check=async(name,fn)=>t.test(name,async()=>{try{const records=await fn();result.checks.push({name,result:'PASS',records});}catch(e){failed=true;result.checks.push({name,result:'FAIL',error:e.code||e.message});throw e;}});
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'1'});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2,reviewer,outsider}=S;
  // Long-lived sessions belong only to these disposable synthetic test actors.
  await db.execute('UPDATE auth_sessions SET expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+400*86400000');
  for(const u of [seller,reviewer,outsider])for(const action of ['WALLET_RULE_REVIEW','REDEMPTION_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:benefit-journey',reason:'isolated only'});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function request(method,url,u=buyer,body,version,operation=key(),party=u.personal_party_id){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':operation||key()}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}});const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status!==200?'ErrorResponse':url.startsWith('/wallet')?'WalletResponse':url.startsWith('/redemption')?'RedemptionResponse':url.startsWith('/stock')&&url!=='/stock/checkout'?'StockResponse':'TradeRecordResponse',value});result.requests.push({method,path:url,status:res.status,error:value.error?.code||null});return {status:res.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.error));return r.data;},post=async(url,u,body,version,op,party)=>ok(await request('POST',url,u,body,version,op,party)),get=async(url,u=buyer)=>ok(await request('GET',url,u));
  const summary=()=>get('/wallet/summary'),sync=o=>post('/wallet/earnings/sync',buyer,{order_id:o.id});
  let rule,orders=[],payments=[],earnA,grant,stock,originalExpiry;
  const proof=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic entitlement unavailable proof'),operation_key:key()});
  await check('independently reviewed wallet and new 48-hour stock terms, zero initial points',async()=>{
   rule=await post('/wallet/rules',outsider,{rule:{...require('./helpers/wallet-rule.cjs'),free_awards:{REGISTER:null,DAILY_CHECKIN:3,REVIEW:null,SHARE:null}}},null,null,null);
   rule=await post('/wallet/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'synthetic reviewed only'},rule.object_version,null,null);
   await post('/wallet/accounts',buyer,{rule_id:rule.id,rule_sha256:rule.content_sha256});assert.equal((await summary()).available_points,0);
   const specification=structuredClone(S.spec.data.specification);Object.assign(specification.stock_license,{acceptance_hours:48,acceptance_policy:'CONTRACT_20261029'});
   let spec=await S.trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic new contract stock',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:100,currency:'CNY',specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});await S.publishSales(seller.personal_party_id,spec.id);S.listingInput.spec_id=spec.id;
   return {rule_id:rule.id,spec_id:spec.id};
  });
  await check('two fresh paid orders earn nothing before real content read and buyer acceptance',async()=>{
   for(let i=0;i<2;i++){
    const listing=await S.listing(),o=await post('/stock/checkout',buyer,{listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'});orders.push(o);payments.push(await S.payment(o));
    assert.equal((await sync(o)).pending_reason,'FULFILLMENT_PENDING');
    const res=await fetch(base+'/stock/purchases/'+o.id+'/content',{headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id}});assert.equal(res.status,200);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),S.file.content_sha256);
    const p=await get('/stock/purchases/'+o.id);await post('/stock/purchases/'+o.id+'/acceptance',buyer,{},p.object_version);assert.equal((await sync(o)).pending_reason,'AFTERCARE_WINDOW');
   }
   assert.equal((await summary()).available_points,0);return {order_ids:orders.map(x=>x.id),payment_ids:payments.map(x=>x.payment.id)};
  });
  await check('mature original order issues once under its captured rule; concurrent sync does not duplicate',async()=>{
   const [[row]]=await db.execute('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) AS seconds');await db.execute('SET timestamp=?',[Number(row.seconds)+8*86400]);
   const responses=await Promise.all([sync(orders[0]),sync(orders[0])]);assert.equal(responses[0].id,responses[1].id);earnA=responses[0];originalExpiry=earnA.data.expires_at;
   assert.equal(earnA.data.points,10);assert.equal(earnA.data.rule_id,rule.id);assert.equal((await summary()).qualifying_growth,10);
   assert.equal((await request('POST','/wallet/earnings/sync',buyer2,{order_id:orders[0].id})).status,404);return {earning_id:earnA.id,points:10,expires_at:originalExpiry};
  });
  await check('a real reward exchange consumes four points once and retains original expiry',async()=>{
   const template={version:'synthetic-test-only',source_ref:'synthetic:no-formal-pricing',title:'Synthetic scheduled exposure',kind:'EXPOSURE',valid_days:30,exchange_points:4,capacity:5,available_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic four-point price; independently reviewed service failure returns original points',production:null,interview:null,exposure:{placement:'synthetic-slot',duration_days:7}};
   stock=await post('/redemption/stock',seller,{template,evidence_asset_ids:[proof.id]});stock=await post('/redemption/stock/'+stock.id+'/review',reviewer,{decision:'APPROVE',reason:'synthetic'},stock.object_version,null,null);
   const op=key(),input={stock_id:stock.id,template_sha256:digest(template)};grant=await post('/redemption/exchanges',buyer,input,null,op);assert.equal((await post('/redemption/exchanges',buyer,input,null,op)).id,grant.id);assert.equal((await summary()).available_points,6);assert.equal((await summary()).qualifying_growth,10);return {grant_id:grant.id,spent:4};
  });
  async function refund(index){let p=await get('/stock/purchases/'+orders[index].id);p=await post('/stock/purchases/'+orders[index].id+'/cases',buyer,{kind:'RIGHTS_DISPUTE',reason:'synthetic full refund review'},p.object_version);await post('/stock/purchases/'+orders[index].id+'/case-resolution',reviewer,{case_id:p.data.current_case_id,decision:'REFUND',reason:'independent synthetic'},p.object_version,null,null);
   let r=await post('/trade/refunds',buyer,{payment_id:payments[index].payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'reviewed original payment refund'});r=await post('/trade/records/'+r.id+'/reviews',reviewer,{decision:'APPROVED',reason:'independent synthetic'},r.object_version,null,null);await S.trade.claim(reviewer.ctx,r.id,null,'REFUND');const proof={...r.data,refund_id:r.id,status:'SUCCEEDED'};await S.trade.applyRefund(r.id,proof);await S.trade.applyRefund(r.id,proof);return r;}
  await check('full cash refund succeeds despite spent points; debt prevents new exchange without using stock',async()=>{
   const r=await refund(0),q=await summary();assert.equal(q.available_points,0);assert.equal(q.qualifying_growth,0);assert.equal(q.points_pending_reversal,4);assert.equal(q.points_block_reason,'POINTS_REVERSAL_PENDING');
   const input={stock_id:stock.id,template_sha256:digest(stock.data.template)};assert.equal((await request('POST','/redemption/exchanges',buyer,input)).error.code,'POINTS_REVERSAL_PENDING');const catalog=ok(await request('GET','/redemption/catalog',buyer,undefined,null,null,null));assert.equal(catalog.items.find(x=>x.id===stock.id).remaining,4);
   const cash=await get('/trade/records/'+orders[0].id);assert.equal(cash.current_status,'REFUNDED');assert.equal(cash.data.financial.refunded_minor,100);return {refund_id:r.id,pending_reversal:4,inventory_remaining:4};
  });
  await check('later order earnings clear earlier debt without erasing the new consumption growth',async()=>{
   const b=await sync(orders[1]),q=await summary();assert.equal(b.data.debt_offset,4);assert.equal(q.points_pending_reversal,0);assert.equal(q.available_points,6);assert.equal(q.qualifying_growth,10);return {earning_id:b.id,offset:4,available:6,growth:10};
  });
  await check('refunding the replacement earning creates its own shortage; free check-in pays debt without adding growth',async()=>{
   const r=await refund(1);let q=await summary();assert.equal(q.points_pending_reversal,4);assert.equal(q.available_points,0);assert.equal(q.qualifying_growth,0);
   const op=key();const award=await post('/wallet/check-in',buyer,{},null,op);assert.deepEqual(await post('/wallet/check-in',buyer,{},null,op),award);q=await summary();assert.equal(q.points_pending_reversal,1);assert.equal(q.available_points,0);assert.equal(q.qualifying_growth,0);return {refund_id:r.id,pending_reversal:1};
  });
  await check('independent reward remedy returns original spent points once, clears remaining debt and cannot resurrect growth',async()=>{
   grant=await get('/redemption/grants/'+grant.id);let remedy=await post('/redemption/grants/'+grant.id+'/remedies',buyer,{reason:'synthetic service unavailable'},grant.object_version);
   const input={decision:'RETURN_POINTS',reason:'independent unavailable service evidence',evidence_asset_id:proof.id},op=key();const reviewed=await post('/redemption/remedies/'+remedy.id+'/review',reviewer,input,remedy.object_version,op,null);assert.deepEqual(await post('/redemption/remedies/'+remedy.id+'/review',reviewer,input,remedy.object_version,op,null),reviewed);
   const q=await summary();assert.equal(q.available_points,3);assert.equal(q.points_pending_reversal,0);assert.equal(q.qualifying_growth,0);assert.equal((await get('/redemption/grants/'+grant.id)).current_status,'POINTS_RETURNED');
   const lots=await get('/wallet/records?kind=EARNING');assert.equal(lots.items.find(x=>x.id===earnA.id).data.expires_at,originalExpiry);for(const o of orders){const current=await get('/trade/records/'+o.id);assert.equal(current.data.financial.net_minor,0);assert.deepEqual(current.data.quote,o.data.quote);}return {grant_id:grant.id,remedy_id:remedy.id,available:3,consumption_growth:0,expiry_unchanged:true};
  });

  await check('same fulfilled stock partial KEEP then final REVOKE reverses points and referral finance exactly once',async()=>{
   await db.execute('SET timestamp=0');
   for(const action of ['ENGAGEMENT_REVIEW','FINANCE_REVIEW'])for(const u of [reviewer,outsider])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:pm01',reason:'isolated only'});
   const R=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});
   let er=await R.createRule(outsider.ctx,{rule:{...require('./helpers/engagement-rule.cjs'),referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:1000,AUDITION:1000,CUSTOMIZATION:1000,COMMERCIAL:1000}},operation_key:key()});
   er=await R.reviewRule(reviewer.ctx,{record_id:er.id,expected_version:er.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
   const link=await R.referralLink(buyer2.ctx,{party_id:buyer2.personal_party_id,target_party_id:seller.personal_party_id,category:'STOCK',rule_id:er.id,operation_key:key()});
   await R.referralClick(buyer.ctx,{party_id:buyer.personal_party_id,link_id:link.id,operation_key:key()});
   const rid=key(),content=require('../src/modules/governance/content').createRuleContent({id:rid,rule_key:'pm01.stock.referral',version:'1',terms:{marketplace_finance:{model:'V5_TWO_LAYER',product_type:'STOCK_VIDEO',fee_base:'NET_PAID',platform_party_id:outsider.personal_party_id,platform_bps:1800,referral_bps:1000,rounding:'HALF_UP_PLATFORM_REMAINDER'}}});
   await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[rid,'pm01.stock.referral','1',JSON.stringify(content),'2020-01-01 00:00:00',outsider.account_id,'EFFECTIVE']);
   await S.publishSales(seller.personal_party_id,S.listingInput.spec_id,rid);
   let listing=await S.stock.create(seller.ctx,{...S.listingInput,rule_id:rid,operation_key:key()});listing=await S.reviewListing(listing,'RIGHTS');listing=await S.reviewListing(listing,'CONTENT');
   const o=await post('/stock/checkout',buyer,{listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'});
   const config={...S.config,environment:'PRODUCTION'},pay=await S.trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,installment_key:'stock',operation_key:key()},config);
   // Labelled receipt exercises the production-accounting branch only; never calls or enables a provider.
   await S.trade.applyPayment({...config,payment_id:pay.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic-pm01:'+key(),status:'SUCCEEDED',product_id:null,app_account_token:null});
   const download=await fetch(base+'/stock/purchases/'+o.id+'/content',{headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id}});assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),S.file.content_sha256);
   let p=await get('/stock/purchases/'+o.id);await post('/stock/purchases/'+o.id+'/acceptance',buyer,{},p.object_version);
   assert.equal((await sync(o)).pending_reason,'AFTERCARE_WINDOW');
   const [[clock]]=await db.execute('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) seconds');await db.execute('SET timestamp=?',[Number(clock.seconds)+8*86400]);
   const before=await summary(),earned=await sync(o);assert.equal(earned.data.points,10);assert.equal((await summary()).available_points,before.available_points+10);
   const referral=()=>R.referralSync(buyer2.ctx,{party_id:buyer2.personal_party_id,order_id:o.id,operation_key:key()});
   assert.equal((await referral()).data.amount_minor,10);
   const finance=require('../src/modules/settlement/repository').createSettlementRepository(db,{resolvePrincipal:S.resolvePrincipal});
   const evidence=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic independent exact allocation'),operation_key:key()});
   let agreement=await finance.agreement(seller.ctx,{party_id:seller.personal_party_id,source_type:'ORDER',source_id:o.id,previous_agreement_id:null,environment:'PRODUCTION',rule_id:rid,rules:{version:'pm01-referral',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'synthetic only',lines:[{line_id:'stock',allocation:o.data.quote.marketplace_finance.allocation,deductions:[]}]},evidence_asset_id:evidence.id,operation_key:key()});
   agreement=await finance.review(reviewer.ctx,{record_id:agreement.id,expected_version:agreement.object_version,decision:'APPROVED',reason:'synthetic independent',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true},operation_key:key()});
   for(const u of [seller,buyer,buyer2,outsider])await finance.confirm(u.ctx,{record_id:agreement.id,party_id:u.personal_party_id,expected_version:agreement.object_version,content_sha256:agreement.content_sha256,decision:'APPROVED',reason:'synthetic exact agreement',operation_key:key()});
   const settle=()=>finance.settle(seller.ctx,{record_id:agreement.id,party_id:seller.personal_party_id,expected_version:agreement.object_version,period_reference:key(),note:'synthetic reconciliation',operation_key:key()});
   await settle();const stages=[];
   for(const [amount,action,total] of [[40,'KEEP',40],[60,'REVOKE',100]]){
    p=await get('/stock/purchases/'+o.id);p=await post('/stock/purchases/'+o.id+'/cases',buyer,{kind:'REFUND',reason:'synthetic partial and remaining'},p.object_version);
    await post('/stock/purchases/'+o.id+'/case-resolution',reviewer,{case_id:p.data.current_case_id,decision:'REFUND',refund_minor:amount,license_action:action,reason:'independent amount and licence'},p.object_version,null,null);
    let refund=await post('/trade/refunds',buyer,{payment_id:pay.id,allocations:[{line_id:'stock',amount_minor:amount}],reason:'synthetic approved amount'});refund=await post('/trade/records/'+refund.id+'/reviews',reviewer,{decision:'APPROVED',reason:'independent'},refund.object_version,null,null);
    await S.trade.claim(reviewer.ctx,refund.id,null,'REFUND');const receipt={...refund.data,refund_id:refund.id,status:'SUCCEEDED'};await S.trade.applyRefund(refund.id,receipt);await S.trade.applyRefund(refund.id,receipt);
    const wallet=await summary(),commission=await referral();assert.equal(wallet.available_points,before.available_points+10-total/10);assert.equal(wallet.qualifying_growth,10-total/10);assert.equal(commission.data.amount_minor,(100-total)/10);
    await settle();const balances=await finance.balances(seller.ctx,{record_id:agreement.id,party_id:seller.personal_party_id});assert.equal(balances.items.reduce((n,x)=>n+x.accrued_minor,0),100-total);assert.equal(balances.items.find(x=>x.party_id===buyer2.personal_party_id).accrued_minor,(100-total)/10);
    const [[count]]=await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[agreement.id]);await settle();assert.equal((await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[agreement.id]))[0][0].n,count.n);
    p=await get('/stock/purchases/'+o.id);assert.equal(p.data.status,action==='KEEP'?'ACTIVE':'REVOKED');const current=await get('/trade/records/'+o.id);assert.deepEqual(current.data.contract,o.data.contract);
    stages.push({refund_id:refund.id,amount_minor:amount,cumulative_refunded_minor:total,license:action,available_points:wallet.available_points,commission_minor:commission.data.amount_minor,balances:balances.items});
   }
   return {order_id:o.id,agreement_id:agreement.id,earning_id:earned.id,stages,fulfillment:'actual content read and acceptance; isolated clock only',receipt:'synthetic PRODUCTION-labelled fact; no provider called'};
  });
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();
  result.result=failed||result.checks.length!==9?'FAIL':'PASS';result.cleanup={server_stopped:true,database_removed:created};const dir=path.resolve(__dirname,'../../../../.local');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'wallet-refund-entitlement-result.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(dir,'wallet-refund-entitlement-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }
});
