"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('contract release mode blocks new old-rule quotes but preserves approved historical promises',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_cutover_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const f=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider}=f.people,fixtures=[];
  async function offer(options={}){let saved;const stop=new Error('synthetic quote only');await assert.rejects(f.newOrder({...options,beforeAccept:async data=>{saved=data;throw stop;}}),e=>e===stop);return saved;}
  const old=await offer();
  const body=x=>({buyer_party_id:buyer.personal_party_id,lines:[{line_id:'film',spec_id:x.spec.id,quantity:1}],...Object.fromEntries(['installments','channel','transaction_model','rule_id','expires_at','payment_window_minutes','license_reservation_id'].map(k=>[k,x.quote.data[k]])),customization_source:x.quote.data.customization});
  const oldDraft=await f.trade.quote(producer.ctx,{...body(old),party_id:producer.acting_party_id,operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  async function post(route,user,body,version=null,op=key()){
   const res=await fetch(base+'/api/v1'+route,{method:'POST',headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/json','Idempotency-Key':op,...(user===reviewer?{}:{'X-Acting-Party':user.acting_party_id}),...(version?{'If-Match':'"'+version+'"'}:{})},body:JSON.stringify(body)}),value=await res.json();fixtures.push({method:'POST',path:'/api/v1'+route,schema:res.status===200?'TradeRecordResponse':'ErrorResponse',value});return {status:res.status,value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.value));return r.value.data;},bad=(r,code)=>assert.equal(r.value.error?.code,code,JSON.stringify(r.value));
  const review=q=>post('/trade/records/'+q.id+'/reviews',reviewer,{decision:'APPROVED',reason:'synthetic independent'},q.object_version);
  const accept=q=>post('/trade/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256},q.object_version);
  await t.test('new old-spec quote is rejected through HTTP and creates no quote record',async()=>{
   const count=async()=>Number((await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='QUOTE'"))[0][0].n),before=await count();bad(await post('/trade/quotes',producer,body(old)),'CUSTOMIZATION_CONTRACT_VERSION_REQUIRED');assert.equal(await count(),before);
  });
  await t.test('pending legacy quote cannot gain approval after cutover',async()=>{bad(await review(oldDraft),'CUSTOMIZATION_CONTRACT_VERSION_REQUIRED');assert.equal((await f.trade.read(producer.ctx,{record_id:oldDraft.id,party_id:producer.acting_party_id})).current_status,'IN_REVIEW');});
  await t.test('already approved quote can still be accepted without rewriting original hours or 30/60/10',async()=>{
   const order=ok(await accept(old.quote));assert.deepEqual(order.data.quote,old.quote.data);assert.deepEqual(order.data.quote.installments.map(x=>x.allocations[0].amount_minor),[3000,6000,1000]);assert.equal(order.data.quote.lines[0].specification.customization_delivery.acceptance_hours,168);
  });
  await t.test('historical specification remains publishable for old-order amendments but cannot create a new ordinary quote',async()=>{
   const s=old.spec.data,draft=await f.trade.createSpec(producer.ctx,{party_id:producer.acting_party_id,previous_spec_id:old.spec.id,...Object.fromEntries(['title','provider_party_id','line_kind','unit_minor','currency','product_profile','specification'].map(k=>[k,s[k]])),operation_key:key()});const published=ok(await review(draft));assert.equal(published.current_status,'PUBLISHED');const fresh=await offer();bad(await post('/trade/quotes',producer,{...body(fresh),lines:[{line_id:'film',spec_id:published.id,quantity:1}]}),'CUSTOMIZATION_CONTRACT_VERSION_REQUIRED');
  });
  await t.test('new calendar specification quotes, independent review and contract snapshot use actual HTTP',async()=>{
   const x=await offer({preview:'SCRIPT_BEFORE_INTERIM',calendar:require('./support/working-calendar.cjs')()}),q=ok(await post('/trade/quotes',producer,body(x))),approved=ok(await review(q)),order=ok(await accept(approved));
   assert.equal(order.data.quote.installments[1].trigger,'CUSTOMIZATION_SCRIPT_CONFIRMED');assert.equal(order.data.quote.lines[0].specification.customization_delivery.acceptance_working_days,5);assert.deepEqual(order.data.contract.commitments.quote,order.data.quote);
  });
  await t.test('omitting product identity and story cannot bypass cutover through the legacy production quote path',async()=>{
   const s=old.spec.data,draft=await f.trade.createSpec(producer.ctx,{party_id:producer.acting_party_id,previous_spec_id:null,...Object.fromEntries(['title','provider_party_id','line_kind','unit_minor','currency','specification'].map(k=>[k,s[k]])),operation_key:key()});
   bad(await review(draft),'PRODUCT_PROFILE_REQUIRED');
   const legacy=await f.reviewTrade(draft),input={...body(old),lines:[{line_id:'film',spec_id:legacy.id,quantity:1}]};delete input.customization_source;
   bad(await post('/trade/quotes',producer,input),'PRODUCT_PROFILE_REQUIRED');
   const legacyDraft=await f.trade.quote(producer.ctx,{...input,party_id:producer.acting_party_id,operation_key:key()});bad(await review(legacyDraft),'PRODUCT_PROFILE_REQUIRED');
  });
  await t.test('expired reviewed calendar cannot form or approve a new quote',async()=>{
   const calendar=require('./support/working-calendar.cjs')();calendar.valid_until=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
   const x=await offer({preview:'SCRIPT_BEFORE_INTERIM',calendar});bad(await post('/trade/quotes',producer,body(x)),'CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED');
   const draft=await f.trade.quote(producer.ctx,{...body(x),party_id:producer.acting_party_id,operation_key:key()});bad(await review(draft),'CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED');
  });
  await t.test('outsider cannot use the release setting to issue platform quotes',async()=>{assert.equal((await post('/trade/quotes',outsider,body(old))).status,403);});
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/contract-cutover-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
