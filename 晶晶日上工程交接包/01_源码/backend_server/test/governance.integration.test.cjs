'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository');
const {createGovernanceRepository}=require('../src/modules/governance/repository');
const {maintainOperatorGrant,authorizeOperator}=require('../src/modules/governance/operator-access');
const {createAccountApi}=require('../src/http/account-api');
const {createAuthRepository}=require('../src/modules/auth/repository');
const http=require('node:http');
const key=()=>randomUUID();
test('isolated MySQL preserves rule history, private snapshots and atomic records',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;
 try {
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});
  const base=path.resolve(__dirname,'../migrations/mysql-runtime');
  const fixture=path.resolve(__dirname,'../../../..','.local/governance-migrations',key());await fs.mkdir(fixture,{recursive:true});
  await t.test('upgrading the authentication schema preserves records and applies governance migrations once',async()=>{
   for(const file of await fs.readdir(base))if(file.endsWith('.sql')&&file.slice(0,4)<'0020')await fs.copyFile(path.join(base,file),path.join(fixture,file));
   await migrate(db,{directory:fixture});await db.execute('INSERT INTO platform_schema_metadata(schema_key,schema_value) VALUES (?,?)',['governance_test','preserve']);
   for(const file of await fs.readdir(base))if(file.endsWith('.sql'))await fs.copyFile(path.join(base,file),path.join(fixture,file));
   assert.deepEqual((await migrate(db,{directory:fixture})).applied,(await fs.readdir(base)).filter(f=>f.endsWith('.sql')&&f.slice(0,4)>='0020').sort().map(f=>f.slice(0,4)));
   assert.deepEqual((await migrate(db,{directory:fixture})).applied,[]);
   assert.equal((await db.execute('SELECT schema_value FROM platform_schema_metadata WHERE schema_key=?',['governance_test']))[0][0].schema_value,'preserve');
  });
  const sessions=new Map(),sources=new Map(),privileged=new Set();
  const resolvePrincipal=async ctx=>sessions.get(ctx)||null;
  const party=createPartyRepository(db,{resolvePrincipal});
  const people=[];
  for(const name of ['operator','reader','outsider']){const ctx=Symbol(name);sessions.set(ctx,{subject_ref:'synthetic:'+key(),request_id:key()});people.push({ctx,...await party.registerAccount(ctx,{display_name:name})});}
  const [operator,reader,outsider]=people;privileged.add(operator.account_id);
  const secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret});
  for(const person of people){person.token=randomBytes(32).toString('base64url');await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',person.token),person.account_id]);}
  server=createAccountApi({db,secret}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  function request(url,person,partyId,method='GET',headers={}){
   return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method,agent:false,headers:{...(person?{Authorization:'Bearer '+person.token}:{}),...(partyId?{'X-Acting-Party':partyId}:{}),...headers}},res=>{let raw='';res.on('data',v=>raw+=v);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:raw?JSON.parse(raw):null}));});req.setTimeout(5000,()=>req.destroy(Error('local HTTP timeout')));req.on('error',reject);req.end();});
  }
  const httpCases=[];
  const options={resolvePrincipal,authorize:async(_tx,a)=>privileged.has(a.account_id),loadCommitment:async(_tx,{source_ref})=>sources.get(source_ref)||null};
  const repo=createGovernanceRepository(db,options);
  const draftInput=()=>({rule_key:'synthetic:'+key(),version:'test-only-1',terms:{notice:'合成测试规则，不是商业默认值'},effective_at:'2026-01-01T00:00:00.000Z',operation_key:key()});
  async function effective(){let value=await repo.createRule(operator.ctx,draftInput());for(const target_status of ['IN_REVIEW','APPROVED','EFFECTIVE'])value=await repo.transitionRule(operator.ctx,{rule_id:value.content.id,expected_version:value.object_version,target_status,operation_key:key()});return value;}
  function source(rule){const source_ref='synthetic:'+key();sources.set(source_ref,{contract_version_id:key(),party_ids:[operator.personal_party_id,reader.personal_party_id],rule_ids:[rule.content.id],reader_account_ids:[operator.account_id,reader.account_id],commitments:{notice:'合成测试承诺'}});return {source_ref,operation_key:key()};}
  await t.test('authentication and privileged operations deny by default, not by caller role fields',async()=>{
   await assert.rejects(createGovernanceRepository(db).createRule({role:'admin'},draftInput()),{code:'AUTHENTICATION_REQUIRED'});
   await assert.rejects(createGovernanceRepository(db,{resolvePrincipal}).createRule(operator.ctx,draftInput()),{code:'GOVERNANCE_FORBIDDEN'});
   await assert.rejects(repo.createRule(outsider.ctx,draftInput()),{code:'GOVERNANCE_FORBIDDEN'});
   await assert.rejects(repo.createRule(operator.ctx,{...draftInput(),role:'admin'}),{code:'INVALID_INPUT'});
  });
  await t.test('concurrent retries create one rule and one audit, while changed content conflicts',async()=>{
   const input=draftInput(),values=await Promise.all([repo.createRule(operator.ctx,input),repo.createRule(operator.ctx,input)]);assert.deepEqual(values[0],values[1]);
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM governance_audit WHERE object_id=?',[values[0].content.id]))[0][0].n),1);
   await assert.rejects(repo.createRule(operator.ctx,{...input,terms:{changed:true}}),{code:'IDEMPOTENCY_CONFLICT'});
   await assert.rejects(repo.createRule(operator.ctx,{...input,operation_key:key()}),{code:'RULE_VERSION_EXISTS'});
   privileged.delete(operator.account_id);await assert.rejects(repo.createRule(operator.ctx,input),{code:'GOVERNANCE_FORBIDDEN'});privileged.add(operator.account_id);
  });
  await t.test('review steps cannot be skipped; concurrent transitions enforce the original version',async()=>{
   const rule=await repo.createRule(operator.ctx,draftInput());
   const input={rule_id:rule.content.id,target_status:'IN_REVIEW',expected_version:1,operation_key:key()};
   await assert.rejects(repo.transitionRule(operator.ctx,{...input,target_status:'EFFECTIVE'}),{code:'RULE_TRANSITION_FORBIDDEN'});
   const results=await Promise.allSettled([repo.transitionRule(operator.ctx,input),repo.transitionRule(operator.ctx,{...input,operation_key:key()})]);
   assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'VERSION_CONFLICT');
   const current=await repo.readRule(operator.ctx,rule.content.id);assert.equal(current.object_version,2);assert.equal(current.content.content_sha256,rule.content.content_sha256);
  });
  await t.test('future rules stay unusable, without scheduled or automatic approval',async()=>{
   let rule=await repo.createRule(operator.ctx,{...draftInput(),effective_at:'2099-01-01T00:00:00.000Z'});
   for(const target_status of ['IN_REVIEW','APPROVED'])rule=await repo.transitionRule(operator.ctx,{rule_id:rule.content.id,target_status,expected_version:rule.object_version,operation_key:key()});
   await assert.rejects(repo.transitionRule(operator.ctx,{rule_id:rule.content.id,target_status:'EFFECTIVE',expected_version:rule.object_version,operation_key:key()}),{code:'RULE_NOT_YET_EFFECTIVE'});
   await assert.rejects(repo.seal(operator.ctx,source(rule)),{code:'RULE_NOT_EFFECTIVE'});
  });
  await t.test('snapshot creation requires a trusted source; caller cannot supply party or promise fields',async()=>{
   await assert.rejects(repo.seal(operator.ctx,{source_ref:'missing',operation_key:key()}),{code:'COMMITMENT_NOT_READY'});
   await assert.rejects(repo.seal(operator.ctx,{source_ref:'missing',operation_key:key(),party_ids:[outsider.personal_party_id]}),{code:'INVALID_INPUT'});
  });
  await t.test('same source under concurrent different keys creates one snapshot and one audit',async()=>{
   const input=source(await effective()),values=await Promise.all([repo.seal(operator.ctx,input),repo.seal(operator.ctx,{...input,operation_key:key()})]);
   assert.deepEqual(values[0],values[1]);const value=values[0];assert.equal(value.signing_method,'NOT_SIGNED');
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM governance_audit WHERE object_id=?',[value.id]))[0][0].n),1);
   assert.deepEqual(await repo.readSnapshot(reader.ctx,value.id),value);
   await assert.rejects(repo.readSnapshot(outsider.ctx,value.id),{code:'SNAPSHOT_NOT_FOUND'});
   await assert.rejects(repo.readRule(reader.ctx,value.rule_contents[0].id),{code:'GOVERNANCE_FORBIDDEN'});
  });
  await t.test('later terms and retirement do not replace the frozen source, including retry with a new key',async()=>{
   const rule=await effective(),input=source(rule),saved=await repo.seal(operator.ctx,input);
   sources.get(input.source_ref).commitments.notice='later changed source';
   await repo.transitionRule(operator.ctx,{rule_id:rule.content.id,target_status:'RETIRED',expected_version:rule.object_version,operation_key:key()});
   assert.deepEqual(await repo.seal(operator.ctx,{...input,operation_key:key()}),saved);
   assert.deepEqual(await repo.readSnapshot(reader.ctx,saved.id),saved);
   await assert.rejects(repo.seal(operator.ctx,source(rule)),{code:'RULE_NOT_EFFECTIVE'});
  });
  await t.test('organization membership alone grants no contract reading rights',async()=>{
   const org=await party.createOrganization(operator.ctx,{display_name:'Synthetic contract party',operation_key:key()});
   const inv=await party.inviteMember(operator.ctx,{party_id:org.party_id,invitee_account_id:outsider.account_id,expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
   await party.respondInvitation(outsider.ctx,{party_id:org.party_id,invitation_id:inv.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
   const input=source(await effective());sources.get(input.source_ref).party_ids=[org.party_id,reader.personal_party_id];
   const value=await repo.seal(operator.ctx,input);
   await assert.rejects(repo.readSnapshot(outsider.ctx,value.id),{code:'SNAPSHOT_NOT_FOUND'});
   assert.deepEqual(await repo.readSnapshot(reader.ctx,value.id),value);
  });
  await t.test('retirement racing with sealing produces either old immutable content or a rejection',async()=>{
   const rule=await effective(),input=source(rule);
   const [sealed,retired]=await Promise.allSettled([repo.seal(operator.ctx,input),repo.transitionRule(operator.ctx,{rule_id:rule.content.id,target_status:'RETIRED',expected_version:rule.object_version,operation_key:key()})]);
   assert.equal(retired.status,'fulfilled');
   if(sealed.status==='fulfilled')assert.deepEqual(await repo.readSnapshot(reader.ctx,sealed.value.id),sealed.value);
   else assert.equal(sealed.reason.code,'RULE_NOT_EFFECTIVE');
   await assert.rejects(repo.seal(operator.ctx,source(rule)),{code:'RULE_NOT_EFFECTIVE'});
  });
  await t.test('replayed results do not bypass removed reader grants or suspended accounts',async()=>{
   const input=source(await effective()),saved=await repo.seal(operator.ctx,input);
   await db.execute('DELETE FROM governance_snapshot_readers WHERE snapshot_id=? AND account_id=?',[saved.id,operator.account_id]);
   await assert.rejects(repo.seal(operator.ctx,input),{code:'SNAPSHOT_NOT_FOUND'});
   await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[reader.account_id]);
   await assert.rejects(repo.readSnapshot(reader.ctx,saved.id),{code:'ACCOUNT_NOT_ACTIVE'});
   await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[reader.account_id]);
  });
  await t.test('audit failure rolls back the snapshot, reader grants and idempotency result',async()=>{
   const input=source(await effective());
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO governance_audit'))throw Error('synthetic audit failure');return tx.execute(sql,args);}}))};
   await assert.rejects(createGovernanceRepository(broken,options).seal(operator.ctx,input),/synthetic audit failure/);
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM governance_snapshots WHERE source_ref=?',[input.source_ref]))[0][0].n),0);
   const value=await repo.seal(operator.ctx,input);assert.equal(value.current_status,'SEALED');
  });
  await t.test('rule creation and transitions also roll back when their audit cannot be saved',async()=>{
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO governance_audit'))throw Error('synthetic audit failure');return tx.execute(sql,args);}}))};
   const failing=createGovernanceRepository(broken,options),input=draftInput();
   await assert.rejects(failing.createRule(operator.ctx,input),/synthetic audit failure/);
   const rule=await repo.createRule(operator.ctx,input),change={rule_id:rule.content.id,target_status:'IN_REVIEW',expected_version:1,operation_key:key()};
   await assert.rejects(failing.transitionRule(operator.ctx,change),/synthetic audit failure/);
   assert.equal((await repo.readRule(operator.ctx,rule.content.id)).current_status,'DRAFT');
   assert.equal((await repo.transitionRule(operator.ctx,change)).current_status,'IN_REVIEW');
  });
  await t.test('stored content changes are detected, rather than silently trusted on read',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective()));
   await db.execute("UPDATE governance_snapshots SET content_json=JSON_SET(content_json,'$.commitments.notice','tampered') WHERE id=?",[value.id]);
   await assert.rejects(repo.readSnapshot(reader.ctx,value.id),{code:'CONTENT_HASH_MISMATCH'});
  });
  await t.test('real HTTP requires a valid session and explicit contract grant in the acting party',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective())),url='/api/v1/contract-snapshots/'+value.id+'/content';
   assert.equal((await request(url,null,reader.personal_party_id)).status,401);
   assert.equal((await request(url,{token:'legacy.jwt'},reader.personal_party_id)).status,401);
   assert.equal((await request(url,reader)).status,400);
   assert.equal((await request(url,reader,operator.personal_party_id)).status,404);
   assert.equal((await request(url,outsider,outsider.personal_party_id)).status,404);
   const other=await party.createOrganization(reader.ctx,{display_name:'Unrelated identity',operation_key:key()});
   assert.equal((await request(url,reader,other.party_id)).status,404);
   const r=await request(url,reader,reader.personal_party_id);assert.equal(r.status,200);assert.deepEqual(r.body.data,value);
   assert.equal(r.body.meta.actor.account_id,reader.account_id);assert.equal(r.body.meta.acting_party,reader.personal_party_id);assert.equal(r.headers['cache-control'],'no-store');
   httpCases.push({schema:'UnsignedSnapshotContentResponse',value:r.body});
   assert.equal((await request(url,reader,reader.personal_party_id,'GET',{'If-None-Match':'*'})).status,200);
   assert.equal((await request(url+'?role=admin',reader,reader.personal_party_id)).status,400);
  });
  await t.test('HTTP rule reads use the historical snapshot and cannot expose unrelated rule versions',async()=>{
   const rule=await effective(),value=await repo.seal(operator.ctx,source(rule));
   await repo.transitionRule(operator.ctx,{rule_id:rule.content.id,target_status:'RETIRED',expected_version:rule.object_version,operation_key:key()});
   const url='/api/v1/rule-versions/'+rule.content.id+'/content?snapshot_id='+value.id;
   const r=await request(url,reader,reader.personal_party_id);assert.equal(r.status,200);assert.deepEqual(r.body.data,rule.content);httpCases.push({schema:'RuleContentResponse',value:r.body});
   const other=await effective();assert.equal((await request('/api/v1/rule-versions/'+other.content.id+'/content?snapshot_id='+value.id,reader,reader.personal_party_id)).status,404);
   assert.equal((await request('/api/v1/rule-versions/'+rule.content.id+'/content',reader,reader.personal_party_id)).status,400);
   assert.equal((await request(url,outsider,outsider.personal_party_id)).status,404);
  });
  await t.test('HTTP never exposes mutation, approval or fabricated file metadata routes',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective()));
   for(const method of ['POST','PATCH','DELETE'])assert.equal((await request('/api/v1/contract-snapshots/'+value.id+'/content',operator,operator.personal_party_id,method)).status,404);
   assert.equal((await request('/api/v1/contract-snapshots/'+value.id,operator,operator.personal_party_id)).status,404);
   assert.equal((await request('/api/v1/rule-versions',operator,operator.personal_party_id,'POST',{'X-Role':'admin'})).status,404);
   await assert.rejects(createGovernanceRepository(db,{resolvePrincipal}).seal(operator.ctx,{source_ref:'fake',operation_key:key()}),{code:'GOVERNANCE_FORBIDDEN'});
  });
  await t.test('HTTP rechecks membership and grants, and masks stored corruption without leaking content',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective())),url='/api/v1/contract-snapshots/'+value.id+'/content';
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[reader.personal_party_id,reader.account_id]);
   assert.equal((await request(url,reader,reader.personal_party_id)).status,404);
   await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[reader.personal_party_id,reader.account_id]);
   await db.execute('DELETE FROM governance_snapshot_readers WHERE snapshot_id=? AND account_id=?',[value.id,reader.account_id]);
   assert.equal((await request(url,reader,reader.personal_party_id)).status,404);
   await db.execute("UPDATE governance_snapshots SET content_json=JSON_SET(content_json,'$.commitments.notice','synthetic-secret-changed') WHERE id=?",[value.id]);
   const r=await request(url,operator,operator.personal_party_id);assert.equal(r.status,503);assert.equal(r.body.error.code,'SERVICE_UNAVAILABLE');assert.ok(!JSON.stringify(r.body).includes('synthetic-secret-changed'));httpCases.push({schema:'ErrorResponse',value:r.body});
  });
  await t.test('HTTP rejects revoked and expired sessions and inactive accounts on each read',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective())),url='/api/v1/contract-snapshots/'+value.id+'/content';
   await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[reader.account_id]);assert.equal((await request(url,reader,reader.personal_party_id)).status,403);
   await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[reader.account_id]);
   const logout=await request('/api/v1/auth/sessions/current',reader,null,'DELETE',{'Idempotency-Key':key()});assert.equal(logout.status,200);assert.equal((await request(url,reader,reader.personal_party_id)).status,401);
   await db.execute('UPDATE auth_sessions SET expires_ms=1 WHERE account_id=?',[operator.account_id]);assert.equal((await request(url,operator,operator.personal_party_id)).status,401);
  });
  await t.test('a fresh connection reads saved content and empty database creation applies the same plan',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective()));
   const fresh=await openDatabase({...env,MYSQL_DATABASE:name});try{assert.deepEqual(await createGovernanceRepository(fresh,options).readSnapshot(reader.ctx,value.id),value);}finally{await fresh.close();}
   const other=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;assert.match(other,/^jx_test_\d+_[a-f0-9]{12}$/);await control.query('CREATE DATABASE '+mysql.escapeId(other));
   let empty;try{empty=await openDatabase({...env,MYSQL_DATABASE:other});assert.equal((await migrate(empty,{directory:fixture})).applied.length,(await fs.readdir(fixture)).length);}finally{if(empty)await empty.close();await control.query('DROP DATABASE '+mysql.escapeId(other));}
  });
  async function staff(){const ctx=Symbol('staff');sessions.set(ctx,{subject_ref:'synthetic:'+key(),request_id:key()});return {ctx,...await party.registerAccount(ctx,{display_name:'Synthetic operator'})};}
  const grant=(p,extra={})=>({account_id:p.account_id,action:'CREATE_RULE',enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic-maintenance',reason:'Synthetic isolated authorization, not production approval',...extra});
  const controlled=createGovernanceRepository(db,{resolvePrincipal});
  await t.test('persisted explicit permission enables only its named operation and survives new composition',async()=>{
   const p=await staff();await assert.rejects(controlled.createRule(p.ctx,draftInput()),{code:'GOVERNANCE_FORBIDDEN'});
   await maintainOperatorGrant(db,grant(p));const rule=await createGovernanceRepository(db,{resolvePrincipal}).createRule(p.ctx,draftInput());
   await assert.rejects(controlled.readRule(p.ctx,rule.content.id),{code:'GOVERNANCE_FORBIDDEN'});
   await assert.rejects(controlled.transitionRule(p.ctx,{rule_id:rule.content.id,target_status:'IN_REVIEW',expected_version:1,operation_key:key()}),{code:'GOVERNANCE_FORBIDDEN'});
   assert.equal(await db.withTransaction(tx=>authorizeOperator(tx,{account_id:p.account_id,action:'UNKNOWN'})),false);
  });
  await t.test('revoked permission rejects a formerly successful idempotent request',async()=>{
   const p=await staff(),input=draftInput();await maintainOperatorGrant(db,grant(p));await controlled.createRule(p.ctx,input);
   await maintainOperatorGrant(db,grant(p,{expected_version:1,enabled:false}));await assert.rejects(controlled.createRule(p.ctx,input),{code:'GOVERNANCE_FORBIDDEN'});
  });
  await t.test('expiration and account suspension are evaluated on every privileged operation',async()=>{
   const p=await staff();await assert.rejects(maintainOperatorGrant(db,grant(p,{expires_at:'2000-01-01T00:00:00.000Z'})),{code:'GRANT_ALREADY_EXPIRED'});
   await maintainOperatorGrant(db,grant(p));await db.execute("UPDATE governance_operator_grants SET expires_at='2000-01-01' WHERE account_id=?",[p.account_id]);
   await assert.rejects(controlled.createRule(p.ctx,draftInput()),{code:'GOVERNANCE_FORBIDDEN'});
   await maintainOperatorGrant(db,grant(p,{expected_version:1}));await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[p.account_id]);
   await assert.rejects(controlled.createRule(p.ctx,draftInput()),{code:'ACCOUNT_NOT_ACTIVE'});
   await assert.rejects(maintainOperatorGrant(db,grant(p,{expected_version:2})),{code:'ACCOUNT_NOT_ACTIVE'});
   assert.equal((await maintainOperatorGrant(db,grant(p,{expected_version:2,enabled:false}))).enabled,false);
  });
  await t.test('concurrent maintenance rejects stale versions and retains both historical states',async()=>{
   const p=await staff(),saved=await maintainOperatorGrant(db,grant(p));
   const result=await Promise.allSettled([maintainOperatorGrant(db,grant(p,{expected_version:1,enabled:false})),maintainOperatorGrant(db,grant(p,{expected_version:1,expires_at:'2099-01-01T00:00:00.000Z'}))]);
   assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.code,'VERSION_CONFLICT');
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM governance_operator_history WHERE grant_id=?',[saved.grant_id]))[0][0].n),2);
  });
  await t.test('grant and history commit atomically; maintenance cannot silently omit evidence fields',async()=>{
   const p=await staff();await assert.rejects(maintainOperatorGrant(db,grant(p,{authority_ref:''})),{code:'INVALID_REFERENCE'});
   await assert.rejects(maintainOperatorGrant(db,grant(p,{reason:''})),{code:'INVALID_DISPLAY_NAME'});
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO governance_operator_history'))throw Error('synthetic history failure');return tx.execute(sql,args);}}))};
   await assert.rejects(maintainOperatorGrant(broken,grant(p)),/synthetic history failure/);
   await assert.rejects(controlled.createRule(p.ctx,draftInput()),{code:'GOVERNANCE_FORBIDDEN'});
   assert.equal((await maintainOperatorGrant(db,grant(p))).object_version,1);
  });
  await t.test('maintenance CLI previews without a database and writes only with explicit apply',async()=>{
   const {main}=require('../scripts/governance-access'),p=await staff();
   const file=path.join(fixture,'synthetic-grant.json');await fs.writeFile(file,JSON.stringify(grant(p)));
   assert.equal((await main([file],{})).status,'PREVIEW_ONLY_NO_DATABASE');
   await assert.rejects(controlled.createRule(p.ctx,draftInput()),{code:'GOVERNANCE_FORBIDDEN'});
   await assert.rejects(main(['--apply',file],{}),{code:'EXPLICIT_MYSQL_ENV_REQUIRED'});
   assert.equal((await main(['--apply',file],{...env,MYSQL_DATABASE:name})).status,'APPLIED');
   assert.equal((await controlled.createRule(p.ctx,draftInput())).current_status,'DRAFT');
  });
  const output=path.resolve(__dirname,'../../../..','.local/governance-http-fixtures.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify({synthetic_only:true,cases:httpCases},null,2));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
