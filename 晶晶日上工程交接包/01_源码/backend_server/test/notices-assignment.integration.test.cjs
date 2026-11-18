'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('specific support assignment and handover preserve original cooperation and quote',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_notice_assignment_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const cases=[],journey=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{buyer,seller,reviewer:staff,buyer2:replacement,outsider:manager}=S;
  const grant=async(user,action,enabled=true)=>{const row=(await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[user.account_id,action]))[0][0];return require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:user.account_id,action,enabled,expected_version:row?.object_version||0,expires_at:null,authority_ref:'synthetic:assignment',reason:'isolated test only'});};
  assert.equal((await db.execute("SELECT account_id FROM governance_operator_grants WHERE action_code='NOTICE_ASSIGN'"))[0].length,0);
  await grant(manager,'NOTICE_ASSIGN');await grant(replacement,'NOTICE_SUPPORT');await grant(buyer,'NOTICE_SUPPORT');await grant(buyer,'NOTICE_ASSIGN');
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,{user=manager,party=null,body,record,op=key()}={}){
   const res=await fetch(base+url,{method,headers:{...user?{Authorization:'Bearer '+user.token}:{},...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':op},...record?{'If-Match':'"'+record.object_version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)}}),value=await res.json();
   const schema=res.ok?(url.includes('/assignment-options')?'NoticeAssignmentOptionsResponse':url.includes('/assignment-history')?'NoticeAssignmentHistoryResponse':url.includes('/quote-options')?'NoticeCaseQuoteOptionsResponse':url.startsWith('/trade/')?'TradeRecordResponse':'NoticeResponse'):'ErrorResponse';cases.push({method,path:new URL(base+url).pathname,schema,value});return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r));
  async function fresh(){let sub=ok(await call('POST','/notices/submissions',{user:seller,party:seller.personal_party_id,body:{rule_id:S.rule.id,submission:S.submission}}));sub=ok(await call('POST','/notices/records/'+sub.id+'/reviews',{user:staff,body:{decision:'APPROVE',reason:'synthetic independent review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}},record:sub}));sub=ok(await call('POST','/notices/submissions/'+sub.id+'/decision',{user:buyer,party:buyer.personal_party_id,body:{decision:'INTERESTED'},record:sub}));return {sub,record:ok(await call('GET','/notices/records/'+sub.data.case_id,{user:staff}))};}
  const first=await fresh();let current=first.record;const route='/notices/cases/'+current.id,assign=(record,account,user=manager,op=key())=>call('POST',route+'/assignment',{user,body:{account_id:account,reason:'synthetic dispatch reason'},record,op});let firstOp,originalAssignment;
  await t.test('new dispatch authority is explicit and cannot be replaced by ordinary support or interested parties',async()=>{
   bad(await assign(current,staff.account_id,staff),'NOTICE_OPERATOR_FORBIDDEN');bad(await assign(current,staff.account_id,buyer),'SELF_REVIEW_FORBIDDEN');bad(await assign(current,buyer.account_id),'SELF_REVIEW_FORBIDDEN');bad(await assign(current,key()),'NOTICE_OPERATOR_FORBIDDEN');
   assert.equal((await call('POST',route+'/assignment',{user:null,body:{account_id:staff.account_id,reason:'synthetic'},record:current})).status,401);
   assert.equal((await call('POST',route+'/assignment',{party:manager.personal_party_id,body:{account_id:staff.account_id,reason:'synthetic'},record:current})).status,400);
   const options=ok(await call('GET',route+'/assignment-options'));assert.ok(options.items.some(x=>x.account_id===staff.account_id));assert.ok(options.items.some(x=>x.account_id===replacement.account_id));assert.ok(!options.items.some(x=>x.account_id===buyer.account_id));
  });
  await t.test('concurrent same command assigns once and exposes only current handler to the parties',async()=>{
   firstOp=key();originalAssignment=current;const replies=await Promise.all([1,2,3].map(()=>assign(current,staff.account_id,manager,firstOp)));current=ok(replies[0]);for(const r of replies)assert.equal(ok(r).object_version,current.object_version);
   assert.equal(current.data.support_assignment.account_id,staff.account_id);assert.equal((await db.execute('SELECT case_id FROM notice_case_assignments WHERE case_id=?',[current.id]))[0].length,1);
   const party=ok(await call('GET','/notices/records/'+current.id,{user:buyer,party:buyer.personal_party_id}));assert.equal(Object.hasOwn(party.data.support_assignment,'reason'),false);assert.equal(Object.hasOwn(party.data.support_assignment,'assigned_by'),false);
   journey.push({name:'specific handler assigned once; internal dispatch reason hidden from parties',result:'PASS',case_id:current.id,submission_id:first.sub.id,account_id:staff.account_id});
  });
  await t.test('handover rejects stale versions; old handler loses reads, quote choices and writes; old key cannot restore assignment',async()=>{
   const stale=current;current=ok(await assign(current,replacement.account_id));bad(await assign(stale,staff.account_id),'VERSION_CONFLICT');
   bad(await call('GET','/notices/records/'+current.id,{user:staff}),'NOTICE_CASE_NOT_ASSIGNED');bad(await call('GET',route+'/quote-options',{user:staff}),'NOTICE_CASE_NOT_ASSIGNED');bad(await call('GET',route+'/assignment-history',{user:staff}),'NOTICE_CASE_NOT_ASSIGNED');
   const recovered=ok(await assign(originalAssignment,staff.account_id,manager,firstOp));assert.equal(recovered.data.support_assignment.account_id,replacement.account_id);assert.equal(recovered.object_version,current.object_version);
   const firstPage=ok(await call('GET',route+'/assignment-history?limit=1',{user:replacement}));assert.equal(firstPage.items.length,1);assert.ok(firstPage.next_cursor);const next=ok(await call('GET',route+'/assignment-history?cursor='+firstPage.next_cursor,{user:replacement}));assert.equal(next.items[0].previous_account_id,staff.account_id);assert.equal(next.items[0].assignment.account_id,replacement.account_id);
   journey.push({name:'handover removes former handler access; recovery returns current handler; history retained',result:'PASS',case_id:current.id,from:staff.account_id,to:replacement.account_id,history_versions:[firstPage.items[0].object_version,next.items[0].object_version]});
  });
  await t.test('revoked assignee cannot read or recover old writes; manager can rescue the same original case',async()=>{
   await grant(replacement,'NOTICE_SUPPORT',false);bad(await call('GET','/notices/records/'+current.id,{user:replacement}),'NOTICE_OPERATOR_FORBIDDEN');bad(await assign(current,replacement.account_id),'NOTICE_OPERATOR_FORBIDDEN');assert.ok(!ok(await call('GET',route+'/assignment-options')).items.some(x=>x.account_id===replacement.account_id));
   current=ok(await assign(current,staff.account_id));assert.equal(current.data.support_assignment.account_id,staff.account_id);
   await grant(replacement,'NOTICE_SUPPORT');journey.push({name:'revoked target blocked and dispatcher rescues original case',result:'PASS',case_id:current.id,restored_account_id:staff.account_id});
  });
  await t.test('only current independent handler links original quote; linked case freezes dispatch and does not change intent',async()=>{
   const {quote}=await S.commercialQuote(),body={quote_id:quote.id,quote_sha256:quote.content_sha256,reason:'synthetic original quote'};
   bad(await call('POST',route+'/quote',{user:replacement,body,record:current}),'NOTICE_CASE_NOT_ASSIGNED');
   current=ok(await call('POST',route+'/quote',{user:staff,body,record:current}));assert.equal(current.data.support_assignment.account_id,staff.account_id);bad(await assign(current,replacement.account_id),'NOTICE_CASE_NOT_OPEN');
   const original=ok(await call('GET','/notices/records/'+first.sub.id,{user:buyer,party:buyer.personal_party_id}));assert.equal(original.content_sha256,first.sub.content_sha256);
   const order=ok(await call('POST','/trade/quotes/'+quote.id+'/acceptance',{user:buyer,party:buyer.personal_party_id,body:{quote_sha256:quote.content_sha256},record:quote}));assert.equal(order.data.financial.received_minor,0);
   journey.push({name:'assigned handler links same quote once; intent preserved and no automatic payment',result:'PASS',case_id:current.id,submission_id:first.sub.id,quote_id:quote.id,order_id:order.id});
  });
  await t.test('unassigned compatibility linking records first handler without rewriting prior case or fee rules',async()=>{
   const {sub,record}=await fresh(),{quote}=await S.commercialQuote();const linked=ok(await call('POST','/notices/cases/'+record.id+'/quote',{user:staff,body:{quote_id:quote.id,quote_sha256:quote.content_sha256,reason:'synthetic compatible claim'},record}));assert.equal(linked.data.support_assignment.mode,'QUOTE_CLAIM');assert.equal(linked.data.support_assignment.account_id,staff.account_id);const history=ok(await call('GET','/notices/cases/'+record.id+'/assignment-history',{user:staff}));assert.equal(history.items.length,1);assert.equal(history.items[0].previous_account_id,null);
   journey.push({name:'compatible unassigned quote link records first actual handler',result:'PASS',case_id:record.id,submission_id:sub.id,quote_id:quote.id});
  });
  await t.test('withdrawn source closes the case and rejects new assignments while preserving history',async()=>{
   const {sub,record}=await fresh();const assigned=ok(await call('POST','/notices/cases/'+record.id+'/assignment',{body:{account_id:staff.account_id,reason:'synthetic before withdrawal'},record}));ok(await call('POST','/notices/records/'+sub.id+'/close',{user:seller,party:seller.personal_party_id,body:{reason:'withdraw original cooperation'},record:sub}));
   const closed=ok(await call('GET','/notices/records/'+record.id));assert.equal(closed.current_status,'CLOSED');bad(await call('POST','/notices/cases/'+record.id+'/assignment',{body:{account_id:replacement.account_id,reason:'too late'},record:closed}),'NOTICE_CASE_NOT_OPEN');assert.equal(ok(await call('GET','/notices/cases/'+record.id+'/assignment-history')).items.length,1);
   journey.push({name:'source withdrawal preserves assignment history and blocks new dispatch',result:'PASS',case_id:record.id,assignment_version:assigned.object_version});
  });
  await t.test('assignment audit failure rolls back the handler, case version and notification together',async()=>{
   const {record}=await fresh();await db.withConnection(c=>c.query("CREATE TRIGGER notice_assignment_abort BEFORE INSERT ON notice_case_assignments FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic assignment rollback'"));
   try{const out=await call('POST','/notices/cases/'+record.id+'/assignment',{body:{account_id:staff.account_id,reason:'must roll back'},record});assert.equal(out.status,503);const unchanged=ok(await call('GET','/notices/records/'+record.id));assert.equal(unchanged.object_version,record.object_version);assert.equal(unchanged.data.support_assignment,undefined);assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM ops_events WHERE record_id=? AND event_code='SUPPORT_ASSIGNED'",[record.id]))[0][0].n),0);}finally{await db.withConnection(c=>c.query('DROP TRIGGER notice_assignment_abort'));}
  });
  await t.test('history integrity and manager revocation are checked on every read',async()=>{
   await db.execute('UPDATE notice_case_assignments SET data_sha256=? WHERE case_id=? AND object_version=2',['0'.repeat(64),first.record.id]);bad(await call('GET',route+'/assignment-history'),'SERVICE_UNAVAILABLE');
   await grant(manager,'NOTICE_ASSIGN',false);assert.equal((await call('GET',route+'/assignment-history')).status,403);assert.equal((await call('GET',route+'/assignment-options')).status,403);
  });
  const out=path.resolve(__dirname,'../../../..','.local');await fs.writeFile(path.join(out,'notices-assignment-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases},null,2)+'\n');await fs.writeFile(path.join(out,'notices-assignment-result.json'),JSON.stringify({result:'PASS',checks:journey,limits:['Synthetic users, permissions, qualifications and unpaid quotes','No frontend, real service or operator grant in production']},null,2)+'\n');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
