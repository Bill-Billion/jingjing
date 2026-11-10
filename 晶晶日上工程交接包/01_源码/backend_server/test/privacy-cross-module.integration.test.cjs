'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createRuleContent}=require('../src/modules/governance/content');

test('privacy restrictions protect commercial and release evidence across their original download routes',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name='jx_test_privacy_cross_'+randomBytes(6).toString('hex'),result={database:name,synthetic_only:true,requests:[],checks:[],cleanup:{}},control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer,producer,reviewer,outsider}=S.people;
  for(const u of [producer,reviewer])for(const action of ['PRIVACY_HANDLE','PRIVACY_REVIEW','GIG_REVIEW','PROJECT_REVIEW'])await S.grant(u,action);
  await S.grant(buyer,'PROJECT_REVIEW');
  let duringRead=null;
  const storageFactory=()=>({...S.storageFactory(),identity:{provider_code:'aliyun-oss',environment:'SANDBOX'},inspect:()=>({implemented:true,configured:true,config_revision:'synthetic-cross-module'}),async getBuffer(k){if(duringRead){const fn=duringRead;duringRead=null;await fn();}return S.files.get(k);},async eraseCurrent(k){S.files.delete(k);return {key:k,current_object_absent:true,scope:'CURRENT_OBJECT_ONLY'};}});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function raw(method,route,u,body,version,party=null,operation=key()){
   const response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)}});
   const value=(response.headers.get('content-type')||'').includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
   result.requests.push({method,route,status:response.status,...Buffer.isBuffer(value)?{sha256:createHash('sha256').update(value).digest('hex')}:value.error?{error:value.error.code}:{record_id:value.data?.id}});return {status:response.status,value};
  }
  async function call(...args){const r=await raw(...args);assert.equal(r.status,200,JSON.stringify(r.value));return r.value.data;}
  async function policy(rule_key,terms){const id=key(),content=createRuleContent({id,rule_key,version:id,terms});await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[id,rule_key,id,JSON.stringify(content),'2020-01-01 00:00:00',producer.account_id,'EFFECTIVE']);return id;}
  const retention=await policy('privacy.retention',{privacy_retention:{categories:[{scope:'TRANSACTIONS',basis:'Synthetic reviewed rule; no formal retention duration asserted',max_review_days:30}]}});
  const pol=await policy('privacy.execution',{privacy_execution:{actions:['RESTRICT_CONTENT','RELEASE_CONTENT','FILE_ERASURE'],basis:'Synthetic independently reviewed scope',contact_reference:'synthetic:contact',backup_strategy:'REAPPLY_ERASURE_REGISTER_BEFORE_ACCESS',retention_rule_id:retention}});
  async function request(type='COMPLAINT',scopes=['CONTENT']){return call('POST','/privacy/requests',buyer,{type,scopes,details:'Independent synthetic cross-module request'});}
  async function propose(r,action,target_id,operations=true){r=await call('GET','/privacy/requests/'+r.id,buyer);return call('POST','/privacy/'+(operations?'operations/':'')+'requests/'+r.id+'/executions',operations?producer:buyer,{action,target_id,policy_rule_id:pol,details:{reason:'Synthetic precise scope',...(action==='RESTRICT_CONTENT'?{target_kind:'ASSET'}:{})}},r.object_version);}
  async function approve(e){return call('POST','/privacy/operations/requests/'+e.request_id+'/executions/'+e.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent scope and retained obligations review',proposal_sha256:e.proposal_sha256,scope_verified:true,retention_verified:true},e.object_version);}
  async function execute(e,operations=true){return call('POST','/privacy/'+(operations?'operations/':'')+'requests/'+e.request_id+'/executions/'+e.id+'/execute',operations?producer:buyer,{confirmed:true},e.object_version);}
  async function restrict(asset){let r=await request();r=await call('POST','/privacy/operations/requests/'+r.id+'/start',producer,{},r.object_version);const e=await execute(await approve(await propose(r,'RESTRICT_CONTENT',asset.id)));return {request:r,execution:e};}
  async function release(h){return execute(await approve(await propose(h.request,'RELEASE_CONTENT',h.execution.result.restriction_id)));}
  let rule=await call('POST','/gigs/rules',producer,{rule:{version:'synthetic-cross-privacy',categories:[{code:'TEST',allowed:true,required_proofs:['AUTHORITY']}],ranking:{window_days:7,newcomer_days:30,minimum_orders:1,order_weight:10,net_minor_weight:0,newcomer_bonus:2},terms:'Synthetic only'}});
  rule=await call('POST','/gigs/records/'+rule.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Synthetic independent rule review',checks:null},rule.object_version);
  const gigProof=await S.upload(buyer,'RIGHTS_EVIDENCE'),channelProof=await S.upload(buyer,'RIGHTS_EVIDENCE');
  const gig=await call('POST','/gigs/requests',buyer,{title:'Synthetic commercial request',brief:'Only isolated evidence restriction test',category:'TEST',scope:{purpose:'COMMERCIAL',territory:'CN',valid_until:'2098-01-01T00:00:00.000Z'},rule_id:rule.id,proofs:[{code:'AUTHORITY',asset_id:gigProof.id}]},null,buyer.personal_party_id);
  const channel=await call('POST','/projects/channels',buyer,{name:'Synthetic release channel',channel_reference:'synthetic:no-real-submission',submission_requirements:'Synthetic no external service',evidence_asset_id:channelProof.id},null,buyer.personal_party_id);
  for(const [label,record,asset,prefix] of [['commercial-evidence',gig,gigProof,'gigs'],['release-channel-evidence',channel,channelProof,'projects']]){
   await t.test(label+' becomes unreadable after independently approved restriction and restores only after release',async()=>{
    const route='/'+prefix+'/records/'+record.id+'/evidence/'+asset.id;
    assert.equal((await raw('GET',route,outsider,undefined,null,outsider.personal_party_id)).status===200,false);
    const first=await raw('GET',route,buyer,undefined,null,buyer.personal_party_id);assert.equal(first.status,200);assert(Buffer.isBuffer(first.value));
    let hold;try{hold=await restrict(asset);const denied=await raw('GET',route,buyer,undefined,null,buyer.personal_party_id);result.checks.push({label,record_id:record.id,asset_id:asset.id,request_id:hold.request.id,expected_status:409,actual_status:denied.status});assert.equal(denied.status,409);assert.equal(denied.value.error.code,'CONTENT_RESTRICTED');}finally{if(hold)await release(hold);}
    const again=await raw('GET',route,buyer,undefined,null,buyer.personal_party_id);assert.equal(again.status,200);assert.deepEqual(again.value,first.value);
   });
   await t.test(label+' restriction appearing during storage transport blocks returning stale bytes',async()=>{
    const route='/'+prefix+'/records/'+record.id+'/evidence/'+asset.id;let hold;duringRead=async()=>{hold=await restrict(asset)};
    try{const denied=await raw('GET',route,buyer,undefined,null,buyer.personal_party_id);assert(hold);result.checks.push({label:label+'-during-read',record_id:record.id,asset_id:asset.id,expected_status:409,actual_status:denied.status});assert.equal(denied.status,409);assert.equal(denied.value.error.code,'CONTENT_RESTRICTED');}finally{duringRead=null;if(hold)await release(hold);}
   });
   await t.test(label+' releasing one of two independent restrictions cannot restore content',async()=>{
    const route='/'+prefix+'/records/'+record.id+'/evidence/'+asset.id,first=await restrict(asset),second=await restrict(asset);
    try{
     await release(first);const blocked=await raw('GET',route,buyer,undefined,null,buyer.personal_party_id);assert.equal(blocked.status,409);assert.equal(blocked.value.error.code,'CONTENT_RESTRICTED');
     const outsiderResult=await raw('GET',route,outsider,undefined,null,outsider.personal_party_id);assert.notEqual(outsiderResult.status,200);assert.notEqual(outsiderResult.value.error.code,'CONTENT_RESTRICTED');
     result.checks.push({label:label+'-release-one-of-two',record_id:record.id,asset_id:asset.id,request_ids:[first.request.id,second.request.id],expected_status:409,actual_status:blocked.status});
    }finally{await release(second);}
    assert.equal((await raw('GET',route,buyer,undefined,null,buyer.personal_party_id)).status,200);
   });
   await t.test(label+' losing operator access during storage transport cannot return content',async()=>{
    const route='/'+prefix+'/records/'+record.id+'/evidence/'+asset.id,action=prefix==='gigs'?'GIG_REVIEW':'PROJECT_REVIEW';
    assert.equal((await raw('GET',route,reviewer)).status,200);
    async function grant(enabled){const row=(await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[reviewer.account_id,action]))[0][0];await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action,enabled,expires_at:null,expected_version:row.object_version,authority_ref:'synthetic:transport-revocation',reason:'isolated test'});}
    duringRead=()=>grant(false);
    try{const denied=await raw('GET',route,reviewer);assert.equal(denied.status,403);result.checks.push({label:label+'-revoked-during-read',record_id:record.id,expected_status:403,actual_status:denied.status});}finally{duringRead=null;await grant(true);}
   });
  }
  await t.test('approved raw-material erasure rechecks a new live avatar reference and keeps stored bytes',async()=>{
   const material=await S.upload(buyer,'AVATAR_MATERIAL'),r=await request('DELETE',['ARTIST_MATERIALS']);let e=await approve(await propose(r,'FILE_ERASURE',material.id,false));
   const avatar=await call('POST','/supply/avatars',buyer,{display_name:'Synthetic avatar added after review',material_asset_ids:[material.id]},null,buyer.personal_party_id);
   const denied=await raw('POST','/privacy/requests/'+r.id+'/executions/'+e.id+'/execute',buyer,{confirmed:true},e.object_version);assert.equal(denied.status,409);assert.equal(denied.value.error.code,'PRIVACY_FILE_RETENTION_REVIEW_REQUIRED');
   const list=await call('GET','/privacy/requests/'+r.id+'/file-options?kind=FILE&limit=100',buyer),entry=list.items.find(x=>x.id===material.id);assert.equal(entry.disposition,'DEPENDENCY_REVIEW');assert(entry.dependencies.some(x=>x.code==='SUPPLY_ARCHIVE'));
   assert.equal((await raw('GET','/privacy/requests/'+r.id+'/files/'+material.id+'/content',buyer)).status,200);
   result.checks.push({label:'new-avatar-reference-after-review',request_id:r.id,asset_id:material.id,avatar_id:avatar.id,status:denied.status,disposition:entry.disposition});
  });
  await t.test('personal original copy cannot bypass restrictions or grant handlers raw evidence access',async()=>{
   const material=await S.upload(buyer,'AVATAR_MATERIAL'),content=await S.upload(buyer,'WORK_CONTENT'),r=await request('COPY',['ALL']);
   for(const [asset,category] of [[material,'ARTIST_MATERIALS'],[content,'CONTENT']]){
    const route='/privacy/requests/'+r.id+'/copies/'+asset.id+'/content?category='+category;
    const before=await raw('GET',route,buyer);assert.equal(before.status,200);assert(Buffer.isBuffer(before.value));
    assert.equal((await raw('GET',route,producer)).status,404);
    const hold=await restrict(asset);
    try{const blocked=await raw('GET',route,buyer);assert.equal(blocked.status,409);assert.equal(blocked.value.error.code,'CONTENT_RESTRICTED');}
    finally{await release(hold);}
    let raced;duringRead=async()=>{raced=await restrict(asset);};
    try{const blocked=await raw('GET',route,buyer);assert(raced);assert.equal(blocked.status,409);assert.equal(blocked.value.error.code,'CONTENT_RESTRICTED');}
    finally{duringRead=null;if(raced)await release(raced);}
    const restored=await raw('GET',route,buyer);assert.equal(restored.status,200);assert.deepEqual(restored.value,before.value);
    result.checks.push({label:'personal-original-'+category,request_id:r.id,asset_id:asset.id,owner_sha256:createHash('sha256').update(before.value).digest('hex'),handler_status:404,restricted_status:409,race_status:409,restored_status:200});
   }
   assert.equal((await call('GET','/privacy/requests/'+r.id,buyer)).current_status,'RECEIVED');
  });
  await t.test('revoked handling permission cannot execute an approved restriction',async()=>{
   const material=await S.upload(buyer,'AVATAR_MATERIAL'),r=await request(),e=await approve(await propose(r,'RESTRICT_CONTENT',material.id));
   const grant=(await db.execute("SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code='PRIVACY_HANDLE'",[producer.account_id]))[0][0];
   await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:producer.account_id,action:'PRIVACY_HANDLE',enabled:false,expires_at:null,expected_version:grant.object_version,authority_ref:'synthetic:revocation',reason:'isolated test'});
   const response=await raw('POST','/privacy/operations/requests/'+r.id+'/executions/'+e.id+'/execute',producer,{confirmed:true},e.object_version);assert.equal(response.status,403);
   result.checks.push({label:'revoked-handler',request_id:r.id,expected_status:403,actual_status:response.status});
  });
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db?.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();result.cleanup={database_removed:true,services_stopped:true};
  if(process.env.JX_PRIVACY_CROSS_EVIDENCE){const target=path.resolve(process.env.JX_PRIVACY_CROSS_EVIDENCE);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,JSON.stringify(result,null,2));}
 }
});
