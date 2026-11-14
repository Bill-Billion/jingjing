'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {digest,createRuleContent}=require('../src/modules/governance/content'),C=require('../src/modules/engagement/context');
const {capture}=require('../src/modules/engagement/referrals');

test('seven-day referral survives unrelated clicks and exact timestamp page boundaries',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_referral_window_'+randomBytes(8).toString('hex');
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server,created=false;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2:referrer,reviewer,outsider}=S;
  for(const u of [outsider,reviewer])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'ENGAGEMENT_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:referral-window',reason:'Disposable regression only'});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function post(route,u,body,{version=null,party=u.personal_party_id,operation=key(),status=200}={}){
   const response=await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json','Idempotency-Key':operation,...party?{'X-Acting-Party':party}:{},...version?{'If-Match':'"'+version+'"'}:{}},body:JSON.stringify(body)});
   const value=await response.json();fixtures.push({method:'POST',path:new URL(base+route).pathname,schema:response.status!==200?'ErrorResponse':route==='/stock/checkout'?'TradeRecordResponse':'EngagementResponse',value});
   assert.equal(response.status,status,value.error?.code||'Unexpected HTTP status');return status===200?value.data:value.error;
  }
  let rule=await post('/engagement/rules',outsider,{rule:{...require('./helpers/engagement-rule.cjs'),version:'synthetic-referral-window',referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:1000,AUDITION:1000,CUSTOMIZATION:1000,COMMERCIAL:1000}}},{party:null});
  rule=await post('/engagement/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent synthetic rule'},{version:rule.object_version,party:null});
  const link=(u,target=seller.personal_party_id,category='STOCK')=>post('/engagement/referrals/links',u,{target_party_id:target,category,rule_id:rule.id});
  const click=l=>post('/engagement/referrals/clicks',buyer,{link_id:l.id});
  const matching=await link(referrer),originalClick=await click(matching),unrelated=await link(referrer,outsider.personal_party_id);
  const rid=key(),content=createRuleContent({id:rid,rule_key:'stock.referral.window.synthetic',version:'1',terms:{marketplace_finance:{model:'V5_TWO_LAYER',product_type:'STOCK_VIDEO',fee_base:'NET_PAID',platform_party_id:outsider.personal_party_id,platform_bps:1800,referral_bps:1000,rounding:'HALF_UP_PLATFORM_REMAINDER'}}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[rid,'stock.referral.window.synthetic','1',JSON.stringify(content),'2020-01-01 00:00:00',outsider.account_id,'EFFECTIVE']);
  await S.publishSales(seller.personal_party_id,S.spec.id,rid);
  async function checkout(){
   let listing=await S.stock.create(seller.ctx,{...S.listingInput,rule_id:rid,operation_key:key()});listing=await S.reviewListing(listing,'RIGHTS');listing=await S.reviewListing(listing,'CONTENT');
   const input={listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'},operation=key();
   return {order:await post('/stock/checkout',buyer,input,{operation}),input,operation};
  }
  // Synthetic clock changes only isolate boundary cases; captured order snapshots remain untouched.
  async function ageClicks(){
   await db.withTransaction(async tx=>{const [rows]=await tx.execute("SELECT * FROM engagement_records WHERE kind='REFERRAL_CLICK' AND owner_party_id=? FOR UPDATE",[buyer.personal_party_id]);
    for(const row of rows){const data={...C.checked(row).data,at:'2020-01-01T00:00:00.000Z'};await tx.execute('UPDATE engagement_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),row.id]);}
   });
  }
  async function syntheticClicks(count,parent=unrelated.id,at=new Date().toISOString(),timestamp=null){
   return db.withTransaction(async tx=>{const rows=[];for(let n=0;n<count;n++){
    const r=await C.insert(tx,{id:buyer.account_id},'REFERRAL_CLICK',buyer.personal_party_id,parent,'VALID',{at,source:'AUTHENTICATED_LINK_VISIT',referrer_party_id:referrer.personal_party_id});
    if(timestamp)await tx.execute('UPDATE engagement_records SET created_at=? WHERE id=?',[timestamp,r.id]);rows.push(r);
   }return rows;});
  }
  let baseline,later;
  await t.test('HTTP checkout retains the valid original referral beyond 100 other-merchant clicks',async()=>{
   for(let n=0;n<99;n++)await click(unrelated);
   baseline=(await checkout()).order;assert.equal(baseline.data.quote.referral?.click_id,originalClick.id);
   await click(unrelated);const result=(await checkout()).order;
   assert.equal(result.data.quote.referral?.click_id,originalClick.id);
   assert.equal(result.data.quote.marketplace_finance.allocation.referrer_party_id,referrer.personal_party_id);
  });
  await t.test('other categories and excluded supplier referrals cannot conceal the eligible earlier click',async()=>{
   const otherCategory=await link(referrer,seller.personal_party_id,'AUDITION');for(let n=0;n<100;n++)await click(otherCategory);
   const sellerLink=await link(seller);await click(sellerLink);
   const self=await link(buyer);assert.equal((await post('/engagement/referrals/clicks',buyer,{link_id:self.id},{status:409})).code,'REFERRAL_SELF_PURCHASE');
   assert.equal((await checkout()).order.data.quote.referral?.click_id,originalClick.id);
  });
  await t.test('202 tied microsecond timestamps preserve id ordering through multiple pages',async()=>{
   await ageClicks();
   const rows=await syntheticClicks(202,unrelated.id,new Date().toISOString(),'2026-11-14 00:00:00.123456');
   const last=rows.map(x=>x.id).sort()[0];await db.execute('UPDATE engagement_records SET parent_id=? WHERE id=?',[matching.id,last]);
   assert.equal((await checkout()).order.data.quote.referral?.click_id,last);
  });
  await t.test('latest eligible click applies only to new orders; replay creates no second commission',async()=>{
   await S.person(reviewer);const newer=await link(reviewer),newClick=await click(newer);later=await checkout();
   assert.equal(later.order.data.quote.referral?.click_id,newClick.id);
   const replay=await post('/stock/checkout',buyer,later.input,{operation:later.operation});assert.equal(replay.id,later.order.id);
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='REFERRAL_COMMISSION' AND parent_id=?",[later.order.id]))[0][0].n),1);
   const old=await S.trade.read(buyer.ctx,{record_id:baseline.id,party_id:buyer.personal_party_id});assert.deepEqual(old.data.quote,baseline.data.quote);assert.deepEqual(old.data.contract,baseline.data.contract);
   await post('/stock/checkout',referrer,later.input,{party:buyer.personal_party_id,status:403});
  });
  await t.test('the seven-day cutoff is inclusive and one millisecond older is ineligible',async()=>{
   await ageClicks();const now=Date.now(),since=new Date(now-7*86400000).toISOString();
   const [boundary]=await syntheticClicks(1,matching.id,since);
   const q={customization:null,stock_video:{},marketplace_finance:{allocation:{platform_party_id:outsider.personal_party_id},rule_snapshot:{content:{terms:{marketplace_finance:{referral_bps:1000}}}}}};
   const read=()=>db.withTransaction(tx=>capture({execute:(sql,args)=>sql.includes('SELECT ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) ms')?Promise.resolve([[{ms:now}]]):tx.execute(sql,args)},q,buyer.personal_party_id,seller.personal_party_id));
   assert.equal((await read()).referral?.click_id,boundary.id);
   const data={...boundary.data,at:new Date(now-7*86400000-1).toISOString()};await db.execute('UPDATE engagement_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),boundary.id]);
   assert.equal((await read()).referral,undefined);
  });
  await t.test('exhausting several pages without an eligible link returns an unattributed order',async()=>{
   await ageClicks();await syntheticClicks(201);assert.equal((await checkout()).order.data.quote.referral,undefined);
  });
  await t.test('corrupted retained click content still fails instead of silently skipping evidence',async()=>{
   const bad=await click(matching);await db.execute('UPDATE engagement_records SET data_sha256=? WHERE id=?',['0'.repeat(64),bad.id]);
   const before=Number((await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='ORDER' AND buyer_party_id=?",[buyer.personal_party_id]))[0][0].n);
   await assert.rejects(checkout(),/SERVICE_UNAVAILABLE/);
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='ORDER' AND buyer_party_id=?",[buyer.personal_party_id]))[0][0].n),before);
  });
 }finally{
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/referral-window-http.json'),JSON.stringify(fixtures,null,2));
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();
 }
});
