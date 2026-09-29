'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository');
const {createAuthRepository}=require('../src/modules/auth/repository');
const {createGovernanceRepository}=require('../src/modules/governance/repository');
const {createGovernanceService}=require('../src/modules/governance/service');
const {createBusinessGate}=require('../src/modules/governance/business-gate');
const {createReadinessRepository}=require('../src/modules/providers/readiness');
const {maintainOperatorGrant,actions}=require('../src/modules/governance/operator-access');
const {main:commandMain}=require('../scripts/governance-command');
const {createAccountApi}=require('../src/http/account-api');
test('reviewed contract sources and business service checks use real isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const contexts=new Map(),resolvePrincipal=async ctx=>contexts.get(ctx),party=createPartyRepository(db,{resolvePrincipal});
  const people=[],secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret});
  for(const label of ['recorder','reader','outsider']){
   const ctx={};contexts.set(ctx,{subject_ref:'synthetic:'+key()});
   const person={ctx,...await party.registerAccount(ctx,{display_name:label}),token:randomBytes(32).toString('base64url')};people.push(person);
   await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',person.token),person.account_id]);
  }
  const [operator,reader,outsider]=people;
  for(const action of actions)await maintainOperatorGrant(db,{account_id:operator.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:approval',reason:'仅隔离测试，不配置真实人员'});
  const service=createGovernanceService({db,secret,environment:'SANDBOX'}),repo=createGovernanceRepository(db,{resolvePrincipal});
  const execute=(command,input,person=operator)=>service.execute(person.token,{command,input});
  async function effective(){
   let row=await execute('create_rule',{rule_key:'synthetic:'+key(),version:'v1',terms:{notice:'合成条款，无正式价格'},effective_at:'2026-01-01T00:00:00.000Z',operation_key:key()});
   for(const target_status of ['IN_REVIEW','APPROVED','EFFECTIVE'])row=await execute('transition_rule',{rule_id:row.content.id,target_status,expected_version:row.object_version,operation_key:key()});
   return row;
  }
  const rule=await effective();
  function sourceInput(){return {content:{business_ref:'synthetic:'+key(),revision:'v1',party_ids:[operator.personal_party_id,reader.personal_party_id],rule_ids:[rule.content.id],reader_account_ids:[operator.account_id,reader.account_id],commitments:{notice:'原承诺，不是正式商业规则'}},operation_key:key()};}
  const review=row=>execute('transition_source',{source_ref:row.source_ref,target_status:'REVIEWED',expected_version:row.object_version,review_ref:'synthetic:review',operation_key:key()});
  const seal=row=>execute('seal',{source_ref:row.source_ref,operation_key:key()});
  let saved;
  await t.test('valid login alone cannot record, review or seal; request principals cannot be forged',async()=>{
   await assert.rejects(execute('create_source',sourceInput(),outsider),{code:'GOVERNANCE_FORBIDDEN'});
   await assert.rejects(service.execute(randomBytes(32).toString('base64url'),{command:'create_source',input:sourceInput()}));
   await assert.rejects(service.execute(operator.token,{command:'create_source',input:sourceInput(),role:'admin'}),{code:'INVALID_INPUT'});
   await assert.rejects(execute('transition_source',{source_ref:'missing',target_status:'REVIEWED',expected_version:1,review_ref:'fake',operation_key:key()},outsider),{code:'GOVERNANCE_FORBIDDEN'});
  });
  await t.test('draft source requires an explicit review; immutable content then becomes an unsigned snapshot',async()=>{
   const draft=await execute('create_source',sourceInput());
   await assert.rejects(seal(draft),{code:'COMMITMENT_NOT_READY'});
   await review(draft);saved=await seal(draft);
   assert.equal(saved.signing_method,'NOT_SIGNED');assert.equal(saved.contract_version_id,draft.contract_version_id);
   assert.deepEqual(saved.commitments,draft.content.commitments);
   assert.deepEqual(await execute('read_snapshot',{snapshot_id:saved.id,party_id:reader.personal_party_id},reader),saved);
  });
  await t.test('a revised promise creates a new version and cannot replace old source or snapshot',async()=>{
   const input=sourceInput(),old=await execute('create_source',input);await review(old);const first=await seal(old);
   await assert.rejects(execute('create_source',{...input,operation_key:key(),content:{...input.content,commitments:{changed:true}}}),{code:'SOURCE_VERSION_EXISTS'});
   const next=await execute('create_source',{...input,operation_key:key(),content:{...input.content,revision:'v2',commitments:{changed:true}}});await review(next);
   assert.notEqual((await seal(next)).id,first.id);
   assert.deepEqual(await execute('read_snapshot',{snapshot_id:first.id,party_id:reader.personal_party_id},reader),first);
  });
  await t.test('retries and concurrent reviews produce one source and one accepted version',async()=>{
   const input=sourceInput(),rows=await Promise.all([execute('create_source',input),execute('create_source',input)]);assert.deepEqual(rows[0],rows[1]);
   const changes=await Promise.allSettled([review(rows[0]),review(rows[0])]);
   assert.equal(changes.filter(v=>v.status==='fulfilled').length,1);assert.equal(changes.find(v=>v.status==='rejected').reason.code,'VERSION_CONFLICT');
   const snapshots=await Promise.all([seal(rows[0]),seal(rows[0])]);assert.deepEqual(snapshots[0],snapshots[1]);
  });
  await t.test('unrelated readers, missing rules and unknown terms are not silently accepted',async()=>{
   const input=sourceInput();
   await assert.rejects(execute('create_source',{...input,content:{...input.content,reader_account_ids:[operator.account_id,outsider.account_id]}}),{code:'READER_NOT_A_PARTY'});
   await assert.rejects(execute('create_source',{...input,content:{...input.content,rule_ids:[key()]}}),{code:'RULE_NOT_FOUND'});
   await assert.rejects(execute('create_source',{...input,content:{...input.content,commitments:{}}}),{code:'MISSING_TERMS'});
   await assert.rejects(execute('create_source',{...input,content:{...input.content,approved:true}}),{code:'INVALID_INPUT'});
  });
  await t.test('withdrawal prevents first sealing but does not delete already preserved history',async()=>{
   for(const beforeSeal of [true,false]){
    const draft=await execute('create_source',sourceInput());await review(draft);const original=beforeSeal?null:await seal(draft);
    await execute('transition_source',{source_ref:draft.source_ref,target_status:'WITHDRAWN',expected_version:2,review_ref:'synthetic:withdrawal',operation_key:key()});
    if(beforeSeal)await assert.rejects(seal(draft),{code:'COMMITMENT_NOT_READY'});else assert.deepEqual(await seal(draft),original);
    await assert.rejects(review({...draft,object_version:3}),{code:'SOURCE_TRANSITION_FORBIDDEN'});
   }
  });
  await t.test('source audit failure rolls back both content and retry record',async()=>{
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO governance_audit'))throw Error('synthetic audit failure');return tx.execute(sql,args);}}))};
   const failing=createGovernanceRepository(broken,{resolvePrincipal}),input=sourceInput();
   await assert.rejects(failing.createSource(operator.ctx,input),/synthetic audit failure/);
   const row=await execute('create_source',input);
   await assert.rejects(failing.transitionSource(operator.ctx,{source_ref:row.source_ref,target_status:'REVIEWED',expected_version:1,review_ref:'synthetic:review',operation_key:key()}),/synthetic audit failure/);
   assert.equal((await execute('read_source',{source_ref:row.source_ref})).current_status,'DRAFT');
  });
  await t.test('modified source content and withdrawn reader membership fail before sealing',async()=>{
   const row=await execute('create_source',sourceInput());await review(row);
   await db.execute("UPDATE governance_sources SET content_json=JSON_SET(content_json,'$.commitments.notice','tampered') WHERE id=?",[row.contract_version_id]);
   await assert.rejects(seal(row),{code:'STORED_CONTENT_MISMATCH'});
   const second=await execute('create_source',sourceInput());await review(second);
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=?",[reader.account_id]);
   try{await assert.rejects(seal(second),{code:'READER_NOT_A_PARTY'});}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=?",[reader.account_id]);}
  });
  await t.test('default service blocks all external business actions even for preserved contracts',async()=>{
   for(const action of ['START_PAYMENT','START_IDENTITY_CHECK','START_SIGNING','START_DIGITAL_HUMAN']){
    const result=await execute('check_business',{snapshot_id:saved.id,party_id:reader.personal_party_id,action},reader);
    assert.equal(result.current_status,'NOT_ENABLED');assert.equal(result.reason_code,'PROVIDER_NOT_IMPLEMENTED');
   }
   await assert.rejects(execute('check_business',{snapshot_id:saved.id,party_id:outsider.personal_party_id,action:'START_PAYMENT'},outsider),{code:'SNAPSHOT_NOT_FOUND'});
   await assert.rejects(execute('check_business',{snapshot_id:saved.id,party_id:reader.personal_party_id,action:'START_PAYMENT',ready:true},reader),{code:'INVALID_INPUT'});
  });
  await t.test('service state requires matching environment, configuration revision and verification evidence',async()=>{
   const provider={provider_kind:'PaymentProvider',provider_code:'synthetic_payment',capability_code:'create',environment:'SANDBOX'};
   const readiness=createReadinessRepository(db,{authorizeChange:async()=>true,verifyEvidence:async()=>true});
   const input={snapshot_id:saved.id,party_id:reader.personal_party_id,action:'START_PAYMENT'};
   const inspection={implemented:true,configured:true,config_revision:'synthetic-v1'};
   const bindings={START_PAYMENT:{provider,inspect:async()=>({...inspection})}};
   const gate=createBusinessGate({governance:repo,readiness,environment:'SANDBOX',bindings});
   assert.equal((await gate.check(reader.ctx,input)).reason_code,'PROVIDER_NOT_VERIFIED');
   await assert.rejects(gate.assertReady(reader.ctx,input),{code:'BUSINESS_NOT_ENABLED'});
   await readiness.record({...provider,current_status:'SANDBOX_VERIFIED',config_revision:'synthetic-v1',expected_version:0,evidence_ref:'synthetic:evidence'},{actor_ref:'synthetic:operator'});
   assert.equal((await gate.assertReady(reader.ctx,input)).current_status,'SERVICE_READY');
   assert.equal((await createBusinessGate({governance:repo,readiness,environment:'PRODUCTION',bindings}).check(reader.ctx,input)).reason_code,'PROVIDER_ENVIRONMENT_MISMATCH');
   inspection.config_revision='synthetic-v2';assert.equal((await gate.check(reader.ctx,input)).reason_code,'PROVIDER_CONFIGURATION_CHANGED');inspection.config_revision='synthetic-v1';
   await readiness.record({...provider,current_status:'DISABLED_BY_PRODUCT',config_revision:'synthetic-v1',expected_version:1},{actor_ref:'synthetic:operator'});
   assert.equal((await gate.check(reader.ctx,input)).current_status,'NOT_ENABLED');
   assert.equal((await execute('read_snapshot',{snapshot_id:saved.id,party_id:reader.personal_party_id},reader)).signing_method,'NOT_SIGNED');
  });
  await t.test('command defaults to offline preview and requires a real session before execution',async()=>{
   const directory=path.resolve(__dirname,'../../../..','.local/governance-service-tests');await fs.mkdir(directory,{recursive:true});
   const file=path.join(directory,key()+'.json');
   try{
    await fs.writeFile(file,JSON.stringify({command:'read_snapshot',input:{snapshot_id:saved.id,party_id:reader.personal_party_id}}));
    assert.equal((await commandMain([file],{})).status,'PREVIEW_ONLY_NO_DATABASE');
    await assert.rejects(commandMain(['--execute',file],{...env,MYSQL_DATABASE:name}),{code:'AUTHENTICATION_REQUIRED'});
    const result=await commandMain(['--execute',file],{...env,MYSQL_DATABASE:name,AUTH_SECRET_BASE64:secret,GOVERNANCE_SESSION_TOKEN:reader.token});assert.deepEqual(result.data,saved);
   }finally{await fs.unlink(file);}
  });
  await t.test('reviewed persisted source is returned through the real authorized HTTP endpoint',async()=>{
   server=createAccountApi({db,secret}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/contract-snapshots/${saved.id}/content`,{headers:{Authorization:'Bearer '+reader.token,'X-Acting-Party':reader.personal_party_id}});
   assert.equal(response.status,200);assert.deepEqual((await response.json()).data,saved);
   const url=`http://127.0.0.1:${server.address().port}/api/v1/contract-snapshots/${saved.id}/business-readiness?action=START_PAYMENT`;
   const headers={Authorization:'Bearer '+reader.token,'X-Acting-Party':reader.personal_party_id};
   const checked=await fetch(url,{headers}),body=await checked.json();assert.equal(checked.status,200);assert.equal(body.data.current_status,'NOT_ENABLED');
   assert.equal(checked.headers.get('cache-control'),'no-store');
   assert.equal((await fetch(url,{headers:{...headers,'If-None-Match':'*'}})).status,200);
   assert.equal((await fetch(url)).status,401);
   assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+outsider.token,'X-Acting-Party':outsider.personal_party_id}})).status,404);
   assert.equal((await fetch(url+'&ready=true',{headers})).status,400);
   const fixtures=path.resolve(__dirname,'../../../..','.local/governance-service-http-fixtures.json');await fs.mkdir(path.dirname(fixtures),{recursive:true});
   await fs.writeFile(fixtures,JSON.stringify({synthetic_only:true,cases:[{schema:'BusinessServiceReadinessResponse',value:body}]}));
   await auth.revoke(reader.token);await assert.rejects(execute('read_snapshot',{snapshot_id:saved.id,party_id:reader.personal_party_id},reader));
   assert.equal((await fetch(url,{headers})).status,401);
  });
 }finally{
  if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();
 }
});
