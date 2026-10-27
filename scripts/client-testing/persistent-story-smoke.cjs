const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {start}=require('./persistent-story.cjs');
(async()=>{
 let running;const checks=[];const name=process.argv[2];
 const request=async(access,role,route,method='GET',body)=>{
  const a=access.accounts[role],r=await fetch(access.base_url+route,{method,headers:{Authorization:'Bearer '+a.bearer_token,'Content-Type':'application/json','X-Acting-Party':a.party_id,'Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};
 };
 try{
  running=await start(name,{hours:1});const original=running.access;
  const draft=await request(original,'buyer','/customization-requests','POST',{template_version_id:original.templates.life,answers:{moment:'跨重启保留的合成测试故事',message:'此文字不是真实个人资料'}});
  assert.equal(draft.status,200,JSON.stringify(draft.body));const id=draft.body.data.id;
  assert.equal((await request(original,'outsider','/customization-requests/'+id)).status,404);checks.push('其他测试账号不能读取本人的故事');
  assert.equal((await request(original,'buyer','/auth/sms-challenges','POST',{})).status,403);checks.push('短信及账号签发路径未开放');
  await assert.rejects(()=>start(name),/EEXIST/);checks.push('同一批资料禁止双进程运行');
  await running.stop();running=null;
  const state=JSON.parse(fs.readFileSync(path.join('.local/client-persistent',name,'status.json')));assert.equal(state.database_retained,true);assert.equal(state.database_removed,false);checks.push('停止服务保留数据库并移除当次访问文件');
  running=await start(name,{hours:1});
  const old={...running.access,accounts:original.accounts};assert.equal((await request(old,'buyer','/me')).status,401);checks.push('重启后旧访问令牌失效');
  const saved=await request(running.access,'buyer','/customization-requests/'+id);assert.equal(saved.status,200);assert.equal(saved.body.data.answers.moment,'跨重启保留的合成测试故事');checks.push('新登录可读取重启前创建的同一故事及原文字');
  const out=path.resolve('docs/testing/evidence/client-local-hosting-20261026');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'PERSISTENCE.json'),JSON.stringify({result:'PASS',checks,scope:'Local isolated story DB; real API write, stop, restart and authorization. Not production or all business lines.'},null,2)+'\n');console.log(JSON.stringify({result:'PASS',checks:checks.length}));
 }finally{if(running)await running.stop();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
