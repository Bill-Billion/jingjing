'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPaymentSimulator}=require('../src/testing/payment-simulator');
const {createTradeService}=require('../src/modules/trade/service');

test('isolated simulator keeps real order state through unknown, duplicate and closed payment outcomes',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_sim_'+randomBytes(10).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db;
 const records={database:name,synthetic_only:true,real_money:false,checks:[]};
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),simEnv={...env,MYSQL_DATABASE:name,JX_PAYMENT_SIMULATOR_ENABLED:'true'},opts={merchant_party_id:S.seller.personal_party_id,resolvePrincipal:S.resolvePrincipal};
  await t.test('production, missing flag, remote host, wrong port and mismatched database cannot construct simulator',async()=>{
   for(const change of [{NODE_ENV:'production'},{JX_PAYMENT_SIMULATOR_ENABLED:'false'},{MYSQL_HOST:'remote.invalid'},{MYSQL_PORT:'3306'},{MYSQL_DATABASE:'jx_dev'}]){
    await assert.rejects(createPaymentSimulator(db,{...simEnv,...change},opts),{code:'SIMULATOR_REQUIRES_ISOLATED_TEST'});
   }
   const [tables]=await db.execute("SHOW TABLES LIKE 'test_payment_simulator'");assert.equal(tables.length,0);
   records.checks.push({name:'environment-denials',cases:5,table_created:false});
  });
  const sim=await createPaymentSimulator(db,simEnv,opts),service=createTradeService(S.trade,sim),listing=await S.listing();
  const order=await S.checkout(listing),input={party_id:S.buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()};let payment;
  const read=()=>S.trade.read(S.buyer.ctx,{record_id:order.id,party_id:S.buyer.personal_party_id});
  const choose=state=>sim.choose(S.buyer.ctx,{record_id:payment.id,party_id:S.buyer.personal_party_id,state});
  const reconcile=()=>service.reconcilePayment(S.buyer.ctx,{record_id:payment.id,party_id:S.buyer.personal_party_id,transaction_id:null});
  await t.test('real checkout dispatch stays pending and the same key retains one payment and simulator row',async()=>{
   payment=await service.startPayment(S.buyer.ctx,input);assert.equal(payment.current_status,'PENDING');
   assert.equal((await service.startPayment(S.buyer.ctx,input)).id,payment.id);
   const [[count]]=await db.execute('SELECT COUNT(*) n FROM test_payment_simulator WHERE id=?',[payment.id]);assert.equal(Number(count.n),1);
   assert.equal((await read()).current_status,'OPEN');
   records.checks.push({name:'pending-unique',order_id:order.id,payment_id:payment.id,simulator_rows:Number(count.n)});
  });
  await t.test('unrelated account cannot select provider outcome and public callback is denied',async()=>{
   await assert.rejects(sim.choose(S.outsider.ctx,{record_id:payment.id,party_id:S.outsider.personal_party_id,state:'SUCCEEDED'}),{code:'TRADE_NOT_FOUND'});
   await assert.rejects(sim.get('ALIPAY').notification({}),{code:'SIMULATOR_HAS_NO_PUBLIC_CALLBACK'});
   assert.equal((await read()).current_status,'OPEN');
  });
  await t.test('unknown result preserves original pending payment without credit or automatic replacement',async()=>{
   await choose('UNKNOWN');await assert.rejects(reconcile(),{code:'SIMULATED_OUTCOME_UNKNOWN'});
   assert.equal((await service.startPayment(S.buyer.ctx,input)).id,payment.id);assert.equal((await read()).current_status,'OPEN');
   const [[n]]=await db.execute("SELECT COUNT(*) n FROM trade_journal WHERE direction='RECEIPT' AND order_id=?",[order.id]);assert.equal(Number(n.n),0);
   records.checks.push({name:'unknown-no-credit',order_id:order.id,payment_id:payment.id,receipts:0});
  });
  await t.test('pending observation remains unpaid; success recovered on the same payment credits exactly once',async()=>{
   await choose('PENDING');await reconcile();assert.equal((await read()).current_status,'OPEN');
   await choose('SUCCEEDED');await Promise.all([reconcile(),reconcile(),reconcile()]);
   assert.equal((await read()).current_status,'PAID');
   const [[n]]=await db.execute("SELECT COUNT(*) n FROM trade_journal WHERE direction='RECEIPT' AND order_id=?",[order.id]);assert.equal(Number(n.n),1);
   await assert.rejects(choose('UNKNOWN'),{code:'SIMULATOR_RESULT_FINAL'});
   await choose('SUCCEEDED');await reconcile();
   records.checks.push({name:'same-payment-recovered-once',order_id:order.id,payment_id:payment.id,receipts:1});
  });
  await t.test('a separately failed payment closes without receipt and cannot be turned into later success',async()=>{
   const other=await S.checkout(listing,S.buyer2),party_id=S.buyer2.personal_party_id;
   const p=await service.startPayment(S.buyer2.ctx,{party_id,order_id:other.id,installment_key:'stock',operation_key:key()});
   await sim.choose(S.buyer2.ctx,{record_id:p.id,party_id,state:'FAILED'});
   const closed=await service.reconcilePayment(S.buyer2.ctx,{record_id:p.id,party_id,transaction_id:null});assert.equal(closed.current_status,'CLOSED');
   await assert.rejects(sim.choose(S.buyer2.ctx,{record_id:p.id,party_id,state:'SUCCEEDED'}),{code:'SIMULATOR_RESULT_FINAL'});
   const [[n]]=await db.execute("SELECT COUNT(*) n FROM trade_journal WHERE direction='RECEIPT' AND order_id=?",[other.id]);assert.equal(Number(n.n),0);
   records.checks.push({name:'failed-closed',order_id:other.id,payment_id:p.id,receipts:0});
  });
 }finally{
  if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
  records.database_removed=true;
  const out=path.resolve(__dirname,'../../../../.local/payment-simulator-isolation-records.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(records,null,2)+'\n');
 }
});
