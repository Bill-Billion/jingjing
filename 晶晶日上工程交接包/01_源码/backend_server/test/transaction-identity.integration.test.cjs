'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('current-contract customization buyer identity on acceptance and payment',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const fixtures=[],records=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);

  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer,producer,reviewer}=S.people;
  const artists=require('../src/modules/artists/repository').createArtistRepository(db,{resolvePrincipal:S.resolvePrincipal});
  async function verified(user){const p=await artists.createPerson(user.ctx,{party_id:user.personal_party_id,display_name:'synthetic verified actor',operation_key:key()}),r=await artists.prepareIdentity(user.ctx,{party_id:user.personal_party_id,person_id:p.id,session_ref:'synthetic:'+key(),operation_key:key()});await artists.applyIdentity(r.id,{request_key:r.data.request_key,person_id:p.id,status:'VERIFIED',issuer:'synthetic-probe',subject_fingerprint:randomBytes(32).toString('hex'),age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:identity',liveness_verified:true,phone_verified:true});return p;}
  const person=await verified(buyer);await verified(producer);
  const currentTrade=require('../src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal:S.resolvePrincipal,customizationMerchantPartyId:S.org.party_id,customizationContractPolicy:'CONTRACT_20261029',fulfillmentGate:require('../src/modules/production/payment-gate').productionPaymentGate});
  let sends=0,failDispatch=false,onReady=null,lastPaymentId=null;
  const providerFactory=()=>({get:()=>({config,assertReady:async()=>{if(onReady)await onReady();},call:async(method,p)=>{
   if(method==='create'){sends++;lastPaymentId=p.id;if(failDispatch)throw new Error('synthetic unknown dispatch');return {kind:'ALIPAY_APP',order_string:'synthetic-only'};}
   if(method==='query')return {...config,payment_id:p.id,currency:'CNY',amount_minor:p.amount_minor,transaction_id:'synthetic.'+p.id,status:'SUCCEEDED',product_id:null,app_account_token:null};
   throw new Error('unexpected synthetic provider operation');
  }})});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,tradeProvidersFactory:providerFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,user,body,version=null,operation=key()){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json','Idempotency-Key':operation,...(user===reviewer?{}:{'X-Acting-Party':user.acting_party_id}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?'TradeRecordResponse':'ErrorResponse',value});return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  async function offer(){
   let prepared;const stop=new Error('stop after quote preparation');await assert.rejects(S.newOrder({preview:'SCRIPT_BEFORE_INTERIM',calendar:require('./support/working-calendar.cjs')(),beforeAccept:async x=>{prepared=x;throw stop;}}),e=>e===stop);
   const body={buyer_party_id:buyer.personal_party_id,lines:[{line_id:'film',spec_id:prepared.spec.id,quantity:1}],...Object.fromEntries(['installments','channel','transaction_model','rule_id','expires_at','payment_window_minutes','license_reservation_id'].map(k=>[k,prepared.quote.data[k]])),customization_source:prepared.quote.data.customization};
   const q=ok(await call('POST','/trade/quotes',producer,body));return ok(await call('POST','/trade/records/'+q.id+'/reviews',reviewer,{decision:'APPROVED',reason:'synthetic independent'},q.object_version));
  }
  const accept=(q,op=key())=>call('POST','/trade/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256},q.object_version,op);
  const q=await offer(),acceptKey=key();let order,payment;
  await t.test('verified buyer accepts a current-contract script-first quote',async()=>{order=ok(await accept(q,acceptKey));assert.equal(order.data.quote.lines[0].specification.customization_delivery.acceptance_working_days,5);assert.equal(order.data.quote.installments[1].trigger,'CUSTOMIZATION_SCRIPT_CONFIRMED');});assert.ok(order);
  const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:S.org.party_id,config_revision:'identity-probe'};
  const payInput={party_id:buyer.personal_party_id,order_id:order.id,installment_key:'first',operation_key:key()};
  await t.test('verified buyer prepares the current-contract first payment',async()=>{payment=await currentTrade.preparePayment(buyer.ctx,payInput,config);assert.equal(payment.data.amount_minor,3000);});assert.ok(payment);
  for(const [state,field,value,restore] of [['unverified','identity_status','UNVERIFIED','VERIFIED'],['expired','identity_valid_until','2020-01-01 00:00:00.000','2099-01-01 00:00:00.000'],['rejected','identity_status','REJECTED','VERIFIED']]){
   const newQuote=await offer(),pending=ok(await accept(await offer()));
   await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[value,person.id]);
   try{
    await t.test(state+' buyer cannot accept a new current-contract quote',async()=>{const r=await accept(newQuote);records.push({state,action:'accept-new',status:r.status,error:r.error?.code||null});assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');});
    await t.test(state+' buyer cannot replay quote acceptance',async()=>{const r=await accept(q,acceptKey);records.push({state,action:'accept-replay',status:r.status,error:r.error?.code||null});assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');});
    await t.test(state+' buyer cannot prepare a new payment on an earlier order',async()=>{await assert.rejects(currentTrade.preparePayment(buyer.ctx,{...payInput,order_id:pending.id,operation_key:key()},config),{code:'VERIFIED_ADULT_REQUIRED'});});
    await t.test(state+' buyer cannot replay payment preparation',async()=>{await assert.rejects(currentTrade.preparePayment(buyer.ctx,payInput,config),{code:'VERIFIED_ADULT_REQUIRED'});});
    await t.test(state+' buyer retains original order read and contract',async()=>{const old=ok(await call('GET','/trade/records/'+order.id,buyer));assert.deepEqual(old.data.contract,order.data.contract);});
   }finally{await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[restore,person.id]);}
  }
  await t.test('restored identity returns the original successful acceptance and payment',async()=>{assert.deepEqual(ok(await accept(q,acceptKey)),order);assert.deepEqual(await currentTrade.preparePayment(buyer.ctx,payInput,config),payment);});
  const racedOrder=ok(await accept(await offer())),racedKey=key(),racedBody={order_id:racedOrder.id,installment_key:'first'},beforeSends=sends;let pendingId;
  await t.test('identity expiry after payment preparation but before dispatch stops the provider call',async()=>{
   let readyCalls=0;onReady=async()=>{if(++readyCalls===2)await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00.000' WHERE id=?",[person.id]);};
   try{const r=await call('POST','/trade/payments',buyer,racedBody,null,racedKey);const [rows]=await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND order_id=?",[racedOrder.id]);assert.equal(rows.length,1);pendingId=rows[0].id;assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');assert.equal(sends,beforeSends);}
   finally{onReady=null;await db.execute("UPDATE artist_people SET identity_valid_until='2099-01-01 00:00:00.000' WHERE id=?",[person.id]);}
  });
  await t.test('restored identity dispatches the original prepared payment exactly once',async()=>{
   const r=ok(await call('POST','/trade/payments',buyer,racedBody,null,racedKey));assert.equal(r.id,pendingId);assert.equal(ok(await call('POST','/trade/payments',buyer,racedBody,null,racedKey)).id,pendingId);assert.equal(sends,beforeSends+1);
  });
  const unknownOrder=ok(await accept(await offer()));let unknownPaymentId;
  await t.test('unknown payment outcome is retained rather than creating a second charge',async()=>{
   failDispatch=true;try{const r=await call('POST','/trade/payments',buyer,{order_id:unknownOrder.id,installment_key:'first'});unknownPaymentId=lastPaymentId;assert.ok(unknownPaymentId);assert.equal(r.status,503,JSON.stringify(r));assert.equal(r.error.code,'SERVICE_UNAVAILABLE');}finally{failDispatch=false;}
  });
  await t.test('identity expiry still permits trusted reconciliation and reading original payment facts',async()=>{
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00.000' WHERE id=?",[person.id]);const before=sends;
   try{ok(await call('POST','/trade/payments/'+unknownPaymentId+'/reconciliation',buyer,{transaction_id:null}));const o=ok(await call('GET','/trade/records/'+unknownOrder.id,buyer));assert.equal(o.data.financial.received_minor,3000);assert.deepEqual(o.data.contract,unknownOrder.data.contract);assert.equal(sends,before);}
   finally{await db.execute("UPDATE artist_people SET identity_valid_until='2099-01-01 00:00:00.000' WHERE id=?",[person.id]);}
  });
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/transaction-identity-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2)+'\n');
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/transaction-identity-records.json'),JSON.stringify({synthetic_only:true,source:'current contract SCRIPT_BEFORE_INTERIM and 5 working days',frontend_run:false,real_services:false,records},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
