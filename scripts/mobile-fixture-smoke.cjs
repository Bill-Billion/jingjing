'use strict';
require('../晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
async function main(){
 const state=JSON.parse(fs.readFileSync('.local/pr20-ui-runtime.json','utf8'));
 assert(state.testOnly&&state.syntheticOnly&&state.scenarios.fullFlow);
 assert.equal(state.apiUrl,'http://127.0.0.1:3362');assert.equal(state.controlUrl,'http://127.0.0.1:3363');
 const base='http://127.0.0.1:3380',checks=[];
 async function request(method,path,{body,token,party,status=200}={}){
  const headers={'Idempotency-Key':crypto.randomUUID()};if(token)headers.Authorization='Bearer '+token;if(party)headers['X-Acting-Party']=party;if(body)headers['Content-Type']='application/json';
  const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,status,path);return r;
 }
 async function login(role){
  const phone=state.accounts[role].phone;
  const challenge=(await (await request('POST','/api/v1/auth/sms-challenges',{body:{phone,purpose:'LOGIN'}})).json()).data;
  const r=await fetch(state.controlUrl+'/code?phone='+phone,{headers:{Authorization:'Bearer '+state.controlToken}});assert.equal(r.status,200);const {code}=await r.json();
  return (await (await request('POST','/api/v1/auth/sessions',{body:{phone,challenge_id:challenge.challenge_id,code}})).json()).data.access_token;
 }
 assert.equal((await(await request('GET','/health')).json()).syntheticOnly,true);checks.push('固定隔离资料入口可用');
 const token=await login('payer'),party=state.accounts.payer.actingPartyId;
 await request('GET','/api/v1/me',{token});await request('GET','/api/v1/me/parties',{token});checks.push('模拟验证码经原登录接口验证，账号和身份可读');
 const journeys=state.scenarios.fullFlow.journeys;assert.equal(journeys.length,6);
 for(const j of journeys)await request('GET','/api/v1/trade/records/'+(j.orderId||j.quoteId),{token,party});checks.push('六组不同进度的报价或订单可读');
 const complete=journeys.find(j=>j.stop==='complete');const route='/api/v1/production/versions/'+complete.versionId+'/content?variant=final';
 const r=await request('GET',route,{token,party}),bytes=Buffer.from(await r.arrayBuffer());assert(bytes.length>0);
 const direct=await fetch(state.apiUrl+route,{headers:{Authorization:'Bearer '+token,'X-Acting-Party':party}});assert.equal(direct.status,200);assert.deepEqual(bytes,Buffer.from(await direct.arrayBuffer()));checks.push('已交付私有文件经过入口后字节保持一致');
 const outsider=await login('outsider');await request('GET',route,{token:outsider,party:state.accounts.outsider.actingPartyId,status:404});checks.push('无关用户仍不能读取私有文件');
 await request('DELETE','/api/v1/auth/sessions/current',{token});await request('GET','/api/v1/me',{token,status:401});checks.push('退出后旧登录令牌失效');
 for(const p of ['/state','/code','/api/v1/admin/provider-readiness','/api/v1/trade/notifications/alipay'])await request('GET',p,{token,status:404});await request('POST','/api/v1/trade/notifications/alipay',{token,body:{synthetic:true},status:404});checks.push('控制、管理和支付回调未开放');
 const dir='docs/testing/evidence/20261005/mobile-entry';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/live-checks.json',JSON.stringify({syntheticOnly:true,realMySQL:true,publicAccess:false,checks,passed:checks.length,failed:0,privateFileBytes:bytes.length,privateFileSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),limitations:['本机真实HTTP，不是安卓真机','短信、支付、存储为模拟传输','只联调定制制作资料组；商单和发行需另测']},null,2)+'\n');console.log('PASS: '+checks.length+' actual fixture groups; no tokens or codes recorded');
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
