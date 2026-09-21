'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./fixtures/legacy-http.cjs');
test('sample payment buttons cannot mark either installment paid',async(t)=>{
 const {db,request}=await fixture(t);
 for(const [id,state,path] of [[1,'draft','pay-intent'],[2,'script_finalized','pay-production']]){
  db.prepare('INSERT INTO sample_orders(id,order_no,user_id,status,step) VALUES (?,?,?,?,?)').run(id,'S'+id,1,state,id===1?0:4);
  const before=db.prepare('SELECT * FROM sample_orders WHERE id=?').get(id);
  for(let i=0;i<2;i++)assert.equal((await request('POST',`/samples/${id}/${path}`,{paid:true,receipt:'fabricated'})).status,503);
  assert.deepEqual(db.prepare('SELECT * FROM sample_orders WHERE id=?').get(id),before);
  assert.equal((await request('POST',`/samples/${id}/${path}`,{},2)).status,404);
  assert.equal((await request('POST',`/samples/${id}/${path}`,{},null)).status,401);
 }
});
test('unavailable identity verification cannot autoapprove or collect identity documents',async(t)=>{
 const {db,request,idVerify,upstream}=await fixture(t);
 for(const configured of [false,true]){
  idVerify.ready=()=>configured;
  const r=await request('POST','/identity/submit',{identityType:'personal',realName:'Synthetic Test',idCard:'000000000000000000'});
  assert.equal(r.status,503);assert.equal(r.body.verified,false);assert.equal(r.body.submitted,false);assert.equal(r.body.status,'pending');
 }
 assert.equal(db.prepare('SELECT COUNT(*) n FROM user_identities').get().n,0);assert.equal(upstream(),0);
});
test('old transaction status is visible only to the owner of its matching business order',async(t)=>{
 const {db,request}=await fixture(t);
 db.prepare("INSERT INTO video_orders(order_no,user_id,amount,status) VALUES ('V1',1,12345,'pending')").run();
 db.prepare("INSERT INTO payment_transactions(tx_no,order_no,order_type,channel,amount,status) VALUES ('TX1','V1','video','mock',12345,'success')").run();
 for(const role of ['user','admin'])assert.equal((await request('GET','/payment/status/TX1',{},2,role)).status,404);
 const own=await request('GET','/payment/status/TX1');assert.equal(own.status,200);assert.equal(own.body.amount,123.45);assert.equal(own.body.status,'unverified');assert.equal(own.body.recordedStatus,'success');assert.equal(own.body.paymentVerified,false);
 assert.equal((await request('GET','/payment/status/TX1',{},null)).status,401);
});

