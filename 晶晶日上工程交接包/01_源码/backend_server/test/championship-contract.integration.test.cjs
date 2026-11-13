'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
const A=require('../src/modules/artists/context'),C=require('../src/modules/engagement/context');
test('contract championship: actual HTTP votes, same-event appeal and earned reward',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_champion_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const fixtures=[],records={synthetic_only:true,frontend_run:false};
 const prior=process.env.RANKING_CONTRACT_POLICY;process.env.RANKING_CONTRACT_POLICY='LEGACY_COMPATIBLE';
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),{buyer,seller,buyer2,reviewer,outsider}=S;
  for(const u of [reviewer,outsider])for(const action of ['ENGAGEMENT_REVIEW','WALLET_RULE_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:champion-contract',reason:'isolated test only'});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  const routes=require('../src/http/engagement-routes');
  async function invoke(method,u,i){const post=routes.posts.find(x=>x[1]===method),d=post||routes.gets.find(x=>x[1]===method);assert.ok(d,method);let url='/engagement'+d[0].replace(':record_id',i.record_id||'');const body=Object.fromEntries(d[2].filter(k=>i[k]!==undefined).map(k=>[k,i[k]]));if(!post&&Object.keys(body).length)url+='?'+new URLSearchParams(body);const r=await fetch(base+url,{method:post?'POST':'GET',headers:{Authorization:'Bearer '+u.token,...i.party_id?{'X-Acting-Party':i.party_id}:{},...post?{'Content-Type':'application/json','Idempotency-Key':i.operation_key||key()}:{},...d[4]?{'If-Match':'"'+i.expected_version+'"'}:{}},...post?{body:JSON.stringify(body)}:{}}),value=await r.json();fixtures.push({method:post?'POST':'GET',path:new URL(base+url).pathname,schema:r.status===200?'EngagementResponse':'ErrorResponse',value});if(r.status!==200)throw Object.assign(new Error(JSON.stringify(value)),{code:value.error?.code,status:r.status});return value.data;}
  const rev=(method,r,u=reviewer)=>invoke(method,u,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'independent synthetic review'});
  const repo=require('../src/modules/engagement/repository'),legacy=repo.createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal,rankingContractPolicy:'LEGACY_COMPATIBLE'}),modern=repo.createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal,rankingContractPolicy:'CONTRACT_20261029'});
  const cfg={...structuredClone(require('./helpers/engagement-rule.cjs')),version:'synthetic-modern-champion',ranking_contract_policy:'CONTRACT_20261029'};cfg.rank.halo_bps=[0,10000,13000,16000];
  const rule=await rev('reviewRule',await invoke('createRule',outsider,{rule:cfg})),oldRule=await rev('reviewRule',await invoke('createRule',outsider,{rule:require('./helpers/engagement-rule.cjs')}));
  const profile=await invoke('rankingProfile',seller,{party_id:seller.personal_party_id,person_id:seller.person.id,city:'champion-city',district:'district',category:'film',opt_in:true});
  // Fixture aging represents the end of the existing cold-start period.
  const aged={...profile.data,registered_at:new Date(Date.now()-60*86400000).toISOString()};await db.execute('UPDATE engagement_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(aged),digest(aged),profile.id]);
  // Actual checkout and wallet accounting with a trusted synthetic receipt. No real payment/provider.
  let spec=await S.trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,title:'Synthetic point source',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:20000,currency:'CNY',specification:S.spec.data.specification,product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:key()});
  spec=await S.trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});await S.publishSales(seller.personal_party_id,spec.id);
  let listing=await S.stock.create(seller.ctx,{...S.listingInput,spec_id:spec.id,operation_key:key()});listing=await S.reviewListing(listing,'RIGHTS');listing=await S.reviewListing(listing,'CONTENT');
  const W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});let wr=await W.createRule(outsider.ctx,{rule:require('./helpers/wallet-rule.cjs'),operation_key:key()});wr=await W.reviewRule(reviewer.ctx,{record_id:wr.id,expected_version:wr.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});await W.open(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});
  const order=await S.checkout(listing),paymentConfig={...S.config,environment:'PRODUCTION'},payment=await S.trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'stock',operation_key:key()},paymentConfig);
  await S.trade.applyPayment({...paymentConfig,payment_id:payment.id,currency:'CNY',amount_minor:20000,transaction_id:'synthetic-champion:'+key(),status:'SUCCEEDED',product_id:null,app_account_token:null});
  const purchase=(await db.execute('SELECT * FROM stock_purchases WHERE order_id=?',[order.id]))[0][0],purchaseData={...A.parse(purchase.data_json),accepted_at:new Date(Date.now()-8*86400000).toISOString()};await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(purchaseData),digest(purchaseData),order.id]);
  await W.syncOrder(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,operation_key:key()});
  const balance=async()=> (await W.summary(buyer.ctx,{party_id:buyer.personal_party_id})).available_points;assert.equal(await balance(),2000);
  const rankInput={city:'champion-city',district:'district',category:'film'},snapshot=await invoke('rankingSnapshot',reviewer,{rule_id:rule.id,...rankInput}),oldSnapshot=await invoke('rankingSnapshot',reviewer,{rule_id:oldRule.id,...rankInput});
  const proof=await S.supply.upload(outsider.ctx,{party_id:outsider.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic champion exposure delivery proof'),operation_key:key()});let stock=await rev('reviewRewardStock',await invoke('rewardStock',outsider,{party_id:outsider.personal_party_id,title:'Synthetic earned exposure',kind:'EXPOSURE',terms:'No paid advertising or performance rights',capacity:6,valid_until:'2099-01-01T00:00:00.000Z',evidence_asset_ids:[proof.id]}));
  const standard={official_bps:6000,ranking_bps:2000,vote_bps:2000,vote_cost:100,daily_cap:10,tie_mode:'MANUAL_REVIEW',void_point_policy:'HOLD_FOR_APPEAL'};
  const input={title:'Synthetic modern event',snapshot_id:snapshot.id,reward_stock_id:stock.id,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),appeal_until:new Date(Date.now()+2*86400000).toISOString(),rules:standard};
  const oldInput={...input,snapshot_id:oldSnapshot.id,rules:{...standard,vote_cost:2,daily_cap:2},operation_key:key()},oldEvent=await legacy.competition(outsider.ctx,oldInput),pendingOld=await legacy.competition(outsider.ctx,{...oldInput,operation_key:key()});
  const oldReview={record_id:oldEvent.id,expected_version:oldEvent.object_version,decision:'APPROVE',reason:'legacy published fixture',operation_key:key()};const publishedOld=await legacy.reviewCompetition(reviewer.ctx,oldReview);
  let event,second,candidate,candidate2,firstVote;
  await t.test('six city boards and composite retain insufficient-data emptiness and exclude other cities',async()=>{
   const original=snapshot.content_sha256,publicRank=await invoke('rankings',buyer,{record_id:snapshot.id});
   assert.deepEqual(Object.keys(publicRank.boards).sort(),['sales','reviews','repeat','popularity','levels','newcomers','composite'].sort());
   assert.equal(publicRank.boards.sales.length,1);assert.equal(publicRank.boards.reviews.length,0);assert.equal(publicRank.boards.repeat.length,0);assert.equal(publicRank.boards.newcomers.length,0);assert.equal(publicRank.paid_advertising,false);assert.equal(publicRank.personalized,false);assert.equal(publicRank.evidence,undefined);
   const empty=await invoke('rankingSnapshot',reviewer,{rule_id:rule.id,...rankInput,city:'other-city'});assert.ok(Object.values((await invoke('rankings',buyer,{record_id:empty.id})).boards).every(rows=>rows.length===0));assert.equal((await legacy.read(reviewer.ctx,{record_id:snapshot.id})).content_sha256,original);
  });
  await t.test('modern snapshots reject changed price, cap and every scoring component even in compatible mode',async()=>{
   for(const rules of [{...standard,vote_cost:2},{...standard,daily_cap:2},{...standard,official_bps:5000,ranking_bps:3000},{...standard,ranking_bps:1000,vote_bps:3000}])await assert.rejects(invoke('competition',outsider,{...input,rules}),{code:'CHAMPIONSHIP_CONTRACT_RATE_MISMATCH'});
  });
  await t.test('new-contract mode rejects legacy new/pending activity but preserves completed creation and approval receipts',async()=>{
   const before=(await modern.read(reviewer.ctx,{record_id:stock.id})).data.reserved;
   await assert.rejects(modern.competition(outsider.ctx,{...oldInput,operation_key:key()}),{code:'RANKING_CONTRACT_POLICY_REQUIRED'});
   await assert.rejects(modern.reviewCompetition(reviewer.ctx,{record_id:pendingOld.id,expected_version:pendingOld.object_version,decision:'APPROVE',reason:'new-contract review',operation_key:key()}),{code:'RANKING_CONTRACT_POLICY_REQUIRED'});
   assert.equal((await modern.read(reviewer.ctx,{record_id:stock.id})).data.reserved,before);
   assert.deepEqual(await modern.competition(outsider.ctx,oldInput),oldEvent);assert.deepEqual(await modern.reviewCompetition(reviewer.ctx,oldReview),publishedOld);
   assert.equal((await invoke('competitionResult',buyer,{record_id:publishedOld.id})).rules.vote_cost,2);
  });
  await t.test('pending modern wrong rules fail independent approval without reserving inventory',async()=>{
   // Simulate a previously pending record made before this guard existed; no production data is mutated.
   const pending=await invoke('competition',outsider,input),data={...pending.data,rules:{...standard,vote_cost:2}};
   await db.execute('UPDATE engagement_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),pending.id]);
   const before=(await legacy.read(reviewer.ctx,{record_id:stock.id})).data.reserved;
   await assert.rejects(rev('reviewCompetition',pending),{code:'CHAMPIONSHIP_CONTRACT_RATE_MISMATCH'});assert.equal((await legacy.read(reviewer.ctx,{record_id:stock.id})).data.reserved,before);
  });
  await t.test('two independently approved events share the same account daily allowance',async()=>{
   event=await invoke('competition',outsider,input);await assert.rejects(rev('reviewCompetition',event,outsider),{code:'SELF_REVIEW_FORBIDDEN'});event=await rev('reviewCompetition',event);second=await rev('reviewCompetition',await invoke('competition',outsider,{...input,title:'Synthetic second event'}));
   candidate=await rev('reviewCandidate',await invoke('nominate',seller,{party_id:seller.personal_party_id,event_id:event.id,profile_id:profile.id}));candidate2=await rev('reviewCandidate',await invoke('nominate',seller,{party_id:seller.personal_party_id,event_id:second.id,profile_id:profile.id}));
   const v={party_id:buyer.personal_party_id,event_id:event.id,candidate_id:candidate.id,operation_key:key()};await db.withConnection(c=>c.query("CREATE TRIGGER champion_vote_fail BEFORE INSERT ON engagement_audit FOR EACH ROW BEGIN IF NEW.event_code='VOTE_POINTS_COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END"));
   try{await assert.rejects(invoke('vote',buyer,v),e=>e.status===503);assert.equal(await balance(),2000);assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='VOTE'"))[0][0].n),0);}finally{await db.withConnection(c=>c.query('DROP TRIGGER champion_vote_fail'));}
   firstVote=await invoke('vote',buyer,v);assert.equal(firstVote.data.points,100);assert.equal((await invoke('vote',buyer,v)).id,firstVote.id);assert.equal(await balance(),1900);
   const attempts=await Promise.allSettled(Array.from({length:12},(_,i)=>invoke('vote',buyer,{party_id:buyer.personal_party_id,event_id:i%2?second.id:event.id,candidate_id:i%2?candidate2.id:candidate.id})));
   assert.equal(attempts.filter(x=>x.status==='fulfilled').length,9);assert.equal(attempts.filter(x=>x.status==='rejected').length,3);for(const x of attempts.filter(x=>x.status==='rejected'))assert.equal(x.reason.code,'VOTE_DAILY_LIMIT');
   assert.equal(await balance(),1000);for(const e of [event,second]){const own=await invoke('myVotes',buyer,{party_id:buyer.personal_party_id,event_id:e.id});assert.equal(own.used_today,10);assert.equal(own.remaining_today,0);assert.equal(own.points_per_vote,100);}
   records.event_id=event.id;records.other_event_id=second.id;records.daily_vote_count=10;records.source_order_id=order.id;
  });
  await t.test('minor, expired identity, unrelated payer and insufficient points cannot create or debit votes',async()=>{
   const v={party_id:buyer2.personal_party_id,event_id:event.id,candidate_id:candidate.id};
   const before=Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='VOTE'"))[0][0].n);
   await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[buyer2.person.id]);try{await assert.rejects(invoke('vote',buyer2,v),{code:'VERIFIED_ADULT_REQUIRED'});}finally{await db.execute("UPDATE artist_people SET age_band='ADULT' WHERE id=?",[buyer2.person.id]);}
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01' WHERE id=?",[buyer2.person.id]);try{await assert.rejects(invoke('vote',buyer2,v),{code:'VERIFIED_ADULT_REQUIRED'});}finally{await db.execute("UPDATE artist_people SET identity_valid_until='2099-01-01' WHERE id=?",[buyer2.person.id]);}
   await assert.rejects(invoke('vote',buyer,{...v,party_id:seller.personal_party_id}));
   await W.open(buyer2.ctx,{party_id:buyer2.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});await assert.rejects(invoke('vote',buyer2,v));
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='VOTE'"))[0][0].n),before);assert.equal(await balance(),1000);
  });
  await t.test('same-vote appeal returns exactly 100 points once without reopening the daily quota',async()=>{
   firstVote=await invoke('voteReview',reviewer,{record_id:firstVote.id,expected_version:firstVote.object_version,decision:'SUSPEND',reason:'synthetic suspected abuse'});
   const appeal=await invoke('appeal',buyer,{party_id:buyer.personal_party_id,event_id:event.id,reason:'synthetic review request'});
   const returning={record_id:firstVote.id,expected_version:firstVote.object_version,decision:'RETURN_POINTS',reason:'synthetic upheld appeal',operation_key:key()};firstVote=await invoke('voteReview',reviewer,returning);assert.deepEqual(await invoke('voteReview',reviewer,returning),firstVote);assert.equal(await balance(),1100);
   await invoke('resolveAppeal',reviewer,{record_id:appeal.id,expected_version:appeal.object_version,reason:'returned original debit only'});
   await assert.rejects(invoke('vote',buyer,{party_id:buyer.personal_party_id,event_id:event.id,candidate_id:candidate.id}),{code:'VOTE_DAILY_LIMIT'});records.returned_vote_id=firstVote.id;records.points_after_return=1100;
  });
  await t.test('final scores use frozen 60/20/20; award issuance is distinct from actual exposure redemption',async()=>{
   await invoke('judge',reviewer,{candidate_id:candidate.id,realism:80,fit:80,completeness:80,reason:'synthetic official scoring'});
   await assert.rejects(invoke('finalize',reviewer,{record_id:event.id,expected_version:event.object_version}),{code:'COMPETITION_NOT_FINALIZABLE'});
   const data={...event.data,ends_at:'2020-01-01T00:00:00.000Z',appeal_until:'2020-01-02T00:00:00.000Z'};await db.execute('UPDATE engagement_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),event.id]);
   const request={record_id:event.id,expected_version:event.object_version,operation_key:key()};event=await invoke('finalize',reviewer,request);assert.deepEqual(await invoke('finalize',reviewer,request),event);assert.equal(event.data.result.scores[0].total,88);
   const valid=Number((await db.execute("SELECT COUNT(*) n FROM engagement_records WHERE kind='VOTE' AND parent_id=? AND current_status='VALID'",[event.id]))[0][0].n);assert.equal(event.data.result.scores[0].votes,valid);
   let grant=(await invoke('myRewards',seller,{party_id:seller.personal_party_id})).items.find(x=>x.parent_id===event.id);assert.equal(grant.current_status,'ISSUED');assert.equal(grant.data.performance_rights_granted,false);assert.deepEqual((await invoke('exposures',buyer,{city:'champion-city'})).items,[]);
   const delivery={evidence_asset_id:proof.id,reference:'synthetic independent delivery',starts_at:new Date(Date.now()-1000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),placement:'CITY_ARTIST_SPOTLIGHT'};
   await assert.rejects(invoke('redeemReward',outsider,{record_id:grant.id,expected_version:grant.object_version,delivery:{...delivery,ends_at:delivery.starts_at}}),{code:'EXPOSURE_PERIOD_INVALID'});
   const redeem={record_id:grant.id,expected_version:grant.object_version,delivery,operation_key:key()};await db.withConnection(c=>c.query("CREATE TRIGGER champion_reward_fail BEFORE INSERT ON engagement_audit FOR EACH ROW BEGIN IF NEW.event_code='REWARD_REDEEMED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END"));
   try{await assert.rejects(invoke('redeemReward',outsider,redeem),e=>e.status===503);assert.equal((await legacy.read(reviewer.ctx,{record_id:grant.id})).current_status,'ISSUED');assert.deepEqual((await invoke('exposures',buyer,{city:'champion-city'})).items,[]);}finally{await db.withConnection(c=>c.query('DROP TRIGGER champion_reward_fail'));}
   grant=await invoke('redeemReward',outsider,redeem);assert.deepEqual(await invoke('redeemReward',outsider,redeem),grant);
   const exposure=(await invoke('exposures',buyer,{city:'champion-city'})).items;assert.equal(exposure.length,1);assert.equal(exposure[0].source,'EARNED_REWARD_NOT_PAID_AD');assert.equal(exposure[0].event_id,event.id);
   const response=await fetch(base+'/engagement/rewards/'+grant.id+'/file',{headers:{Authorization:'Bearer '+seller.token,'X-Acting-Party':seller.personal_party_id}});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.content_sha256);assert.equal(bytes.toString(),'synthetic champion exposure delivery proof');
   const outsiderResponse=await fetch(base+'/engagement/rewards/'+grant.id+'/file',{headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id}});assert.equal(outsiderResponse.status,404);await outsiderResponse.arrayBuffer();
   records.award_id=grant.id;records.score=event.data.result.scores[0];records.delivery_hash=proof.content_sha256;records.earned_exposure_only=true;
  });
  const out=path.resolve(__dirname,'../../../..','.local');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'championship-contract-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(out,'championship-contract-records.json'),JSON.stringify(records,null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();if(prior===undefined)delete process.env.RANKING_CONTRACT_POLICY;else process.env.RANKING_CONTRACT_POLICY=prior;}
});
