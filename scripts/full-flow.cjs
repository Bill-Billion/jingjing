'use strict';
// Local, synthetic acceptance convenience commands. No production configuration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),stateFile=path.join(root,'.local/pr20-ui-runtime.json');
async function main(){
 const [command,argument]=process.argv.slice(2);
 if(command==='start'){
  assert.equal(argument,'--test-only','Start requires --test-only');
  assert(process.env.JX_MYSQL_TEST_ENV_FILE,'Set the isolated MySQL environment file');
  assert(!fs.existsSync(stateFile),'Existing fixture must be stopped; state is never overwritten');
  const child=spawn(process.execPath,[path.join(__dirname,'pr20-ui-test-server.cjs'),'--test-only','--full-flow'],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
  child.once('exit',code=>{process.exitCode=code??1;});return;
 }
 assert(['status','code','stop'].includes(command),'Use start --test-only | status | code ROLE | stop');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 assert(state.testOnly&&state.syntheticOnly&&state.scenarios.fullFlow,'Not a full-flow synthetic fixture');
 const u=new URL(state.controlUrl);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'3363');
 const request=async(route,method='GET')=>{const r=await fetch(u.origin+route,{method,headers:{Authorization:'Bearer '+state.controlToken},signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();};
 const current=await request('/state');assert.equal(current.pid,state.pid);assert.equal(current.schema,state.schema);
 if(command==='stop'){await request('/shutdown','POST');console.log('已请求关闭本次隔离服务并清理它自己的测试库；不会停止其他数据库。');return;}
 if(command==='code'){
  const person=state.accounts[argument];assert(person&&/^139000098\d{2}$/.test(person.phone),'Unknown synthetic role');
  console.log('仅模拟验证码（先在测试页面点击获取验证码）：'+(await request('/code?phone='+person.phone)).code);return;
 }
 console.log(JSON.stringify({testOnly:true,api:state.apiUrl,web:'http://127.0.0.1:5211',app:'http://127.0.0.1:8780',
  accounts:state.accounts,checkpoints:state.scenarios.fullFlow.journeys,limitations:state.scenarios.fullFlow.limitations},null,2));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