test('transaction ownership covers every old order type, collisions, unknown types and orphan records',async(t)=>{
 const {db,request}=await fixture(t);
 for(const [type,table] of [['video','video_orders'],['endorsement','endorsement_orders'],['customization','claims'],['recruiting','claims'],['sample','sample_orders']]){
  const order='order-'+type,tx='tx-'+type;
  db.prepare(`INSERT INTO ${table}(order_no,user_id,amount) VALUES (?,?,?)`).run(order,1,9900);
  db.prepare('INSERT INTO payment_transactions(tx_no,order_no,order_type,channel,amount,status) VALUES (?,?,?, ?,?,?)').run(tx,order,type,'mock',9900,'pending');
  assert.equal((await request('GET','/payment/status/'+tx)).status,200);
  assert.equal((await request('GET','/payment/status/'+tx,{},2)).status,404);
 }
 db.prepare("INSERT INTO video_orders(order_no,user_id,amount) VALUES ('collision',1,9900)").run();
 db.prepare("INSERT INTO endorsement_orders(order_no,user_id,amount) VALUES ('collision',2,9900)").run();
 for(const [tx,order,type] of [['tx-collision','collision','endorsement'],['tx-unknown','collision','unrecognized'],['tx-orphan','missing','sample']]){
  db.prepare('INSERT INTO payment_transactions(tx_no,order_no,order_type,channel,amount,status) VALUES (?,?,?,?,?,?)').run(tx,order,type,'mock',9900,'pending');
  const r=await request('GET','/payment/status/'+tx);assert.equal(r.status,404);assert.equal(r.body.amount,undefined);
 }
});
test('Alipay status returns only owned rows and never queries or advances a payment during a read',async(t)=>{
 const {db,request,upstream}=await fixture(t);
 for(const [pay,user,stage,status] of [['mine',1,'intent','paid'],['other',2,'production','pending']])db.prepare('INSERT INTO payments(pay_no,order_no,biz_type,stage,amount_fen,buyer_id,status) VALUES (?,?,?,?,?,?,?)').run(pay,'shared','sample',stage,9900,user,status);
 const before=db.prepare('SELECT * FROM payments ORDER BY id').all();
 const mine=await request('GET','/pay/status/shared');assert.equal(mine.status,200);assert.equal(mine.body.payments.length,1);assert.equal(mine.body.payments[0].payNo,'mine');assert.equal(mine.body.payments[0].paid,false);assert.equal(mine.body.payments[0].recordedStatus,'paid');
 const other=await request('GET','/pay/status/shared',{},2);assert.equal(other.body.payments.length,1);assert.equal(other.body.payments[0].payNo,'other');
 for(const role of ['user','admin'])assert.equal((await request('GET','/pay/status/shared',{},99,role)).status,404);
 assert.equal(upstream(),0);assert.deepEqual(db.prepare('SELECT * FROM payments ORDER BY id').all(),before);
});
test('legacy writes, callbacks and Apple receipts are disabled even with configured test providers',async(t)=>{
 const {db,request,upstream}=await fixture(t);
 for(const path of ['/payment/pay','/payment/apple/verify','/pay/alipay/create']){
  const r=await request('POST',path,{orderNo:'fabricated',orderType:'sample',bizType:'sample',receiptData:'synthetic-receipt'});
  assert.equal(r.status,503);assert.equal(r.body.code,'PAYMENT_NOT_READY');assert.equal(r.body.demo,false);
  assert.equal((await request('POST',path,{},null)).status,401);
 }
 for(const path of ['/payment/wx/notify','/payment/alipay/notify','/pay/alipay/notify']){
  const r=await request('POST',path,{trade_status:'TRADE_SUCCESS',out_trade_no:'fabricated',sign:'synthetic'},null);
  assert.equal(r.status,503);assert.equal(r.body,'fail');
 }
 for(const table of ['payments','payment_transactions','refunds'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 assert.equal(upstream(),0);
});
test('old approved identities stay unchanged but are not exposed as verified or accepted by dependent actions',async(t)=>{
 const {db,request,upstream}=await fixture(t);
 db.prepare("INSERT INTO user_identities(user_id,identity_type,real_name,id_card,status,liveness_verified) VALUES (1,'personal','Synthetic','synthetic-cipher','approved',1)").run();
 db.prepare("INSERT INTO wallets(user_id,balance,id_verified,alipay_account) VALUES (1,100000,1,'synthetic-account')").run();
 const identityBefore=db.prepare('SELECT * FROM user_identities').get(),walletBefore=db.prepare('SELECT * FROM wallets').get();
 const status=await request('GET','/identity/status');assert.equal(status.body.verified,false);assert.equal(status.body.status,'pending');assert.equal(status.body.recordedStatus,'approved');assert.equal(status.body.livenessVerified,false);assert.equal(status.body.id_card,undefined);
 const wallet=await request('GET','/settlement/wallet');assert.equal(wallet.body.idVerified,false);assert.equal(wallet.body.identityStatus,'pending');
 for(const [method,path] of [['POST','/settlement/bind-account'],['POST','/settlement/withdraw'],['POST','/face/init'],['GET','/face/result/old-reference']]){
  const r=await request(method,path,{amount:100,channel:'alipay',humanId:1,facePictureUrl:'synthetic'});assert.equal(r.status,503);assert.equal(r.body.code,'IDENTITY_NOT_READY');
 }
 const resubmit=await request('POST','/identity/submit',{identityType:'personal',realName:'changed',idCard:'000000000000000000'});assert.equal(resubmit.status,503);
 assert.deepEqual(db.prepare('SELECT * FROM user_identities').get(),identityBefore);assert.deepEqual(db.prepare('SELECT * FROM wallets').get(),walletBefore);assert.equal(upstream(),0);
});
test('company submissions remain pending and rejected history is not promoted to verified',async(t)=>{
 const {db,request}=await fixture(t);
 const company=await request('POST','/identity/submit',{identityType:'company',companyName:'Synthetic Company',creditCode:'SYNTHETIC'});
 assert.equal(company.status,200);assert.equal(company.body.status,'pending');assert.equal(company.body.verified,false);assert.equal(company.body.submitted,true);
 db.prepare("UPDATE user_identities SET status='rejected',reject_reason='synthetic rejection' WHERE user_id=1").run();
 const status=await request('GET','/identity/status');assert.equal(status.body.status,'rejected');assert.equal(status.body.verified,false);
});
test('default finance service cannot create, confirm or refund money in any environment',async(t)=>{
 const {db,payment}=await fixture(t);const config=require('../config');const saved=config.env;
 db.prepare("INSERT INTO video_orders(order_no,user_id,amount,status) VALUES ('funds',1,9900,'pending')").run();
 db.prepare("INSERT INTO payment_transactions(tx_no,order_no,order_type,channel,amount,status) VALUES ('funds-tx','funds','video','mock',9900,'success')").run();
 const before=db.prepare('SELECT * FROM payment_transactions').all();
 try{
  for(const env of ['test','development','production']){
   config.env=env;
   for(const channel of ['mock','wechat','alipay','apple_iap','unknown']){
    await assert.rejects(payment.createPayment({orderNo:'funds',orderType:'video',amount:9900,channel}),{code:'PAYMENT_NOT_READY'});
    await assert.rejects(payment.handleCallback(channel,{},'{}'),{code:'PAYMENT_NOT_READY'});
   }
   await assert.rejects(payment.onPaymentSuccess(before[0]),{code:'PAYMENT_NOT_READY'});
   await assert.rejects(payment.refund('funds',9900,'test'),{code:'PAYMENT_NOT_READY'});
  }
 }finally{config.env=saved;}
 assert.equal(db.prepare("SELECT status FROM video_orders WHERE order_no='funds'").get().status,'pending');
 assert.deepEqual(db.prepare('SELECT * FROM payment_transactions').all(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM refunds').get().n,0);
});

test('obsolete scripts that expected demo success are stopped before loading services',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 for(const name of ['aliyun_compliance_selftest.js','volc_compliance_selftest.js','verify_pay_skeleton.js','pay_sandbox_joint_test.js']){
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts',name)],{encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.status,1);assert.match(result.stderr,/LEGACY_SELFTEST_RETIRED/);
 }
});
