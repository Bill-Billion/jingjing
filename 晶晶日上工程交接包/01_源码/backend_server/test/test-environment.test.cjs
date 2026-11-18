'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{backendOnlyEnvironment}=require('../scripts/test-environment.cjs');
test('backend mode removes directory and boolean browser opt-ins, including the truthy string zero',()=>{
 for(const value of ['0','1','synthetic/dist']){
  const input={...process.env,JX_INDEPENDENT_WEB:value,JX_INDEPENDENT_FULL_UI:value,JX_INDEPENDENT_EVIDENCE_DIR:'synthetic/evidence',JX_PM01_NOTICES_WEB:'1',JX_PM01_STOCK_WEB:'1',JX_MYSQL_TEST_ENV_FILE:'synthetic/mysql.json'};
  const env=backendOnlyEnvironment(input),child=spawnSync(process.execPath,['-e',"const e=process.env;process.stdout.write(JSON.stringify({directory:!!e.JX_INDEPENDENT_WEB,ui:!!e.JX_INDEPENDENT_FULL_UI,notices:e.JX_PM01_NOTICES_WEB==='1',stock:e.JX_PM01_STOCK_WEB==='1',mysql:e.JX_MYSQL_TEST_ENV_FILE,evidence:!!e.JX_INDEPENDENT_EVIDENCE_DIR}));"],{env,encoding:'utf8',windowsHide:true});
  assert.equal(child.status,0);assert.deepEqual(JSON.parse(child.stdout),{directory:false,ui:false,notices:false,stock:false,mysql:'synthetic/mysql.json',evidence:false});assert.equal(input.JX_INDEPENDENT_WEB,value);
 }
});
