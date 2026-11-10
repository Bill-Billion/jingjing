'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createRuleContent,digest}=require('../src/modules/governance/content');
test('personal trade copies preserve receipts, refunds and historical contracts',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer,producer,outsider,reviewer,artist:seller}=S.people,trade=S.trade;
  const repo=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const request=(who,scopes=['ALL'],type='COPY')=>repo.create(who.ctx,{request:{type,scopes,details:'Synthetic transaction copy'},operation_key:key()});
  const all=await request(buyer),onlyMoney=await request(buyer,['TRANSACTIONS']),onlyContracts=await request(buyer,['CONTRACTS']),profile=await request(buyer,['PROFILE']),deletion=await request(buyer,['ALL'],'DELETE'),sellerRequest=await request(seller),orgRequest=await request(producer);
  const ruleId=key(),rule=createRuleContent({id:ruleId,rule_key:'copy.synthetic',version:'1',terms:{explicit:'Synthetic historical promise'}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'copy.synthetic','1',JSON.stringify(rule),'2020-01-01 00:00:00',seller.account_id,'EFFECTIVE']);
  const spec=await S.reviewTrade(await trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic personal supplier',provider_party_id:seller.personal_party_id,line_kind:'PRODUCTION',unit_minor:10000,currency:'CNY',specification:{version:'1',service_tier:'Synthetic',sample_seconds:20,final_seconds:90,revision_limit:1,deliverables:['synthetic film'],terms:'Synthetic only'},operation_key:key()}));
  async function make(who=buyer){const q=await S.reviewTrade(await trade.quote(seller.ctx,{party_id:seller.personal_party_id,buyer_party_id:who.acting_party_id,lines:[{line_id:'film',spec_id:spec.id,quantity:1}],installments:[{key:'first',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'film',amount_minor:10000}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'DIRECT_SUPPLIER',rule_id:ruleId,expires_at:'2099-01-01T00:00:00.000Z',payment_window_minutes:30,license_reservation_id:null,operation_key:key()}));return trade.accept(who.ctx,{party_id:who.acting_party_id,record_id:q.id,quote_sha256:q.content_sha256,expected_version:q.object_version,operation_key:key()});}
  const order=await make(),other=await make(),foreign=await make(outsider),orgOrder=await make(producer);
  const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'copy-test'};
  const payment=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'first',operation_key:key()},config);
  await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:10000,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
  let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'film',amount_minor:2500}],reason:'Synthetic partial refund',operation_key:key()});
  refund=await S.reviewTrade(refund);await trade.claim(reviewer.ctx,refund.id,null,'REFUND');
  await trade.applyRefund(refund.id,{...config,refund_id:refund.id,payment_id:payment.id,transaction_id:refund.data.transaction_id,currency:'CNY',amount_minor:2500,status:'SUCCEEDED'});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,fixtures=[];
  async function page(section,{who=buyer,req=all,record=order,query='',party=null}={}){const url='/api/v1/privacy/requests/'+req.id+'/transaction-data',r=await fetch(base+url+'?section='+section+(section==='ORDERS'?'':'&order_id='+record.id)+query,{headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{}}}),value=await r.json();fixtures.push({method:'GET',path:url,schema:r.status===200?'PrivacyTransactionCopyPageResponse':'ErrorResponse',value});return {status:r.status,cache:r.headers.get('cache-control'),...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.cache,'no-store');return r.data;};
  await t.test('own buyer and seller paginate; organization membership gives no personal copy',async()=>{
   let cursor='',rows=[];do{const p=ok(await page('ORDERS',{query:'&limit=1'+(cursor?'&cursor='+cursor:'')}));rows.push(...p.items);cursor=p.next_cursor;}while(cursor);
   assert.deepEqual(rows.map(x=>x.id).sort(),[order.id,other.id].sort());assert.deepEqual(rows[0].roles,['BUYER']);
   const p=ok(await page('ORDERS',{who:seller,req:sellerRequest}));assert.equal(p.items.length,4);assert.deepEqual(p.items[0].roles,['MERCHANT']);
   assert.deepEqual(ok(await page('ORDERS',{who:producer,req:orgRequest})).items,[]);assert.equal((await page('SUMMARY',{who:producer,req:orgRequest,record:orgOrder})).status,404);
  });
  await t.test('gross and refund facts remain separate; no provider secrets or false completion',async()=>{
   const s=ok(await page('SUMMARY')).items[0];assert.deepEqual(s.financial,{received_minor:10000,refunded_minor:2500,net_minor:7500});assert.equal(s.total_minor,10000);
   assert.equal(ok(await page('SUMMARY',{record:other})).items[0].financial.received_minor,0);
   const p=ok(await page('PAYMENTS')).items[0],r=ok(await page('REFUNDS')).items[0];assert.equal(p.amount_minor,10000);assert.equal(r.amount_minor,2500);assert.equal(r.current_status,'SUCCEEDED');assert.equal(p.environment,'SANDBOX');
   for(const x of [p,r])for(const field of ['app_id','merchant_id','proof','checkout','review','consumer_request_key','transaction_id'])assert.equal(x[field],undefined);
   let cursor='',entries=[];do{const p=ok(await page('JOURNAL',{query:'&limit=1'+(cursor?'&cursor='+cursor:'')}));entries.push(...p.items);cursor=p.next_cursor;}while(cursor);
   assert.deepEqual(entries.map(x=>[x.direction,x.amount_minor]).sort(),[['RECEIPT',10000],['REFUND',2500]]);assert.equal(entries[0].provider_reference,undefined);
   assert.equal(ok(await page('SUMMARY')).request_completion,'NOT_CONFIRMED');assert.equal((await repo.read(buyer.ctx,{request_id:all.id})).current_status,'RECEIVED');
  });
  await t.test('redacted contract has its own checksum; source stays unchanged and unsigned',async()=>{
   const c=ok(await page('CONTRACT')).items[0];assert.equal(c.copy_kind,'REDACTED_CONTRACT_COPY');assert.equal(c.signing_method,'NOT_SIGNED');
   assert.equal(c.source_content_sha256,order.data.contract.content_sha256);assert.equal(c.copy_sha256,digest(c.terms));assert.notEqual(c.copy_sha256,c.source_content_sha256);
   assert.equal(c.terms.commitments.quote.review,undefined);assert.ok(c.redacted_paths.includes('commitments.quote.review'));assert.equal(c.terms.commitments.quote.lines[0].review,undefined);assert.equal(c.terms.commitments.quote.total_minor,10000);
   assert.deepEqual((await trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id})).data.contract,order.data.contract);
   assert.equal(ok(await page('CONTRACT',{who:seller,req:sellerRequest})).items[0].source_content_sha256,c.source_content_sha256);
  });
  await t.test('scope, account and cursor isolation apply to every request',async()=>{
   assert.equal((await page('CONTRACT',{req:onlyMoney})).status,409);assert.equal((await page('SUMMARY',{req:onlyContracts})).status,409);assert.equal(ok(await page('ORDERS',{req:onlyContracts})).items.length,2);ok(await page('CONTRACT',{req:onlyContracts}));
   for(const req of [profile,deletion])assert.equal((await page('SUMMARY',{req})).status,409);
   for(const opts of [{who:outsider},{record:foreign}])assert.equal((await page('SUMMARY',opts)).status,404);
   assert.equal((await page('SUMMARY',{party:buyer.personal_party_id})).status,400);
   for(const opts of [{section:'REFUNDS',query:'&cursor='+payment.id},{section:'PAYMENTS',record:other,query:'&cursor='+payment.id},{section:'SUMMARY',query:'&cursor='+payment.id},{section:'ORDERS',query:'&limit=0'},{section:'ORDERS',query:'&extra=1'}])assert.equal((await page(opts.section,opts)).status,400);
   for(const section of ['invalid','__proto__'])assert.equal((await page(section)).status,400);
  });
  await t.test('corrupt records and inconsistent journal fail closed',async()=>{
   const [[r]]=await db.execute('SELECT data_sha256 FROM trade_records WHERE id=?',[payment.id]);try{await db.execute('UPDATE trade_records SET data_sha256=? WHERE id=?',['0'.repeat(64),payment.id]);assert.equal((await page('PAYMENTS')).status,503);assert.equal((await page('JOURNAL')).status,503);}finally{await db.execute('UPDATE trade_records SET data_sha256=? WHERE id=?',[r.data_sha256,payment.id]);}
   try{await db.execute('UPDATE trade_journal SET amount_minor=10001 WHERE source_id=?',[payment.id]);assert.equal((await page('SUMMARY')).status,503);assert.equal((await page('JOURNAL')).status,503);}finally{await db.execute('UPDATE trade_journal SET amount_minor=10000 WHERE source_id=?',[payment.id]);}
   const [[o]]=await db.execute('SELECT data_json,data_sha256 FROM trade_records WHERE id=?',[order.id]),original=typeof o.data_json==='string'?JSON.parse(o.data_json):o.data_json,bad=structuredClone(original);bad.contract.commitments.quote.total_minor=1;
   try{await db.execute('UPDATE trade_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(bad),digest(bad),order.id]);assert.equal((await page('CONTRACT')).status,503);}finally{await db.execute('UPDATE trade_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(original),o.data_sha256,order.id]);}
  });
  await t.test('unknown payment and requested refund never become received or refunded money',async()=>{
   const pending=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:other.id,installment_key:'first',operation_key:key()},config);await trade.claim(buyer.ctx,pending.id,buyer.personal_party_id,'PAYMENT');await trade.dispatchResult(pending.id,null,true);
   assert.equal(ok(await page('PAYMENTS',{record:other})).items[0].current_status,'UNKNOWN');assert.equal(ok(await page('SUMMARY',{record:other})).items[0].financial.received_minor,0);assert.deepEqual(ok(await page('JOURNAL',{record:other})).items,[]);
   const unapproved=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'film',amount_minor:1000}],reason:'Synthetic unapproved request',operation_key:key()});
   assert.equal(ok(await page('REFUNDS')).items.find(x=>x.id===unapproved.id).current_status,'REQUESTED');assert.equal(ok(await page('SUMMARY')).items[0].financial.refunded_minor,2500);
  });
  await t.test('creation, cancellation and payment deadline are actual recorded facts, not settlement timestamps',async()=>{
   const s=ok(await page('SUMMARY')).items[0];assert.ok(s.created_at.endsWith('Z'));assert.equal(s.cancel_reason,null);
   assert.equal(ok(await page('ORDERS')).items.find(x=>x.id===order.id).created_at,s.created_at);
   assert.equal(ok(await page('PAYMENTS')).items.find(x=>x.id===payment.id).expires_at,payment.data.expires_at);assert.equal(ok(await page('REFUNDS')).items.find(x=>x.id===refund.id).expires_at,null);
   const cancellable=await make();const cancelled=await trade.cancel(buyer.ctx,{record_id:cancellable.id,party_id:buyer.personal_party_id,expected_version:cancellable.object_version,reason:'Synthetic customer cancelled before payment',operation_key:key()});
   const mine=ok(await page('SUMMARY',{record:cancelled})).items[0],supplier=ok(await page('SUMMARY',{who:seller,req:sellerRequest,record:cancelled})).items[0];assert.equal(mine.cancel_reason,'Synthetic customer cancelled before payment');assert.equal(supplier.cancel_reason,mine.cancel_reason);assert.equal(mine.financial.received_minor,0);
   const [[row]]=await db.execute('SELECT data_json,data_sha256 FROM trade_records WHERE id=?',[payment.id]),original=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;
   try{for(const expires_at of ['synthetic-invalid-time','2026-02-30T00:00:00.000Z']){const bad={...original,expires_at};await db.execute('UPDATE trade_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(bad),digest(bad),payment.id]);assert.equal((await page('PAYMENTS')).status,503);}}finally{await db.execute('UPDATE trade_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(original),row.data_sha256,payment.id]);}
  });
  await t.test('disabled account is rechecked, reads do not complete the privacy request',async()=>{
   try{await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[buyer.account_id]);assert.notEqual((await page('CONTRACT')).status,200);}finally{await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[buyer.account_id]);}
   assert.equal((await repo.read(buyer.ctx,{request_id:all.id})).current_status,'RECEIVED');
  });
  const out=path.resolve(__dirname,'../../../..','.local/prelaunch-transaction-copy-20261106/http.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
