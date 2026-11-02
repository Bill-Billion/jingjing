"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomBytes,randomUUID:key}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createTradeRepository}=require('../src/modules/trade/repository'),M=require('../src/modules/settlement/marketplace-policy');
test('new stock commission cutover and frozen historical orders through real HTTP',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD});let db;const servers=[],fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  for(const [label,cfg,code] of [['missing',null,'MARKETPLACE_CONTRACT_RULE_REQUIRED'],['wrong-rate',{platform_bps:2200},'MARKETPLACE_CONTRACT_RATE_MISMATCH'],['wrong-type',{product_type:'AUDITION'},'MARKETPLACE_CONTRACT_RATE_MISMATCH'],['valid',{},null]])await t.test(label,async()=>{
   const S=await require('./helpers/stock-seed.cjs').seedStock(db,{ruleKey:'stock.'+label,marketplaceFinance:cfg}),listing=await S.listing();
   const server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:{MARKETPLACE_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');servers.push(server);await new Promise(r=>server.once('listening',r));
   const body={listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'},operation=key();
   const checkout=async()=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/stock/checkout',{method:'POST',headers:{Authorization:'Bearer '+S.buyer.token,'X-Acting-Party':S.buyer.personal_party_id,'Content-Type':'application/json','Idempotency-Key':operation},body:JSON.stringify(body)});const json=await r.json();fixtures.push({schema:r.status===200?'TradeRecordResponse':'ErrorResponse',value:json});return {status:r.status,...json};};
   const before=(await db.execute('SELECT COUNT(*) n FROM trade_records'))[0][0].n,r=await checkout();
   if(code){assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,code);assert.equal((await db.execute('SELECT COUNT(*) n FROM trade_records'))[0][0].n,before);assert.equal((await checkout()).error.code,code);return;}
   assert.equal(r.status,200,JSON.stringify(r));const order=r.data;assert.equal(order.data.quote.marketplace_finance.allocation.platform_bps,1800);assert.equal((await checkout()).data.id,order.id);
   assert.deepEqual(M.split(100,order.data.quote.marketplace_finance.allocation).entries.map(x=>x.amount_minor),[18,82]);
   await S.payment(order);const paid=await S.trade.read(S.buyer.ctx,{record_id:order.id,party_id:S.buyer.personal_party_id});assert.equal(paid.current_status,'PAID');assert.deepEqual(paid.data.quote.marketplace_finance,order.data.quote.marketplace_finance);
  });
  await t.test('old nonstandard commission remains payable and immutable after new-order switch',async()=>{
   const S=await require('./helpers/stock-seed.cjs').seedStock(db,{ruleKey:'stock.historical',marketplaceFinance:{platform_bps:1500}}),listing=await S.listing(),order=await S.checkout(listing);
   const strict=createTradeRepository(db,{resolvePrincipal:S.resolvePrincipal,marketplaceContractPolicy:'CONTRACT_20261029'});
   const payment=await strict.preparePayment(S.buyer.ctx,{party_id:S.buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()},S.config);
   await strict.applyPayment({...S.config,payment_id:payment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   const paid=await strict.read(S.buyer.ctx,{record_id:order.id,party_id:S.buyer.personal_party_id});assert.equal(paid.current_status,'PAID');assert.deepEqual(paid.data.contract,order.data.contract);assert.equal(M.split(100,paid.data.quote.marketplace_finance.allocation).entries[0].amount_minor,15);
   await assert.rejects(strict.stockCheckout(S.buyer2.ctx,{party_id:S.buyer2.personal_party_id,listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY',operation_key:key()}),{code:'MARKETPLACE_CONTRACT_RATE_MISMATCH'});
  });
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/marketplace-contract-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
