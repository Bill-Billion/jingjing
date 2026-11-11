'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {collectEvidence}=require('./run-backend-acceptance.cjs');
test('a rejected profile cannot silently select the full acceptance run',()=>{
 const r=spawnSync(process.execPath,[path.join(__dirname,'run-backend-acceptance.cjs'),'--profile','typo'],{encoding:'utf8',env:{...process.env,JX_MYSQL_TEST_ENV_FILE:''}});
 assert.equal(r.status,1);assert.match(r.stderr,/UNKNOWN_ACCEPTANCE_PROFILE/);assert(!r.stdout.includes('Evidence:'));
});
test('stale, missing, failed and empty evidence cannot be substituted for fresh successful responses',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jx-acceptance-evidence-')),local=path.join(root,'.local'),out=path.join(root,'out');
 fs.mkdirSync(local);fs.mkdirSync(out);
 try{
  const put=(name,value)=>fs.writeFileSync(path.join(local,name),JSON.stringify(value));
  put('old.json',{result:'PASS'});fs.utimesSync(path.join(local,'old.json'),1,1);
  put('failed.json',{result:'FAIL'});put('null.json',null);put('empty-fixtures.json',{cases:[]});put('fresh-fixtures.json',{synthetic_only:true,cases:[{value:{data:{id:'synthetic'}}}]});
  fs.writeFileSync(path.join(local,'broken.json'),'{');
  const names=['missing.json','old.json','failed.json','null.json','empty-fixtures.json','broken.json','fresh-fixtures.json'];
  const result=collectEvidence(root,out,names,'2000-01-01T00:00:00.000Z');
  assert.equal(result.artifactErrors.length,6);assert.deepEqual(result.evidence.map(x=>x.path),['fresh-fixtures.json']);assert.match(result.evidence[0].sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(fs.readFileSync(path.join(out,'fresh-fixtures.json')),fs.readFileSync(path.join(local,'fresh-fixtures.json')));
  assert(!fs.existsSync(path.join(out,'old.json')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
