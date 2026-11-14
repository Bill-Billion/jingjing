 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content'),A=require('../src/modules/artists/context'),C=require('../src/modules/engagement/context');
test('candidate withdrawal must not prevent an independent rejection',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');const name='jx_test_candidate_exit_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);const S=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,buyer2,reviewer,outsider}=S,R=new Proxy({}, {get:(_,method)=>(ctx,input)=>invoke(method,ctx,input)}),W=require('../src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
 for(const u of [outsider,reviewer])for(const action of ['ENGAGEMENT_REVIEW','WALLET_RULE_REVIEW'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:r9',reason:'isolated fixture only'});
 const descriptors=require('../src/http/engagement-routes'),fixtures=[];
 let duringFileRead=null;const storageFactory=()=>{const x=S.storageFactory();return {...x,getBuffer:async k=>{const b=await x.getBuffer(k);if(duringFileRead)await duringFileRead();return b;}}};
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 async function invoke(method,ctx,input){const post=descriptors.posts.find(x=>x[1]===method),get=descriptors.gets.find(x=>x[1]===method);if(!post&&!get)return require('../src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal})[method](ctx,input);const d=post||get,u=S.users.find(x=>x.ctx===ctx);assert.ok(u);let route='/engagement'+d[0].replace(':record_id',input.record_id||'');const body=Object.fromEntries(d[2].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])),headers={Authorization:'Bearer '+u.token,...input.party_id?{'X-Acting-Party':input.party_id}:{},...post?{'Content-Type':'application/json','Idempotency-Key':input.operation_key}:{},...d[4]?{'If-Match':'"'+input.expected_version+'"'}:{}};if(get&&Object.keys(body).length)route+='?'+new URLSearchParams(body);const response=await fetch(base+route,{method:post?'POST':'GET',headers,...post?{body:JSON.stringify(body)}:{}}),json=await response.json();fixtures.push({method:post?'POST':'GET',path:base?new URL(base+route).pathname:'',schema:response.status===200?'EngagementResponse':'ErrorResponse',value:json});if(response.status!==200)throw Object.assign(new Error(json.error?.code||JSON.stringify(json)),{code:json.error?.code,status:response.status});return json.data;}
 const write=(fn,u,i)=>R[fn](u.ctx,{...i,operation_key:key()}),review=(fn,r,u=reviewer)=>write(fn,u,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'independent synthetic review'});
 async function patch(table,r,change){const raw=(await db.execute('SELECT * FROM '+table+' WHERE id=?',[r.id]))[0][0],data={...A.parse(raw.data_json),...change};await db.execute('UPDATE '+table+' SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),r.id]);return table==='engagement_records'?db.withTransaction(tx=>C.load(tx,r.id)):null;}

 let rule=await review('reviewRule',await write('createRule',outsider,{rule:require('./helpers/engagement-rule.cjs')}));
 const input={party_id:seller.personal_party_id,person_id:seller.person.id,city:'candidate-city',district:'synthetic',category:'synthetic'};
 let profile=await write('rankingProfile',seller,{...input,opt_in:true});
 profile=await patch('engagement_records',profile,{registered_at:'2020-01-01T00:00:00.000Z'});
 const snapshot=await write('rankingSnapshot',reviewer,{rule_id:rule.id,city:input.city,district:input.district,category:input.category});
 const proof=await S.supply.upload(outsider.ctx,{party_id:outsider.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic candidate selection inventory'),operation_key:key()});
 const stock=await review('reviewRewardStock',await write('rewardStock',outsider,{party_id:outsider.personal_party_id,title:'synthetic certificate',kind:'CERTIFICATE',terms:'synthetic only',capacity:10,valid_until:'2099-01-01T00:00:00.000Z',evidence_asset_ids:[proof.id]}));
 await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:seller.account_id,action:'ENGAGEMENT_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:candidate-self-check',reason:'isolated only'});
 const events=[];
 async function candidate(){
  const event=await review('reviewCompetition',await write('competition',outsider,{title:'synthetic pending nomination',snapshot_id:snapshot.id,reward_stock_id:stock.id,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),appeal_until:new Date(Date.now()+2*86400000).toISOString(),rules:{official_bps:6000,ranking_bps:2000,vote_bps:2000,vote_cost:2,daily_cap:2,tie_mode:'MANUAL_REVIEW',void_point_policy:'HOLD_FOR_APPEAL'}}));
  const nomination=await write('nominate',seller,{party_id:seller.personal_party_id,event_id:event.id,profile_id:profile.id});return {event,nomination};
 }
 async function reject(c){
  await assert.rejects(review('reviewCandidate',c.nomination),{code:'PUBLIC_ARTIST_NOT_AVAILABLE'});
  const i={record_id:c.nomination.id,expected_version:c.nomination.object_version,decision:'REJECT',reason:'independent rejection of withdrawn candidate',operation_key:key()};
  await assert.rejects(R.reviewCandidate(seller.ctx,i),{code:'SELF_REVIEW_FORBIDDEN'});
  await assert.rejects(R.reviewCandidate(buyer.ctx,i),{code:'ENGAGEMENT_OPERATOR_FORBIDDEN'});
  await assert.rejects(R.reviewCandidate(reviewer.ctx,{...i,expected_version:i.expected_version+1}),{code:'VERSION_CONFLICT'});
  const r=await R.reviewCandidate(reviewer.ctx,i);assert.equal(r.current_status,'REJECTED');assert.equal((await R.reviewCandidate(reviewer.ctx,i)).object_version,r.object_version);
  assert.equal((await R.competitionResult(buyer.ctx,{record_id:c.event.id})).candidates.length,0);
  assert.equal((await db.withTransaction(tx=>C.load(tx,c.event.id))).content_sha256,c.event.content_sha256);
  events.push({event_id:c.event.id,candidate_id:c.nomination.id,status:r.current_status});
 }
 await t.test('opt-out still permits independent rejection while approval remains blocked',async()=>{
  const c=await candidate();profile=await write('rankingProfile',seller,{...input,opt_in:false});
  try{await reject(c);}finally{profile=await write('rankingProfile',seller,{...input,opt_in:true});}
 });
 await t.test('operator content exclusion cannot strand an unreviewed nomination',async()=>{
  const c=await candidate();profile=await write('moderate',reviewer,{record_id:profile.id,expected_version:profile.object_version,exclude:true,reason:'synthetic separate public restriction'});
  try{await reject(c);}finally{profile=await write('moderate',reviewer,{record_id:profile.id,expected_version:profile.object_version,exclude:false,reason:'synthetic restriction lifted'});}
 });

 await t.test('earned certificate file checks current restriction before and after private byte retrieval',async()=>{
  const c=await candidate();let nomination=await review('reviewCandidate',c.nomination);
  await write('judge',reviewer,{candidate_id:nomination.id,realism:90,fit:90,completeness:90,reason:'synthetic score'});
  let event=await patch('engagement_records',c.event,{ends_at:'2020-01-01T00:00:00.000Z',appeal_until:'2020-01-02T00:00:00.000Z'});
  event=await write('finalize',reviewer,{record_id:event.id,expected_version:event.object_version});
  let award=(await R.myRewards(seller.ctx,{party_id:seller.personal_party_id})).items.find(x=>x.parent_id===event.id);
  award=await write('redeemReward',outsider,{record_id:award.id,expected_version:award.object_version,delivery:{evidence_asset_id:proof.id,reference:'synthetic certificate',starts_at:null,ends_at:null,placement:null}});
  const route='/engagement/rewards/'+award.id+'/file';
  async function file(u=seller){
   const r=await fetch(base+route,{headers:{Authorization:'Bearer '+u.token,'X-Acting-Party':u.personal_party_id}});
   const body=await r.text();if(r.headers.get('content-type')?.includes('json'))fixtures.push({method:'GET',path:new URL(base+route).pathname,schema:'ErrorResponse',value:JSON.parse(body)});
   return {status:r.status,body};
  }
  assert.equal((await file()).status,200);assert.equal((await file(buyer)).status,404);
  const requestId=key(),executionId=key(),restrictionId=key(),empty=JSON.stringify({});
  await db.execute('INSERT INTO privacy_requests(id,account_id,request_json,request_sha256,response_due_on) VALUES (?,?,?,?,?)',[requestId,outsider.account_id,empty,digest({}),'2099-01-01']);
  await db.execute("INSERT INTO privacy_executions(id,request_id,action_code,target_id,proposed_by,current_status,payload_json,payload_sha256) VALUES (?,?,?,?,?,'EXECUTED',?,?)",[executionId,requestId,'RESTRICT_CONTENT',proof.id,outsider.account_id,empty,digest({})]);
  await db.execute("INSERT INTO content_restrictions(id,target_kind,target_id,execution_id) VALUES (?,'ASSET',?,?)",[restrictionId,proof.id,executionId]);
  assert.equal((await file()).status,409);
  await db.execute("UPDATE content_restrictions SET current_status='RELEASED' WHERE id=?",[restrictionId]);assert.equal((await file()).status,200);
  duringFileRead=()=>db.execute("UPDATE content_restrictions SET current_status='ACTIVE' WHERE id=?",[restrictionId]);
  try{assert.equal((await file()).status,409);}finally{duringFileRead=null;}
  assert.equal((await db.withTransaction(tx=>C.load(tx,award.id))).content_sha256,award.content_sha256);
  events.push({event_id:event.id,award_id:award.id,restriction_id:restrictionId,restriction_checked_before_and_after_bytes:true,award_unchanged:true});
 });

 await t.test('rejection retains the existing review deadline and cannot change an already approved candidate',async()=>{
  const c=await candidate();let r=await review('reviewCandidate',c.nomination);
  await assert.rejects(R.reviewCandidate(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'REJECT',reason:'must not invent post-approval cancellation',operation_key:key()}),{code:'REVIEW_NOT_PENDING'});
  const closed=await candidate();await patch('engagement_records',closed.event,{ends_at:'2020-01-01T00:00:00.000Z'});
  await assert.rejects(R.reviewCandidate(reviewer.ctx,{record_id:closed.nomination.id,expected_version:closed.nomination.object_version,decision:'REJECT',reason:'existing review deadline retained',operation_key:key()}),{code:'REVIEW_NOT_PENDING'});
 });
 await t.test('withdrawn public consent still permits rejection without restoring public rights',async()=>{
  const c=await candidate();await S.artists.withdraw(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,record_id:S.consent.id,expected_version:S.consent.object_version,reason:'synthetic withdrawal',operation_key:key()});await reject(c);
  assert.equal((await R.myProfiles(seller.ctx,{party_id:seller.personal_party_id})).items.length,0);
 });
 const out=path.resolve(__dirname,'../../../../.local');
 await fs.writeFile(path.join(out,'candidate-withdrawal-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 await fs.writeFile(path.join(out,'candidate-withdrawal-journey.json'),JSON.stringify({synthetic_only:true,events,limits:'isolated loopback HTTP; pending nominations only, no change to approved candidates or final winners; no frontend'},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
