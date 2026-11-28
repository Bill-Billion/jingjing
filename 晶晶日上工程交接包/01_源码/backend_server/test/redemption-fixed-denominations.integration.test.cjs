'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context'),C=require('../src/modules/redemption/context');
test('remaining fixed production-credit denominations through actual HTTP',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');
 const name='jx_test_fixed_credit_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'4'});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2,reviewer,outsider}=S,W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
  for(const u of [seller,outsider,reviewer])for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW','ENGAGEMENT_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:r11',reason:'isolated test only'});
  const descriptors=require('../src/http/redemption-routes'),fixtures=[];
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,u,input={}){
   const post=descriptors.posts.find(x=>x[1]===method),d=post||descriptors.gets.find(x=>x[1]===method);assert.ok(d);
   let route='/redemption'+d[0].replace(':record_id',input.record_id||'');const body=Object.fromEntries(d[2].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
   const headers={Authorization:'Bearer '+u.token,...input.party_id?{'X-Acting-Party':input.party_id}:{},...post?{'Content-Type':'application/json','Idempotency-Key':input.operation_key||key()}:{},...d[4]?{'If-Match':'"'+input.expected_version+'"'}:{}};
   if(!post&&Object.keys(body).length)route+='?'+new URLSearchParams(body);
   const response=await fetch(base+route,{method:post?'POST':'GET',headers,...post?{body:JSON.stringify(body)}:{}}),json=await response.json();fixtures.push({method:post?'POST':'GET',path:new URL(base+route).pathname,schema:response.status===200?'RedemptionResponse':'ErrorResponse',value:json});
   if(response.status!==200)throw Object.assign(new Error(json.error?.code||JSON.stringify(json)),{code:json.error?.code,status:response.status});return json.data;
  }
  const review=(r,u=reviewer,decision='APPROVE')=>call('reviewStock',u,{record_id:r.id,expected_version:r.object_version,decision,reason:'independent synthetic review'});
  const proof=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic inventory / fulfillment evidence; no real prize'),operation_key:key()});
  let walletRule=await W.createRule(outsider.ctx,{rule:{...require('./helpers/wallet-rule.cjs'),free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});walletRule=await W.reviewRule(reviewer.ctx,{record_id:walletRule.id,expected_version:walletRule.object_version,decision:'APPROVE',reason:'isolated synthetic rule',operation_key:key()});
  for(const u of [seller,buyer,buyer2])await W.open(u.ctx,{party_id:u.personal_party_id,rule_id:walletRule.id,rule_sha256:walletRule.content_sha256,operation_key:key()});
  async function balance(u){const response=await fetch(base+'/wallet/summary',{headers:{Authorization:'Bearer '+u.token,'X-Acting-Party':u.personal_party_id}}),json=await response.json();fixtures.push({method:'GET',path:'/api/v1/wallet/summary',schema:response.status===200?'WalletResponse':'ErrorResponse',value:json});assert.equal(response.status,200);return json.data;}
  const records=[];
  const count=async()=>Number((await db.execute('SELECT COUNT(*) n FROM redemption_records'))[0][0].n);
  for(const [face,minimum,points] of [[10000,80000,12000],[20000,100000,24000],[50000,200000,60000]]){
   await t.test('credit '+face+' cents exchanges for exactly '+points+' points, once',async()=>{
    let spec=await S.trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic fixed-credit service',provider_party_id:seller.personal_party_id,line_kind:'PRODUCTION',unit_minor:minimum,currency:'CNY',specification:{version:'synthetic',service_tier:'synthetic',sample_seconds:0,final_seconds:10,revision_limit:1,deliverables:['synthetic service'],terms:'not a live service'},product_profile:{version:'V5',type:'PRIVATE_CUSTOMIZATION'},operation_key:key()});
    spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'Independent synthetic service review',operation_key:key()});
    const template={version:'synthetic-fixed-credit',source_ref:'original-contract-fixed-prices',title:'Synthetic production credit',kind:'PRODUCTION_CREDIT',valid_days:30,exchange_points:points,capacity:2,available_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic fixed exchange; no lottery or real service',production:{face_minor:face,minimum_minor:minimum,spec_ids:[spec.id]},interview:null,exposure:null};
    const beforeRows=await count(),before=(await balance(buyer)).available_points;
    for(const wrong of [points-1,points+1])await assert.rejects(call('createStock',seller,{party_id:seller.personal_party_id,template:{...template,exchange_points:wrong},evidence_asset_ids:[proof.id]}),{code:'PRODUCTION_EXCHANGE_PRICE_INVALID',status:400});
    assert.equal(await count(),beforeRows);assert.equal((await balance(buyer)).available_points,before);
    let stock=await call('createStock',seller,{party_id:seller.personal_party_id,template,evidence_asset_ids:[proof.id]});
    await assert.rejects(call('exchange',buyer,{party_id:buyer.personal_party_id,stock_id:stock.id,template_sha256:digest(template)}),{code:'REWARD_STOCK_UNAVAILABLE',status:409});
    stock=await review(stock);const catalog=await call('catalog',buyer),entry=catalog.items.find(x=>x.id===stock.id);assert(entry);assert.equal(entry.template.exchange_points,points);assert.equal(entry.template.production.face_minor,face);
    const input={party_id:buyer.personal_party_id,stock_id:stock.id,template_sha256:digest(template),operation_key:key()},grants=await Promise.all([call('exchange',buyer,input),call('exchange',buyer,input),call('exchange',buyer,input)]),grant=grants[0];
    assert(grants.every(x=>x.id===grant.id));assert.equal(grant.current_status,'AVAILABLE');assert.equal(grant.data.template.production.face_minor,face);assert.equal(grant.data.template.exchange_points,points);
    assert.equal((await balance(buyer)).available_points,before-points);
    assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM redemption_records WHERE kind='GRANT' AND parent_id=?",[stock.id]))[0][0].n),1);
    const current=await call('catalog',buyer);assert.equal(current.items.find(x=>x.id===stock.id).remaining,1);
    await assert.rejects(call('exchange',buyer,{...input,template_sha256:'0'.repeat(64)}),{code:'IDEMPOTENCY_CONFLICT',status:409});
    await assert.rejects(call('grant',buyer2,{party_id:buyer2.personal_party_id,record_id:grant.id}),{code:'REDEMPTION_NOT_FOUND',status:404});
    assert.equal((await call('grant',buyer,{party_id:buyer.personal_party_id,record_id:grant.id})).id,grant.id);assert.equal((await balance(buyer)).available_points,before-points);
    records.push({stock_id:stock.id,grant_id:grant.id,spec_id:spec.id,face_minor:face,exchange_points:points,balance_before:before,balance_after:before-points});
   });
  }
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/redemption-fixed-denominations-http.json'),JSON.stringify({synthetic_only:true,database:name,records,cases:fixtures},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
