'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository');
const {createGovernanceRepository}=require('../src/modules/governance/repository');
const key=()=>randomUUID();
test('isolated MySQL preserves rule history, private snapshots and atomic records',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db;
 try {
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});
  const base=path.resolve(__dirname,'../migrations/mysql-runtime'),planned=path.resolve(__dirname,'../migrations/planned-governance');
  const fixture=path.resolve(__dirname,'../../../..','.local/governance-migrations',key());await fs.mkdir(fixture,{recursive:true});
  await t.test('only explicit isolated fixture applies planned migrations; existing records survive',async()=>{
   await migrate(db);await db.execute('INSERT INTO platform_schema_metadata(schema_key,schema_value) VALUES (?,?)',['governance_test','preserve']);
   for(const directory of [base,planned])for(const file of await fs.readdir(directory))if(file.endsWith('.sql'))await fs.copyFile(path.join(directory,file),path.join(fixture,file));
   assert.deepEqual((await migrate(db,{directory:fixture})).applied,['0020','0021','0022','0023','0024']);
   assert.deepEqual((await migrate(db,{directory:fixture})).applied,[]);
   assert.equal((await db.execute('SELECT schema_value FROM platform_schema_metadata WHERE schema_key=?',['governance_test']))[0][0].schema_value,'preserve');
  });
  const sessions=new Map(),sources=new Map(),privileged=new Set();
  const resolvePrincipal=async ctx=>sessions.get(ctx)||null;
  const party=createPartyRepository(db,{resolvePrincipal});
  const people=[];
  for(const name of ['operator','reader','outsider']){const ctx=Symbol(name);sessions.set(ctx,{subject_ref:'synthetic:'+key(),request_id:key()});people.push({ctx,...await party.registerAccount(ctx,{display_name:name})});}
  const [operator,reader,outsider]=people;privileged.add(operator.account_id);
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
  await t.test('a fresh connection reads saved content and empty database creation applies the same plan',async()=>{
   const value=await repo.seal(operator.ctx,source(await effective()));
   const fresh=await openDatabase({...env,MYSQL_DATABASE:name});try{assert.deepEqual(await createGovernanceRepository(fresh,options).readSnapshot(reader.ctx,value.id),value);}finally{await fresh.close();}
   const other=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;assert.match(other,/^jx_test_\d+_[a-f0-9]{12}$/);await control.query('CREATE DATABASE '+mysql.escapeId(other));
   let empty;try{empty=await openDatabase({...env,MYSQL_DATABASE:other});assert.equal((await migrate(empty,{directory:fixture})).applied.length,(await fs.readdir(fixture)).length);}finally{if(empty)await empty.close();await control.query('DROP DATABASE '+mysql.escapeId(other));}
  });
 }finally{if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
