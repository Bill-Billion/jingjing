'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('ordinary publishing and same-notice cooperation in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex');
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server,web;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{buyer,buyer2,seller,outsider,reviewer,notices:N}=S;
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[],records={synthetic_only:true,database:name};
  async function call(method,url,u=buyer,body,party=u.personal_party_id,h={}){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...(party?{'X-Acting-Party':party}:{}),...(body?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{}),...h},...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
   if(!(res.headers.get('content-type')||'').includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
   const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.startsWith('/gigs/')?'CommercialConversationResponse':url.startsWith('/trade/')?'TradeRecordResponse':url.startsWith('/production/')?'ProductionRecordResponse':'NoticeResponse'):'ErrorResponse',value});
   return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,c)=>assert.equal(r.error?.code,c,JSON.stringify(r));
  const headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
  const approve=(r,u=reviewer,checks={content_reviewed:true,materials_reviewed:true,no_private_contact:true})=>call('POST','/notices/records/'+r.id+'/reviews',u,{decision:'APPROVE',reason:'synthetic independent review',checks},null,headers(r));
  const read=(r,u=buyer)=>call('GET','/notices/records/'+r.id,u);
  const create=(rule,u=buyer,notice=S.body,h=headers(),party=u.personal_party_id)=>call('POST','/notices/announcements',u,{rule_id:rule.id,notice},party,h);
  let rule,published,legacy,submission,caseRecord,quote,trade,order,work,productionProof;
  await t.test('new publishing rule requires independent approval; old rule and notices retain snapshots',async()=>{
   legacy=ok(await approve(ok(await create(S.rule))));
   const input={...S.ruleInput,version:'PM01-20261111',publishing_policy:'VERIFIED_ADULT_20261111'};
   let pending=ok(await call('POST','/notices/rules',outsider,{rule:input},null,headers()));
   bad(await create(pending,buyer2),'NOTICE_RULE_NOT_EFFECTIVE');
   bad(await approve(pending,outsider,{business_rule_verified:true}),'SELF_REVIEW_FORBIDDEN');
   rule=ok(await approve(pending,reviewer,{business_rule_verified:true}));
   const rules=ok(await call('GET','/notices/rules',buyer,undefined,null)).items;
   assert.equal(rules.find(r=>r.id===rule.id).rule.publishing_policy,'VERIFIED_ADULT_20261111');
   assert.equal(rules.find(r=>r.id===S.rule.id).rule.publishing_policy,undefined);
   records.rule_id=rule.id;records.legacy_rule_id=S.rule.id;records.legacy_notice_id=legacy.id;
  });
  await t.test('never-funded adult can publish all five ordinary types without changing membership',async()=>{
   assert.equal(ok(await call('GET','/notices/eligibility?rule_id='+S.rule.id,buyer2)).active,false);
   const q=ok(await call('GET','/notices/eligibility?rule_id='+rule.id,buyer2));
   assert.equal(q.active,true);assert.equal(q.level,0);assert.deepEqual(q.types,['DRAMA','PERFORMANCE','COMMERCIAL','EVENT','RECRUITMENT']);
   const details={DRAMA:{synopsis:'synthetic',roles:'adult'},PERFORMANCE:{venue:'synthetic',schedule:'synthetic',requirements:'adult'},COMMERCIAL:{deliverables:'synthetic',requirements:'adult'},EVENT:{venue:'synthetic',schedule:'synthetic'},RECRUITMENT:S.body.details};
   for(const type of q.types){
    const n=ok(await create(rule,buyer2,{...S.body,type,details:details[type],accept_submissions:['DRAMA','RECRUITMENT'].includes(type)}));
    bad(await call('GET','/notices/catalog/'+n.id,seller,undefined,null),'NOTICE_NOT_OPEN');
    const live=ok(await approve(n));assert.equal(live.current_status,'PUBLISHED');
    assert.equal(ok(await call('GET','/notices/catalog/'+n.id,seller,undefined,null)).official,false);
   }
   assert.equal(ok(await call('GET','/notices/eligibility?rule_id='+S.rule.id,buyer2)).active,false);
  });
  await t.test('membership revocation leaves new ordinary publishing usable and legacy eligibility unchanged',async()=>{
   await N.close(reviewer.ctx,{record_id:S.topup.id,expected_version:S.topup.object_version,reason:'synthetic membership loss',operation_key:key()});
   bad(await call('GET','/notices/catalog/'+legacy.id,seller,undefined,null),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   bad(await create(S.rule),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   const requestKey=key(),h=headers(null,requestKey),pending=ok(await create(rule,buyer,S.body,h));
   assert.deepEqual(ok(await create(rule,buyer,S.body,h)),pending);
   bad(await create(rule,buyer,{...S.body,title:'changed request'},h),'IDEMPOTENCY_CONFLICT');
   assert.equal(ok(await read(pending)).current_status,'IN_REVIEW');
   bad(await approve(pending,buyer),'NOTICE_OPERATOR_FORBIDDEN');
   published=ok(await approve(pending));assert.equal(ok(await read(published)).data.rule_id,rule.id);
   records.notice_id=published.id;
   assert.ok(ok(await call('GET','/notices/catalog?publisher_party_id='+buyer.personal_party_id,seller,undefined,null)).items.some(r=>r.id===published.id));
   assert.equal(ok(await read(legacy)).content_sha256,legacy.content_sha256);
  });
  await t.test('unverified, child, expired, inactive, foreign identity and official impersonation remain rejected',async()=>{
   bad(await create(rule,outsider),'NOTICE_VERIFIED_ADULT_REQUIRED');
   bad(await create(rule,buyer2,S.body,headers(),buyer.personal_party_id),'ARTIST_PARTY_FORBIDDEN');
   bad(await create(rule,buyer,{...S.body,type:'OFFICIAL',details:{summary:'synthetic'},accept_submissions:false},headers(),null),'NOTICE_OPERATOR_FORBIDDEN');
   bad(await create(rule,buyer,{...S.body,description:'https://example.test'}),'NOTICE_PRIVATE_CONTACT_FORBIDDEN');
   const fields=[['age_band','MINOR','ADULT'],['identity_status','FAILED','VERIFIED'],['current_status','WITHDRAWN','ACTIVE'],['identity_valid_until','2020-01-01 00:00:00.000','2099-01-01 00:00:00.000']];
   for(const [field,value,restore]of fields){
    await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[value,buyer2.person.id]);
    try{bad(await create(rule,buyer2),'NOTICE_VERIFIED_ADULT_REQUIRED');}finally{await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[restore,buyer2.person.id]);}
   }
   const rejected=ok(await create(rule,buyer2));
   const out=ok(await call('POST','/notices/records/'+rejected.id+'/reviews',reviewer,{decision:'REJECT',reason:'synthetic rejection',checks:null},null,headers(rejected)));
   assert.equal(out.current_status,'REJECTED');bad(await call('GET','/notices/catalog/'+out.id,seller,undefined,null),'NOTICE_NOT_OPEN');
  });
  await t.test('identity or ownership lost after submission is checked at review and public read',async()=>{
   const pending=ok(await create(rule,buyer2));
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00.000' WHERE id=?",[buyer2.person.id]);
   try{bad(await approve(pending),'NOTICE_VERIFIED_ADULT_REQUIRED');assert.equal(ok(await read(pending,buyer2)).current_status,'IN_REVIEW');}
   finally{await db.execute("UPDATE artist_people SET identity_valid_until='2099-01-01 00:00:00.000' WHERE id=?",[buyer2.person.id]);}
   const live=ok(await approve(pending));
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[buyer2.personal_party_id,buyer2.account_id]);
   try{bad(await call('GET','/notices/catalog/'+live.id,seller,undefined,null),'ARTIST_PARTY_FORBIDDEN');}
   finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[buyer2.personal_party_id,buyer2.account_id]);}
   assert.equal(ok(await call('GET','/notices/catalog/'+live.id,seller,undefined,null)).id,live.id);
  });
  await t.test('organization scope and other project ownership cannot be bypassed with an ordinary rule',async()=>{
   const org=await S.parties.createOrganization(buyer2.ctx,{display_name:'synthetic ordinary organization',operation_key:key()});
   bad(await create(rule,buyer2,S.body,headers(),org.party_id),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   bad(await create(rule,buyer2,{...S.body,project_id:key()}),'NOTICE_PROJECT_MISMATCH');
   const proof=await S.supply.upload(buyer2.ctx,{party_id:org.party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic qualification'),operation_key:key()});
   const q=await N.applyQualification(buyer2.ctx,{party_id:org.party_id,types:['RECRUITMENT'],valid_from:S.body.valid_from,valid_until:S.body.valid_until,evidence_asset_ids:[proof.id],terms:'synthetic scope',operation_key:key()});
   ok(await approve(q,reviewer,{identity_verified:true,authority_verified:true,evidence_verified:true}));
   assert.equal(ok(await approve(ok(await create(rule,buyer2,S.body,headers(),org.party_id)))).current_status,'PUBLISHED');
   bad(await create(rule,buyer2,{...S.body,type:'EVENT',details:{venue:'synthetic',schedule:'synthetic'},accept_submissions:false},headers(),org.party_id),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
  });
  await t.test('same notice receives reviewed artist submission then one support case after lost response recovery',async()=>{
   const body={rule_id:rule.id,submission:{...S.submission,notice_id:published.id}},h=headers();
   const pending=ok(await call('POST','/notices/submissions',seller,body,seller.personal_party_id,h));
   assert.deepEqual(ok(await call('POST','/notices/submissions',seller,body,seller.personal_party_id,h)),pending);
   bad(await read(pending),'NOTICE_NOT_FOUND');
   submission=ok(await approve(pending));
   const decisionHeaders=headers(submission),decisionBody={decision:'INTERESTED'};
   const interested=ok(await call('POST','/notices/submissions/'+submission.id+'/decision',buyer,decisionBody,buyer.personal_party_id,decisionHeaders));
   assert.equal(ok(await read(submission)).data.case_id,interested.data.case_id);
   assert.deepEqual(ok(await call('POST','/notices/submissions/'+submission.id+'/decision',buyer,decisionBody,buyer.personal_party_id,decisionHeaders)),interested);
   caseRecord=ok(await read({id:interested.data.case_id}));
   assert.equal((await db.execute('SELECT case_id FROM notice_links WHERE submission_id=?',[submission.id]))[0].length,1);
   bad(await call('POST','/notices/submissions',seller,{rule_id:rule.id,submission:{...S.submission,notice_id:legacy.id}},seller.personal_party_id,headers()),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   records.submission_id=submission.id;records.case_id=caseRecord.id;
  });
  await t.test('suspended account or party hides publication and blocks further cooperation',async()=>{
   for(const [table,id,column,value,restore,code]of [['identity_accounts',buyer.account_id,'current_status','SUSPENDED','ACTIVE','ACCOUNT_NOT_ACTIVE'],['parties',buyer.personal_party_id,'current_status','SUSPENDED','ACTIVE','PARTY_NOT_ACTIVE']]){
    await db.execute('UPDATE '+table+' SET '+column+'=? WHERE id=?',[value,id]);
    try{
     bad(await call('GET','/notices/catalog/'+published.id,seller,undefined,null),code);
     assert.equal(ok(await call('GET','/notices/catalog?publisher_party_id='+buyer.personal_party_id,seller,undefined,null)).items.length,0);
     bad(await call('POST','/notices/submissions',seller,{rule_id:rule.id,submission:{...S.submission,notice_id:published.id}},seller.personal_party_id,headers()),code);
    }finally{await db.execute('UPDATE '+table+' SET '+column+'=? WHERE id=?',[restore,id]);}
   }
   assert.equal(ok(await call('GET','/notices/catalog/'+published.id,seller,undefined,null)).id,published.id);
  });
  await t.test('independent support links actual quote and creates the same unpaid order without membership',async()=>{
   ({trade,quote,work,productionProof}=await S.commercialQuote({production:true}));
   const body={quote_id:quote.id,quote_sha256:quote.content_sha256,reason:'synthetic same notice quote'};
   bad(await call('POST','/notices/cases/'+caseRecord.id+'/quote',buyer,body,null,headers(caseRecord)),'NOTICE_OPERATOR_FORBIDDEN');
   const h=headers(caseRecord);
   const linked=ok(await call('POST','/notices/cases/'+caseRecord.id+'/quote',reviewer,body,null,h));
   assert.deepEqual(ok(await call('POST','/notices/cases/'+caseRecord.id+'/quote',reviewer,body,null,h)),linked);
   order=await trade.accept(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()});
   assert.equal(order.current_status,'OPEN');assert.equal(order.data.financial.received_minor,0);
   assert.equal(ok(await read(caseRecord)).order_id,order.id);
   records.quote_id=quote.id;records.order_id=order.id;records.received_minor=0;
  });
  await t.test('same notice order receives payment, scoped conversation and independently reviewed full refund',async()=>{
   const route='/gigs/orders/'+order.id+'/conversation/messages',originalContract=structuredClone(order.data.contract);
   bad(await call('POST',route,seller,{kind:'TEXT',body:'Before payment'},seller.personal_party_id,headers()),'COMMERCIAL_CONVERSATION_AWAITING_PAYMENT');
   const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'synthetic-pm01'};
   const payment=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'full',operation_key:key()},config);
   const proof={...config,payment_id:payment.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null};
   await trade.applyPayment(proof);await trade.applyPayment(proof);
   const body={kind:'TEXT',body:'Synthetic same-notice agreed work'},h=headers();
   const message=ok(await call('POST',route,seller,body,seller.personal_party_id,h));
   assert.deepEqual(ok(await call('POST',route,seller,body,seller.personal_party_id,h)),message);
   assert.equal(ok(await call('GET',route)).items.filter(x=>x.id===message.id).length,1);
   bad(await call('GET',route,buyer2),'GIG_NOT_FOUND');
   assert.equal(order.data.quote.marketplace_finance.allocation.platform_bps,2200);
   let project=ok(await call('POST','/production/projects',seller,{order_id:order.id,line_id:'commercial',script_version_id:work.id,license_project_id:null,assignee_account_id:seller.account_id,purpose:'COMMERCIAL',territory:'CN',consent_ids:[],evidence_asset_id:productionProof.id},seller.personal_party_id,headers()));
   project=ok(await call('POST','/production/records/'+project.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Synthetic non-identifiable animation',verification:{contract_sha256:project.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}},null,headers(project)));
   if(process.env.JX_PM01_NOTICES_WEB==='1')web=await require('./support/notices-browser.cjs').start({base,buyer,fixtures});
   const versions={};let finalBytes;
   for(const stage of ['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']){
    const bytes=web&&stage!=='SCRIPT'?web.media:Buffer.from('synthetic '+stage+' full protocol bytes '+key()),previewBytes=web&&stage!=='SCRIPT'?web.previewMedia:Buffer.from('synthetic '+stage+' preview '+key()),media=stage==='SCRIPT'?'text/plain':'video/mp4';
    const file=ok(await call('POST','/production/projects/'+project.id+'/files?media_type='+encodeURIComponent(media),seller,bytes,seller.personal_party_id,headers()));
    const preview=stage==='SCRIPT'?file:ok(await call('POST','/production/projects/'+project.id+'/files?media_type='+encodeURIComponent(media),seller,previewBytes,seller.personal_party_id,headers()));
    project=ok(await call('GET','/production/records/'+project.id,seller));
    let version=ok(await call('POST','/production/projects/'+project.id+'/versions',seller,{stage,file_id:file.id,preview_file_id:preview.id,note:'Synthetic protocol bytes, not video quality evidence'},seller.personal_party_id,headers(project)));
    const checks=stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
    bad(await call('POST','/production/records/'+version.id+'/reviews',seller,{decision:'APPROVED',reason:'Self review rejected',verification:checks},null,headers(version)),'PRODUCTION_REVIEW_FORBIDDEN');
    version=ok(await call('POST','/production/records/'+version.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Independent synthetic stage review',verification:checks},null,headers(version)));
    assert.deepEqual((await call('GET','/production/versions/'+version.id+'/content?variant=preview')).bytes,stage==='SCRIPT'?bytes:previewBytes);
    if(web)await web.accept(version);else ok(await call('POST','/production/versions/'+version.id+'/feedback',buyer,{decision:'ACCEPT',note:'Buyer confirms original stage',checklist:checks},buyer.personal_party_id,headers(version)));
    versions[stage]=version.id;if(stage==='FINAL')finalBytes=bytes;
   }
   project=ok(await call('GET','/production/records/'+project.id,seller));assert.equal(project.current_status,'ACCEPTED');
   const finalRoute='/production/versions/'+versions.FINAL+'/content?variant=final';assert.deepEqual((await call('GET',finalRoute)).bytes,finalBytes);
   bad(await call('GET',finalRoute,buyer2),'PRODUCTION_NOT_FOUND');if(web)await web.download(versions.FINAL,finalBytes);
   Object.assign(records,{project_id:project.id,versions,platform_bps:2200});
   let refund=ok(await call('POST','/trade/refunds',buyer,{payment_id:payment.id,allocations:[{line_id:'commercial',amount_minor:10001}],reason:'Synthetic independent full cancellation'},buyer.personal_party_id,headers()));
   refund=ok(await call('POST','/trade/records/'+refund.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Synthetic independent refund'},null,headers(refund)));
   assert.equal(ok(await call('GET','/trade/records/'+order.id)).data.financial.refunded_minor,0);
   await trade.claim(reviewer.ctx,refund.id,null,'REFUND');
   const refundProof={...refund.data,refund_id:refund.id,status:'SUCCEEDED'};
   await trade.applyRefund(refund.id,refundProof);await trade.applyRefund(refund.id,refundProof);
   const current=ok(await call('GET','/trade/records/'+order.id));assert.deepEqual(current.data.financial,{received_minor:10001,refunded_minor:10001,net_minor:0});assert.deepEqual(current.data.contract,originalContract);
   bad(await call('POST',route,seller,{kind:'TEXT',body:'Cannot restart refunded cooperation'},seller.personal_party_id,headers()),'COMMERCIAL_CONVERSATION_ARCHIVED');
   bad(await call('GET',finalRoute),'PRODUCTION_ORDER_BLOCKED');if(web)await web.refunded(versions.FINAL);
   assert.equal(ok(await read(caseRecord)).order_id,order.id);
   const rows=(await db.execute('SELECT direction FROM trade_journal WHERE order_id=?',[order.id]))[0];assert.equal(rows.filter(x=>x.direction==='RECEIPT').length,1);assert.equal(rows.filter(x=>x.direction==='REFUND').length,1);
   Object.assign(records,{surface:web?'API plus buyer Web':'API',actors:{buyer:buyer.account_id,artist:seller.account_id,independent_reviewer:reviewer.account_id},payment_id:payment.id,message_id:message.id,refund_id:refund.id,received_minor:10001,financial:current.data.financial,limits:[web?'Synthetic color video played and downloaded; no real marking or creative-quality certification':'Synthetic non-identifiable animation; protocol bytes only, not playable video or real marking review','Synthetic identity/materials and trusted payment/refund observations',web?'Buyer browser playback/acceptance/download verified; full staff UI/native/live services pending':'No browser/native/live service acceptance']});
  });
  await t.test('closing ordinary notice blocks new submissions while historical quote remains unchanged',async()=>{
   const before=await trade.read(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id});
   ok(await call('POST','/notices/records/'+published.id+'/close',buyer,{reason:'synthetic closure'},buyer.personal_party_id,headers(published)));
   bad(await call('GET','/notices/catalog/'+published.id,seller,undefined,null),'NOTICE_NOT_OPEN');
   bad(await call('POST','/notices/submissions',seller,{rule_id:rule.id,submission:{...S.submission,notice_id:published.id}},seller.personal_party_id,headers()),'NOTICE_NOT_OPEN');
   const stored=await trade.read(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id});
   assert.deepEqual(stored,before);
  });
  const out=process.env.JX_NOTICES_ORDINARY_HTTP_FIXTURES||path.resolve(__dirname,'../../../..','.local/notices-ordinary-http-fixtures.json');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(out.replace(/\.json$/,'.records.json'),JSON.stringify(records,null,2));
 }finally{
  if(web)await web.close();if(server)await new Promise(r=>server.close(r));if(db)await db.close();
  await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
