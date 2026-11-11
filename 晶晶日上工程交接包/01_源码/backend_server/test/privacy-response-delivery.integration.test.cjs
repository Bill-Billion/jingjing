"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('privacy responses require the actual reviewed files before publication',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider}=S.people;await S.grant(producer,'PRIVACY_HANDLE');await S.grant(producer,'PRIVACY_REVIEW');await S.grant(reviewer,'PRIVACY_HANDLE');await S.grant(reviewer,'PRIVACY_REVIEW');
 const proof=await S.assets.upload(producer.ctx,{party_id:producer.acting_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic redacted privacy copy'),operation_key:key()});
 let afterRead=null;const checkedStorage=()=>({...S.storageFactory(),async getBuffer(k){const b=await S.storageFactory().getBuffer(k);if(afterRead)await afterRead(k);return b;}});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:checkedStorage}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/privacy',fixtures=[];
 async function call(method,url,who=buyer,body,version=null,operation=key(),party=null){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version===null?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});if(!(res.headers.get('content-type')||'').includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.includes('/account-data?')?'PrivacyAccountCopyPageResponse':url.includes('/transaction-data?')?'PrivacyTransactionCopyPageResponse':url.includes('/stories/')&&url.includes('/data?')?'PrivacyStoryCopyPageResponse':url.includes('/data?')?'PrivacyDataExportResponse':url.endsWith('/copy-options')?'PrivacyCopyOptionsResponse':url.startsWith('/preferences')?'PrivacyPreferencesResponse':url.endsWith('/history')?'PrivacyHistoryResponse':value.data?.items?'PrivacyListResponse':'PrivacyRequestResponse'):'ErrorResponse',value});return {status:res.status,data:value.data,error:value.error,body:value};}

 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const rejects=r=>assert.notEqual(r.status,200,JSON.stringify(r));
 const create=async()=>{let r=ok(await call('POST','/requests',buyer,{type:'COPY',scopes:['PROFILE'],details:'Synthetic machine readable personal copy'}));return ok(await call('POST','/operations/requests/'+r.id+'/start',producer,{},r.object_version));};
 const propose=(r,p=proof,remaining=[])=>call('POST','/operations/requests/'+r.id+'/response',producer,{result:{response:'Synthetic personal copy; verify remaining items separately',outcome:'INFORMATION_PROVIDED',evidence_asset_ids:[p.id],retentions:[],remaining_actions:remaining}},r.object_version);
 const review=(r,op=key())=>call('POST','/operations/requests/'+r.id+'/review',reviewer,{decision:'APPROVED',reason:'Synthetic independent verification',proposal_sha256:r.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true},r.object_version,op);
 const current=r=>call('GET','/requests/'+r.id);
 const history=r=>call('GET','/requests/'+r.id+'/history');
 const [[file]]=await db.execute('SELECT * FROM supply_assets WHERE id=?',[proof.id]);
 const original=Buffer.from(S.files.get(file.object_key));
 await t.test('a READY metadata row without stored bytes cannot be offered as a delivered copy',async()=>{
  const r=await create();S.files.delete(file.object_key);
  try{rejects(await propose(r));assert.equal(ok(await current(r)).current_status,'PROCESSING');assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
 });
 await t.test('missing bytes at independent review do not publish; same request recovers after restoration',async()=>{
  const r=ok(await propose(await create())),operation=key();S.files.delete(file.object_key);
  try{rejects(await review(r,operation));assert.equal(ok(await current(r)).current_status,'AWAITING_REVIEW');assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
  const done=ok(await review(r,operation));assert.equal(done.current_status,'RESPONDED');
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+proof.id+'/content')).bytes.toString(),original.toString());
  assert.deepEqual(ok(await review(r,operation)),done);assert.equal(ok(await history(r)).responses.length,1);
 });

 const {digest}=require('../src/modules/governance/content');
 const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
 const freshProof=body=>S.assets.upload(producer.ctx,{party_id:producer.acting_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from(body),operation_key:key()});
 const rejectDraft=r=>call('POST','/operations/requests/'+r.id+'/review',reviewer,{decision:'REJECTED',reason:'Replace missing or changed evidence',proposal_sha256:r.proposal_sha256},r.object_version);
 await t.test('tampered bytes cannot pass even when metadata still looks ready',async()=>{
  const r=ok(await propose(await create()));S.files.set(file.object_key,Buffer.alloc(original.length,120));
  try{const failure=await review(r);assert.equal(failure.status,503);assert.equal(failure.error.code,'SERVICE_UNAVAILABLE');assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
 });
 await t.test('replacing both metadata and bytes cannot reuse the previously submitted digest',async()=>{
  const r=ok(await propose(await create())),replacement=Buffer.from('Different synthetic redacted copy');
  assert.equal(r.proposal.files[0].content_sha256,file.content_sha256);
  await db.execute('UPDATE supply_assets SET content_sha256=?,byte_size=? WHERE id=?',[hash(replacement),replacement.length,file.id]);S.files.set(file.object_key,replacement);
  try{assert.equal((await review(r)).error.code,'PRIVACY_EVIDENCE_CHANGED');assert.equal(ok(await current(r)).current_status,'AWAITING_REVIEW');assert.equal(ok(await history(r)).responses.length,0);}
  finally{await db.execute('UPDATE supply_assets SET content_sha256=?,byte_size=? WHERE id=?',[file.content_sha256,file.byte_size,file.id]);S.files.set(file.object_key,original);}
 });
 await t.test('restricted evidence is blocked both before submission and before approval',async()=>{
  const pending=ok(await propose(await create())),notSubmitted=await create(),hold=key();
  const execution=key(); // Synthetic existing restriction: creation workflow is separately tested.
  await db.execute("INSERT INTO privacy_executions(id,request_id,action_code,target_id,proposed_by,current_status,payload_json,payload_sha256) VALUES (?,?,?,?,?,'EXECUTED',?,?)",[execution,pending.id,'RESTRICT_CONTENT',proof.id,reviewer.account_id,'{}',digest({})]);
  await db.execute("INSERT INTO content_restrictions(id,target_kind,target_id,execution_id) VALUES (?,'ASSET',?,?)",[hold,proof.id,execution]);
  try{assert.equal((await propose(notSubmitted)).error.code,'CONTENT_RESTRICTED');assert.equal((await review(pending)).error.code,'CONTENT_RESTRICTED');assert.equal(ok(await history(pending)).responses.length,0);}
  finally{await db.execute('DELETE FROM content_restrictions WHERE id=?',[hold]);}
 });
 await t.test('legacy pending drafts require rejection and resubmission, not silent approval',async()=>{
  let r=ok(await propose(await create()));const legacy={...r.proposal};delete legacy.files;
  await db.execute('UPDATE privacy_requests SET proposal_json=?,proposal_sha256=? WHERE id=?',[JSON.stringify(legacy),digest(legacy),r.id]);r.proposal_sha256=digest(legacy);
  assert.equal((await review(r)).error.code,'PRIVACY_EVIDENCE_CHANGED');
  r=ok(await rejectDraft(r));r=ok(await propose(r));r=ok(await review(r));assert.equal(r.current_status,'RESPONDED');
 });
 await t.test('partial delivery remains follow-up; subsequent replies preserve both downloadable versions',async()=>{
  const firstProof=await freshProof('Synthetic profile subset'),secondProof=await freshProof('Synthetic supplemental subset');
  let r=ok(await propose(await create(),firstProof,['Other requested records still require review']));r=ok(await review(r));assert.equal(r.current_status,'FOLLOW_UP');
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+firstProof.id+'/content',outsider)).error.code,'PRIVACY_REQUEST_NOT_FOUND');
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+firstProof.id+'/content',buyer,undefined,null,key(),buyer.personal_party_id)).error.code,'ACTING_PARTY_NOT_ALLOWED');
  r=ok(await propose(r,secondProof));r=ok(await review(r));assert.equal(r.current_status,'RESPONDED');assert.equal(ok(await history(r)).responses.length,2);
  for(const [proof,bytes] of [[firstProof,'Synthetic profile subset'],[secondProof,'Synthetic supplemental subset']])assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+proof.id+'/content')).bytes.toString(),bytes);
 });
 await t.test('no failed approval creates a response notification, history or successful command',async()=>{
  const r=ok(await propose(await create())),operation=key();S.files.delete(file.object_key);
  try{rejects(await review(r,operation));const [[events]]=await db.execute("SELECT COUNT(*) n FROM ops_events WHERE domain='PRIVACY' AND record_id=?",[r.id]);assert.equal(Number(events.n),0);assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
  const attempts=await Promise.all([review(r,operation),review(r,operation)]);assert.deepEqual(ok(attempts[0]),ok(attempts[1]));assert.equal(ok(await history(r)).responses.length,1);
 });
 await t.test('clients cannot forge the server attachment snapshot or submit another operator evidence',async()=>{
  const r=await create();const forged={response:'Synthetic',outcome:'INFORMATION_PROVIDED',evidence_asset_ids:[proof.id],retentions:[],remaining_actions:[],files:[{id:proof.id}]};
  assert.notEqual((await call('POST','/operations/requests/'+r.id+'/response',producer,{result:forged},r.object_version)).status,200);
  const other=await S.upload(outsider,'REVIEW_EVIDENCE');assert.equal((await propose(r,other)).error.code,'PRIVACY_EVIDENCE_OWNER_REQUIRED');
 });

 let existingCast,existingForeignCast;
 await t.test('same application exports actual scoped records, delivers reviewed bytes and reopens without losing history',async()=>{
  const own=await S.newOrder({preview:'SCRIPT_BEFORE_INTERIM'}),foreign=await S.newOrder({commissioner:outsider,preview:'SCRIPT_BEFORE_INTERIM'});
  const artist=existingCast=await S.actorCast(buyer);existingForeignCast=await S.actorCast(outsider);
  let r=ok(await call('POST','/requests',buyer,{type:'COPY',scopes:['ALL'],details:'Synthetic actual account and order copy'}));
  const page=(suffix,who=producer)=>call('GET','/operations/requests/'+r.id+suffix,who);
  assert.equal((await page('/account-data?section=ACCOUNT')).error.code,'PRIVACY_STATE_CONFLICT');
  r=ok(await call('POST','/operations/requests/'+r.id+'/start',producer,{},r.object_version));
  assert.equal(ok(await page('/copy-options')).request_completion,'NOT_CONFIRMED');
  const account=ok(await page('/account-data?section=ACCOUNT'));
  assert.equal(account.items[0].id,buyer.account_id);assert.equal(account.items[0].subject_ref,undefined);assert.equal(account.items[0].phone_hash,undefined);
  assert.deepEqual(account,ok(await call('GET','/requests/'+r.id+'/account-data?section=ACCOUNT')));
  let orders=[],cursor='';do{const d=ok(await page('/transaction-data?section=ORDERS&limit=1'+(cursor?'&cursor='+cursor:'')));orders.push(...d.items);cursor=d.next_cursor;}while(cursor);
  assert.ok(orders.some(x=>x.id===own.order.id));assert.ok(!orders.some(x=>x.id===foreign.order.id));assert.equal(new Set(orders.map(x=>x.id)).size,orders.length);
  const contract=ok(await page('/transaction-data?section=CONTRACT&order_id='+own.order.id));
  assert.equal(contract.items[0].source_content_sha256,own.order.data.contract.content_sha256);assert.equal(contract.items[0].terms.commitments.quote.review,undefined);
  const consents=ok(await page('/data?category=CONTRACTS'));assert.ok(consents.items.some(x=>x.id===artist.production.id));
  const story=ok(await page('/stories/'+own.story.id+'/data?section=SUBMISSIONS'));assert.ok(story.items.length);
  assert.equal((await page('/transaction-data?section=CONTRACT&order_id='+foreign.order.id)).status,404);
  assert.equal((await page('/stories/'+foreign.story.id+'/data?section=SUBMISSIONS')).status,404);
  assert.equal((await page('/account-data?section=ACCOUNT&account_id='+outsider.account_id)).status,400);
  assert.equal((await page('/account-data?section=ACCOUNT',outsider)).status,403);
  assert.equal((await call('GET','/operations/requests/'+r.id+'/account-data?section=ACCOUNT',producer,undefined,null,key(),producer.acting_party_id)).status,400);
  await S.grant(buyer,'PRIVACY_HANDLE');assert.equal((await page('/account-data?section=ACCOUNT',buyer)).error.code,'SELF_REVIEW_FORBIDDEN');
  const scoped=await create();assert.equal((await call('GET','/operations/requests/'+scoped.id+'/account-data?section=WALLET',producer)).error.code,'PRIVACY_ACTION_SCOPE_MISMATCH');
  const body=JSON.stringify({request_id:r.id,coverage:'SELECTED_RECORDS_ONLY',account,orders,contract,consents,story});
  assert.ok(!body.includes(foreign.order.id));assert.ok(!body.includes(buyer.token));
  const attachment=await freshProof(body);
  r=ok(await propose(r,attachment,['Remaining categories and supplier originals need separate handling']));
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+attachment.id+'/content')).error.code,'PRIVACY_FILE_NOT_FOUND');
  assert.deepEqual(ok(await page('/account-data?section=ACCOUNT',reviewer)),account);
  const self=await call('POST','/operations/requests/'+r.id+'/review',producer,{decision:'APPROVED',reason:'must fail',proposal_sha256:r.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true},r.object_version);assert.equal(self.error.code,'SELF_REVIEW_FORBIDDEN');
  const op=key(),pending=r;r=ok(await review(pending,op));assert.equal(ok(await review(pending,op)).id,r.id);assert.equal(r.current_status,'FOLLOW_UP');
  const fileUrl='/requests/'+r.id+'/evidence/'+attachment.id+'/content';assert.equal((await call('GET',fileUrl)).bytes.toString(),body);assert.equal((await call('GET',fileUrl,outsider)).status,404);
  assert.equal(ok(await history(r)).responses.length,1);
  r=ok(await call('POST','/requests/'+r.id+'/reopen',buyer,{reason:'Please complete the remaining categories'},r.object_version));assert.equal(r.current_status,'REOPENED');
  assert.equal((await page('/account-data?section=ACCOUNT')).error.code,'PRIVACY_STATE_CONFLICT');assert.equal((await call('GET',fileUrl)).bytes.toString(),body);
  r=ok(await call('POST','/operations/requests/'+r.id+'/start',producer,{},r.object_version));
  await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='PRIVACY_HANDLE'",[producer.account_id]);
  try{assert.equal((await page('/account-data?section=ACCOUNT')).status,403);}finally{await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='PRIVACY_HANDLE'",[producer.account_id]);}
  const [audit]=await db.execute("SELECT actor_account_id,message FROM privacy_events WHERE request_id=? AND event_code='COPY_DATA_ACCESSED'",[r.id]);assert.ok(audit.some(x=>x.actor_account_id===producer.account_id));assert.ok(audit.some(x=>x.actor_account_id===reviewer.account_id));assert.ok(audit.every(x=>!x.message.includes(buyer.token)));
  assert.equal(ok(await current(r)).current_status,'PROCESSING');
 });


 await t.test('one material and trade copy stays recoverable and scoped through actual delivery',async t=>{
  const own=await S.newOrder({preview:'SCRIPT_BEFORE_INTERIM'}),foreign=await S.newOrder({commissioner:outsider,preview:'SCRIPT_BEFORE_INTERIM'});
  const payment=await S.pay(own.order,'first'),cast=existingCast,foreignCast=existingForeignCast;
  const materialId=cast.look.data.material_asset_ids[0],foreignMaterialId=foreignCast.look.data.material_asset_ids[0];
  let refund=await S.trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'film',amount_minor:500}],reason:'Synthetic copy partial refund',operation_key:key()});
  refund=await S.reviewTrade(refund);await S.trade.claim(reviewer.ctx,refund.id,null,'REFUND');
  await S.trade.applyRefund(refund.id,{provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',config_revision:'r04',refund_id:refund.id,payment_id:payment.id,transaction_id:refund.data.transaction_id,currency:'CNY',amount_minor:500,status:'SUCCEEDED'});
  const content=await S.upload(buyer,'WORK_CONTENT'),foreignContent=await S.upload(outsider,'WORK_CONTENT');
  let r=ok(await call('POST','/requests',buyer,{type:'COPY',scopes:['ARTIST_MATERIALS','CONTENT','TRANSACTIONS','CONTRACTS'],details:'Synthetic single-request material and trade fulfillment'}));
  const requestId=r.id,read=suffix=>call('GET','/operations/requests/'+requestId+suffix,producer);
  r=ok(await call('POST','/operations/requests/'+r.id+'/start',producer,{},r.object_version));
  const material=ok(await read('/data?category=ARTIST_MATERIALS')),works=ok(await read('/data?category=CONTENT'));
  const transactions={};for(const section of ['ORDERS','SUMMARY','PAYMENTS','REFUNDS','JOURNAL','CONTRACT'])transactions[section]=ok(await read('/transaction-data?section='+section+(section==='ORDERS'?'':'&order_id='+own.order.id)));
  let attachment,text,pending,reviewKey,submitKey,submittedVersion,submission;
  const fileUrl=()=>'/requests/'+requestId+'/evidence/'+attachment.id+'/content';
  await t.test('real selected rows form the same request file, without other people or provider internals',async()=>{
   const m=material.items.find(x=>x.id===materialId);assert.ok(m);assert.equal(m.artist_person_id,cast.person.id);assert.ok(m.created_at);assert.ok(works.items.some(x=>x.id===content.id));
   assert.deepEqual(transactions.SUMMARY.items[0].financial,{received_minor:3000,refunded_minor:500,net_minor:2500});
   assert.ok(transactions.ORDERS.items.some(x=>x.id===own.order.id&&x.created_at));assert.equal(transactions.PAYMENTS.items[0].id,payment.id);assert.equal(transactions.PAYMENTS.items[0].expires_at,payment.data.expires_at);assert.equal(transactions.REFUNDS.items[0].id,refund.id);
   text=JSON.stringify({request_id:requestId,coverage:'SELECTED_RECORDS_ONLY',original_files_included:false,material,works,transactions});
   for(const forbidden of [foreign.order.id,foreignMaterialId,foreignContent.id,buyer.token,'object_key','merchant_id','consumer_request_key'])assert.ok(!text.includes(forbidden),forbidden==='object_key'?'internal storage key leaked':'unrelated or internal data leaked');
   attachment=await freshProof(text);assert.equal(attachment.content_sha256,hash(Buffer.from(text)));
  });
  await t.test('lost submission result uses original key; an unapproved file stays private',async()=>{
   submitKey=key();submittedVersion=r.object_version;
   submission={result:{response:'Selected material metadata and trade records; originals remain pending',outcome:'INFORMATION_PROVIDED',evidence_asset_ids:[attachment.id],retentions:[],remaining_actions:['Original files, other categories and unreviewed fields remain pending']}};
   // The server completes the write, but the simulated client discards its response.
   ok(await call('POST','/operations/requests/'+requestId+'/response',producer,submission,submittedVersion,submitKey));
   r=ok(await current(r));assert.equal(r.current_status,'AWAITING_REVIEW');
   pending=ok(await call('POST','/operations/requests/'+requestId+'/response',producer,submission,submittedVersion,submitKey));assert.equal(pending.object_version,r.object_version);
   assert.equal(ok(await history(r)).responses.length,0);assert.equal((await call('GET',fileUrl())).status,404);
   const [[counts]]=await db.execute("SELECT COUNT(*) AS n FROM privacy_events WHERE request_id=? AND event_code='REVIEW_PENDING'",[requestId]);assert.equal(Number(counts.n),1);
  });
  await t.test('revoked operator or reviewer cannot recover an old operation or approve',async()=>{
   await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='PRIVACY_HANDLE'",[producer.account_id]);
   try{assert.equal((await read('/data?category=ARTIST_MATERIALS')).status,403);assert.equal((await call('POST','/operations/requests/'+requestId+'/response',producer,submission,submittedVersion,submitKey)).status,403);}
   finally{await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='PRIVACY_HANDLE'",[producer.account_id]);}
   reviewKey=key();await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='PRIVACY_REVIEW'",[reviewer.account_id]);
   try{assert.equal((await review(pending,reviewKey)).status,403);assert.equal(ok(await history(r)).responses.length,0);}
   finally{await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='PRIVACY_REVIEW'",[reviewer.account_id]);}
  });
  await t.test('missing file blocks review; restoration and lost approval recover one answer only',async()=>{
   const [[row]]=await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[attachment.id]),bytes=S.files.get(row.object_key);S.files.delete(row.object_key);
   try{assert.equal((await review(pending,reviewKey)).status,503);assert.equal(ok(await current(r)).current_status,'AWAITING_REVIEW');assert.equal(ok(await history(r)).responses.length,0);}
   finally{S.files.set(row.object_key,bytes);}
   ok(await review(pending,reviewKey));r=ok(await current(r));assert.equal(r.current_status,'FOLLOW_UP');
   assert.equal(ok(await review(pending,reviewKey)).object_version,r.object_version);assert.equal(ok(await history(r)).responses.length,1);
  });
  await t.test('downloaded bytes match the reviewed snapshot and same business identifiers',async()=>{
   const got=await call('GET',fileUrl());assert.equal(got.status,200);assert.equal(got.bytes.toString(),text);assert.equal(hash(got.bytes),attachment.content_sha256);
   const payload=JSON.parse(got.bytes);assert.equal(payload.request_id,requestId);assert.equal(payload.transactions.SUMMARY.items[0].id,own.order.id);assert.equal(payload.transactions.REFUNDS.items[0].id,refund.id);
   assert.equal((await call('GET',fileUrl(),outsider)).status,404);assert.equal((await call('GET',fileUrl(),buyer,undefined,null,key(),buyer.personal_party_id)).status,400);
  });
  await t.test('account disabled during file transport cannot receive bytes; restored account can retry',async()=>{
   const [[row]]=await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[attachment.id]);
   afterRead=async k=>{if(k===row.object_key){afterRead=null;await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[buyer.account_id]);}};
   try{const got=await call('GET',fileUrl());assert.notEqual(got.status,200);assert.equal(got.bytes,undefined);}
   finally{afterRead=null;await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[buyer.account_id]);}
   assert.equal((await call('GET',fileUrl())).bytes.toString(),text);
  });
  await t.test('reopened follow-up preserves reviewed file without claiming all personal data finished',async()=>{
   r=ok(await call('POST','/requests/'+requestId+'/reopen',buyer,{reason:'Please handle original files and other categories'},r.object_version));assert.equal(r.current_status,'REOPENED');
   assert.equal((await read('/data?category=ARTIST_MATERIALS')).error.code,'PRIVACY_STATE_CONFLICT');assert.equal((await call('GET',fileUrl())).bytes.toString(),text);assert.equal(ok(await history(r)).responses.length,1);
   const out=path.resolve(__dirname,'../../../..','.local/privacy-copy-fulfillment-20261111/records.json');await fs.mkdir(path.dirname(out),{recursive:true});
   await fs.writeFile(out,JSON.stringify({synthetic_only:true,request_id:requestId,order_id:own.order.id,payment_id:payment.id,refund_id:refund.id,material_id:materialId,content_id:content.id,response_asset_id:attachment.id,content_sha256:attachment.content_sha256,status:r.current_status,scope:'SELECTED_RECORDS_ONLY',original_files_included:false},null,2));
  });
 });

 await fs.mkdir(path.resolve(__dirname,'../../../..','.local/privacy-response-delivery-20261109'),{recursive:true});
 await fs.writeFile(path.resolve(__dirname,'../../../..','.local/privacy-response-delivery-20261109/http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
