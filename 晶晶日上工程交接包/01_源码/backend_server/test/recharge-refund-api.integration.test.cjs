'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const C=require('../src/modules/wallet/context');
test('recharge refund role-separated HTTP and personal guardian copies',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_refund_api_'+randomBytes(7).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,buyer2,reviewer,outsider,trade,stock}=S;
  const grant=async(u,action,enabled=true,version=0)=>require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled,expected_version:version,expires_at:null,authority_ref:'synthetic:recharge-refund',reason:'isolated test only'});
  for(const u of [outsider,reviewer])await grant(u,'WALLET_RULE_REVIEW');for(const u of [buyer,reviewer])await grant(u,'WALLET_REFUND_REVIEW');
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal}),custody=require('../src/modules/wallet/custody').createCustodyLedger(db),R=require('../src/modules/wallet/recharge-refunds').createRechargeRefunds(db,{resolvePrincipal:S.resolvePrincipal});
  let rule=await W.createRule(outsider.ctx,{rule:require('./helpers/wallet-rule.cjs'),operation_key:key()});rule=await W.reviewRule(reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'synthetic independent rule',operation_key:key()});
  for(const u of [buyer,buyer2])await W.open(u.ctx,{party_id:u.personal_party_id,rule_id:rule.id,rule_sha256:rule.content_sha256,operation_key:key()});
  const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-merchant',revision:'v1'};
  const recharge=await db.withTransaction(tx=>custody.prepare(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,amount_minor:30000,operation_key:key()},binding));
  const topupProof={record_id:recharge.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic:'+key(),occurred_at:new Date().toISOString(),status:'SUCCEEDED'};await custody.applyVerifiedReceipt(topupProof);
  const proofAsset=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic mistaken topup evidence'),operation_key:key()});
  const summary=()=>W.summary(buyer.ctx,{party_id:buyer.personal_party_id}),read=r=>R.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id}),request=(amount,operation=key())=>R.request(buyer.ctx,{party_id:buyer.personal_party_id,recharge_id:recharge.id,amount_minor:amount,reason:'synthetic mistaken recharge',evidence_asset_ids:[proofAsset.id],operation_key:operation});
  const reviewInput=(r,amount=r.data.requested_minor,decision='APPROVE')=>({record_id:r.id,expected_version:r.object_version,decision,amount_minor:amount,reason:'synthetic independent case decision',checks:{identity_verified:true,source_verified:true,refund_basis_verified:true},operation_key:key()});
  const receipt=(r,status='SUCCEEDED',extra={})=>({record_id:r.id,recharge_id:recharge.id,...binding,original_transaction_id:topupProof.transaction_id,refund_transaction_id:status==='SUCCEEDED'?'synthetic-refund:'+r.id:null,currency:'CNY',amount_minor:r.data.amount_minor,occurred_at:new Date().toISOString(),status,...extra});
  const assessment=()=>db.withTransaction(tx=>custody.assessRefund(tx,{id:buyer.account_id},{party_id:buyer.personal_party_id,recharge_id:recharge.id},binding));
  const config={...S.config,provider:'CUSTODY',merchant_id:binding.merchant_id,config_revision:binding.revision,custody_binding:binding};
  async function order(amount){let spec=await trade.createSpec(S.seller.ctx,{party_id:S.seller.personal_party_id,previous_spec_id:null,title:'synthetic refund/payment competition',provider_party_id:S.seller.personal_party_id,line_kind:'OTHER',unit_minor:amount,currency:'CNY',specification:S.spec.data.specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic cash',operation_key:key()});await S.publishSales(S.seller.personal_party_id,spec.id);let l=await stock.create(S.seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});l=await S.reviewListing(l,'RIGHTS');l=await S.reviewListing(l,'CONTENT');return trade.stockCheckout(buyer.ctx,{party_id:buyer.personal_party_id,listing_id:l.id,offer_sha256:l.content_sha256,channel:'CUSTODY',operation_key:key()});}
  const payment=o=>trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:o.id,installment_key:'stock',operation_key:key()},config);
  const cancel=r=>R.cancel(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id,expected_version:r.object_version,reason:'synthetic cancel unsent refund',operation_key:key()});


  const fixtures=[],records=[];
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',own='/wallet/recharge-refunds',ops='/wallet/operations/recharge-refunds',guardPath='/wallet/guardian-recharge-refunds';
  async function http(u,url,{method='GET',body,party=null,version=null,op=key(),auth=true,capture=true,schema='RechargeRefundResponse'}={}){
   const res=await fetch(base+url,{method,headers:{...auth?{Authorization:'Bearer '+u.token}:{},...party?{'X-Acting-Party':party}:{},...body?{'Content-Type':'application/json','Idempotency-Key':op}:{},...version!==null?{'If-Match':'"'+version+'"'}:{}},...body?{body:JSON.stringify(body)}:{}});
   const json=(res.headers.get('content-type')||'').includes('json'),value=json?await res.json():await res.text();
   if(json&&capture)fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?schema:'ErrorResponse',value});
   if(res.status===200)assert.equal(res.headers.get('cache-control'),'no-store');
   return {status:res.status,value,etag:res.headers.get('etag')};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.value.data;};
  const createBody=()=>({recharge_id:recharge.id,amount_minor:1000,reason:'synthetic original recharge request',evidence_asset_ids:[proofAsset.id]});
  const checks={identity_verified:true,source_verified:true,refund_basis_verified:true};
  let item;
  await t.test('authenticated personal request is idempotent and cannot forge source, party, receipt or guardian',async()=>{
   const body=createBody(),op=key(),args={method:'POST',body,party:buyer.personal_party_id,op};
   assert.equal((await http(buyer,own,{...args,auth:false})).status,401);
   assert.equal((await http(buyer,own,{...args,party:null})).status,400);
   assert.equal((await http(outsider,own,args)).status,403);
   for(const extra of [{receipt:{}},{guardian_link_id:key()},{operations:true},{amount_minor:-1}])assert.equal((await http(buyer,own,{...args,body:{...body,...extra}})).status,400);
   item=ok(await http(buyer,own,args));assert.equal(ok(await http(buyer,own,args)).id,item.id);
   assert.equal((await http(buyer,own,{...args,body:{...body,amount_minor:1001}})).status,409);
   for(const secret of ['binding','original_transaction_id','receipt','proof_sha256','created_by','owner_party_id','evidence_asset_ids','dispatch_job_id','guardian_account_id'])assert.equal(item[secret],undefined);
   records.push({case_id:item.id,recharge_id:recharge.id});
  });
  await t.test('own lists, cursor and cancellation respect identity, current version and command replay',async()=>{
   assert.equal(ok(await http(buyer,own,{party:buyer.personal_party_id})).items[0].id,item.id);
   assert.equal(ok(await http(buyer,own+'/'+item.id,{party:buyer.personal_party_id})).id,item.id);
   assert.equal((await http(buyer2,own+'/'+item.id,{party:buyer2.personal_party_id})).status,404);
   for(const tail of ['?limit=0','?limit=1&limit=2','?cursor='+key(),'?operations=true'])assert.equal((await http(buyer,own+tail,{party:buyer.personal_party_id})).status,400);
   const extra=ok(await http(buyer,own,{method:'POST',body:createBody(),party:buyer.personal_party_id}));
   const page=ok(await http(buyer,own+'?limit=1',{party:buyer.personal_party_id}));assert.equal(page.items.length,1);assert(page.next_cursor);
   assert.equal(ok(await http(buyer,own+'?limit=1&cursor='+page.next_cursor,{party:buyer.personal_party_id})).items.length,1);
   const args={method:'POST',body:{reason:'synthetic unsent cancellation'},party:buyer.personal_party_id,op:key()};
   assert.equal((await http(buyer,own+'/'+extra.id+'/cancellation',args)).status,428);
   assert.equal((await http(buyer,own+'/'+extra.id+'/cancellation',{...args,version:999})).status,412);
   const cancelled=ok(await http(buyer,own+'/'+extra.id+'/cancellation',{...args,version:extra.object_version}));
   assert.equal(cancelled.current_status,'CANCELLED');assert.equal(ok(await http(buyer,own+'/'+extra.id+'/cancellation',{...args,version:extra.object_version})).object_version,cancelled.object_version);
  });
  await t.test('independent queue and actual evidence bytes never expose own case or unrelated files',async()=>{
   assert.equal((await http(outsider,ops)).status,403);
   assert.equal(ok(await http(buyer,ops)).items.length,0);
   assert.equal((await http(buyer,ops+'/'+item.id)).status,403);
   assert.equal((await http(reviewer,ops,{party:reviewer.personal_party_id})).status,400);
   assert(ok(await http(reviewer,ops)).items.some(x=>x.id===item.id));
   const detail=ok(await http(reviewer,ops+'/'+item.id));assert.deepEqual(detail.evidence_asset_ids,[proofAsset.id]);assert.equal(detail.binding,undefined);
   const evidence=ops+'/'+item.id+'/evidence/';
   assert.equal(ok(await http(reviewer,ops+'/'+item.id)).id,item.id);
   const bytes=await http(reviewer,evidence+proofAsset.id);assert.equal(bytes.status,200);assert.equal(bytes.value,'synthetic mistaken topup evidence');
   assert.equal((await http(buyer,evidence+proofAsset.id)).status,403);assert.equal((await http(reviewer,evidence+key())).status,404);
   await grant(reviewer,'WALLET_REFUND_REVIEW',false,1);assert.equal((await http(reviewer,evidence+proofAsset.id)).status,403);await grant(reviewer,'WALLET_REFUND_REVIEW',true,2);
  });
  await t.test('HTTP independent approval, scheduling and retry join the real worker without public dispatch or receipt input',async()=>{
   const path=ops+'/'+item.id,body={decision:'APPROVE',amount_minor:1000,reason:'synthetic independent decision',checks};
   assert.equal((await http(buyer,path+'/review',{method:'POST',body,version:item.object_version})).status,403);
   assert.equal((await http(reviewer,path+'/review',{method:'POST',body:{...body,checks:{}},version:item.object_version})).status,409);
   assert.equal((await http(reviewer,path+'/review',{method:'POST',body,version:999})).status,412);
   item=ok(await http(reviewer,path+'/review',{method:'POST',body,version:item.object_version}));
   const args={method:'POST',body:{},version:item.object_version,op:key()};
   item=ok(await http(reviewer,path+'/scheduling',args));assert.equal(ok(await http(reviewer,path+'/scheduling',args)).object_version,item.object_version);assert.equal(item.task_scheduled,true);assert.equal(item.job_id,undefined);
   const jobs=require('../src/infrastructure/jobs/repository').createJobRepository(db),{TYPE}=require('../src/modules/wallet/recharge-refund-jobs'),{createWorker}=require('../src/worker/runner'),{createRechargeRefundHandler}=require('../src/modules/wallet/recharge-refund-handler');
   const raw=await read(item),jobId=raw.data.dispatch_job_id;let sent=0,queried=0,proof;
   const provider={binding,assertReady:async()=>{},refund:async(input,{idempotency_key})=>{assert.equal(idempotency_key,item.id);sent++;proof=receipt(await read(item));return {...proof,amount_minor:1};},queryRefund:async()=>{queried++;return proof;}};
   const worker=createWorker({repository:jobs,handlers:new Map([[TYPE,createRechargeRefundHandler({refunds:R,operatorContext:async()=>reviewer.ctx,providers:new Map([[binding.provider,provider]])})]]),leaseMs:60000,pollMs:10});
   const advance=async()=>{const before=(await jobs.get(jobId)).attempts;for(let n=0;n<200;n++){await worker.tick();if((await jobs.get(jobId)).attempts>before)return;}assert.fail('target task not reached');};
   await advance();assert.equal((await jobs.get(jobId)).status,'BLOCKED');assert.equal((await summary()).reserved_balance_minor,1000);
   item=ok(await http(buyer,own+'/'+item.id,{party:buyer.personal_party_id}));assert.equal(item.current_status,'SUBMITTING');
   const retry={method:'POST',body:{reason:'synthetic independent original request recovery'},version:item.object_version,op:key()};
   assert.equal((await http(buyer,path+'/retry',retry)).status,403);
   item=ok(await http(reviewer,path+'/retry',retry));assert.equal(ok(await http(reviewer,path+'/retry',retry)).object_version,item.object_version);
   await advance();assert.equal((await jobs.get(jobId)).status,'SUCCEEDED');assert.equal(sent,1);assert.equal(queried,1);
   item=ok(await http(buyer,own+'/'+item.id,{party:buyer.personal_party_id}));assert.equal(item.current_status,'SUCCEEDED');
   for(const action of ['claim','receipt'])assert.equal((await http(reviewer,path+'/'+action,{method:'POST',body:{},capture:false})).status,404);
   records.push({case_id:item.id,job_id:jobId,sent,queried,status:item.current_status});
  });
  const childTopup=await db.withTransaction(tx=>custody.prepare(tx,{id:buyer2.account_id},{party_id:buyer2.personal_party_id,amount_minor:30000,operation_key:key()},binding));
  await custody.applyVerifiedReceipt({record_id:childTopup.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic-child:'+childTopup.id,occurred_at:new Date().toISOString(),status:'SUCCEEDED'});
  await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[buyer2.person.id]);
  const G=require('../src/modules/guardians/repository').createGuardianRepository(db,{resolvePrincipal:S.resolvePrincipal});
  await grant(reviewer,'PRIVACY_REVIEW');await grant(S.seller,'WALLET_REFUND_REVIEW');await grant(buyer2,'WALLET_REFUND_REVIEW');
  const guardianProof=await S.supply.upload(S.seller.ctx,{party_id:S.seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic guardian case evidence'),operation_key:key()});
  const ruleId=key(),terms={version:'CONTRACT_20261029',daily_minutes:30,rest_minutes:15,single_minor:1000,daily_minor:2000,night_start:22,night_end:8,terms:'synthetic guardian only'},content=require('../src/modules/governance/content').createRuleContent({id:ruleId,rule_key:'guardian.protection',version:'synthetic-v1',terms:{guardian_protection:terms}});
  await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[ruleId,'guardian.protection',content.version,JSON.stringify(content),'2020-01-01 00:00:00',reviewer.account_id]);
  let link=await G.invite(S.seller.ctx,{child_account_id:buyer2.account_id,relationship:'synthetic parent',evidence_asset_ids:[guardianProof.id],rule_id:ruleId,valid_until:'2099-01-01T00:00:00.000Z',operation_key:key()});

  link=await G.decide(buyer2.ctx,{record_id:link.id,expected_version:link.object_version,decision:'ACCEPT',reason:'synthetic child acceptance',operation_key:key()});
  link=await G.decide(reviewer.ctx,{record_id:link.id,operations:true,expected_version:link.object_version,decision:'APPROVE',age_band:'AGE_14_17',identity_checked:true,relationship_checked:true,reason:'synthetic relationship checked',operation_key:key()});
  const guardianBody={child_party_id:buyer2.personal_party_id,guardian_link_id:link.id,recharge_id:childTopup.id,amount_minor:1000,reason:'synthetic guardian original refund',evidence_asset_ids:[guardianProof.id]};
  let guardianCase;
  await t.test('guardian HTTP uses own identity and evidence, separate child source, no self-review',async()=>{
   const args={method:'POST',body:guardianBody,op:key()};
   assert.equal((await http(S.seller,guardPath,{...args,party:buyer2.personal_party_id})).status,400);
   assert.equal((await http(outsider,guardPath,args)).status,403);
   assert.equal((await http(S.seller,guardPath,{...args,body:{...guardianBody,child_party_id:buyer.personal_party_id}})).status,403);
   assert.equal((await http(S.seller,guardPath,{...args,body:{...guardianBody,evidence_asset_ids:[proofAsset.id]}})).status,409);
   guardianCase=ok(await http(S.seller,guardPath,args));assert.equal(ok(await http(S.seller,guardPath,args)).id,guardianCase.id);
   assert.equal(ok(await http(buyer2,own+'/'+guardianCase.id,{party:buyer2.personal_party_id})).id,guardianCase.id);
   assert.equal(guardianCase.applicant_kind,'GUARDIAN');assert.equal(guardianCase.guardian_account_id,undefined);
   assert.equal(ok(await http(S.seller,guardPath)).items.length,1);assert.equal(ok(await http(outsider,guardPath)).items.length,0);
   assert.equal(ok(await http(S.seller,guardPath+'/'+guardianCase.id)).id,guardianCase.id);
   assert.equal((await http(outsider,guardPath+'/'+guardianCase.id)).status,404);
   const review={method:'POST',body:{decision:'APPROVE',amount_minor:1000,reason:'synthetic guardian review',checks},version:guardianCase.object_version};
   assert.equal((await http(S.seller,ops+'/'+guardianCase.id+'/review',review)).status,403);
   assert.equal((await http(buyer2,ops+'/'+guardianCase.id+'/review',review)).status,403);
   assert.equal((await http(reviewer,ops+'/'+guardianCase.id+'/review',review)).status,409);
   guardianCase=ok(await http(reviewer,ops+'/'+guardianCase.id+'/review',{...review,body:{...review.body,checks:{...checks,relationship_verified:true}}}));
  });
  const privacy=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal}),copies=new Map();
  for(const u of [buyer,buyer2,S.seller,outsider])copies.set(u.account_id,await privacy.create(u.ctx,{request:{type:'COPY',scopes:['ALL'],details:'synthetic refund copy'},operation_key:key()}));
  const copy=(u,section,extra='',request=copies.get(u.account_id))=>http(u,'/privacy/requests/'+request.id+'/account-data?section='+section+extra,{schema:'PrivacyAccountCopyPageResponse'});
  await t.test('own wallet and guardian copies redact task, channel, identity and review evidence',async()=>{
   const wallet=ok(await copy(buyer,'WALLET'));assert(wallet.items.some(x=>x.id===item.id));
   const mine=ok(await copy(S.seller,'GUARDIAN_RECHARGE_REFUNDS'));assert.equal(mine.items[0].id,guardianCase.id);assert.equal(mine.items[0].own_role,'GUARDIAN');assert.equal(mine.items[0].data.amount_minor,1000);
   assert.equal(ok(await copy(buyer2,'GUARDIAN_RECHARGE_REFUNDS')).items[0].own_role,'CHILD');
   assert.equal(ok(await copy(outsider,'GUARDIAN_RECHARGE_REFUNDS')).items.length,0);
   assert(ok(await copy(buyer2,'WALLET')).items.some(x=>x.id===guardianCase.id));assert.equal(ok(await copy(S.seller,'WALLET')).items.some(x=>x.id===guardianCase.id),false);
   for(const data of [wallet,mine])for(const field of ['merchant_id','original_transaction_id','refund_transaction_id','dispatch_job_id','guardian_account_id','guardian_link_id','evidence_asset_ids','task_retry'])assert.equal(JSON.stringify(data).includes('"'+field+'"'),false,field);
   assert.equal((await copy(S.seller,'GUARDIAN_RECHARGE_REFUNDS','&cursor='+item.id)).status,400);
   const profile=await privacy.create(S.seller.ctx,{request:{type:'COPY',scopes:['PROFILE'],details:'synthetic profile only'},operation_key:key()});assert.equal((await copy(S.seller,'GUARDIAN_RECHARGE_REFUNDS','',profile)).status,409);
  });
  await t.test('revoked guardian loses live case details and new requests but own child retains financial copy',async()=>{
   link=await G.decide(S.seller.ctx,{record_id:link.id,expected_version:link.object_version,decision:'REVOKE',reason:'synthetic relation revoked',operation_key:key()});
   assert.equal((await http(S.seller,guardPath+'/'+guardianCase.id)).status,403);assert.equal(ok(await http(S.seller,guardPath)).items.length,0);
   assert.equal((await http(S.seller,guardPath,{method:'POST',body:guardianBody})).status,403);
   const copyAfter=ok(await copy(S.seller,'GUARDIAN_RECHARGE_REFUNDS'));assert.equal(copyAfter.items[0].data,null);assert.equal(copyAfter.items[0].detail_access,'CURRENT_GUARDIAN_ACCESS_REQUIRED');
   assert.equal(ok(await copy(buyer2,'GUARDIAN_RECHARGE_REFUNDS')).items[0].data.id,guardianCase.id);
   assert.equal((await http(reviewer,ops+'/'+guardianCase.id+'/scheduling',{method:'POST',body:{},version:guardianCase.object_version})).status,403);
   assert.equal((await http(buyer2,own,{method:'POST',party:buyer2.personal_party_id,body:{recharge_id:childTopup.id,amount_minor:1000,reason:'must remain blocked',evidence_asset_ids:[guardianProof.id]}})).status,403);
   assert.equal((await http(buyer2,'/wallet/recharges',{method:'POST',party:buyer2.personal_party_id,body:{amount_minor:1000},capture:false})).status,403);
   assert.equal((await http(buyer2,own+'/'+item.id+'/cancellation',{method:'POST',party:buyer2.personal_party_id,body:{reason:'not own'},version:item.object_version})).status,404);
   guardianCase=ok(await http(buyer2,own+'/'+guardianCase.id+'/cancellation',{method:'POST',party:buyer2.personal_party_id,body:{reason:'synthetic child cancels unsent'},version:guardianCase.object_version}));assert.equal(guardianCase.current_status,'CANCELLED');
  });
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/recharge-refund-api-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.resolve(__dirname,'../../../..','.local/recharge-refund-api-journey.json'),JSON.stringify({synthetic_only:true,records,guardian_case_id:guardianCase.id,guardian_link_id:link.id,frontend_run:false,live_provider_enabled:false},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
