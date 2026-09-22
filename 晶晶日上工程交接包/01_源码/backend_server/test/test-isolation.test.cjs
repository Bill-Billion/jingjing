 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),path=require('node:path');
const {fixture}=require('./fixtures/legacy-http.cjs');
test('unknown test suite fails instead of running another module',()=>{
 const env={...process.env};delete env.JX_MYSQL_TEST_ENV_FILE;
 const result=spawnSync(process.execPath,['scripts/test-mysql.js','partyy'],{cwd:path.resolve(__dirname,'..'),env,encoding:'utf8',windowsHide:true});
 assert.equal(result.status,1);assert.match(result.stderr,/Unknown MySQL test suite: partyy/);assert.doesNotMatch(result.stdout,/TAP version/);
});
test('requesting one legacy router does not load payment or unrelated routers',async t=>{
 const f=await fixture(t);assert.deepEqual(f.loadedRoutes(),[]);
 await f.request('GET','/samples/does-not-exist');
 assert.deepEqual(f.loadedRoutes(),['samples']);assert.equal(f.upstream(),0);
 await f.request('GET','/samples/does-not-exist');assert.deepEqual(f.loadedRoutes(),['samples']);
});
