"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('notices and one-way submissions in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);

 const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{seller,buyer,buyer2,reviewer,outsider,notices:N}=S;
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
 async function call(method,url,user=buyer,body,party=user.personal_party_id,headers={}){const h={Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...headers};if(body!==undefined)h['Content-Type']='application/json';const res=await fetch(base+url,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});if(!res.headers.get('content-type')?.includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};const json=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.startsWith('/operations')?'OperationResponse':'NoticeResponse'):'ErrorResponse',value:json});return {status:res.status,data:json.data,error:json.error};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,c)=>assert.equal(r.error?.code,c,JSON.stringify(r)),headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
 const review=async r=>ok(await call('POST','/notices/records/'+r.id+'/reviews',reviewer,{decision:'APPROVE',reason:'synthetic independent review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}},null,headers(r)));
 const makeNotice=async(body=S.body)=>review(ok(await call('POST','/notices/announcements',buyer,{rule_id:S.rule.id,notice:body},buyer.personal_party_id,headers())));
 const submit=async(s=S.submission)=>review(ok(await call('POST','/notices/submissions',seller,{rule_id:S.rule.id,submission:s},seller.personal_party_id,headers())));
 const read=(r,u=buyer)=>call('GET','/notices/records/'+r.id,u);
 let notice,submission,caseId;
 await t.test('ordinary adult cannot publish by supplying a level; funding alone grants no points',async()=>{
  bad(await call('POST','/notices/announcements',buyer2,{rule_id:S.rule.id,notice:S.body},buyer2.personal_party_id,headers()),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
  const rules=ok(await call('GET','/notices/rules',buyer,undefined,null));assert.ok(rules.items.some(r=>r.id===S.rule.id));
  const q=ok(await call('GET','/notices/eligibility?rule_id='+S.rule.id));assert.equal(q.level,1);assert.equal(q.active,true);assert.equal(q.types.includes('EVENT'),false);
  bad(await call('POST','/notices/announcements',buyer,{rule_id:S.rule.id,notice:S.body,level:6},buyer.personal_party_id,headers()),'INVALID_INPUT');
 });
 await t.test('independent review and public projection exclude evidence/contacts',async()=>{
  let r=ok(await call('POST','/notices/announcements',buyer,{rule_id:S.rule.id,notice:S.body},buyer.personal_party_id,headers()));bad(await call('GET','/notices/catalog/'+r.id,buyer,undefined,null),'NOTICE_NOT_OPEN');
  bad(await call('POST','/notices/records/'+r.id+'/reviews',buyer,{decision:'APPROVE',reason:'self',checks:{}},null,headers(r)),'NOTICE_OPERATOR_FORBIDDEN');
  notice=await review(r);const pub=ok(await call('GET','/notices/catalog/'+notice.id,buyer,undefined,null));assert.equal(pub.official,false);assert.ok(!JSON.stringify(pub).includes('evidence'));assert.equal(pub.chat_enabled,false);
  assert.equal(ok(await call('GET','/notices/catalog?type=RECRUITMENT&city=synthetic-city',buyer,undefined,null)).items.length,1);
 });
 await t.test('official posts need dedicated operator authority and independent reviewer',async()=>{
  const body={...S.body,type:'OFFICIAL',details:{summary:'synthetic official'},accept_submissions:false};bad(await call('POST','/notices/announcements',buyer,{rule_id:S.rule.id,notice:body},null,headers()),'NOTICE_OPERATOR_FORBIDDEN');
  const r=ok(await call('POST','/notices/announcements',outsider,{rule_id:S.rule.id,notice:body},null,headers()));const approved=await review(r);assert.equal(ok(await call('GET','/notices/catalog/'+approved.id,buyer,undefined,null)).official,true);
 });
 await t.test('three structured artist submission kinds and buyer intent retain concrete person/avatar',async()=>{
  for(const kind of ['PROFILE','ROLE','CREATE_DRAMA']){const r=await submit({...S.submission,kind,role:kind==='ROLE'?'lead':null,notice_id:notice.id});assert.equal(r.current_status,'SENT');if(kind==='PROFILE')submission=r;}
  const r=ok(await call('POST','/notices/submissions',buyer,{rule_id:S.rule.id,submission:{...S.submission,kind:'INVITATION',target_party_id:seller.personal_party_id}},buyer.personal_party_id,headers()));const live=await review(r);assert.equal(ok(await read(live,seller)).data.submission.person_id,seller.person.id);
 });
 await t.test('pending submissions hidden from recipient; outsider and generic comments cannot bypass',async()=>{
  const p=ok(await call('POST','/notices/submissions',seller,{rule_id:S.rule.id,submission:S.submission},seller.personal_party_id,headers()));bad(await read(p),'NOTICE_NOT_FOUND');bad(await read(submission,buyer2),'NOTICE_NOT_FOUND');
  bad(await call('POST','/operations/objects/NOTICES/'+submission.id+'/comments',buyer,{reply_to:null,body:'free chat'},buyer.personal_party_id,headers()),'COMMENT_TARGET_NOT_SUPPORTED');
 });
 await t.test('duplicate interest creates one case; no order or chat created',async()=>{
  const k=key(),body={decision:'INTERESTED'};const x=ok(await call('POST','/notices/submissions/'+submission.id+'/decision',buyer,body,buyer.personal_party_id,headers(submission,k)));caseId=x.data.case_id;
  const y=ok(await call('POST','/notices/submissions/'+submission.id+'/decision',buyer,body,buyer.personal_party_id,headers(submission,k)));assert.equal(y.data.case_id,caseId);
  const c=ok(await read({id:caseId}));assert.equal(c.next_action,'WAIT_SUPPORT');assert.equal(c.order_id,null);assert.equal(c.chat_enabled,false);
  assert.equal((await db.execute('SELECT case_id FROM notice_links WHERE submission_id=?',[submission.id]))[0].length,1);
 });
 await t.test('concurrent opposite decisions produce one winner, stale version rejected',async()=>{
  const r=await submit();const replies=await Promise.all(['INTERESTED','DECLINE'].map(decision=>call('POST','/notices/submissions/'+r.id+'/decision',buyer,{decision},buyer.personal_party_id,headers(r))));assert.equal(replies.filter(x=>x.status===200).length,1);assert.equal(replies.filter(x=>x.error?.code==='VERSION_CONFLICT').length,1);
 });
 await t.test('deadline failure never creates a customer service case',async()=>{
  let r=await submit();const data={...r.data,expires_at:'2020-01-01T00:00:00.000Z'};await db.execute('UPDATE notice_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),r.id]);bad(await call('POST','/notices/submissions/'+r.id+'/decision',buyer,{decision:'INTERESTED'},buyer.personal_party_id,headers(r)),'NOTICE_SUBMISSION_EXPIRED');assert.equal(ok(await read(r)).next_action,'EXPIRED');
 });
 await t.test('withdrawal closes unlinked case and blocks later conversion',async()=>{
  const r=await submit();let x=ok(await call('POST','/notices/submissions/'+r.id+'/decision',buyer,{decision:'INTERESTED'},buyer.personal_party_id,headers(r)));await N.close(seller.ctx,{record_id:x.id,party_id:seller.personal_party_id,expected_version:x.object_version,reason:'withdraw',operation_key:key()});assert.equal(ok(await read({id:x.data.case_id})).current_status,'CLOSED');
 });
 await t.test('qualified organization still needs reviewed explicit publishing scope',async()=>{
  const org=await S.parties.createOrganization(buyer2.ctx,{display_name:'synthetic org',operation_key:key()});
  const proof=await S.supply.upload(buyer2.ctx,{party_id:org.party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic org qualification'),operation_key:key()});
  let q=ok(await call('POST','/notices/qualifications',buyer2,{types:['RECRUITMENT'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',evidence_asset_ids:[proof.id],terms:'synthetic org approval scope'},org.party_id,headers()));
  bad(await call('POST','/notices/announcements',buyer2,{rule_id:S.rule.id,notice:S.body},org.party_id,headers()),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
  q=ok(await call('POST','/notices/records/'+q.id+'/reviews',reviewer,{decision:'APPROVE',reason:'reviewed synthetic organization evidence',checks:{identity_verified:true,authority_verified:true,evidence_verified:true}},null,headers(q)));
  const r=ok(await call('POST','/notices/announcements',buyer2,{rule_id:S.rule.id,notice:S.body},org.party_id,headers()));assert.equal((await review(r)).current_status,'PUBLISHED');
  const intent=ok(await call('POST','/notices/submissions',buyer2,{rule_id:S.rule.id,submission:{...S.submission,kind:'INVITATION',target_party_id:seller.personal_party_id}},org.party_id,headers()));assert.equal((await review(intent)).current_status,'SENT');
 });
 await t.test('finance facts cannot be self approved or credited twice using same receipt',async()=>{
  const proof=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic unique receipt'),operation_key:key()});
  const body={party_id:buyer.personal_party_id,kind:'TOPUP',amount:100,occurred_at:new Date().toISOString(),source_ref:'synthetic:'+key(),evidence_asset_id:proof.id};const f=ok(await call('POST','/notices/facts',outsider,body,null,headers()));
  bad(await call('POST','/notices/records/'+f.id+'/reviews',outsider,{decision:'APPROVE',reason:'self',checks:{}},null,headers(f)),'SELF_REVIEW_FORBIDDEN');
  bad(await call('POST','/notices/facts',outsider,{...body,source_ref:'synthetic:'+key()},null,headers()),'NOTICE_FACT_SOURCE_REUSED');
  assert.equal((await call('GET','/notices/records/'+f.id+'/materials/'+proof.id,reviewer,undefined,null)).status,200);
 });
 await t.test('case association verifies actual quote, parties, avatar and immutable version',async()=>{
  const c=ok(await read({id:caseId})),{trade,quote}=await S.commercialQuote(),qid=quote.id,data=quote.data;
  const body={quote_id:qid,quote_sha256:'0'.repeat(64),reason:'synthetic quote for same parties'};
  bad(await call('POST','/notices/cases/'+c.id+'/quote',reviewer,body,null,headers(c)),'NOTICE_QUOTE_MISMATCH');
  const linked=ok(await call('POST','/notices/cases/'+c.id+'/quote',reviewer,{...body,quote_sha256:digest(data)},null,headers(c)));assert.equal(linked.data.quote.id,qid);assert.equal(ok(await read(c)).order_id,null);

  const accepted=await trade.accept(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()});
  assert.equal(accepted.current_status,'OPEN');assert.equal(accepted.data.financial.received_minor,0);assert.equal(ok(await read(c)).order_id,accepted.id);

 });

 await t.test('audit failure rolls back case and decision together',async()=>{
  const r=await submit();await db.withConnection(c=>c.query("CREATE TRIGGER notice_test_abort BEFORE INSERT ON notice_links FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic rollback'"));
  try{const out=await call('POST','/notices/submissions/'+r.id+'/decision',buyer,{decision:'INTERESTED'},buyer.personal_party_id,headers(r));assert.equal(out.status,503);assert.equal(ok(await read(r)).current_status,'SENT');assert.equal((await db.execute("SELECT id FROM notice_records WHERE kind='CASE' AND parent_id=?",[r.id]))[0].length,0);}finally{await db.withConnection(c=>c.query('DROP TRIGGER notice_test_abort'));}
 });
 await t.test('private submission file checks ownership, recipient consent and stored bytes',async()=>{
  const file=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'image/png',body:Buffer.from('synthetic image bytes'),operation_key:key()});
  const r=await submit({...S.submission,material_asset_ids:[file.id]});const path='/notices/records/'+r.id+'/materials/'+file.id;
  assert.equal((await call('GET',path,buyer)).status,200);bad(await call('GET',path,buyer2),'NOTICE_NOT_FOUND');
  const raw=(await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[file.id]))[0][0],original=S.bytes.get(raw.object_key);S.bytes.set(raw.object_key,Buffer.from('altered'));assert.equal((await call('GET',path,buyer)).status,503);S.bytes.set(raw.object_key,original);
 });
 await t.test('a child or revoked consent cannot be submitted or read as a valid adult artist',async()=>{
  await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[seller.person.id]);bad(await call('POST','/notices/submissions',seller,{rule_id:S.rule.id,submission:S.submission},seller.personal_party_id,headers()),'MINOR_OPERATION_RESTRICTED');await db.execute("UPDATE artist_people SET age_band='ADULT' WHERE id=?",[seller.person.id]);
  await db.execute("UPDATE artist_records SET current_status='WITHDRAWN' WHERE id=?",[S.consent.id]);bad(await read(submission),'NOTICE_NOT_FOUND');await db.execute("UPDATE artist_records SET current_status='APPROVED' WHERE id=?",[S.consent.id]);
 });

 await t.test('MCN may submit only for the specifically delegated person; withdrawal removes access',async()=>{
  const org=await S.parties.createOrganization(outsider.ctx,{display_name:'synthetic authorized MCN',operation_key:key()});await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);const relation=key(),data={valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',accepted_by:seller.account_id};await db.execute("INSERT INTO gig_records(id,kind,owner_party_id,counterparty_id,created_by,current_status,data_json,data_sha256) VALUES (?,'RELATION',?,?,?,'ACTIVE',?,?)",[relation,org.party_id,seller.personal_party_id,outsider.account_id,JSON.stringify(data),digest(data)]);
  bad(await call('POST','/notices/submissions',outsider,{rule_id:S.rule.id,submission:S.submission},org.party_id,headers()),'ARTIST_DELEGATION_REQUIRED');
  const d=await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation,actions:['SUBMIT_COOPERATION'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'synthetic submit delegation'},operation_key:key()});
  const optionsPath='/notices/submission-options?person_id='+seller.person.id+'&notice_id='+notice.id;
  const options=ok(await call('GET',optionsPath,outsider,undefined,org.party_id));
  assert.equal(options.items.length,1);assert.equal(options.items[0].consent_id,S.consent.id);assert.equal(options.items[0].avatar_id,S.avatar.id);
  assert.ok(!JSON.stringify(options).includes('evidence'));assert.ok(!JSON.stringify(options).includes('terms'));
  bad(await call('GET',optionsPath,buyer2,undefined,buyer2.personal_party_id),'ARTIST_NOT_FOUND');
  await db.execute("UPDATE artist_records SET current_status='WITHDRAWN' WHERE id=?",[S.consent.id]);
  assert.equal(ok(await call('GET',optionsPath,outsider,undefined,org.party_id)).items.length,0);
  await db.execute("UPDATE artist_records SET current_status='APPROVED' WHERE id=?",[S.consent.id]);
  let r=ok(await call('POST','/notices/submissions',outsider,{rule_id:S.rule.id,submission:S.submission},org.party_id,headers()));r=await review(r);assert.equal(ok(await read(r)).data.submission.person_id,seller.person.id);
  await S.artists.withdraw(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,record_id:d.id,expected_version:d.object_version,reason:'stop delegation',operation_key:key()});bad(await read(r),'NOTICE_NOT_FOUND');bad(await call('GET',optionsPath,outsider,undefined,org.party_id),'ARTIST_DELEGATION_REQUIRED');
 });
 await t.test('rule API uses independent approval, rejection and closure; unauthenticated route remains closed',async()=>{
  const r=ok(await call('POST','/notices/rules',outsider,{rule:{...S.ruleInput,version:'synthetic-v2'}},null,headers()));
  bad(await call('POST','/notices/records/'+r.id+'/reviews',outsider,{decision:'APPROVE',reason:'self',checks:{business_rule_verified:true}},null,headers(r)),'SELF_REVIEW_FORBIDDEN');
  const rejected=ok(await call('POST','/notices/records/'+r.id+'/reviews',reviewer,{decision:'REJECT',reason:'synthetic rejection',checks:null},null,headers(r)));assert.equal(rejected.current_status,'REJECTED');
  const n=await makeNotice();ok(await call('POST','/notices/records/'+n.id+'/close',buyer,{reason:'withdraw notice'},buyer.personal_party_id,headers(n)));bad(await call('GET','/notices/catalog/'+n.id,buyer,undefined,null),'NOTICE_NOT_OPEN');
  const res=await fetch(base+'/notices/catalog');assert.equal(res.status,401);
 });
 await t.test('publication loss prevents new replies without changing historical quote snapshot',async()=>{
  const r=await submit();await N.close(reviewer.ctx,{record_id:S.topup.id,expected_version:S.topup.object_version,reason:'revoked synthetic finance evidence',operation_key:key()});
  bad(await call('POST','/notices/submissions/'+r.id+'/decision',buyer,{decision:'INTERESTED'},buyer.personal_party_id,headers(r)),'NOTICE_RECEIVER_NOT_ELIGIBLE');bad(await call('GET','/notices/catalog/'+notice.id,buyer,undefined,null),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
 });
 await t.test('lists and notifications use current permissions',async()=>{
  assert.ok(ok(await call('GET','/notices/records?kind=SUBMISSION',seller)).items.length);assert.ok(ok(await call('GET','/notices/records?kind=CASE',reviewer,undefined,null)).items.length);
  assert.equal(ok(await call('GET','/notices/records?kind=CASE',buyer2)).items.length,0);
  const audit=ok(await call('GET','/operations/objects/NOTICES/'+submission.id+'/audit',reviewer,undefined,null));assert.ok(audit.items.some(x=>x.event_code==='INTERESTED'));assert.ok(audit.items.every(x=>x.request_id));
 });
 const out=process.env.JX_NOTICES_HTTP_FIXTURES||path.resolve(__dirname,'../../../..','.local/notices-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures.filter(x=>!x.path.includes('/operations'))},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
