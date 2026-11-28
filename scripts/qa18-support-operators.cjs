'use strict';
// Adds only bounded synthetic review roles through the existing audited grant method.
// Never changes identity, capability, consent, certification, or business status rows.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend,'scripts/test-network-guard.cjs'));
async function main(){
 const out=path.resolve(process.argv[2]||'');assert.equal(process.argv.length,3);
 assert.equal(path.dirname(out),path.join(root,'.local/stock-sandbox'));
 assert.match(path.basename(out),/^jx_test_stock_pm03_[a-f0-9]{24}$/);
 const state=JSON.parse(await fs.readFile(path.join(out,'state.json'),'utf8'));
 assert(state.synthetic_only&&state.mode==='BATCH'&&state.database===path.basename(out)&&Date.parse(state.expires_at)>Date.now());
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const db=await require(path.join(backend,'src/infrastructure/database')).openDatabase({...env,MYSQL_DATABASE:state.database});
 const result=[];
 try{for(const role of ['first_auditions_reviewer','reviewer']){
  const account=state.accounts[role];assert(account?.account_id);const action='SUPPORT_HANDLE';
  const [rows]=await db.execute('SELECT object_version,enabled,expires_at FROM governance_operator_grants WHERE account_id=? AND action_code=?',[account.account_id,action]);
  const prior=rows[0];if(prior?.enabled&&new Date(prior.expires_at).getTime()===Date.parse(state.expires_at)){result.push({role,action,existing:true});continue;}
  await require(path.join(backend,'src/modules/governance/operator-access')).maintainOperatorGrant(db,{account_id:account.account_id,action,enabled:true,expected_version:prior?.object_version||0,expires_at:state.expires_at,authority_ref:'synthetic:qa18-g09-g10',reason:'Independent synthetic support handling machine checks; expires with isolated environment'});
  result.push({role,action,existing:false,expires_at:state.expires_at});
 }}finally{await db.close();}
 console.log(JSON.stringify({synthetic_only:true,database:state.database,grants:result,business_records_changed:false}));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
