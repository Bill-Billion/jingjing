'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('same commercial production accepts after finance confirmation and closes through independent manual archive',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_archive_timing_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const cases=[],checks=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{buyer,seller,reviewer}=S,{trade,quote,work,productionProof}=await S.commercialQuote({production:true});
  const order=await trade.accept(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()}),contract=structuredClone(order.data.contract);
  const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'synthetic-archive'},payment=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'full',operation_key:key()},config);
  await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',root='/gigs/orders/'+order.id+'/conversation';
  async function call(method,url,{user=buyer,party=user.personal_party_id,body,record,op=key()}={}){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op}:{},...record?{'If-Match':'"'+record.object_version+'"'}:{}},...body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{}});
   if(!(res.headers.get('content-type')||'').includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
   const value=await res.json();cases.push({method,path:new URL(base+url).pathname,schema:res.ok?(url.startsWith('/production/')?'ProductionRecordResponse':'CommercialConversationResponse'):'ErrorResponse',value});return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const message=ok(await call('POST',root+'/messages',{body:{kind:'TEXT',body:'Please complete the agreed final production'}}));
  const F=require('../src/modules/settlement/repository').createSettlementRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const review=r=>F.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'synthetic independent finance',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true},operation_key:key()});
  let agreement,settlement,finalVersion,finalBytes;
  await t.test('confirmed full current finance does not prematurely archive before accepted production',async()=>{
   agreement=await review(await F.agreement(seller.ctx,{party_id:seller.personal_party_id,source_type:'ORDER',source_id:order.id,previous_agreement_id:null,environment:'SANDBOX',rule_id:order.data.quote.rule_id,rules:{version:'synthetic-early-finance',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'Synthetic final delivery remains required',lines:[{line_id:'commercial',allocation:order.data.quote.marketplace_finance.allocation,deductions:[]}]},evidence_asset_id:productionProof.id,operation_key:key()}));
   const confirm=async r=>{for(const id of agreement.data.parties){const u=S.users.find(x=>x.personal_party_id===id);assert.ok(u);await F.confirm(u.ctx,{record_id:r.id,party_id:id,expected_version:r.object_version,content_sha256:r.content_sha256,decision:'APPROVED',reason:'synthetic exact facts',operation_key:key()});}};
   await confirm(agreement);settlement=await review(await F.settle(seller.ctx,{record_id:agreement.id,party_id:seller.personal_party_id,expected_version:agreement.object_version,period_reference:'before-acceptance',note:'Full payment, delivery still pending',operation_key:key()}));await confirm(settlement);
   assert.equal(settlement.data.received_minor,10001);assert.equal(settlement.data.receivable_minor,0);assert.equal(ok(await call('GET',root+'/messages')).status,'OPEN');assert.equal((await db.execute('SELECT order_id FROM gig_settlement_archives WHERE order_id=?',[order.id]))[0].length,0);
   checks.push({name:'full finance confirmed before final delivery keeps cooperation open',result:'PASS',order_id:order.id,settlement_id:settlement.id});
  });
  await t.test('same order completes all independently reviewed and buyer accepted production stages',async()=>{
   let project=ok(await call('POST','/production/projects',{user:seller,body:{order_id:order.id,line_id:'commercial',script_version_id:work.id,license_project_id:null,assignee_account_id:seller.account_id,purpose:'COMMERCIAL',territory:'CN',consent_ids:[],evidence_asset_id:productionProof.id}}));
   project=ok(await call('POST','/production/records/'+project.id+'/reviews',{user:reviewer,party:null,record:project,body:{decision:'APPROVED',reason:'Synthetic non-identifiable animation',verification:{contract_sha256:project.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}}}));
   for(const stage of ['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']){
    const bytes=Buffer.from('synthetic protocol-only '+stage+' '+key()),media=stage==='SCRIPT'?'text/plain':'video/mp4',file=ok(await call('POST','/production/projects/'+project.id+'/files?media_type='+encodeURIComponent(media),{user:seller,body:bytes}));
    const previewBytes=stage==='SCRIPT'?bytes:Buffer.from('synthetic preview '+stage+' '+key()),preview=stage==='SCRIPT'?file:ok(await call('POST','/production/projects/'+project.id+'/files?media_type='+encodeURIComponent(media),{user:seller,body:previewBytes}));
    project=ok(await call('GET','/production/records/'+project.id,{user:seller}));let version=ok(await call('POST','/production/projects/'+project.id+'/versions',{user:seller,record:project,body:{stage,file_id:file.id,preview_file_id:preview.id,note:'Synthetic protocol bytes, not playable-video evidence'}}));
    const verification=stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
    version=ok(await call('POST','/production/records/'+version.id+'/reviews',{user:reviewer,party:null,record:version,body:{decision:'APPROVED',reason:'Synthetic independent stage review',verification}}));assert.deepEqual((await call('GET','/production/versions/'+version.id+'/content?variant=preview')).bytes,previewBytes);
    ok(await call('POST','/production/versions/'+version.id+'/feedback',{record:version,body:{decision:'ACCEPT',note:'Synthetic buyer accepts',checklist:verification}}));if(stage==='FINAL'){finalVersion=version;finalBytes=bytes;}
   }
   project=ok(await call('GET','/production/records/'+project.id,{user:seller}));assert.equal(project.current_status,'ACCEPTED');
   checks.push({name:'same paid order accepts all four production stages after finance',result:'PASS',order_id:order.id,project_id:project.id,final_version_id:finalVersion.id});
  });
  await t.test('independent manual archive finishes the later-acceptance path without changing rights or money',async()=>{
   const current=ok(await call('GET',root+'/messages'));assert.equal(current.status,'OPEN');
   const G=require('../src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal:S.resolvePrincipal}),input={order_id:order.id,expected_version:current.object_version,action:'ARCHIVE',reason:'Final production accepted after complete finance confirmation',operation_key:key()};
   await assert.rejects(G.commercialControl(buyer.ctx,{...input,party_id:buyer.personal_party_id}),e=>e.code==='GIG_REVIEW_FORBIDDEN');
   const archived=await G.commercialControl(reviewer.ctx,{...input,party_id:null});assert.deepEqual(await G.commercialControl(reviewer.ctx,{...input,party_id:null}),archived);
   const history=ok(await call('GET',root+'/messages'));assert.equal(history.status,'ARCHIVED');assert.equal(history.items.filter(x=>x.id===message.id).length,1);
   assert.equal((await call('POST',root+'/messages',{body:{kind:'TEXT',body:'Do not reopen'}})).error.code,'COMMERCIAL_CONVERSATION_ARCHIVED');
   await assert.rejects(G.commercialControl(reviewer.ctx,{...input,party_id:null,expected_version:history.object_version,action:'RESUME',operation_key:key()}),e=>e.code==='COMMERCIAL_CONTROL_NOT_ALLOWED');
   assert.deepEqual((await call('GET','/production/versions/'+finalVersion.id+'/content?variant=final')).bytes,finalBytes);
   const latest=await trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id});assert.deepEqual(latest.data.contract,contract);assert.deepEqual(latest.data.financial,{received_minor:10001,refunded_minor:0,net_minor:10001});assert.equal((await db.execute("SELECT id FROM finance_entries WHERE agreement_id=? AND category='PAYOUT'",[agreement.id]))[0].length,0);
   checks.push({name:'independent manual archive preserves history and delivered bytes without payout or new rights',result:'PASS',order_id:order.id,settlement_id:settlement.id});
  });
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/commercial-archive-timing.json'),JSON.stringify({synthetic_only:true,cases},null,2));await fs.writeFile(path.resolve(__dirname,'../../../../.local/commercial-archive-timing-records.json'),JSON.stringify({result:'PASS',checks,limits:['Actual independent manual archive; no automatic historical scan','Synthetic payment and protocol bytes, no creative-quality or real-payment evidence','No frontend or real services']},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
