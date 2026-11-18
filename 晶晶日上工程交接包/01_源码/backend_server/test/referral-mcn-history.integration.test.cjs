'use strict';
// Same persisted stock order: agency/referral changes must not rewrite its original financial participants.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {digest,createRuleContent}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context');
test('same order keeps original referrer and agency through replacement, partial refund and final reversal',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_referral_mcn_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2:referrer,reviewer,outsider}=S;
  const parties=require('../src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const gigs=require('../src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const engagement=require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const finance=require('../src/modules/settlement/repository').createSettlementRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const records=[],verification={parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true};
  for(const u of [outsider,reviewer])for(const action of ['ENGAGEMENT_REVIEW','FINANCE_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:referral-mcn-history',reason:'Disposable test only'});
  reviewer.person=await S.person(reviewer);
  const oldOrg=await parties.createOrganization(outsider.ctx,{display_name:'Synthetic original agency',operation_key:key()}),newOrg=await parties.createOrganization(referrer.ctx,{display_name:'Synthetic replacement agency',operation_key:key()});
  for(const org of [oldOrg,newOrg])await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);
  async function relation(owner,org){
   const proof=await S.supply.upload(owner.ctx,{party_id:org.party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic agency terms, no real representative authority'),operation_key:key()});
   let r=await gigs.relation(owner.ctx,{party_id:org.party_id,artist_party_id:seller.personal_party_id,scope:'COMMERCIAL',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:false,terms:'Synthetic agency agreement',commission:{platform_bps:1800,mcn_bps:0},v5_terms:{version:'V5',supply_share_bps:2000},evidence_asset_ids:[proof.id],operation_key:key()});
   return gigs.relationDecision(seller.ctx,{party_id:seller.personal_party_id,record_id:r.id,expected_version:r.object_version,decision:'ACCEPT',reason:'Synthetic artist accepts exact agency',operation_key:key()});
  }
  let oldRelation=await relation(outsider,oldOrg),newRelation,order,payment,agreement,commission,listing,partialRefund,finalRefund;
  let rule=await engagement.createRule(outsider.ctx,{rule:{...require('./helpers/engagement-rule.cjs'),version:'synthetic-referral-mcn',referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:1000,AUDITION:1000,CUSTOMIZATION:1000,COMMERCIAL:1000}},operation_key:key()});
  rule=await engagement.reviewRule(reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'Independent synthetic review',operation_key:key()});
  async function click(u){const link=await engagement.referralLink(u.ctx,{party_id:u.personal_party_id,target_party_id:seller.personal_party_id,category:'STOCK',rule_id:rule.id,operation_key:key()});await engagement.referralClick(buyer.ctx,{party_id:buyer.personal_party_id,link_id:link.id,operation_key:key()});return link;}
  await click(referrer);
  const rid=key(),content=createRuleContent({id:rid,rule_key:'stock.referral.mcn.synthetic',version:'1',terms:{marketplace_finance:{model:'V5_TWO_LAYER',product_type:'STOCK_VIDEO',fee_base:'NET_PAID',platform_party_id:outsider.personal_party_id,platform_bps:1800,referral_bps:1000,rounding:'HALF_UP_PLATFORM_REMAINDER'}}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[rid,'stock.referral.mcn.synthetic','1',JSON.stringify(content),'2020-01-01 00:00:00',outsider.account_id,'EFFECTIVE']);await S.publishSales(seller.personal_party_id,S.spec.id,rid);
  const sync=()=>engagement.referralSync(referrer.ctx,{party_id:referrer.personal_party_id,order_id:order.id,operation_key:key()});
  const settle=()=>finance.settle(seller.ctx,{record_id:agreement.id,party_id:seller.personal_party_id,expected_version:agreement.object_version,period_reference:key(),note:'Synthetic original-order reconciliation',operation_key:key()});
  const balances=()=>finance.balances(seller.ctx,{record_id:agreement.id,party_id:seller.personal_party_id});
  async function assertFrozen(){const read=await S.trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id});assert.deepEqual(read.data.contract,order.data.contract);assert.deepEqual(read.data.quote,order.data.quote);assert.equal(read.data.quote.marketplace_finance.allocation.mcn_party_id,oldOrg.party_id);assert.equal(read.data.quote.referral.referrer_party_id,referrer.personal_party_id);}
  await t.test('accepted old agency and original referral are frozen in a purchased order',async()=>{
   listing=await S.stock.create(seller.ctx,{...S.listingInput,rule_id:rid,operation_key:key()});listing=await S.reviewListing(listing,'RIGHTS');listing=await S.reviewListing(listing,'CONTENT');order=await S.checkout(listing);
   assert.equal(order.data.quote.marketplace_finance.allocation.mcn_party_id,oldOrg.party_id);assert.equal(order.data.quote.referral.referrer_party_id,referrer.personal_party_id);
   const config={...S.config,environment:'PRODUCTION'};payment=await S.trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()},config);
   await S.trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic-local:'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
   await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});
   const row=(await db.execute('SELECT * FROM stock_purchases WHERE order_id=?',[order.id]))[0][0],data={...A.parse(row.data_json),accepted_at:new Date(Date.now()-8*86400000).toISOString()};
   await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(data),digest(data),order.id]);
   commission=await sync();assert.equal(commission.current_status,'ACCRUED');assert.equal(commission.data.amount_minor,10);
  });
  await t.test('ending original agency and accepting replacement affects a new order, not the old referrer',async()=>{
   oldRelation=await gigs.relationDecision(seller.ctx,{party_id:seller.personal_party_id,record_id:oldRelation.id,expected_version:oldRelation.object_version,decision:'END',reason:'Synthetic agency replacement',operation_key:key()});newRelation=await relation(referrer,newOrg);await click(reviewer);
   let nextListing=await S.stock.create(seller.ctx,{...S.listingInput,rule_id:rid,operation_key:key()});nextListing=await S.reviewListing(nextListing,'RIGHTS');nextListing=await S.reviewListing(nextListing,'CONTENT');
   const fresh=await S.checkout(nextListing);assert.equal(fresh.data.quote.marketplace_finance.allocation.mcn_party_id,newOrg.party_id);assert.equal(fresh.data.quote.referral.referrer_party_id,reviewer.personal_party_id);
   await assertFrozen();const current=await sync();assert.equal(current.id,commission.id);assert.equal(current.data.amount_minor,10);assert.equal(current.data.attribution.referrer_party_id,referrer.personal_party_id);
   await assert.rejects(engagement.referralSync(reviewer.ctx,{party_id:reviewer.personal_party_id,order_id:order.id,operation_key:key()}));
   records.push({case:'REPLACEMENT_ONLY_CHANGES_NEW_ORDER',old_order_id:order.id,new_unpaid_order_id:fresh.id,old_relation_id:oldRelation.id,new_relation_id:newRelation.id,old_mcn_party_id:oldOrg.party_id,new_mcn_party_id:newOrg.party_id,old_referrer_party_id:referrer.personal_party_id,new_referrer_party_id:reviewer.personal_party_id});
  });
  await t.test('original participants still confirm and settle old order after agency replacement',async()=>{
   const proof=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic original-order financial agreement'),operation_key:key()});
   agreement=await finance.agreement(seller.ctx,{party_id:seller.personal_party_id,source_type:'ORDER',source_id:order.id,previous_agreement_id:null,environment:'PRODUCTION',rule_id:rid,rules:{version:'synthetic-history',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'Synthetic only',lines:[{line_id:'stock',allocation:order.data.quote.marketplace_finance.allocation,deductions:[]}]},evidence_asset_id:proof.id,operation_key:key()});
   agreement=await finance.review(reviewer.ctx,{record_id:agreement.id,expected_version:agreement.object_version,decision:'APPROVED',reason:'Independent original agreement',verification,operation_key:key()});
   for(const [u,party] of [[seller,seller.personal_party_id],[buyer,buyer.personal_party_id],[referrer,referrer.personal_party_id],[outsider,outsider.personal_party_id],[outsider,oldOrg.party_id]])await finance.confirm(u.ctx,{record_id:agreement.id,party_id:party,expected_version:agreement.object_version,content_sha256:agreement.content_sha256,decision:'APPROVED',reason:'Confirm original snapshot',operation_key:key()});
   await assert.rejects(finance.balances(referrer.ctx,{record_id:agreement.id,party_id:newOrg.party_id}));
   await settle();const view=await balances();assert.equal(view.items.find(x=>x.party_id===oldOrg.party_id).accrued_minor,16);assert.equal(view.items.find(x=>x.party_id===referrer.personal_party_id).accrued_minor,10);assert.ok(!view.items.some(x=>x.party_id===newOrg.party_id));assert.equal(view.items.reduce((n,x)=>n+x.accrued_minor,0),100);
  });
  async function refund(amount,license){
   let p=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id});p=await S.stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'Synthetic independent refund',operation_key:key()});
   await S.stock.resolveCase(reviewer.ctx,{order_id:order.id,expected_version:p.object_version,case_id:p.data.current_case_id,decision:'REFUND',refund_minor:amount,license_action:license,reason:'Independent amount and licence decision',operation_key:key()});
   let r=await S.trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'stock',amount_minor:amount}],reason:'Original payment refund',operation_key:key()});r=await S.trade.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'Independent synthetic finance review',operation_key:key()});await S.trade.claim(reviewer.ctx,r.id,null,'REFUND');const receipt={...r.data,refund_id:r.id,status:'SUCCEEDED'};await S.trade.applyRefund(r.id,receipt);await S.trade.applyRefund(r.id,receipt);return r;
  }
  await t.test('partial KEEP refund reverses original agency and referral shares, without paying replacement',async()=>{
   partialRefund=await refund(40,'KEEP');const c=await sync();assert.equal(c.id,commission.id);assert.equal(c.data.amount_minor,6);assert.equal(c.data.attribution.referrer_party_id,referrer.personal_party_id);await settle();const view=await balances();assert.equal(view.items.find(x=>x.party_id===oldOrg.party_id).accrued_minor,10);assert.equal(view.items.find(x=>x.party_id===referrer.personal_party_id).accrued_minor,6);assert.equal(view.items.reduce((n,x)=>n+x.accrued_minor,0),60);assert.ok(!view.items.some(x=>x.party_id===newOrg.party_id));await assertFrozen();
   records.push({case:'PARTIAL_REFUND_ORIGINAL_PARTICIPANTS',order_id:order.id,refund_id:partialRefund.id,refund_minor:40,original_mcn_accrual_minor:10,original_referrer_accrual_minor:6,total_accrued_minor:60});
  });
  await t.test('remaining REVOKE refund reverses old commission and allocation exactly once',async()=>{
   finalRefund=await refund(60,'REVOKE');const c=await sync();assert.equal(c.id,commission.id);assert.equal(c.current_status,'REVERSED');assert.equal(c.data.amount_minor,0);await settle();assert.ok((await balances()).items.every(x=>x.accrued_minor===0));await assertFrozen();
   const before=(await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[agreement.id]))[0][0].n;await settle();await sync();assert.equal((await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[agreement.id]))[0][0].n,before);
   records.push({case:'FULL_REFUND_DEDUPLICATED',order_id:order.id,refund_id:finalRefund.id,commission_id:c.id,agreement_id:agreement.id,total_refunded_minor:100,total_accrued_minor:0,contract_sha256:digest(order.data.contract),actual_payout_performed:false});
  });
  const out=path.resolve(__dirname,'../../../../.local/referral-mcn-history-records.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,real_services:false,frontend_run:false,http_run:false,records,limits:['Identity, media, MCN capability and provider receipts are synthetic','PRODUCTION labels are isolated receipt fixtures; no external service used','Accepted_at is a synthetic matured timestamp, not actual elapsed fulfillment','Repository-level persisted workflow; not full API/device acceptance or actual payout/recovery']},null,2));
 }finally{if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
