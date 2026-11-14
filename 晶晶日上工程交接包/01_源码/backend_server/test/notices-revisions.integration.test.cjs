'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('reviewed notice revisions retain history and fence old offers in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
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
   const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.includes('/history')?'NoticeHistoryResponse':url.startsWith('/operations/notifications')?'OpsNotificationListResponse':url.startsWith('/gigs/')?'CommercialConversationResponse':url.startsWith('/trade/')?'TradeRecordResponse':url.startsWith('/production/')?'ProductionRecordResponse':'NoticeResponse'):'ErrorResponse',value});
   return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,c)=>assert.equal(r.error?.code,c,JSON.stringify(r));
  const headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
  const approve=(r,u=reviewer,checks={content_reviewed:true,materials_reviewed:true,no_private_contact:true})=>call('POST','/notices/records/'+r.id+'/reviews',u,{decision:'APPROVE',reason:'synthetic independent review',checks},null,headers(r));
  const read=(r,u=buyer)=>call('GET','/notices/records/'+r.id,u);
  const create=(rule,u=buyer,notice=S.body,h=headers(),party=u.personal_party_id)=>call('POST','/notices/announcements',u,{rule_id:rule.id,notice},party,h);

  const {digest}=require('../src/modules/governance/content');
  const revise=(n,notice={...n.data.notice,title:'Revised recruitment'},u=buyer,h=headers(n))=>call('POST','/notices/announcements/'+n.id+'/revisions',u,{notice,reason:'synthetic revised requirements'},u.personal_party_id,h);
  const confirm=(s,n,u=seller,h=headers(s),hash=digest(n.data.notice))=>call('POST','/notices/submissions/'+s.id+'/notice-confirmation',u,{notice_version:n.object_version,notice_sha256:hash},u.personal_party_id,h);
  const history=(n,u=seller)=>call('GET','/notices/announcements/'+n.id+'/history',u);
  const submit=n=>call('POST','/notices/submissions',seller,{rule_id:S.rule.id,submission:{...S.submission,notice_id:n.id},notice_version:n.object_version,notice_sha256:digest(n.data.notice)},seller.personal_party_id,headers());
  let n,old,sub,pending,other,revision,stale,linked,quote,trade,order,oldOrder,retryBody,retryHeaders,retrySubmission;
  await t.test('new applications capture exact original notice; old order and outstanding quote share the same notice',async()=>{
   n=ok(await approve(ok(await create(S.rule))));old=structuredClone(n);
   sub=ok(await approve(ok(await submit(n))));assert.deepEqual(sub.data.notice_snapshot.notice,n.data.notice);
   other=ok(await approve(ok(await submit(n))));pending=ok(await submit(n));
   async function link(s){const interested=ok(await call('POST','/notices/submissions/'+s.id+'/decision',buyer,{decision:'INTERESTED'},buyer.personal_party_id,headers(s)));const c=ok(await call('GET','/notices/records/'+interested.data.case_id,reviewer,undefined,null));const q=await S.commercialQuote();const l=ok(await call('POST','/notices/cases/'+c.id+'/quote',reviewer,{quote_id:q.quote.id,quote_sha256:q.quote.content_sha256,reason:'synthetic old terms'},null,headers(c)));return {...q,s:interested,l};}
   const first=await link(other);other=first.s;order=await first.trade.accept(buyer.ctx,{record_id:first.quote.id,party_id:buyer.personal_party_id,expected_version:first.quote.object_version,quote_sha256:first.quote.content_sha256,operation_key:key()});
   const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'synthetic-revision'};
   const payment=await first.trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'full',operation_key:key()},config);
   await first.trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   oldOrder=ok(await call('GET','/trade/records/'+order.id,buyer));assert.equal(oldOrder.data.financial.received_minor,10001);
   const second=await link(sub);sub=second.s;linked=second.l;quote=second.quote;trade=second.trade;
  });
  await t.test('pending revision is private, idempotent and does not replace published content',async()=>{
   const h=headers(n),body={...n.data.notice,title:'Revised recruitment'};
   revision=ok(await revise(n,body,buyer,h));assert.deepEqual(ok(await revise(n,body,buyer,h)),revision);
   bad(await revise(n,{...body,title:'different'},buyer,h),'IDEMPOTENCY_CONFLICT');
   assert.equal(revision.kind,'NOTICE_REVISION');bad(await read(revision,seller),'NOTICE_NOT_FOUND');
   assert.deepEqual(ok(await call('GET','/notices/catalog/'+n.id,seller,undefined,null)).notice,old.data.notice);
   assert.equal(ok(await history(n)).items.length,0);bad(await history(n,buyer2),'NOTICE_NOT_FOUND');
   bad(await revise(n,body,buyer2),'NOTICE_NOT_FOUND');
   bad(await revise(n,{...body,type:'OFFICIAL',details:{summary:'synthetic'},accept_submissions:false}),'NOTICE_REVISION_SCOPE_INVALID');
   stale=ok(await revise(n,{...body,title:'Competing revision'}));
  });
  await t.test('independent rejection and withdrawal preserve live version; revoked author cannot publish',async()=>{
   const reject=ok(await revise(n,{...n.data.notice,title:'Rejected draft'}));
   assert.equal(ok(await call('POST','/notices/records/'+reject.id+'/reviews',reviewer,{decision:'REJECT',reason:'synthetic rejection',checks:null},null,headers(reject))).current_status,'REJECTED');
   const withdrawn=ok(await revise(n,{...n.data.notice,title:'Withdrawn draft'}));
   ok(await call('POST','/notices/records/'+withdrawn.id+'/close',buyer,{reason:'synthetic withdrawal'},buyer.personal_party_id,headers(withdrawn)));
   bad(await approve(withdrawn),'VERSION_CONFLICT');
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[buyer.personal_party_id,buyer.account_id]);
   try{bad(await approve(revision),'ARTIST_PARTY_FORBIDDEN');}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[buyer.personal_party_id,buyer.account_id]);}
   assert.deepEqual(ok(await read(n)).data.notice,old.data.notice);
  });
  await t.test('publication and notifications roll back together; approved history cannot be withdrawn; competing base becomes stale',async()=>{
   const h=headers(revision),body={decision:'APPROVE',reason:'synthetic revision approval',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}};
   await db.withConnection(c=>c.query("CREATE TRIGGER notice_revision_abort BEFORE INSERT ON ops_events FOR EACH ROW BEGIN IF NEW.event_code='NOTICE_REVISED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic revision event failure'; END IF; END"));
   try{assert.equal((await call('POST','/notices/records/'+revision.id+'/reviews',reviewer,body,null,h)).status,503);assert.deepEqual(ok(await read(n)).data.notice,old.data.notice);assert.equal(ok(await read(revision)).current_status,'IN_REVIEW');}
   finally{await db.withConnection(c=>c.query('DROP TRIGGER notice_revision_abort'));}
   const approved=ok(await call('POST','/notices/records/'+revision.id+'/reviews',reviewer,body,null,h));
   assert.deepEqual(ok(await call('POST','/notices/records/'+revision.id+'/reviews',reviewer,body,null,h)),approved);
   bad(await call('POST','/notices/records/'+approved.id+'/close',buyer,{reason:'must not erase published history'},buyer.personal_party_id,headers(approved)),'NOTICE_CANNOT_CLOSE');
   assert.equal(ok(await read(approved)).current_status,'APPROVED');
   n=ok(await read(n));assert.equal(n.data.revision_id,revision.id);assert.equal(n.data.notice.title,'Revised recruitment');
   const count=Number((await db.execute("SELECT COUNT(*) n FROM ops_events WHERE event_code='NOTICE_REVISED' AND record_id IN (?,?,?)",[sub.id,other.id,pending.id]))[0][0].n);assert.equal(count,3);
   bad(await approve(stale),'VERSION_CONFLICT');
   const hist=ok(await history(n));assert.equal(hist.items.length,1);assert.deepEqual(hist.items[0].base_snapshot.notice,old.data.notice);assert.equal(hist.items[0].created_by,undefined);
  });
  await t.test('new applications reject unseen revisions while retries retain their original accepted version',async()=>{
   const body={rule_id:S.rule.id,submission:{...S.submission,notice_id:n.id}};
   bad(await call('POST','/notices/submissions',seller,body,seller.personal_party_id,headers()),'NOTICE_REVISION_ACK_REQUIRED');
   bad(await call('POST','/notices/submissions',seller,{...body,notice_version:old.object_version,notice_sha256:digest(old.data.notice)},seller.personal_party_id,headers()),'VERSION_CONFLICT');
   const current=ok(await call('GET','/notices/catalog/'+n.id,seller,undefined,null));assert.equal(current.notice_sha256,digest(n.data.notice));
   retryBody={...body,notice_version:current.object_version,notice_sha256:current.notice_sha256};retryHeaders=headers();
   retrySubmission=ok(await call('POST','/notices/submissions',seller,retryBody,seller.personal_party_id,retryHeaders));
  });
  await t.test('applicant must confirm exact current version without rewriting original snapshot; recipient cannot confirm for them',async()=>{
   bad(await approve(pending),'NOTICE_REVISION_ACK_REQUIRED');
   bad(await confirm(sub,n,buyer),'NOTICE_NOT_FOUND');
   bad(await confirm(sub,n,seller,headers(sub),'0'.repeat(64)),'NOTICE_CONTENT_MISMATCH');
   bad(await confirm(sub,old),'VERSION_CONFLICT');
   const h=headers(sub);const confirmed=ok(await confirm(sub,n,seller,h));assert.deepEqual(ok(await confirm(sub,n,seller,h)),confirmed);
   assert.deepEqual(confirmed.data.notice_snapshot,sub.data.notice_snapshot);assert.equal(confirmed.data.notice_acknowledgement.revision_id,revision.id);sub=confirmed;
   pending=ok(await confirm(pending,n));pending=ok(await approve(pending));assert.equal(pending.current_status,'SENT');
  });
  await t.test('confirmation cannot revive old quote; formed order is unchanged; new quote can be accepted',async()=>{
   await assert.rejects(trade.accept(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()}),e=>e.code==='NOTICE_QUOTE_REVISION_CONFLICT');
   assert.deepEqual(ok(await call('GET','/trade/records/'+order.id,buyer)),oldOrder);
   const s=ok(await call('POST','/notices/submissions/'+pending.id+'/decision',buyer,{decision:'INTERESTED'},buyer.personal_party_id,headers(pending)));
   const c=ok(await call('GET','/notices/records/'+s.data.case_id,reviewer,undefined,null)),q=await S.commercialQuote();
   const l=ok(await call('POST','/notices/cases/'+c.id+'/quote',reviewer,{quote_id:q.quote.id,quote_sha256:q.quote.content_sha256,reason:'synthetic current terms'},null,headers(c)));
   assert.equal(l.data.quote.notice_revision_id,n.data.revision_id);
   const currentOrder=await q.trade.accept(buyer.ctx,{record_id:q.quote.id,party_id:buyer.personal_party_id,expected_version:q.quote.object_version,quote_sha256:q.quote.content_sha256,operation_key:key()});assert.equal(currentOrder.current_status,'OPEN');
  });
  await t.test('new application binds revised notice and expired identity still blocks acknowledgment',async()=>{
   const fresh=ok(await submit(n));assert.equal(fresh.data.notice_snapshot.revision_id,revision.id);
   const next=ok(await revise(n,{...n.data.notice,title:'Third published version'}));ok(await approve(next));n=ok(await read(n));
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00.000' WHERE id=?",[seller.person.id]);
   try{const r=await confirm(fresh,n);assert.ok([403,404,409].includes(r.status),JSON.stringify(r));}
   finally{await db.execute("UPDATE artist_people SET identity_valid_until='2099-01-01 00:00:00.000' WHERE id=?",[seller.person.id]);}
   assert.equal(ok(await history(n)).items.length,2);
   assert.deepEqual(ok(await call('POST','/notices/submissions',seller,retryBody,seller.personal_party_id,retryHeaders)),retrySubmission);
  });
  await t.test('legacy missing snapshot is never fabricated; confirmation preserves that absence',async()=>{
   const legacy=ok(await submit(n)),data={...legacy.data};delete data.notice_snapshot;
   await db.execute('UPDATE notice_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),legacy.id]);
   const historic=ok(await read(legacy,seller));assert.equal(historic.data.notice_snapshot,undefined);
   bad(await approve(historic),'NOTICE_REVISION_ACK_REQUIRED');
   const ack=ok(await confirm(historic,n));assert.equal(ack.data.notice_snapshot,undefined);assert.equal(ack.data.notice_acknowledgement.revision_id,n.data.revision_id);
  });
  await t.test('simultaneous approvals cannot overwrite each other; exactly one revision takes effect',async()=>{
   const first=ok(await revise(n,{...n.data.notice,title:'Concurrent A'})),second=ok(await revise(n,{...n.data.notice,title:'Concurrent B'}));
   const results=await Promise.all([approve(first),approve(second)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
   n=ok(await read(n));assert.equal(n.data.revision_id,results.find(x=>x.status===200).data.id);
   bad(await revise(n,{...n.data.notice,valid_until:'2021-01-01T00:00:00.000Z'}),'NOTICE_PERIOD_INVALID');
  });
  await t.test('official revisions require current official author and independent reviewer',async()=>{
   const original=ok(await approve(ok(await create(S.rule,outsider,{...S.body,type:'OFFICIAL',details:{summary:'synthetic public statement'},accept_submissions:false},headers(),null))));
   const body={notice:{...original.data.notice,title:'Revised official statement'},reason:'synthetic official revision'},h=headers(original);
   const pendingOfficial=ok(await call('POST','/notices/announcements/'+original.id+'/revisions',outsider,body,null,h));
   bad(await approve(pendingOfficial,outsider),'SELF_REVIEW_FORBIDDEN');
   await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='NOTICE_OFFICIAL'",[outsider.account_id]);
   try{bad(await approve(pendingOfficial),'NOTICE_OPERATOR_FORBIDDEN');}
   finally{await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='NOTICE_OFFICIAL'",[outsider.account_id]);}
   // Existing division of duties: NOTICE_REVIEW is enough for the independent
   // reviewer; only the publisher needs NOTICE_OFFICIAL.
   await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='NOTICE_OFFICIAL'",[reviewer.account_id]);
   try{assert.equal(ok(await approve(pendingOfficial)).current_status,'APPROVED');}
   finally{await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='NOTICE_OFFICIAL'",[reviewer.account_id]);}
   assert.equal(ok(await call('GET','/notices/catalog/'+original.id,buyer,undefined,null)).notice.title,body.notice.title);
  });
  const out=path.resolve(__dirname,'../../../..','.local/notices-revisions-http-fixtures.json');
  await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{
  if(server)await new Promise(r=>server.close(r));if(db)await db.close();
  await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
