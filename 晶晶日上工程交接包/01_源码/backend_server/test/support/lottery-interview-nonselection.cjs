'use strict';
const assert=require('node:assert/strict'),{randomUUID:key,createHash}=require('node:crypto');
module.exports=async({t,db,S,W,wr,request,config,review,draw,ageNotice,evidence})=>{
 const {producer,reviewer,outsider}=S.people,{digest}=require('../../src/modules/governance/content'),C=require('../../src/modules/redemption/context');
 await S.actorCast(outsider); // Independent reviewer is also a verified adult for the cross-owner request check.
 const readSchedule=id=>db.withTransaction(tx=>C.load(tx,id,'SCHEDULE'));
 async function winningInterview({noAvatar=false}={}){
  const who=await S.registerActor('synthetic nonselected winner');let performer;
  if(noAvatar){
   const repo=require('../../src/modules/artists/repository').createArtistRepository(db,{resolvePrincipal:S.resolvePrincipal});
   const person=await repo.createPerson(who.ctx,{party_id:who.personal_party_id,display_name:'synthetic verified person without avatar',operation_key:key()});
   const identity=await repo.prepareIdentity(who.ctx,{party_id:who.personal_party_id,person_id:person.id,session_ref:'synthetic:'+key(),operation_key:key()});
   await repo.applyIdentity(identity.id,{request_key:identity.data.request_key,person_id:person.id,status:'VERIFIED',issuer:'synthetic-provider',subject_fingerprint:createHash('sha256').update(who.account_id).digest('hex'),age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:identity',liveness_verified:true,phone_verified:true});
   performer={repo,person};assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM artist_avatar_links WHERE person_id=?',[person.id]))[0][0].n),0);
  }else performer=await S.actorCast(who);
  await W.open(who.ctx,{party_id:who.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});
  const template={version:'synthetic-nonselected',source_ref:'synthetic-only',title:'synthetic interview remedy',kind:'INTERVIEW',valid_days:90,exchange_points:null,capacity:10,available_until:'2099-01-01T00:00:00.000Z',terms:'synthetic one extension or original 600 point fallback; not a public promise',production:null,interview:{channel:'OPEN',project_ref:'synthetic-project',batch_ref:'synthetic-batch',min_halo:1,purpose:'PRIVATE',territory:'CN',extension_days:30,fallback_points:600},exposure:null};
  let stock=await request('/redemption/stock',producer,{body:{template,evidence_asset_ids:[evidence.id]}});
  stock=await request('/redemption/stock/'+stock.id+'/review',reviewer,{party:false,version:stock.object_version,body:{decision:'APPROVE',reason:'synthetic independent stock'}});
  let pool=await request('/redemption/pools',producer,{body:{config:config([{key:'interview',kind:'INTERVIEW_OPEN',weight:10000,estimated_cost_minor:100}]),bindings:[{key:'interview',stock_id:stock.id,point_back:0}],starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2099-01-01T00:00:00.000Z',terms:'synthetic deterministic interview fixture',cost_limit_single_minor:100,cost_limit_ten_minor:1000,evidence_asset_ids:[evidence.id]}});
  pool=await review(pool,reviewer,'RULES');pool=await review(pool,outsider,'FINANCE');pool=await ageNotice(pool);
  const operation=key(),risk=require('../../src/modules/wallet/risk').createConsumerRisk(db,{resolvePrincipal:S.resolvePrincipal}),target={kind:'LOTTERY',pool_id:pool.id,count:1,request_key:operation};
  const preview=await risk.preview(who.ctx,{party_id:who.personal_party_id,target});await risk.confirm(who.ctx,{party_id:who.personal_party_id,target,preview_sha256:preview.preview_sha256,read_confirmed:true,operation_key:key()});
  const result=await draw(pool,1,operation,who),grantId=result.data.results[0].grant_id;
  const get=()=>request('/redemption/grants/'+grantId,who),open=(g,op=key(),actor=who)=>request('/redemption/grants/'+grantId+'/remedies',actor,{version:g.object_version,operation:op,body:{reason:'synthetic interview not selected'}});
  const resolve=(r,decision,op=key(),actor=reviewer)=>request('/redemption/remedies/'+r.id+'/review',actor,{party:false,version:r.object_version,operation:op,body:{decision,reason:'synthetic original promise remedy',evidence_asset_id:evidence.id}});
  if(!noAvatar){
  const ownProof=await S.upload(who,'CONSENT_EVIDENCE'); // Reviewer grant is already established by the preceding interview fixture.
  let halo=await performer.repo.requestHalo(who.ctx,{party_id:who.personal_party_id,person_id:performer.person.id,level:1,ownership_promise:true,evidence_asset_ids:[ownProof.id],service_id:null,operation_key:key()});
  await performer.repo.review(reviewer.ctx,{person_id:performer.person.id,record_id:halo.id,expected_version:halo.object_version,decision:'APPROVE',reason:'synthetic independent halo',operation_key:key()});
  let g=await get();g=await request('/redemption/grants/'+grantId+'/bind',who,{version:g.object_version,body:{person_id:performer.person.id,avatar_id:performer.avatar.id,cast:performer.roster.cast[0],profile_id:null}});
  }
  async function finish(outcome='NOT_SELECTED'){
   let current=await get();await request('/redemption/grants/'+grantId+'/evidence-submissions',producer,{version:current.object_version,body:{asset_id:evidence.id,purpose:'SCHEDULE'}});
   const s=await request('/redemption/grants/'+grantId+'/deliveries',outsider,{party:false,version:current.object_version,body:{starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+7200000).toISOString(),reference:'synthetic interview batch',evidence_asset_id:evidence.id}});
   await request('/redemption/deliveries/'+s.id+'/review',reviewer,{party:false,version:s.object_version,body:{decision:'APPROVE',reason:'synthetic independent appointment'}});
   current=await get();current=await request('/redemption/grants/'+grantId+'/confirmation',who,{version:current.object_version,body:{accepted:true}});
   // Advance only the isolated grant's delivery times; no real elapsed interview or production clock bypass.
   const data={...current.data,delivery:{...current.data.delivery,starts_at:new Date(Date.now()-7200000).toISOString(),ends_at:new Date(Date.now()-3600000).toISOString()}};
   await db.execute('UPDATE redemption_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),grantId]);current=await get();
   await request('/redemption/grants/'+grantId+'/evidence-submissions',producer,{version:current.object_version,body:{asset_id:evidence.id,purpose:'COMPLETION'}});
   const completed=await request('/redemption/grants/'+grantId+'/finish',reviewer,{party:false,version:current.object_version,body:{outcome,reason:'synthetic result; no role contract',evidence_asset_id:evidence.id}});
   assert.equal(completed.data.performance_rights_granted,false);return {completed,schedule:await readSchedule(s.id)};
  }
  async function unchangedDraw(){assert.deepEqual(await draw(pool,1,operation,who),result);const stake=await db.withTransaction(tx=>require('../../src/modules/wallet/context').load(tx,result.data.hold_id,'POINT_HOLD'));assert.equal(stake.current_status,'SPENT');assert.equal(stake.data.points,300);}
  return {who,performer,grantId,get,open,resolve,finish,unchangedDraw};
 }
 await t.test('actual winning interview not selected can receive one reviewed fallback without redrawing or cancelling the completed appointment',async()=>{
  const x=await winningInterview(),{completed,schedule}=await x.finish(),before=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id});
  const rejected=await x.open(completed);await assert.rejects(x.resolve(rejected,'RETURN_POINTS',key(),producer),{code:'SELF_REVIEW_FORBIDDEN'});await x.resolve(rejected,'REJECT');assert.deepEqual((await x.get()).data.delivery,completed.data.delivery);
  const g=await x.get(),operation=key(),r=await x.open(g,operation);assert.equal((await x.open(g,operation)).id,r.id);assert.deepEqual(r.data.completed_delivery,completed.data.delivery);
  await assert.rejects(x.open(g,key(),outsider),{code:'REDEMPTION_NOT_FOUND'});
  const reviewKey=key();await x.resolve(r,'RETURN_POINTS',reviewKey);await x.resolve(r,'RETURN_POINTS',reviewKey);
  const after=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id});assert.equal(after.available_points-before.available_points,600);assert.equal(after.qualifying_growth,before.qualifying_growth);
  const final=await x.get();assert.equal(final.current_status,'POINTS_RETURNED');await assert.rejects(x.open(final),{code:'REWARD_REMEDY_NOT_AVAILABLE'});assert.deepEqual(await readSchedule(schedule.id),schedule);await x.unchangedDraw();
 });
 await t.test('not-selected interview can extend once, preserve the first attempt, and resolve a second unsuccessful attempt on the same grant',async()=>{
  const x=await winningInterview(),first=await x.finish(),r=await x.open(first.completed),reviewKey=key();await x.resolve(r,'EXTEND_ONCE',reviewKey);await x.resolve(r,'EXTEND_ONCE',reviewKey);
  const extended=await x.get();assert.equal(extended.current_status,'BOUND');assert.equal(extended.data.extension_used,true);assert.equal(extended.data.delivery,null);assert.equal(Date.parse(extended.data.expires_at)-Date.parse(first.completed.data.expires_at),30*86400000);
  const saved=await db.withTransaction(tx=>C.load(tx,r.id,'REMEDY'));assert.deepEqual(saved.data.completed_delivery,first.completed.data.delivery);assert.deepEqual(await readSchedule(first.schedule.id),first.schedule);
  const second=await x.finish(),again=await x.open(second.completed);assert.notEqual(second.schedule.id,first.schedule.id);assert.deepEqual(again.data.completed_delivery,second.completed.data.delivery);
  await assert.rejects(x.resolve(again,'EXTEND_ONCE'),{code:'REWARD_EXTENSION_NOT_AVAILABLE'});await x.resolve(again,'RETURN_POINTS');assert.deepEqual(await readSchedule(first.schedule.id),first.schedule);assert.deepEqual(await readSchedule(second.schedule.id),second.schedule);await x.unchangedDraw();
 });
 await t.test('completed interview without an explicit not-selected result stays ineligible for this remedy',async()=>{
  const x=await winningInterview(),{completed,schedule}=await x.finish('INTERVIEWED');await assert.rejects(x.open(completed),{code:'REWARD_REMEDY_NOT_AVAILABLE'});assert.deepEqual(await readSchedule(schedule.id),schedule);await x.unchangedDraw();
 });
 await t.test('verified winner without any avatar cannot bind invented material but can extend and receive the original fallback on the same draw',async()=>{
  const x=await winningInterview({noAvatar:true}),g=await x.get(),avatarId=key();assert.equal(g.current_status,'AVAILABLE');assert.equal(g.data.binding,null);
  await assert.rejects(request('/redemption/grants/'+g.id+'/bind',x.who,{version:g.object_version,body:{person_id:x.performer.person.id,avatar_id:avatarId,cast:{person_id:x.performer.person.id,avatar_id:avatarId,supply_consent_id:key(),artist_consent_ids:[key()],look_version_id:key(),voice_version_id:null,usage:'EXISTING_MATERIAL'},profile_id:null}}),{code:'ARTIST_AVATAR_NOT_FOUND'});
  assert.deepEqual(await x.get(),g);const first=await x.open(g);await x.resolve(first,'EXTEND_ONCE');const extended=await x.get();assert.equal(extended.current_status,'AVAILABLE');assert.equal(extended.data.binding,null);assert.equal(Date.parse(extended.data.expires_at)-Date.parse(g.data.expires_at),30*86400000);
  const r=await x.open(extended),before=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id}),operation=key();await assert.rejects(x.resolve(r,'EXTEND_ONCE'),{code:'REWARD_EXTENSION_NOT_AVAILABLE'});await x.resolve(r,'RETURN_POINTS',operation);await x.resolve(r,'RETURN_POINTS',operation);
  const after=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id});assert.equal(after.available_points-before.available_points,600);assert.equal(after.qualifying_growth,before.qualifying_growth);assert.equal((await x.get()).current_status,'POINTS_RETURNED');await x.unchangedDraw();
  assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM artist_avatar_links WHERE person_id=?',[x.performer.person.id]))[0][0].n),0);
 });
 await t.test('unbound winning remedy can finish after prize expiry but revoked reviewer cannot execute or replay its result',async()=>{
  const x=await winningInterview({noAvatar:true}),g=await x.get(),r=await x.open(g),auditor=await S.registerActor('synthetic revocable prize reviewer');
  const access=require('../../src/modules/governance/operator-access'),initial=await S.grant(auditor,'REDEMPTION_REVIEW');let version=initial.object_version;
  const set=async enabled=>{const next=await access.maintainOperatorGrant(db,{account_id:auditor.account_id,action:'REDEMPTION_REVIEW',enabled,expected_version:version,expires_at:null,authority_ref:'synthetic:reviewer-revocation',reason:'isolated permission recovery'});version=next.object_version;};
  const A=require('../../src/modules/artists/context'),previous=A.now;A.now=async()=>new Date(Date.now()+91*86400000).toISOString();
  try{
   const before=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id}),operation=key();assert.ok(Date.parse(g.data.expires_at)<Date.parse(await A.now()));await set(false);
   await assert.rejects(x.resolve(r,'RETURN_POINTS',operation,auditor),{code:'REDEMPTION_OPERATOR_FORBIDDEN'});assert.equal((await x.get()).current_status,'REMEDY_PENDING');assert.equal((await W.summary(x.who.ctx,{party_id:x.who.personal_party_id})).available_points,before.available_points);
   await set(true);const resolved=await x.resolve(r,'RETURN_POINTS',operation,auditor);const after=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id});assert.equal(after.available_points-before.available_points,600);
   await set(false);await assert.rejects(x.resolve(r,'RETURN_POINTS',operation,auditor),{code:'REDEMPTION_OPERATOR_FORBIDDEN'});
   await set(true);assert.deepEqual(await x.resolve(r,'RETURN_POINTS',operation,auditor),resolved);assert.equal((await W.summary(x.who.ctx,{party_id:x.who.personal_party_id})).available_points,after.available_points);assert.equal((await x.get()).data.expires_at,g.data.expires_at);await x.unchangedDraw();
  }finally{A.now=previous;}
 });
 await t.test('same drawn interview with withdrawn production consent blocks use but keeps the independently reviewed remedy available',async()=>{
  const x=await winningInterview(),g=await x.get();const p=x.performer;
  await p.repo.withdraw(x.who.ctx,{party_id:x.who.personal_party_id,person_id:p.person.id,record_id:p.production.id,expected_version:p.production.object_version,reason:'synthetic owner withdraws further use',operation_key:key()});
  await request('/redemption/grants/'+g.id+'/evidence-submissions',producer,{version:g.object_version,body:{asset_id:evidence.id,purpose:'SCHEDULE'}});
  await assert.rejects(request('/redemption/grants/'+g.id+'/deliveries',outsider,{party:false,version:g.object_version,body:{starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+7200000).toISOString(),reference:'must not schedule withdrawn consent',evidence_asset_id:evidence.id}}),{code:'ARTIST_CONSENT_REQUIRED'});
  const before=await W.summary(x.who.ctx,{party_id:x.who.personal_party_id}),r=await x.open(g),operation=key();await x.resolve(r,'RETURN_POINTS',operation);await x.resolve(r,'RETURN_POINTS',operation);assert.equal((await W.summary(x.who.ctx,{party_id:x.who.personal_party_id})).available_points-before.available_points,600);
  const final=await x.get();assert.equal(final.current_status,'POINTS_RETURNED');assert.equal(final.data.performance_rights_granted,false);assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM redemption_records WHERE kind='SCHEDULE' AND parent_id=?",[g.id]))[0][0].n),0);await x.unchangedDraw();
 });
};
