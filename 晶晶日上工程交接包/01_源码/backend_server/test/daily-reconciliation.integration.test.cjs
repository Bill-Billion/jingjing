'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('daily reconciliation scopes real ledger facts, detects differences and preserves independently reviewed history',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name='jx_test_daily_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,reviewer,outsider,buyer2}=S;
 for(const u of [seller,reviewer,outsider])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'FINANCE_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:daily',reason:'isolated daily reconciliation test'});
 const R=require('../src/modules/reconciliation/repository').createReconciliationRepository(db,{resolvePrincipal:S.resolvePrincipal}),bad=(p,code)=>assert.rejects(p,{code});
 const proof=async(u,text)=>S.supply.upload(u.ctx,{party_id:u.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from(text),operation_key:key()});
 const bookProof=await proof(seller,'Synthetic complete external statement; not actual bank or payment data'),feeProof=await proof(seller,'Synthetic independent fee evidence'),bankProof=await proof(seller,'Synthetic bank evidence; not real funds');
 const listing=await S.listing(),order=await S.checkout(listing),paid=await S.payment(order);
 const business_date=new Date(Date.now()-86400000+8*3600000).toISOString().slice(0,10),posted=business_date+' 04:00:00.000';
 await db.execute('UPDATE trade_journal SET created_at=? WHERE source_id=?',[posted,paid.payment.id]);
 const scope={business_date,merchant_party_id:seller.personal_party_id,provider:'ALIPAY',environment:'SANDBOX',app_id:S.config.app_id,merchant_id:S.config.merchant_id};
 let report,expected,fee,bank;
 const mutate=(method,fields={},who=seller,op=key())=>R[method](who.ctx,{report_id:report.id,expected_version:report.object_version,...fields,operation_key:op});
 await t.test('authenticated operators only, closed days and one batch per scoped day',async()=>{
  await bad(R.create(buyer.ctx,{scope,note:'synthetic',operation_key:key()}),'FINANCE_REVIEW_FORBIDDEN');
  await bad(R.create(seller.ctx,{scope:{...scope,business_date:'2026-02-30'},note:'synthetic',operation_key:key()}),'INVALID_RECONCILIATION_DAY');
  await bad(R.create(seller.ctx,{scope:{...scope,business_date:'2099-01-01'},note:'synthetic',operation_key:key()}),'RECONCILIATION_DAY_NOT_CLOSED');
  const op=key(),input={scope,note:'Synthetic day',operation_key:op};
  const both=await Promise.all([R.create(seller.ctx,input),R.create(seller.ctx,input)]);assert.equal(both[0].id,both[1].id);report=both[0];
  await bad(R.create(seller.ctx,{...input,operation_key:key()}),'RECONCILIATION_DAY_ALREADY_EXISTS');
  const f=await R.facts(seller.ctx,{report_id:report.id,after:0,limit:100});assert.equal(f.items.length,1);assert.equal(f.items[0].record_id,paid.payment.id);expected=f.items.map(({kind,source_key,...x})=>x);
  const other=await R.create(seller.ctx,{scope:{...scope,merchant_id:'another-account'},note:'different channel account',operation_key:key()});assert.equal((await R.facts(seller.ctx,{report_id:other.id,after:0,limit:100})).items.length,0);
  const prod=await R.create(seller.ctx,{scope:{...scope,environment:'PRODUCTION'},note:'No production services called',operation_key:key()});assert.equal((await R.facts(seller.ctx,{report_id:prod.id,after:0,limit:100})).items.length,0);
 });
 await t.test('missing books and mismatched money cannot be reviewed',async()=>{
  report=await mutate('compare');assert.equal(report.current_status,'DIFFERENCES');assert.equal(report.data.comparison.differences.length,5);
  report=await mutate('statement',{kind:'RECEIPT',mode:'REPLACE',items:[{...expected[0],amount_minor:99}],external_reference:'synthetic-receipt-book',evidence_asset_id:bookProof.id,no_activity_reason:''});
  report=await mutate('compare');assert(report.data.comparison.differences.some(x=>x.reason==='AMOUNT_OR_DIRECTION_MISMATCH'));
  await bad(mutate('review',{decision:'APPROVE',reason:'cannot waive discrepancy',verification:{scope_verified:true,statements_complete:true,manual_evidence_verified:true,sources_verified:true}},reviewer),'RECONCILIATION_NOT_MATCHED');
 });
 await t.test('manual fee/bank evidence is source-bound, separate from statements and never a payment',async()=>{
  fee={id:key(),kind:'FEE',source_ids:[paid.payment.id],external_reference:'synthetic-fee',direction:'OUT',amount_minor:1,evidence_asset_id:feeProof.id,reason:'Synthetic fee proof'};
  bank={id:key(),kind:'BANK',source_ids:[paid.payment.id],external_reference:'synthetic-bank',direction:'IN',amount_minor:99,evidence_asset_id:bankProof.id,reason:'Synthetic net bank credit'};
  await bad(mutate('manual',{mode:'REPLACE',items:[{...fee,amount_minor:101}]}),'RECONCILIATION_EVIDENCE_EXCEEDS_SOURCE');
  await bad(mutate('manual',{mode:'REPLACE',items:[{...fee,source_ids:[key()]}]}),'RECONCILIATION_SOURCE_NOT_VERIFIED');
  report=await mutate('manual',{mode:'REPLACE',items:[fee,bank]});
  for(const kind of ['RECEIPT','REFUND','SPLIT','FEE','BANK']){const items=kind==='RECEIPT'?expected:kind==='FEE'?[{record_id:fee.id,external_reference:fee.external_reference,direction:'OUT',amount_minor:1}]:kind==='BANK'?[{record_id:bank.id,external_reference:bank.external_reference,direction:'IN',amount_minor:99}]:[];
   report=await mutate('statement',{kind,mode:'REPLACE',items,external_reference:'synthetic-'+kind,evidence_asset_id:bookProof.id,no_activity_reason:items.length?'':'Synthetic no activity declaration'});
  }
  report=await mutate('compare');assert.equal(report.current_status,'READY');assert.equal(report.data.comparison.meaning,'COMPARISON_ONLY_NO_PAYMENT_OR_TRANSFER');
  const original=await R.read(seller.ctx,{report_id:report.id});assert.equal(original.sources_current,true);
  const journal=(await db.execute('SELECT COUNT(*) n FROM trade_journal'))[0][0];assert.equal(Number(journal.n),1);
  const badManual=await mutate('manual',{mode:'REPLACE',items:[{...fee,evidence_asset_id:bookProof.id},bank]});report=badManual;
  await bad(mutate('compare'),'INDEPENDENT_RECONCILIATION_EVIDENCE_REQUIRED');
  report=await mutate('manual',{mode:'REPLACE',items:[fee,bank]});report=await mutate('compare');
 });
 const verification={scope_verified:true,statements_complete:true,manual_evidence_verified:true,sources_verified:true};
 await t.test('editor cannot self-review; late ledger facts invalidate a frozen review without rewriting it',async()=>{
  await bad(mutate('review',{decision:'APPROVE',reason:'self review',verification}),'SELF_REVIEW_FORBIDDEN');
  await bad(mutate('review',{decision:'APPROVE',reason:'missing bank verification',verification:{...verification,manual_evidence_verified:false}},reviewer),'FINANCE_VERIFICATION_REQUIRED');
  report=await mutate('review',{decision:'APPROVE',reason:'Independent synthetic evidence checked',verification},reviewer);assert.equal(report.current_status,'REVIEWED');
  await bad(mutate('compare'),'RECONCILIATION_REOPEN_REQUIRED');
  const before=await R.history(reviewer.ctx,{report_id:report.id});assert.equal(before.items.length,1);
  const second=await S.payment(await S.checkout(listing,buyer2),buyer2);await db.execute('UPDATE trade_journal SET created_at=? WHERE source_id=?',[posted,second.payment.id]);
  assert.equal((await R.read(seller.ctx,{report_id:report.id})).effective_status,'RECHECK_REQUIRED');
  assert.equal((await R.list(reviewer.ctx,{after:'',limit:100,merchant_party_id:seller.personal_party_id,business_date})).items.find(x=>x.id===report.id).needs_recheck,true);
  assert.deepEqual((await R.history(reviewer.ctx,{report_id:report.id})).items,before.items);
  report=await mutate('reopen',{reason:'Late source arrived'});
  report=await mutate('compare');assert.equal(report.current_status,'DIFFERENCES');
  const f=await R.facts(seller.ctx,{report_id:report.id,after:0,limit:100});expected=f.items.map(({kind,source_key,...x})=>x);
  report=await mutate('statement',{kind:'RECEIPT',mode:'REPLACE',items:expected,external_reference:'synthetic-RECEIPT',evidence_asset_id:bookProof.id,no_activity_reason:''});report=await mutate('compare');
  await bad(mutate('review',{decision:'APPROVE',reason:'original editor still prohibited',verification}),'SELF_REVIEW_FORBIDDEN');
  report=await mutate('review',{decision:'APPROVE',reason:'Second independent review',verification},reviewer);
  assert.equal((await R.history(reviewer.ctx,{report_id:report.id})).items.length,2);
 });
 await t.test('HTTP exposes versioned resume, scoped ledger and private evidence without writing money',async()=>{
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const fixtures=[],base='http://127.0.0.1:'+server.address().port+'/api/v1/finance/daily-reconciliations';
  async function call(method,url,u,body,version,op=key(),party=null){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)}});if(!res.headers.get('content-type')?.includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.ok?'DailyReconciliationResponse':'ErrorResponse',value});return {status:res.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  assert.equal((await call('GET','/'+report.id,buyer)).status,403);
  assert.equal((await call('GET','/'+report.id,seller,undefined,undefined,key(),seller.personal_party_id)).status,400);
  ok(await call('GET','?merchant_party_id='+seller.personal_party_id,reviewer));ok(await call('GET','/'+report.id,reviewer));ok(await call('GET','/'+report.id+'/facts?limit=1',reviewer));ok(await call('GET','/'+report.id+'/history',reviewer));
  const download=await call('GET','/'+report.id+'/files/'+bookProof.id,reviewer);assert.equal(download.status,200);assert.deepEqual(download.bytes,S.bytes.get((await R.evidence(reviewer.ctx,{report_id:report.id,asset_id:bookProof.id})).object_key));
  const op=key(),body={reason:'HTTP reopen after interrupted response'},a=ok(await call('POST','/'+report.id+'/reopen',seller,body,report.object_version,op)),again=ok(await call('POST','/'+report.id+'/reopen',seller,body,report.object_version,op));assert.equal(a.object_version,again.object_version);
  assert.equal((await call('POST','/'+report.id+'/reopen',seller,{reason:'changed'},report.object_version,op)).status,409);
  const older={...scope,business_date:new Date(Date.now()-2*86400000+8*3600000).toISOString().slice(0,10)};
  let h=ok(await call('POST','',seller,{scope:older,note:'Synthetic HTTP zero-activity day'}));
  for(const kind of ['RECEIPT','REFUND','SPLIT','FEE','BANK'])h=ok(await call('POST','/'+h.id+'/statements',seller,{kind,mode:'REPLACE',items:[],external_reference:'synthetic-zero-'+kind,evidence_asset_id:bookProof.id,no_activity_reason:'Verified synthetic zero activity'},h.object_version));
  h=ok(await call('POST','/'+h.id+'/manual-evidence',seller,{mode:'REPLACE',items:[]},h.object_version));
  h=ok(await call('POST','/'+h.id+'/comparison',seller,{},h.object_version));assert.equal(h.current_status,'READY');
  h=ok(await call('POST','/'+h.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent synthetic zero-day proof verified',verification},h.object_version));
  assert.equal(h.current_status,'REVIEWED');
  // Evidence can become unavailable after closure; status must not stay a misleading green result.
  await db.execute("UPDATE supply_assets SET current_status='ERASURE_PENDING' WHERE id=?",[bookProof.id]);
  assert.equal(ok(await call('GET','/'+h.id,seller)).effective_status,'RECHECK_REQUIRED');
  assert.equal((await call('GET','/'+h.id+'/files/'+bookProof.id,reviewer)).status,409);
  await db.execute("UPDATE supply_assets SET current_status='READY' WHERE id=?",[bookProof.id]);
  const path=require('node:path'),out=path.resolve(__dirname,'../../../..','.local/daily-reconciliation-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 });
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
