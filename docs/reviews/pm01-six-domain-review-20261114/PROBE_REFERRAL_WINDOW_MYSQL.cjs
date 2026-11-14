'use strict';
// Run from the formal worktree. Isolated synthetic data; no payment or UI.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID:key,randomBytes}=require('node:crypto'),{createRequire}=require('node:module');
const backend=path.resolve('晶晶日上工程交接包/01_源码/backend_server'),fromBackend=createRequire(path.join(backend,'package.json'));
fromBackend('./scripts/test-network-guard.cjs');
const mysql=fromBackend('mysql2/promise'),{openDatabase}=fromBackend('./src/infrastructure/database'),{migrate}=fromBackend('./src/infrastructure/database/migrator'),{createRuleContent}=fromBackend('./src/modules/governance/content');
(async()=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_referral_window_'+randomBytes(8).toString('hex');assert.match(name,/^jx_test_referral_window_[a-f0-9]{16}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,created=false;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await fromBackend('./test/helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2:referrer,reviewer,outsider}=S;
  for(const u of [outsider,reviewer])await fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'ENGAGEMENT_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:referral-window',reason:'Disposable regression only'});
  server=fromBackend('./src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function post(route,u,body,version=null,party=u.personal_party_id){const response=await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json','Idempotency-Key':key(),...party?{'X-Acting-Party':party}:{},...version?{'If-Match':'"'+version+'"'}:{}},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,200,value.error?.code||'HTTP request failed');return value.data;}
  let rule=await post('/engagement/rules',outsider,{rule:{...fromBackend('./test/helpers/engagement-rule.cjs'),version:'synthetic-referral-window',referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:1000,AUDITION:1000,CUSTOMIZATION:1000,COMMERCIAL:1000}}},null,null);
  rule=await post('/engagement/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent synthetic rule'},rule.object_version,null);
  const matching=await post('/engagement/referrals/links',referrer,{target_party_id:seller.personal_party_id,category:'STOCK',rule_id:rule.id});await post('/engagement/referrals/clicks',buyer,{link_id:matching.id});
  const unrelated=await post('/engagement/referrals/links',referrer,{target_party_id:outsider.personal_party_id,category:'STOCK',rule_id:rule.id});
  const rid=key(),content=createRuleContent({id:rid,rule_key:'stock.referral.window.synthetic',version:'1',terms:{marketplace_finance:{model:'V5_TWO_LAYER',product_type:'STOCK_VIDEO',fee_base:'NET_PAID',platform_party_id:outsider.personal_party_id,platform_bps:1800,referral_bps:1000,rounding:'HALF_UP_PLATFORM_REMAINDER'}}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[rid,'stock.referral.window.synthetic','1',JSON.stringify(content),'2020-01-01 00:00:00',outsider.account_id,'EFFECTIVE']);await S.publishSales(seller.personal_party_id,S.spec.id,rid);
  for(let n=0;n<99;n++)await post('/engagement/referrals/clicks',buyer,{link_id:unrelated.id});
  const checkout=async()=>{let listing=await S.stock.create(seller.ctx,{...S.listingInput,rule_id:rid,operation_key:key()});listing=await S.reviewListing(listing,'RIGHTS');listing=await S.reviewListing(listing,'CONTENT');return post('/stock/checkout',buyer,{listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'});};
  const before=await checkout();assert.equal(before.data.quote.referral?.referrer_party_id,referrer.personal_party_id);
  await post('/engagement/referrals/clicks',buyer,{link_id:unrelated.id});const after=await checkout();
  console.log(JSON.stringify({scope:'actual isolated MySQL and HTTP referral link/click/stock checkout; seed identities/catalog/rules, no payment',matching_link_id:matching.id,before_order_id:before.id,after_order_id:after.id,before_unrelated_clicks:99,after_unrelated_clicks:100,before_attributed:before.data.quote.referral?.referrer_party_id===referrer.personal_party_id,after_attributed:after.data.quote.referral?.referrer_party_id===referrer.personal_party_id},null,2));
  assert.equal(after.data.quote.referral?.referrer_party_id,referrer.personal_party_id,'Valid seven-day referral must survive 100 unrelated merchant clicks');
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
