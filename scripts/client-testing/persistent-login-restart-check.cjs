'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {start}=require('./persistent-story.cjs');
async function run(name,output){
 const root=path.resolve(__dirname,'../..'),out=path.resolve(root,output);assert(out.startsWith(path.join(root,'docs/testing/evidence')+path.sep)&&!fs.existsSync(out));
 const checks=[],report={synthetic_only:true,database:name,checks};let runtime;
 async function request(route,{token,party,body,key=crypto.randomUUID()}={}){
  const response=await fetch(runtime.access.base_url+route,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(party?{'X-Acting-Party':party}:{}),'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();return {status:response.status,...data};
 }
 try{
  runtime=await start(name,{hours:1});const p=runtime.access.scenarios.complete.phone;
  const phone=p.new_phone,challenge=await request('/auth/sms-challenges',{body:{phone,purpose:'LOGIN'}});assert.equal(challenge.status,200);
  const inbox=JSON.parse(fs.readFileSync(path.join(runtime.dir,'phone-codes.json'),'utf8'));assert(inbox.synthetic_only);
  const key=crypto.randomUUID(),body={phone,challenge_id:challenge.data.challenge_id,code:inbox.codes[phone]};
  const login=await request('/auth/sessions',{key,body});assert.equal(login.status,200);
  const oldFixture=runtime.access.accounts.stock_buyer;assert.equal(login.data.account.id,oldFixture.account_id,'Run after the phone-change complete check');
  const replay=await request('/auth/sessions',{key,body});assert.equal(replay.data.access_token,login.data.access_token);
  checks.push({name:'模拟短信登录及原请求恢复',result:'PASS',account_id:oldFixture.account_id});
  await runtime.stop();runtime=await start(name,{hours:1});
  assert.equal((await request('/me',{token:login.data.access_token})).status,401);assert.equal((await request('/me',{token:oldFixture.bearer_token})).status,401);
  const old=await request('/auth/sessions',{key,body});assert.equal(old.status,401);
  checks.push({name:'重启成功、原短信及旧测试会话失效，原登录请求不能复活',result:'PASS'});
  const current=runtime.access.accounts.stock_buyer;
  assert.equal((await request('/me',{token:current.bearer_token})).data.id,oldFixture.account_id);
  const order=runtime.access.scenarios.complete.order_id;
  assert.equal((await request('/trade/records/'+order,{token:current.bearer_token,party:current.party_id})).data.id,order);
  checks.push({name:'新会话仍属于原账号，原订单保留',result:'PASS',order_id:order});report.result='PASS';
 }catch(e){report.result='FAIL';report.failure=e.message;process.exitCode=1;}
 finally{if(runtime)await runtime.stop();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});}
 console.log(JSON.stringify({result:report.result,checks:checks.length,failure:report.failure}));
}
if(require.main===module)run(process.argv[2],process.argv[3]).catch(()=>{console.error('测试未完成；私有登录信息未输出。');process.exitCode=1;});
