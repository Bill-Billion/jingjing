 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{createAccountApi}=require('../src/http/account-api');
const {digest,createRuleContent,sealUnsignedContent}=require('../src/modules/governance/content');
const {createSupplyRepository}=require('../src/modules/works/repository'),{createSupplyAssets}=require('../src/modules/works/assets');
const M=require('../src/modules/settlement/marketplace-policy'),MC=require('../src/modules/settlement/marketplace-context');
test('V5 two-layer previews, accepted MCN terms and real finance HTTP with synthetic order facts',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal}),secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret});
  const people=[];for(const label of ['supplier','buyer','mcn','platform','reviewer','outsider']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});const p={ctx,...await parties.registerAccount(ctx,{display_name:'synthetic '+label}),token:randomBytes(32).toString('base64url')};people.push(p);await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
  const [seller,buyer,mcn,platform,reviewer,outsider]=people;
  await maintainOperatorGrant(db,{account_id:reviewer.account_id,action:'FINANCE_REVIEW',enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:test',reason:'isolated finance test'});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[mcn.personal_party_id]);
  const files=new Map(),storageFactory=()=>({async put({key,body}){files.set(key,Buffer.from(body));return {key,size:body.length,sha256:createHash('sha256').update(body).digest('hex')};},async getBuffer(key){return files.get(key);}});
  const supply=createSupplyRepository(db,{resolvePrincipal}),assets=createSupplyAssets({db,repository:supply,storageFactory});
  const proof=async p=>assets.upload(p.ctx,{party_id:p.personal_party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic contract evidence, not real signature '+key()),operation_key:key()});
  const evidence=await proof(seller),mcnProof=await proof(mcn),ruleId=key();
  const cfg={model:'V5_TWO_LAYER',product_type:'STOCK_VIDEO',fee_base:'NET_PAID',platform_party_id:platform.personal_party_id,platform_bps:1800,referral_bps:720,rounding:'HALF_UP_PLATFORM_REMAINDER'};
  const content=createRuleContent({id:ruleId,rule_key:'synthetic.marketplace',version:'1',terms:{marketplace_finance:cfg}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'synthetic.marketplace','1',JSON.stringify(content),'2020-01-01 00:00:00',reviewer.account_id,'EFFECTIVE']);
  server=createAccountApi({db,secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const host='http://127.0.0.1:'+server.address().port,fixtures=[];
  async function call(method,url,p=reviewer,body,party=null,headers={}){const r=await fetch(host+'/api/v1'+url,{method,headers:{...(p?{Authorization:'Bearer '+p.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(method==='POST'?{'Content-Type':'application/json','Idempotency-Key':key()}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
  const take=(r,schema='FinanceRecordResponse')=>{assert.equal(r.status,200,JSON.stringify(r.body));fixtures.push({name:'marketplace-http-'+fixtures.length,schema,value:r.body});return r.body.data;};
  const preview=(p=reviewer,query={})=>call('GET','/finance/marketplace-preview?'+new URLSearchParams({rule_id:ruleId,supplier_party_id:seller.personal_party_id,net_minor:'10000',...query}),p);
  const relationInput={artist_party_id:seller.personal_party_id,scope:'COMMERCIAL',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:true,terms:'synthetic direct contract',commission:{platform_bps:1800,mcn_bps:0},v5_terms:{version:'V5'},evidence_asset_ids:[mcnProof.id]};
  const relation=body=>call('POST','/gigs/relations',mcn,body,mcn.personal_party_id).then(r=>take(r,'GigRecordResponse'));
  const decide=(r,decision,p=seller)=>call('POST','/gigs/relations/'+r.id+'/decision',p,{decision,reason:'synthetic explicit consent'},p.personal_party_id,{'If-Match':'"'+r.object_version+'"'});
  let rel,snap,order,group;
  await t.test('preview is finance-only, uses approved rules and creates no order or money',async()=>{
   assert.equal((await preview(null)).status,401);assert.equal((await preview(outsider)).status,403);
   const v=take(await preview(),'MarketplacePreviewResponse');assert.equal(v.meaning,'PREVIEW_ONLY_NOT_ORDER_OR_PAYABLE');assert.equal(v.allocation.mcn_party_id,null);assert.deepEqual(v.amounts.entries.map(x=>x.amount_minor),[1800,8200]);
   assert.equal((await preview(reviewer,{platform_bps:'0'})).status,400);assert.equal((await preview(reviewer,{net_minor:'1.1'})).status,400);
   for(const table of ['trade_records','trade_journal','finance_records']){const [[n]]=await db.execute('SELECT COUNT(*) n FROM '+mysql.escapeId(table));assert.equal(Number(n.n),0);}
  });
  await t.test('MCN invitation needs artist acceptance; omitted new rate records explicit 20 percent',async()=>{
   rel=await relation(relationInput);assert.equal(rel.current_status,'INVITED');assert.equal(rel.data.v5_terms.supply_share_bps,2000);
   assert.equal((await preview(reviewer,{relation_id:rel.id})).status,409);assert.equal((await decide(rel,'ACCEPT',mcn)).status,409);
   rel=take(await decide(rel,'ACCEPT'),'GigRecordResponse');const v=take(await preview(),'MarketplacePreviewResponse');assert.equal(v.allocation.mcn_supply_bps,2000);assert.deepEqual(v.amounts.entries.map(x=>x.amount_minor),[1800,6560,1640]);assert.equal(v.relation_reference.id,rel.id);
   snap=await db.withTransaction(tx=>MC.snapshot(tx,{rule_id:ruleId,supplier_party_id:seller.personal_party_id,relation_id:null}));
  });
  const read=async r=>take(await call('GET','/finance/records/'+r.id,seller,undefined,seller.personal_party_id));
  const post=(url,r,body,p=seller,party=p.personal_party_id)=>call('POST',url,p,body,party,{'If-Match':'"'+r.object_version+'"'});
  async function approve(r){r=take(await post('/finance/records/'+r.id+'/reviews',r,{decision:'APPROVED',reason:'synthetic independent review',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true}},reviewer,null));for(const person of [seller,buyer,mcn,platform]){r=await read(r);take(await post('/finance/records/'+r.id+'/confirmations',r,{content_sha256:r.content_sha256,decision:'APPROVED',reason:'synthetic exact terms'},person));}return read(r);}
  let input;
  await t.test('synthetic historical order drives actual finance API; changing its source or rates is rejected',async()=>{
   // R02 does NOT open the later stock-video checkout. This order is an explicitly synthetic finance-source fixture.
   const quote={rule_id:ruleId,total_minor:10000,lines:[{line_id:'sale',provider_party_id:seller.personal_party_id,total_minor:10000,line_kind:'OTHER',product_profile:{version:'V5',type:'STOCK_VIDEO'}}],marketplace_finance:snap};
   const contract=sealUnsignedContent({id:key(),contract_version_id:key(),party_ids:[buyer.personal_party_id,seller.personal_party_id],created_at:new Date().toISOString(),rules:[snap.rule_snapshot],commitments:{quote}});
   order={id:key(),data:{quote,contract,financial:{received_minor:0,refunded_minor:0,net_minor:0}}};
   await db.execute("INSERT INTO trade_records(id,kind,buyer_party_id,merchant_party_id,created_by,current_status,data_json,data_sha256) VALUES (?,'ORDER',?,?,?,'OPEN',?,?)",[order.id,buyer.personal_party_id,seller.personal_party_id,seller.account_id,JSON.stringify(order.data),digest(order.data)]);
   const rules={version:'synthetic-v5',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'synthetic old order agreement',lines:[{line_id:'sale',allocation:snap.allocation,deductions:[]}]};
   input={source_type:'ORDER',source_id:order.id,previous_agreement_id:null,environment:'SANDBOX',rule_id:ruleId,rules,evidence_asset_id:evidence.id};
   const altered=structuredClone(input);altered.rules.lines[0].allocation.mcn_supply_bps=3000;
   assert.equal((await call('POST','/finance/agreements',seller,altered,seller.personal_party_id)).status,409);
   assert.equal((await call('POST','/finance/agreements',seller,{...input,rule_id:key()},seller.personal_party_id)).status,409);
   assert.equal((await call('POST','/finance/agreements',outsider,input,outsider.personal_party_id)).status,403);
   // Ending the live relation and changing the current rule cannot rewrite this historical order.
   rel=take(await decide(rel,'END'),'GigRecordResponse');
   const changed=createRuleContent({id:ruleId,rule_key:'synthetic.marketplace',version:'2',terms:{marketplace_finance:{...cfg,platform_bps:2200}}});await db.execute('UPDATE governance_rules SET content_json=? WHERE id=?',[JSON.stringify(changed),ruleId]);
   group=take(await call('POST','/finance/agreements',seller,input,seller.personal_party_id));assert.deepEqual(group.data.rule_snapshot,content);
   assert.equal((await post('/finance/agreements/'+group.id+'/settlements',group,{period_reference:key(),note:'not approved'})).status,409);
   group=await approve(group);
   const gate=take(await call('GET','/finance/agreements/'+group.id+'/readiness',seller,undefined,seller.personal_party_id),'FinanceReadinessResponse');assert.equal(gate.business_gate.reason_code,'MARKETPLACE_PAYOUT_NOT_ENABLED');
   const payout=await post('/finance/agreements/'+group.id+'/payouts',group,{recipient_party_id:mcn.personal_party_id,amount_minor:1,destination_asset_id:evidence.id,note:'must not enable transfer'});assert.equal(payout.status,409);assert.equal(payout.body.error.code,'MARKETPLACE_PAYOUT_NOT_ENABLED');
  });
  const settle=async()=>{group=await read(group);return take(await post('/finance/agreements/'+group.id+'/settlements',group,{period_reference:key(),note:'synthetic reconcile'}));};
  const balances=async()=>take(await call('GET','/finance/agreements/'+group.id+'/balances',seller,undefined,seller.personal_party_id),'FinanceBalancesResponse');
  async function observe(direction,amount){
   const rid=key(),data={provider:'ALIPAY',environment:'SANDBOX',transaction_id:'synthetic:'+key(),allocations:[{line_id:'sale',amount_minor:amount}]};
   await db.execute('INSERT INTO trade_records(id,kind,buyer_party_id,merchant_party_id,parent_id,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)',[rid,direction==='RECEIPT'?'PAYMENT':'REFUND',buyer.personal_party_id,seller.personal_party_id,order.id,order.id,seller.account_id,'SUCCEEDED',JSON.stringify(data),digest(data)]);
   await db.execute('INSERT INTO trade_journal(id,source_id,order_id,direction,currency,amount_minor,provider_reference) VALUES (?,?,?,?,?,?,?)',[key(),rid,order.id,direction,'CNY',amount,'synthetic:'+key()]);
  }
  await t.test('zero receipt, partial and full refund conserve money and preserve the original MCN after termination',async()=>{
   await settle();let b=await balances();assert.ok(b.items.every(x=>x.accrued_minor===0));
   for(const [direction,amount,net] of [['RECEIPT',10000,10000],['REFUND',9995,5],['REFUND',5,0]]){
    await observe(direction,amount);await settle();b=await balances();const expected=M.split(net,snap.allocation);
    for(const x of expected.entries)assert.equal(b.items.find(y=>y.party_id===x.party_id).accrued_minor,x.amount_minor);
    const [[n]]=await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[group.id]);await settle();const [[again]]=await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[group.id]);assert.equal(Number(n.n),Number(again.n));
   }
   const e=take(await call('GET','/finance/agreements/'+group.id+'/entries',seller,undefined,seller.personal_party_id),'FinanceEntriesResponse');assert.ok(e.items.some(x=>x.data.rounding?.[0]?.rounding_diff_minor!==undefined));
   assert.equal((await call('GET','/finance/agreements/'+group.id+'/balances',outsider,undefined,outsider.personal_party_id)).status,404);
  });
  await t.test('new relations take 10/30/fractional percent only after artist confirmation; old unversioned terms cannot be reinterpreted',async()=>{
   for(const n of [1000,3000,1001]){
    let r=await relation({...relationInput,v5_terms:{version:'V5',supply_share_bps:n}});r=take(await decide(r,'ACCEPT'),'GigRecordResponse');const v=take(await preview(),'MarketplacePreviewResponse');assert.equal(v.allocation.mcn_supply_bps,n);assert.equal(v.allocation.platform_bps,2200);take(await decide(r,'END'),'GigRecordResponse');
   }
   const {v5_terms,...old}=relationInput;let r=await relation(old);r=take(await decide(r,'ACCEPT'),'GigRecordResponse');const denied=await preview();assert.equal(denied.status,409);assert.equal(denied.body.error.code,'MCN_V5_TERMS_REQUIRED');take(await decide(r,'END'),'GigRecordResponse');
   assert.equal(take(await preview(),'MarketplacePreviewResponse').allocation.mcn_party_id,null);
  });
  const out=path.resolve(__dirname,'../../../..','.local/marketplace-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
