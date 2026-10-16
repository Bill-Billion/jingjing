 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository');
const {createCustomizationRepository}=require('../src/modules/customization/repository');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access');
const {digest,createRuleContent}=require('../src/modules/governance/content');
const {createAuthRepository}=require('../src/modules/auth/repository'),{createAccountApi}=require('../src/http/account-api');
const {createTradeRepository}=require('../src/modules/trade/repository');
const context=require('../src/modules/customization/trade-context');

test('platform customization quote HTTP, story version and unique order transactions',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');
 assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),party=createPartyRepository(db,{resolvePrincipal}),stories=createCustomizationRepository(db,{resolvePrincipal});
  const people=[];for(const display_name of ['synthetic buyer','synthetic operator','synthetic merchant','synthetic reviewer','synthetic stranger']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});people.push({ctx,...await party.registerAccount(ctx,{display_name})});}
  const [buyer,operator,merchant,reviewer,stranger]=people;
  for(const action of ['CUSTOMIZATION_INTAKE','CUSTOMIZATION_TEMPLATE_PUBLISH'])await maintainOperatorGrant(db,{account_id:operator.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:version-tests',reason:'isolated transaction test only'});
  const template=await stories.publishTemplate(operator.ctx,{category_code:'synthetic',template_version:1,template_snapshot:{title:'合成故事',description:'仅验证事务，不是真实客户资料',fields:[{key:'story',label:'故事',type:'TEXT',required:true,max_length:1000}]},source_ref:'synthetic:version-test',operation_key:key()});
  const create=()=>stories.create(buyer.ctx,{party_id:buyer.personal_party_id,template_version_id:template.template_version_id,answers:{story:'合成内容第一版'},operation_key:key()});
  const submit=r=>stories.submit(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,expected_version:r.object_version,operation_key:key()});
  const intake=r=>stories.intake(operator.ctx,{request_id:r.id,expected_version:r.object_version,operation_key:key()});
  const ready=async()=>intake(await submit(await create()));
  const source=r=>({request_id:r.id,submission_id:r.submission.id,content_sha256:r.submission.content_sha256});
  const check=(s,b=buyer.personal_party_id)=>db.withTransaction(tx=>context.current(tx,s,b));
  const issues=[{field_key:'story',reason:'补充细节',instruction:'说明结尾'}];
  const supplement=r=>stories.requestSupplement(operator.ctx,{request_id:r.id,items:issues,expected_version:r.object_version,operation_key:key()});
  // Inserts are test fixtures only. They do NOT prove merchant authorization, quote review or an HTTP workflow.
  async function fixtureOrder(tx,r){
   const qid=key(),oid=key(),quote={customization:source(r)},data={quote,financial:{received_minor:0,refunded_minor:0,net_minor:0}};
   for(const [id,kind,parent,json] of [[qid,'QUOTE',null,quote],[oid,'ORDER',qid,data]])await tx.execute('INSERT INTO trade_records(id,kind,buyer_party_id,merchant_party_id,parent_id,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,NULL,?,?,?,?)',[id,kind,buyer.personal_party_id,merchant.personal_party_id,parent,buyer.account_id,kind==='QUOTE'?'APPROVED':'OPEN',JSON.stringify(json),digest(json)]);
   return {id:oid,parent_id:qid,buyer_party_id:buyer.personal_party_id,data};
  }
  const bind=r=>db.withTransaction(async tx=>{const order=await fixtureOrder(tx,r);await context.bindOrder(tx,order);return order;});
  const merchantOrg=await party.createOrganization(merchant.ctx,{display_name:'合成平台签约主体',operation_key:key()});
  const secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret});
  for(const p of people){p.token=randomBytes(32).toString('base64url');await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
  async function grant(p,action,enabled=true,expected_version=0){return maintainOperatorGrant(db,{account_id:p.account_id,action,enabled,expires_at:null,expected_version,authority_ref:'synthetic:quote-tests',reason:'isolated quote fixture only'});}
  await grant(reviewer,'TRADE_REVIEW');await grant(merchant,'TRADE_REVIEW');await grant(merchant,'CUSTOMIZATION_INTAKE');
  const ruleId=key(),rule=createRuleContent({id:ruleId,rule_key:'customization.synthetic',version:'1',terms:{explicit:'Synthetic, no formal prices or rights'}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'customization.synthetic','1',JSON.stringify(rule),'2020-01-01 00:00:00',operator.account_id,'EFFECTIVE']);
  let paidCalls=0;const fakeProviders=()=>({get:()=>({config:{provider:'ALIPAY',environment:'SANDBOX',merchant_party_id:merchantOrg.party_id,app_id:'synthetic',merchant_id:'synthetic',config_revision:1},assertReady:async()=>{},call:async()=>{paidCalls++;throw Error('External calls forbidden');}})});
  const trade=createTradeRepository(db,{resolvePrincipal,customizationMerchantPartyId:merchantOrg.party_id});
  server=createAccountApi({db,secret,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:merchantOrg.party_id},tradeProvidersFactory:fakeProviders}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
  async function http(method,url,p=buyer,body,acting=p.personal_party_id,version=null,op=key()){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+p.token,...(acting?{'X-Acting-Party':acting}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':op}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   return {status:res.status,body:await res.json(),headers:res.headers};
  }
  function take(r,schema='TradeRecordResponse'){assert.equal(r.status,200,JSON.stringify(r.body));fixtures.push({schema,value:r.body});return r.body.data;}
  function denied(r,status){assert.equal(r.status,status,JSON.stringify(r.body));fixtures.push({schema:'ErrorResponse',value:r.body});return r.body.error;}
  const review=q=>http('POST','/trade/records/'+q.id+'/reviews',reviewer,{decision:'APPROVED',reason:'合成报价独立复核'},null,q.object_version);
  const specification={version:'synthetic-1',service_tier:'隔离测试，不是真实商品',sample_seconds:23,final_seconds:119,revision_limit:2,deliverables:['合成测试文件'],terms:'仅供测试；不作为正式价格、权利或改稿承诺'};
  const spec=take(await review(take(await http('POST','/trade/specifications',merchant,{previous_spec_id:null,title:'合成定制',provider_party_id:merchantOrg.party_id,line_kind:'PRODUCTION',unit_minor:10001,currency:'CNY',specification},merchantOrg.party_id))));
  const quoteBody=r=>({buyer_party_id:buyer.personal_party_id,lines:[{line_id:'production',spec_id:spec.id,quantity:1}],installments:[['first','ORDER_ACCEPTED',3000],['interim','CUSTOMIZATION_INTERIM_CONFIRMED',6000],['last','FINAL_ACCEPTED',1001]].map(([key,trigger,amount_minor])=>({key,trigger,allocations:[{line_id:'production',amount_minor}],apple_product_id:null})),channel:'ALIPAY',transaction_model:'PLATFORM_PRINCIPAL',rule_id:ruleId,expires_at:new Date(Date.now()+3600000).toISOString(),payment_window_minutes:30,license_reservation_id:null,customization_source:source(r)});
  const quote=async r=>take(await http('POST','/trade/quotes',merchant,quoteBody(r),merchantOrg.party_id));
  const accept=(q,op=key())=>http('POST','/trade/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256},buyer.personal_party_id,q.object_version,op);
  const list=(r,p=buyer,acting=p.personal_party_id,suffix='')=>http('GET','/customization-requests/'+r.id+'/quotes'+suffix,p,undefined,acting);
  await t.test('source only accepts explicit request, submission and digest; no mutable caller reference',()=>{
   const s={request_id:key(),submission_id:key(),content_sha256:'a'.repeat(64)};assert.deepEqual(context.source(s),s);assert.notEqual(context.source(s),s);
   for(const bad of [{...s,approved:true},{...s,content_sha256:'fake'},{...s,submission_id:'bad'},{}])assert.throws(()=>context.source(bad));
  });
  await t.test('draft and merely submitted stories cannot be quoted; intake makes exact version available',async()=>{
   const draft=await create();await assert.rejects(check({request_id:draft.id,submission_id:key(),content_sha256:'a'.repeat(64)}),{code:'CUSTOMIZATION_NOT_QUOTABLE'});
   const submitted=await submit(draft);await assert.rejects(check(source(submitted)),{code:'CUSTOMIZATION_NOT_QUOTABLE'});
   const r=await intake(submitted);assert.equal((await check(source(r))).id,r.id);
   await assert.rejects(check(source(r),merchant.personal_party_id),{code:'CUSTOMIZATION_NOT_FOUND'});
   await assert.rejects(check({...source(r),submission_id:key()}),{code:'CUSTOMIZATION_SOURCE_CHANGED'});
   await assert.rejects(check({...source(r),content_sha256:'a'.repeat(64)}),{code:'CUSTOMIZATION_SOURCE_CHANGED'});
  });
  await t.test('open supplement blocks old quote basis; resubmission and re-intake never revive it',async()=>{
   let r=await ready();const old=source(r),oldSubmission=r.submission;const opened=await supplement(r);
   await assert.rejects(check(old),{code:'CUSTOMIZATION_NOT_QUOTABLE'});
   const saved=await stories.saveSupplement(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,answers:{story:'合成内容第二版'},responses:{story:'已补结尾'},expected_version:opened.object_version,operation_key:key()});
   r=await stories.submitSupplement(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,expected_version:saved.object_version,operation_key:key()});
   await assert.rejects(check(source(r)),{code:'CUSTOMIZATION_NOT_QUOTABLE'});r=await intake(r);
   await assert.rejects(check(old),{code:'CUSTOMIZATION_SOURCE_CHANGED'});await check(source(r));
   assert.deepEqual((await stories.getSubmission(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,submission_id:oldSubmission.id})).submission,oldSubmission);
  });
  await t.test('tampered stored story or digest is refused rather than silently quoted',async()=>{
   const r=await ready();await db.execute('UPDATE customization_submissions SET answers_json=? WHERE id=?',[JSON.stringify({story:'tampered'}),r.submission.id]);
   await assert.rejects(check(source(r)),{code:'STORED_CONTENT_MISMATCH'});
  });
  await t.test('accepted binding freezes original story and prevents supplement even if order is later cancelled',async()=>{
   const r=await ready(),order=await bind(r);
   const [[link]]=await db.execute('SELECT * FROM customization_orders WHERE request_id=?',[r.id]);assert.equal(link.order_id,order.id);assert.equal(link.submission_id,r.submission.id);
   await assert.rejects(supplement(r),{code:'CUSTOMIZATION_ORDER_EXISTS'});
   await db.execute("UPDATE trade_records SET current_status='CANCELLED' WHERE id=?",[order.id]);await assert.rejects(supplement(r),{code:'CUSTOMIZATION_ORDER_EXISTS'});
   assert.deepEqual((await stories.get(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id})).submission,r.submission);
  });
  await t.test('two competing orders serialize on story and roll back the losing order',async()=>{
   const r=await ready(),out=await Promise.allSettled([bind(r),bind(r)]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);
   assert.equal(out.find(x=>x.status==='rejected').reason.code,'CUSTOMIZATION_ORDER_EXISTS');
   const [[n]]=await db.execute('SELECT COUNT(*) n FROM customization_orders WHERE request_id=?',[r.id]);assert.equal(Number(n.n),1);
   const [[orders]]=await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='ORDER' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.quote.customization.request_id'))=?",[r.id]);assert.equal(Number(orders.n),1);
  });
  await t.test('order confirmation racing supplement allows only one winner and preserves coherent state',async()=>{
   for(let i=0;i<3;i++){
    const r=await ready(),results=await Promise.allSettled([bind(r),supplement(r)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const [[n]]=await db.execute("SELECT COUNT(*) n FROM customization_supplements WHERE request_id=? AND current_status='OPEN'",[r.id]);
    const [[o]]=await db.execute('SELECT COUNT(*) n FROM customization_orders WHERE request_id=?',[r.id]);assert.equal(Number(n.n)+Number(o.n),1);
   }
  });
  await t.test('later transaction failure rolls back binding and fixture order together',async()=>{
   const r=await ready();await assert.rejects(db.withTransaction(async tx=>{await context.bindOrder(tx,await fixtureOrder(tx,r));throw Error('synthetic failure after binding');}),/synthetic failure/);
   const [[n]]=await db.execute('SELECT COUNT(*) n FROM customization_orders WHERE request_id=?',[r.id]);assert.equal(Number(n.n),0);await check(source(r));await supplement(r);
  });
  await t.test('primitives never create cash, signatures or production and unbound existing order remains unaffected',async()=>{
   await db.withTransaction(tx=>context.bindOrder(tx,{data:{quote:{}}}));
   for(const table of ['trade_journal','production_records']){const [[n]]=await db.execute('SELECT COUNT(*) n FROM '+mysql.escapeId(table));assert.equal(Number(n.n),0);}
  });
  await t.test('platform quote, independent review and buyer confirmation use existing HTTP order and unsigned snapshot',async()=>{
   const r=await ready(),q=await quote(r);assert.deepEqual(q.data.customization,source(r));assert.equal(q.data.customization.answers,undefined);
   denied(await http('POST','/trade/records/'+q.id+'/reviews',merchant,{decision:'APPROVED',reason:'self'},null,q.object_version),403);
   denied(await accept(q),409);const approved=take(await review(q)),op=key(),order=take(await accept(approved,op));
   assert.equal(order.kind,'ORDER');assert.equal(order.current_status,'OPEN');assert.equal(order.data.contract.signing_method,'NOT_SIGNED');assert.equal(order.data.financial.received_minor,0);assert.deepEqual(order.data.quote.customization,source(r));
   assert.equal(take(await accept(approved,op)).id,order.id);
   const page=take(await list(r),'CustomizationQuotePageResponse');assert.equal(page.items[0].order_id,order.id);assert.equal(page.items[0].current_status,'ACCEPTED');assert.equal(page.items[0].source_is_current,true);
   denied(await list(r,stranger),404);denied(await list(r,merchant,merchantOrg.party_id),404);
   const error=denied(await http('POST','/trade/payments',buyer,{order_id:order.id,installment_key:'first'}),409);assert.equal(error.code,'CUSTOMIZATION_PAYMENT_RULES_PENDING');assert.equal(paidCalls,0);
  });
  await t.test('ordinary merchant, intake staff without platform ownership and missing platform configuration cannot quote',async()=>{
   const r=await ready(),body=quoteBody(r),input={...body,party_id:merchantOrg.party_id,operation_key:key()};
   await assert.rejects(createTradeRepository(db,{resolvePrincipal}).quote(merchant.ctx,input),{code:'CUSTOMIZATION_MERCHANT_NOT_CONFIGURED'});
   denied(await http('POST','/trade/quotes',operator,body,merchantOrg.party_id),403);
   denied(await http('POST','/trade/quotes',stranger,body,stranger.personal_party_id),403);
   await grant(merchant,'CUSTOMIZATION_INTAKE',false,1);denied(await http('POST','/trade/quotes',merchant,body,merchantOrg.party_id),403);await grant(merchant,'CUSTOMIZATION_INTAKE',true,2);
  });
  await t.test('replayed successful quote still checks current operator authority; malformed source cannot bypass platform gate',async()=>{
   const r=await ready(),body=quoteBody(r),op=key(),q=take(await http('POST','/trade/quotes',merchant,body,merchantOrg.party_id,null,op));
   await grant(merchant,'CUSTOMIZATION_INTAKE',false,3);denied(await http('POST','/trade/quotes',merchant,body,merchantOrg.party_id,null,op),403);await grant(merchant,'CUSTOMIZATION_INTAKE',true,4);
   assert.equal(take(await http('POST','/trade/quotes',merchant,body,merchantOrg.party_id,null,op)).id,q.id);
   denied(await http('POST','/trade/quotes',merchant,{...body,customization_source:null},merchantOrg.party_id),400);
  });
  await t.test('new quote rejects old 30/40/30 plan, wrong transaction model and mismatched buyer without altering old trade rules',async()=>{
   const r=await ready(),body=quoteBody(r),old=structuredClone(body);old.installments[1].allocations[0].amount_minor=4000;old.installments[2].allocations[0].amount_minor=3001;
   assert.equal(denied(await http('POST','/trade/quotes',merchant,old,merchantOrg.party_id),400).code,'CUSTOMIZATION_PAYMENT_PLAN_INVALID');
   denied(await http('POST','/trade/quotes',merchant,{...body,transaction_model:'DIRECT_SUPPLIER'},merchantOrg.party_id),400);
   denied(await http('POST','/trade/quotes',merchant,{...body,buyer_party_id:stranger.personal_party_id},merchantOrg.party_id),404);
  });
  await t.test('supplement blocks both approval and accepting a previously approved quote',async()=>{
   const r=await ready(),q=await quote(r),approved=take(await review(await quote(r)));await supplement(r);
   denied(await review(q),409);denied(await accept(approved),409);denied(await http('POST','/trade/quotes',merchant,quoteBody(r),merchantOrg.party_id),409);
  });
  await t.test('a new submitted story invalidates an approved old quote and listing identifies its old source',async()=>{
   let r=await ready();const q=take(await review(await quote(r))),old=source(r),opened=await supplement(r);
   const saved=await stories.saveSupplement(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,answers:{story:'更新后的合成故事'},responses:{story:'已修改'},expected_version:opened.object_version,operation_key:key()});
   r=await stories.submitSupplement(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,expected_version:saved.object_version,operation_key:key()});r=await intake(r);
   assert.equal(denied(await accept(q),409).code,'CUSTOMIZATION_SOURCE_CHANGED');
   const page=take(await list(r),'CustomizationQuotePageResponse');assert.equal(page.items[0].source_is_current,false);assert.equal(page.items[0].submission_id,old.submission_id);
   const current=take(await review(await quote(r)));take(await accept(current));
  });
  await t.test('ordinary institution member can request production but cannot confirm a financial order',async()=>{
   const org=await party.createOrganization(buyer.ctx,{display_name:'合成买方机构',operation_key:key()}),invite=await party.inviteMember(buyer.ctx,{party_id:org.party_id,invitee_account_id:stranger.account_id,expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
   await party.respondInvitation(stranger.ctx,{party_id:org.party_id,invitation_id:invite.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
   let r=await stories.create(stranger.ctx,{party_id:org.party_id,template_version_id:template.template_version_id,answers:{story:'机构成员合成需求'},operation_key:key()});
   r=await stories.submit(stranger.ctx,{request_id:r.id,party_id:org.party_id,expected_version:r.object_version,operation_key:key()});r=await intake(r);
   const q=take(await review(take(await http('POST','/trade/quotes',merchant,{...quoteBody(r),buyer_party_id:org.party_id},merchantOrg.party_id))));
   denied(await http('POST','/trade/quotes/'+q.id+'/acceptance',stranger,{quote_sha256:q.content_sha256},org.party_id,q.object_version),403);
   denied(await list(r,buyer,org.party_id),404); // Financial ownership does not expose the member's private story.
   take(await http('POST','/trade/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256},org.party_id,q.object_version));
  });
  await t.test('two separately approved quotes racing acceptance create only one linked unpaid order',async()=>{
   const r=await ready(),a=take(await review(await quote(r))),b=take(await review(await quote(r)));
   const results=await Promise.all([accept(a),accept(b)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);take(results.find(x=>x.status===200));denied(results.find(x=>x.status===409),409);
   const page=take(await list(r,buyer,buyer.personal_party_id,'?limit=1'),'CustomizationQuotePageResponse');assert.ok(page.next_cursor);
   take(await list(r,buyer,buyer.personal_party_id,'?cursor='+encodeURIComponent(page.next_cursor)),'CustomizationQuotePageResponse');
   const other=await ready();denied(await list(other,buyer,buyer.personal_party_id,'?cursor='+encodeURIComponent(page.next_cursor)),400);
  });
  await t.test('quote association failure rolls back quote, audit and idempotency entry',async()=>{
   const r=await ready(),body=quoteBody(r),op=key();await db.withConnection(c=>c.query("CREATE TRIGGER customization_link_fail BEFORE INSERT ON customization_quotes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic link failure'"));
   try{denied(await http('POST','/trade/quotes',merchant,body,merchantOrg.party_id,null,op),503);assert.equal(take(await list(r),'CustomizationQuotePageResponse').items.length,0);}
   finally{await db.withConnection(c=>c.query('DROP TRIGGER customization_link_fail'));}
   take(await http('POST','/trade/quotes',merchant,body,merchantOrg.party_id,null,op));
  });
  assert.equal(paidCalls,0);
  const output=path.resolve(__dirname,'../../../..','.local/customization-quote-http-fixtures.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
