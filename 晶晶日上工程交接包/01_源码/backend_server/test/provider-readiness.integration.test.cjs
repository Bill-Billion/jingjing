'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const crypto=require('node:crypto');const mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');const {migrate}=require('../src/infrastructure/database/migrator');
const {createReadinessRepository,assertUsable}=require('../src/modules/providers/readiness');const {mysqlReady}=require('../src/http/operations');
const identity={provider_kind:'ObjectStorageProvider',provider_code:'synthetic-oss',capability_code:'private_assets',environment:'SANDBOX'};
const actor={actor_ref:'test-admin'};
const authorized={authorizeChange:async id=>id==='test-admin',verifyEvidence:async input=>input.evidence_ref==='synthetic-test-evidence'&&input.config_revision==='r1'};
const inspected={implemented:true,configured:true,config_revision:'r1'};
test('real isolated MySQL persists provider status, evidence and concurrent edits',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async(t)=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db;
 try{
  await control.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin`);
  db=await openDatabase({...env,MYSQL_DATABASE:name});
  await t.test('database readiness requires applied migrations, not just a connection',async()=>{assert.equal(await mysqlReady(db)(),false);await migrate(db);assert.equal(await mysqlReady(db)(),true);});
  let repo=createReadinessRepository(db,authorized);
  const write=(current_status,expected_version,extra={})=>repo.record({...identity,current_status,expected_version,config_revision:'r1',...extra},actor);
  await t.test('recording is denied by default and requires genuine server-side evidence checking',async()=>{
   const input={...identity,current_status:'CONFIGURED',expected_version:0,config_revision:'r1'};
   await assert.rejects(createReadinessRepository(db).record(input,actor),{code:'PROVIDER_CHANGE_FORBIDDEN'});
   await assert.rejects(repo.record(input,{actor_ref:'other'}),{code:'PROVIDER_CHANGE_FORBIDDEN'});
   await assert.rejects(write('SANDBOX_VERIFIED',0,{evidence_ref:'unapproved'}),{code:'VERIFICATION_EVIDENCE_REQUIRED'});
   await assert.rejects(write('PRODUCTION_VERIFIED',0,{evidence_ref:'synthetic-test-evidence'}),{code:'VERIFICATION_ENVIRONMENT_MISMATCH'});
   assert.equal(await repo.read(identity),null);
  });
  await t.test('configuration is saved but does not authorize real calls',async()=>{
   const row=await write('CONFIGURED',0);assert.equal(row.object_version,1);assert.equal(row.verification_history.length,0);
   await assert.rejects(assertUsable(repo,identity,inspected),{code:'PROVIDER_NOT_VERIFIED'});
  });
  await t.test('verified evidence survives closing and reopening the database connection',async()=>{
   const row=await write('SANDBOX_VERIFIED',1,{evidence_ref:'synthetic-test-evidence'});assert.equal(row.object_version,2);assert.equal(row.verification_history.length,1);assert.match(row.verification_history[0].verified_at,/Z$/);
   await db.close();db=await openDatabase({...env,MYSQL_DATABASE:name});repo=createReadinessRepository(db,authorized);
   assert.equal((await assertUsable(repo,identity,inspected)).object_version,2);
   await assert.rejects(assertUsable(repo,{...identity,environment:'PRODUCTION'},inspected),{code:'PROVIDER_NOT_VERIFIED'});
   await assert.rejects(assertUsable(repo,identity,{...inspected,config_revision:'new-credentials'}),{code:'PROVIDER_CONFIGURATION_CHANGED'});
  });
  await t.test('disabling and awaiting approval keep history but block new calls',async()=>{
   for(const [state,version] of [['DISABLED_BY_PRODUCT',2],['WAITING_PROVIDER_APPROVAL',3]]){
    const row=await write(state,version,{reason_code:'MANUAL_REVIEW'});assert.equal(row.verification_history.length,1);
    await assert.rejects(assertUsable(repo,identity,inspected),{code:'PROVIDER_NOT_VERIFIED'});
   }
  });
  await t.test('two concurrent updates cannot overwrite each other silently',async()=>{
   const results=await Promise.allSettled([write('CONFIGURED',4),write('IMPLEMENTED',4)]);
   assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'PROVIDER_VERSION_CONFLICT');
   assert.equal((await repo.read(identity)).object_version,5);
   const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM platform_provider_readiness_history');assert.equal(Number(count.n),5);
  });
  await t.test('history write failure rolls back both status and version',async()=>{
   const failing={execute:db.execute,withTransaction:fn=>db.withTransaction(tx=>fn({execute:(sql,params)=>{if(sql.includes('INSERT INTO platform_provider_readiness_history'))throw Error('injected history failure');return tx.execute(sql,params);}}))};
   const broken=createReadinessRepository(failing,authorized);
   await assert.rejects(broken.record({...identity,current_status:'DISABLED_BY_PRODUCT',expected_version:5,config_revision:'r1'},actor),/injected history failure/);
   assert.equal((await repo.read(identity)).object_version,5);
  });
  await t.test('re-enabling requires fresh evidence and preserves earlier verification',async()=>{
   await assert.rejects(write('SANDBOX_VERIFIED',5,{evidence_ref:'unapproved'}),{code:'VERIFICATION_EVIDENCE_REQUIRED'});
   const row=await write('SANDBOX_VERIFIED',5,{evidence_ref:'synthetic-test-evidence'});assert.equal(row.verification_history.length,2);
   assert.equal((await assertUsable(repo,identity,inspected)).object_version,6);
  });
  await t.test('capabilities have separate status even for the same provider',async()=>{
   await assert.rejects(assertUsable(repo,{...identity,capability_code:'other_assets'},inspected),{code:'PROVIDER_NOT_VERIFIED'});
   const all=await db.execute('SELECT COUNT(*) AS n FROM platform_provider_readiness');assert.equal(Number(all[0][0].n),1);
  });
 }finally{
  if(db)await db.close();
  assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);await control.query(`DROP DATABASE IF EXISTS \`${name}\``);await control.end();
 }
});
