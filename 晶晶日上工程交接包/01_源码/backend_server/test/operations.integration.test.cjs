 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{createAccountApi}=require('../src/http/account-api');
const {createTradeRepository}=require('../src/modules/trade/repository'),{createRuleContent,digest}=require('../src/modules/governance/content');
test('operations actual HTTP permissions, comments, notifications and report jobs',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal}),secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret}),repo=createTradeRepository(db,{resolvePrincipal});
 const people=[];for(const label of ['seller','buyer','reviewer','stranger']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});const p={ctx,...await parties.registerAccount(ctx,{display_name:label}),token:randomBytes(32).toString('base64url')};people.push(p);await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
 const [seller,buyer,reviewer,stranger]=people;for(const person of [reviewer,seller])for(const action of ['TRADE_REVIEW','TRADE_REFUND'])await maintainOperatorGrant(db,{account_id:person.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:test',reason:'isolated test'});
 const ruleId=key(),rule=createRuleContent({id:ruleId,rule_key:'trade.test',version:'1',terms:{explicit:'synthetic only'}});await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'trade.test','1',JSON.stringify(rule),'2020-01-01 00:00:00',seller.account_id,'EFFECTIVE']);
 let calls=0,fail=false,ready=true;const proofs=new Map();const config=code=>({provider:code,environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'test'});
 const providersFactory=()=>({get(code){return {config:config(code),async assertReady(){if(!ready)throw Error('not configured');},async call(method,p){if(method==='create'){calls++;if(fail)throw Error('unknown');return code==='ALIPAY'?{kind:'ALIPAY_APP',order_string:'synthetic-only'}:{kind:'APPLE_STOREKIT2',product_id:p.apple_product_id,app_account_token:p.id};}if(method==='refund')return {status:code==='APPLE'?'AWAITING_APPLE_REQUEST':'PENDING'};return proofs.get(p.id);},async refundQuery(r){return {...r,refund_id:r.id,status:'SUCCEEDED'};},async notification(body){if(body.signedPayload!=='synthetic-verified-token'||!proofs.has('notification'))throw Error('unsigned');return proofs.get('notification');}};}});
 const files=new Map(),storageFactory=()=>({async put({key,body}){files.set(key,body);return {key,size:body.length,sha256:require('node:crypto').createHash('sha256').update(body).digest('hex')};},async getBuffer(key){return files.get(key);}});
 server=createAccountApi({db,secret,tradeProvidersFactory:providersFactory,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/trade',fixtures=[];
 async function api(method,url,person=buyer,body,party=person?.personal_party_id,headers={}){const r=await fetch(base+url,{method,headers:{...(person?{Authorization:'Bearer '+person.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(method==='POST'?{'Content-Type':'application/json','Idempotency-Key':key()}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:(r.headers.get('content-type')||'').includes('application/json')?await r.json():await r.text()};}
 const take=(r,schema='TradeRecordResponse')=>{assert.equal(r.status,200,JSON.stringify(r.body));fixtures.push({schema,value:r.body});return r.body.data;};
 const review=async r=>take(await api('POST','/records/'+r.id+'/reviews',reviewer,{decision:'APPROVED',reason:'synthetic verified'},null,{'If-Match':'"'+r.object_version+'"'}));
 const specification={version:'1',service_tier:'Explicit synthetic tier',sample_seconds:23,final_seconds:119,revision_limit:2,deliverables:['test artifact'],terms:'No real product terms'};
 let spec,order,payment;
 async function newOrder(channel='ALIPAY',trigger='ORDER_ACCEPTED'){const q=await review(take(await api('POST','/quotes',seller,{buyer_party_id:buyer.personal_party_id,lines:[{line_id:'production',spec_id:spec.id,quantity:1}],installments:[{key:'first',trigger,allocations:[{line_id:'production',amount_minor:500000}],apple_product_id:channel==='APPLE'?'synthetic.product':null}],channel,transaction_model:'DIRECT_SUPPLIER',rule_id:ruleId,expires_at:'2099-01-01T00:00:00.000Z',payment_window_minutes:30,license_reservation_id:null})));return take(await api('POST','/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256},buyer.personal_party_id,{'If-Match':'"'+q.object_version+'"'}));}
 const start=(o,op=key())=>api('POST','/payments',buyer,{order_id:o.id,installment_key:'first'},buyer.personal_party_id,{'Idempotency-Key':op});
 const proof=p=>({...config(p.data.provider),payment_id:p.id,currency:'CNY',amount_minor:p.data.amount_minor,status:'SUCCEEDED',transaction_id:'synthetic.'+p.id,product_id:p.data.apple_product_id,app_account_token:p.data.provider==='APPLE'?p.id:null});

 spec=await review(take(await api('POST','/specifications',seller,{previous_spec_id:null,title:'Synthetic production',provider_party_id:seller.personal_party_id,line_kind:'PRODUCTION',unit_minor:500000,currency:'CNY',specification})));order=await newOrder();

 const {createOperationsRepository}=require('../src/modules/operations/repository'),{createOperationsHandlers}=require('../src/modules/operations/reports'),{createJobRepository}=require('../src/infrastructure/jobs/repository');
 const ops=createOperationsRepository(db,{resolvePrincipal}),jobs=createJobRepository(db),handler=createOperationsHandlers(db).get('OPERATIONS_REPORT'),opsFixtures=[],requests=[];
 for(const action of ['OPERATIONS_REPORT','OPERATIONS_AUDIT','COMMENT_MODERATE'])await maintainOperatorGrant(db,{account_id:reviewer.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:test',reason:'isolated test'});
 async function call(method,url,person=buyer,body,party=person?.personal_party_id,headers={}){const r=await fetch(base.replace(/\/trade$/,'/operations')+url,{method,headers:{...(person?{Authorization:'Bearer '+person.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(method==='POST'?{'Content-Type':'application/json','Idempotency-Key':key()}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=(r.headers.get('content-type')||'').includes('application/json')?await r.json():await r.text();if(r.status===200&&method==='POST')requests.push({path:url,body});if(r.status>=400&&typeof value==='object')opsFixtures.push({schema:'ErrorResponse',value});return {status:r.status,body:value,headers:r.headers};}
 const ok=(r,schema)=>{assert.equal(r.status,200,JSON.stringify(r.body));if(schema)opsFixtures.push({schema,value:r.body});return r.body.data;};
 const target='/objects/TRADE/'+order.id,commentBody={body:'Please confirm this project requirement. <script> is plain text.',reply_to:null};
 const reportBody={kind:'CASH',environment:'SANDBOX',period_start:'2026-01-01T00:00:00.000Z',period_end:'2027-01-01T00:00:00.000Z'};
 async function runJob(){const job=await jobs.claim('operations.test',60000);assert.ok(job);const result=await handler.execute(job);await jobs.finish(job,result);return {job,result};}
 let c,report;
 await t.test('fresh authentication, acting party, input bounds and unsupported comments',async()=>{
  assert.equal((await call('GET','/notifications',null)).status,401);assert.equal((await call('GET','/notifications',buyer,undefined,null)).status,400);
  for(const q of ['?limit=0','?limit=-1','?cursor=abc','?cursor=-2','?unread_only=maybe','?limit=1&limit=2'])assert.equal((await call('GET','/notifications'+q)).status,400);
  assert.equal((await call('POST',target+'/comments',buyer,{body:'x',reply_to:null,author_account_id:reviewer.account_id})).status,400);
  assert.equal((await call('POST','/objects/TRADE/'+spec.id+'/comments',seller,commentBody)).status,400);
 });
 await t.test('business audit and notification insert are atomic; duplicate events have one recipient',async()=>{
  const before=ok(await call('GET','/notifications'),'OpsNotificationListResponse');assert.ok(before.items.some(x=>x.record_id===order.id));
  const [[event]]=await db.execute('SELECT * FROM trade_audit WHERE record_id=? LIMIT 1',[order.id]);
  const {publishEvent}=require('../src/modules/operations/events');const input={domain:'TRADE',record_id:order.id,event_id:event.id,event_code:event.event_code,object_version:event.object_version,actor_account_id:event.actor_account_id};
  await db.withTransaction(async tx=>{await publishEvent(tx,input);await publishEvent(tx,input);});
  assert.equal(ok(await call('GET','/notifications')).items.length,before.items.length);
  await db.withConnection(c=>c.query("CREATE TRIGGER ops_event_fail BEFORE INSERT ON ops_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic failure'"));
  const [[n]]=await db.execute('SELECT COUNT(*) n FROM trade_records');try{assert.equal((await api('POST','/specifications',seller,{previous_spec_id:null,title:'fail',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:1,currency:'CNY',specification})).status,503);}finally{await db.withConnection(c=>c.query('DROP TRIGGER ops_event_fail'));}assert.equal((await db.execute('SELECT COUNT(*) n FROM trade_records'))[0][0].n,n.n);
 });
 await t.test('inbox isolates parties, supports unread and refresh, and marks read idempotently',async()=>{
  assert.deepEqual(ok(await call('GET','/notifications',stranger)).items,[]);assert.equal((await call('GET','/notifications',stranger,undefined,buyer.personal_party_id)).status,403);
  const item=ok(await call('GET','/notifications')).items[0];ok(await call('POST','/notifications/'+item.id+'/read',buyer,{}),'OpsReadResponse');ok(await call('POST','/notifications/'+item.id+'/read',buyer,{}),'OpsReadResponse');
  assert.ok(!ok(await call('GET','/notifications?unread_only=true')).items.some(x=>x.id===item.id));assert.ok(ok(await call('GET','/notifications')).items.find(x=>x.id===item.id).read);
  assert.equal((await call('POST','/notifications/'+item.id+'/read',stranger,{})).status,404);
  const page=ok(await call('GET','/notifications?limit=1'));assert.ok(page.next_cursor);const next=ok(await call('GET','/notifications?cursor='+page.next_cursor));assert.ok(next.items.every(x=>x.id<page.next_cursor));
 });
 await t.test('comments are object-bound and concurrent retries create once',async()=>{
  const op=key(),rows=await Promise.all([1,2,3].map(()=>call('POST',target+'/comments',buyer,commentBody,buyer.personal_party_id,{'Idempotency-Key':op})));c=ok(rows[0],'OpsCommentResponse');rows.forEach(r=>assert.equal(ok(r,'OpsCommentResponse').id,c.id));
  assert.equal((await call('POST',target+'/comments',buyer,{...commentBody,body:'changed'},buyer.personal_party_id,{'Idempotency-Key':op})).status,409);
  assert.equal((await call('GET',target+'/comments',stranger)).status,404);
  const reply=ok(await call('POST',target+'/comments',seller,{body:'Confirmed.',reply_to:c.id}),'OpsCommentResponse');assert.equal(reply.reply_to,c.id);
  const other=await newOrder();assert.equal((await call('POST','/objects/TRADE/'+other.id+'/comments',buyer,{body:'wrong thread',reply_to:c.id})).status,409);
  assert.equal(ok(await call('GET',target+'/comments'),'OpsCommentListResponse').items.length,2);
 });
 await t.test('withdrawal preserves audit, checks version, and never exposes withdrawn text',async()=>{
  const body={action:'WITHDRAW',reason:'correct later'};assert.equal((await call('POST','/comments/'+c.id+'/actions',seller,body,seller.personal_party_id,{'If-Match':'"1"'})).status,403);
  assert.equal((await call('POST','/comments/'+c.id+'/actions',buyer,body,buyer.personal_party_id,{'If-Match':'"2"'})).status,412);
  const op=key(),h={'If-Match':'"1"','Idempotency-Key':op};const r=ok(await call('POST','/comments/'+c.id+'/actions',buyer,body,buyer.personal_party_id,h),'OpsCommentResponse');assert.equal(r.body,null);assert.equal(r.current_status,'WITHDRAWN');assert.equal(ok(await call('POST','/comments/'+c.id+'/actions',buyer,body,buyer.personal_party_id,h)).id,r.id);
  assert.equal(ok(await call('GET',target+'/comments')).items.find(x=>x.id===c.id).body,null);
 });
 await t.test('moderation requires explicit grant and business access; audit cannot be forged',async()=>{
  const row=ok(await call('POST',target+'/comments',seller,{body:'moderation sample',reply_to:null}));
  assert.equal((await call('POST','/comments/'+row.id+'/actions',buyer,{action:'HIDE',reason:'not a moderator'},buyer.personal_party_id,{'If-Match':'"1"'})).status,403);
  const changed=ok(await call('POST','/comments/'+row.id+'/actions',reviewer,{action:'HIDE',reason:'independent review'},null,{'If-Match':'"1"'}),'OpsCommentResponse');assert.equal(changed.body,null);
  assert.equal((await call('GET','/audit',buyer,undefined,null)).status,403);const audit=ok(await call('GET','/audit?object_id='+row.id,reviewer,undefined,null),'OpsAuditListResponse');assert.ok(audit.items.some(x=>x.event_code==='COMMENT_HIDE'));
  ok(await call('GET',target+'/audit',reviewer,undefined,null),'OpsBusinessAuditListResponse');
 });
 await t.test('reports queue durably and exclude unverified legacy money',async()=>{
  payment=take(await start(order));await repo.applyPayment(proof(payment));
  const op=key();report=ok(await call('POST','/reports',buyer,reportBody,buyer.personal_party_id,{'Idempotency-Key':op}),'OpsReportResponse');assert.equal(report.current_status,'PENDING');assert.equal(report.result,null);
  assert.equal(ok(await call('POST','/reports',buyer,reportBody,buyer.personal_party_id,{'Idempotency-Key':op})).id,report.id);
  assert.equal((await call('GET','/reports/'+report.id+'/content')).status,409);
  const {result}=await runJob();assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
  report=ok(await call('GET','/reports/'+report.id),'OpsReportResponse');assert.equal(report.result.totals.RECEIPT,500000);assert.equal(report.result.rows.length,1);assert.equal(report.result.metric_version,'1');
  const csv=await call('GET','/reports/'+report.id+'/content');assert.equal(csv.status,200);assert.ok(csv.body.includes('500000'));assert.ok(csv.headers.get('content-type').startsWith('text/csv'));assert.equal(csv.headers.get('cache-control'),'no-store');
 });
 await t.test('completed report is immutable across later receipts and only its creator can download',async()=>{
  const before=JSON.stringify(report);const another=await newOrder();const p=take(await start(another));await repo.applyPayment(proof(p));assert.equal(JSON.stringify(ok(await call('GET','/reports/'+report.id))),before);
  assert.equal((await call('GET','/reports/'+report.id,stranger)).status,404);assert.equal((await call('GET','/reports/'+report.id,reviewer,undefined,null)).status,404);
  const prod=ok(await call('POST','/reports',buyer,{...reportBody,environment:'PRODUCTION'}));assert.equal((await runJob()).result.status,'SUCCEEDED');const out=ok(await call('GET','/reports/'+prod.id),'OpsReportResponse');assert.equal(out.result.rows.length,0);
 });
 await t.test('revoked membership blocks inbox, comments and already generated report',async()=>{
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);try{for(const url of ['/notifications',target+'/comments','/reports/'+report.id,'/reports/'+report.id+'/content'])assert.equal((await call('GET',url)).status,403);}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);}
 });
 await t.test('revoked operator access blocks queued job; authorized retry is idempotent',async()=>{
  const r=ok(await call('POST','/reports',reviewer,reportBody,null));await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='OPERATIONS_REPORT'",[reviewer.account_id]);assert.equal((await runJob()).result.status,'BLOCKED');assert.equal((await call('GET','/reports/'+r.id,reviewer,undefined,null)).status,403);
  await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='OPERATIONS_REPORT'",[reviewer.account_id]);ok(await call('GET','/reports/'+r.id,reviewer,undefined,null),'OpsReportResponse');const op=key(),h={'Idempotency-Key':op};ok(await call('POST','/reports/'+r.id+'/retries',reviewer,{reason:'permission restored'},null,h),'OpsReportResponse');ok(await call('POST','/reports/'+r.id+'/retries',reviewer,{reason:'permission restored'},null,h),'OpsReportResponse');assert.equal((await runJob()).result.status,'SUCCEEDED');ok(await call('GET','/reports/'+r.id,reviewer,undefined,null),'OpsReportResponse');
 });
 await t.test('expired worker cannot publish and recovered job produces one snapshot',async()=>{
  const r=ok(await call('POST','/reports',buyer,reportBody));const old=await jobs.claim('old',60000);await db.execute("UPDATE platform_jobs SET lease_until='2020-01-01' WHERE id=?",[old.id]);const fresh=await jobs.claim('new',60000);await assert.rejects(handler.execute(old),{code:'LEASE_LOST'});const result=await handler.execute(fresh);assert.equal(result.status,'SUCCEEDED');await jobs.finish(fresh,result);assert.equal(ok(await call('GET','/reports/'+r.id)).current_status,'SUCCEEDED');
  assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM ops_audit WHERE object_id=? AND event_code='REPORT_GENERATED'",[r.id]))[0][0].n),1);
 });
 await t.test('empty workload and settlement reports explain limits without fabricated profit',async()=>{
  for(const kind of ['WORKLOAD','SETTLEMENT']){const r=ok(await call('POST','/reports',buyer,{...reportBody,kind}));assert.equal((await runJob()).result.status,'SUCCEEDED');const ready=ok(await call('GET','/reports/'+r.id),'OpsReportResponse');assert.equal(ready.result.row_count,0);assert.ok(ready.result.limitations.length);}
 });
 await t.test('report and comment audit failures roll back changes and idempotency keys',async()=>{
  await db.withConnection(c=>c.query("CREATE TRIGGER ops_audit_fail BEFORE INSERT ON ops_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic failure'"));
  const [[before]]=await db.execute('SELECT COUNT(*) n FROM ops_comments');try{assert.equal((await call('POST',target+'/comments',buyer,{body:'must roll back',reply_to:null})).status,503);}finally{await db.withConnection(c=>c.query('DROP TRIGGER ops_audit_fail'));}assert.equal((await db.execute('SELECT COUNT(*) n FROM ops_comments'))[0][0].n,before.n);
 });

 await t.test('settlement shares and real workload states use bounded source rows, not assumed profit',async()=>{
  const agreement=key(),data={parties:[buyer.personal_party_id,seller.personal_party_id],environment:'SANDBOX'},entry={synthetic:true};
  await db.execute("INSERT INTO finance_records(id,kind,owner_party_id,created_by,current_status,data_json,data_sha256) VALUES (?,'AGREEMENT',?,?,'APPROVED',?,?)",[agreement,seller.personal_party_id,seller.account_id,JSON.stringify(data),digest(data)]);
  for(const [party,value] of [[buyer.personal_party_id,120],[seller.personal_party_id,880]])await db.execute("INSERT INTO finance_entries(agreement_id,party_id,fact_key,category,amount_minor,source_id,data_json,data_sha256) VALUES (?,?,?,'ACCRUAL',?,?,?,?)",[agreement,party,digest(key()),value,agreement,JSON.stringify(entry),digest(entry)]);
  const project=key(),pd={buyer_party_id:buyer.personal_party_id,merchant_party_id:seller.personal_party_id,producer_party_id:seller.personal_party_id,assignee_account_id:seller.account_id};
  await db.execute("INSERT INTO production_records(id,kind,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'PROJECT',?,?,'IN_PROGRESS',?,?)",[project,order.id,seller.account_id,JSON.stringify(pd),digest(pd)]);
  for(const [kind,total,category] of [['SETTLEMENT',120,'ACCRUAL'],['WORKLOAD',1,'IN_PROGRESS']]){const r=ok(await call('POST','/reports',buyer,{...reportBody,kind}));assert.equal((await runJob()).result.status,'SUCCEEDED');const out=ok(await call('GET','/reports/'+r.id),'OpsReportResponse');assert.equal(out.result.totals[category],total);assert.equal(out.result.rows.length,1);}
  const pc='/objects/PRODUCTION/'+project+'/comments';ok(await call('POST',pc,buyer,{body:'Project discussion',reply_to:null}),'OpsCommentResponse');ok(await call('GET',pc,seller),'OpsCommentListResponse');assert.equal((await call('GET',pc,stranger)).status,404);

  const versionId=key(),vd={synthetic:true};await db.execute("INSERT INTO production_records(id,kind,project_id,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'VERSION',?,?,?,'APPROVED',?,?)",[versionId,project,order.id,seller.account_id,JSON.stringify(vd),digest(vd)]);
  ok(await call('POST','/objects/PRODUCTION/'+versionId+'/comments',seller,{body:'Version-specific note',reply_to:null}),'OpsCommentResponse');assert.equal(ok(await call('GET','/objects/PRODUCTION/'+versionId+'/comments',buyer),'OpsCommentListResponse').items.length,1);
  const planned=key(),plan=key(),plannedData={current_plan_id:plan},planData={confirmers:[{party_id:buyer.personal_party_id},{party_id:seller.personal_party_id}]};
  for(const [pid,kind,parent,body] of [[planned,'PROJECT',null,plannedData],[plan,'PLAN',planned,planData]])await db.execute('INSERT INTO project_records(id,kind,project_id,owner_party_id,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?)',[pid,kind,parent,seller.personal_party_id,seller.account_id,'PREPARING',JSON.stringify(body),digest(body)]);
  const pc2='/objects/PROJECTS/'+planned+'/comments';ok(await call('POST',pc2,seller,{body:'Plan discussion',reply_to:null}),'OpsCommentResponse');assert.equal(ok(await call('GET',pc2,buyer),'OpsCommentListResponse').items.length,1);assert.equal((await call('GET',pc2,stranger)).status,404);
  const notices=ok(await call('GET','/notifications?limit=100',buyer),'OpsNotificationListResponse');assert.ok(notices.items.some(x=>x.record_id===planned));
  await db.withTransaction(tx=>require('../src/modules/operations/events').publishEvent(tx,{domain:'PROJECTS',record_id:plan,event_id:key(),event_code:'PLAN_CREATED',object_version:1,actor_account_id:seller.account_id}));assert.ok(ok(await call('GET','/notifications?limit=100',buyer)).items.some(x=>x.record_id===plan));
  // Permission is checked again against each source even when the report is already complete.
  const saved=ok(await call('POST','/reports',buyer,{...reportBody,kind:'SETTLEMENT'}));await runJob();data.parties=[seller.personal_party_id];await db.execute('UPDATE finance_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),agreement]);assert.equal((await call('GET','/reports/'+saved.id)).status,404);
  data.parties.push(buyer.personal_party_id);await db.execute('UPDATE finance_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),agreement]);
  // A too-large export is blocked explicitly, never silently cut off and called complete.
  for(let batch=0;batch<4;batch++){const values=[],parts=[];for(let n=0;n<500;n++){parts.push("(?,?,?,'ACCRUAL',1,?,?,?)");values.push(agreement,buyer.personal_party_id,digest(key()),agreement,JSON.stringify(entry),digest(entry));}await db.execute('INSERT INTO finance_entries(agreement_id,party_id,fact_key,category,amount_minor,source_id,data_json,data_sha256) VALUES '+parts.join(','),values);}
  const large=ok(await call('POST','/reports',buyer,{...reportBody,kind:'SETTLEMENT'}));const blocked=await runJob();assert.equal(blocked.result.error_code,'REPORT_LIMIT_EXCEEDED');const out=ok(await call('GET','/reports/'+large.id),'OpsReportResponse');assert.equal(out.result,null);assert.equal(out.current_status,'BLOCKED');
 });
 const out=path.resolve(__dirname,'../../../..','.local/operations-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:opsFixtures,requests},null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
