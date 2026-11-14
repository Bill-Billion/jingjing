'use strict';
// Disposable loopback MySQL fixture. All people, permissions, evidence and money are synthetic.
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict'),{randomUUID:key,randomBytes}=require('node:crypto');
const P=path.resolve(__dirname,'..'),B=path.join(P,'晶晶日上工程交接包/01_源码/backend_server'),req=require('node:module').createRequire(path.join(B,'package.json'));
req('./scripts/test-network-guard.cjs');
const mysql=req('mysql2/promise'),express=req('express'),out=path.join(P,'.local/pr39-six-contract'),{digest,createRuleContent}=req('./src/modules/governance/content');
let db,control,server,watch,created=false,cleaning=false;const name='jx_test_six_'+randomBytes(8).toString('hex');
async function cleanup(){if(cleaning)return;cleaning=true;clearInterval(watch);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(control){if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}await fs.rm(path.join(out,'access.json'),{force:true});await fs.writeFile(path.join(out,'cleanup.json'),JSON.stringify({synthetic_only:true,database_removed:true,credentials_removed:true}));console.log('STOPPED');}
(async()=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 await fs.mkdir(out,{recursive:true});await fs.rm(path.join(out,'stop'),{force:true});control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
 db=await req('./src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});await req('./src/infrastructure/database/migrator').migrate(db);
 const S=await req('./test/helpers/stock-seed.cjs').seedStock(db,{marketplaceFinance:{rounding:'LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN'}}),{seller,buyer,reviewer,outsider,buyer2}=S;
 const grants=req('./src/modules/governance/operator-access').maintainOperatorGrant;
 for(const u of [reviewer,outsider])for(const action of ['SUPPORT_HANDLE','PRIVACY_HANDLE','PRIVACY_REVIEW','ENGAGEMENT_REVIEW'])await grants(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:six-page-check',reason:'Isolated synthetic UI only'});
 const proof=async u=>S.supply.upload(u.ctx,{party_id:u.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic only: '+u.account_id),operation_key:key()});
 const proofs={seller:S.evidence.id,buyer:(await proof(buyer)).id,buyer2:(await proof(buyer2)).id,reviewer:(await proof(reviewer)).id,outsider:(await proof(outsider)).id};
 const rule=async(rule_key,terms)=>{const id=key(),c=createRuleContent({id,rule_key,version:'synthetic-six-v1',terms});await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[id,rule_key,c.version,JSON.stringify(c),'2020-01-01 00:00:00',reviewer.account_id]);return id;};
 const listing=await S.listing(),legacy=await S.checkout(listing,buyer2);await S.payment(legacy,buyer2);
 const specData=structuredClone(S.spec.data.specification);specData.stock_license.acceptance_hours=48;specData.stock_license.acceptance_policy='CONTRACT_20261029';
 let spec=await S.trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic 48h order',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:100,currency:'CNY',specification:specData,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'Synthetic',operation_key:key()});await S.publishSales(seller.personal_party_id,spec.id);
 let modernListing=await S.stock.create(seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});modernListing=await S.reviewListing(modernListing,'RIGHTS');modernListing=await S.reviewListing(modernListing,'CONTENT');
 const modern=await S.checkout(modernListing,buyer2);await S.payment(modern,buyer2);
 const childOrder=await S.checkout(listing,buyer),childPayment=await S.payment(childOrder,buyer);await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[buyer.person.id]);
 const guardianRule=await rule('guardian.protection',{guardian_protection:{version:'CONTRACT_20261029',daily_minutes:30,rest_minutes:15,single_minor:1000,daily_minor:2000,night_start:22,night_end:8,terms:'Synthetic reviewed limits only; not official defaults'}});
 await rule('guardian.content-pool',{guardian_content_pool:{version:'CONTRACT_20261029',terms:'Synthetic preview only',items:[{listing_id:listing.id,title:'合成适龄预览',suitability_reviewed:true}]}});
 process.env.GUARDIAN_CONTENT_POOL_ENABLED='true'; // This process owns only the disposable test DB.
 const A=req('./src/modules/artists/context');const originalNow=A.now;A.now=async tx=>{const now=await originalNow(tx);return now.slice(0,10)+'T04:00:00.000Z';};
 const privacy=req('./src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
 const closure=await privacy.create(buyer2.ctx,{request:{type:'CLOSE_ACCOUNT',scopes:['ALL'],details:'Synthetic closure clock; no real person'},operation_key:key()});
 const R=req('./src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal}),oldRule=req('./test/helpers/engagement-rule.cjs');
 let referral=await R.createRule(outsider.ctx,{rule:oldRule,operation_key:key()});referral=await R.reviewRule(reviewer.ctx,{record_id:referral.id,expected_version:referral.object_version,decision:'APPROVE',reason:'Synthetic legacy rule',operation_key:key()});
 const controlToken=randomBytes(32).toString('base64url'),app=express();
 app.post('/__synthetic/control',express.json(),async(q,s)=>{try{assert.equal(q.ip,'127.0.0.1');assert.equal(q.get('Authorization'),'Bearer '+controlToken);const i=q.body;
  if(i.action==='refund-settle'){let refund=await S.trade.read(reviewer.ctx,{record_id:i.refund_id});assert.equal(refund.kind,'REFUND');assert.equal(refund.data.payment_id,childPayment.payment.id);refund=await S.trade.review(reviewer.ctx,{record_id:refund.id,expected_version:refund.object_version,decision:'APPROVED',reason:'Independent synthetic original-payment review',operation_key:key()});await S.trade.claim(reviewer.ctx,refund.id,null,'REFUND');await S.trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});s.json({synthetic_only:true});}
  else if(i.action==='expire-guardian'){const [[row]]=await db.execute("SELECT * FROM guardian_records WHERE id=? AND kind='LINK'",[i.id]);assert(row);const d=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;d.valid_until='2000-01-01T00:00:00.000Z';await db.execute('UPDATE guardian_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(d),digest(d),i.id]);s.json({synthetic_only:true});}
  else if(i.action==='clock-overdue'){A.now=async()=>'2090-01-01T04:00:00.000Z';s.json({synthetic_only:true});}
  else if(i.action==='clock-normal'){A.now=async tx=>(await originalNow(tx)).slice(0,10)+'T04:00:00.000Z';s.json({synthetic_only:true});}
  else throw Error('Unknown bounded synthetic action');
 }catch(e){s.status(400).json({error:e.code||e.message});}});
 app.use(req('./src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 // Long-lived local fixture sessions avoid a test restart invalidating evidence; they are removed on cleanup.
 await db.execute('UPDATE auth_sessions SET expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+43200000');
 await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,host:'http://127.0.0.1:'+server.address().port,controlToken,accounts:Object.fromEntries(Object.entries({seller,buyer,reviewer,outsider,buyer2}).map(([k,u])=>[k,{token:u.token,account:u.account_id,party:u.personal_party_id}])),proofs,guardian_rule:guardianRule,closure_id:closure.id,legacy_referral_id:referral.id,listing_id:listing.id,modern_listing_id:modernListing.id,legacy_order:legacy.id,modern_order:modern.id,child_payment:childPayment.payment.id,child_order:childOrder.id}),{mode:0o600});
 console.log('READY six-contract synthetic loopback only');watch=setInterval(()=>fs.access(path.join(out,'stop')).then(cleanup).catch(()=>{}),500);process.once('SIGTERM',cleanup);process.once('SIGINT',cleanup);
})().catch(async e=>{console.error(e.stack);process.exitCode=1;await cleanup();});
