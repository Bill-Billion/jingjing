import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'));
const {chromium}=require('playwright-core');
const cfg=JSON.parse(await readFile(process.argv[2],'utf8')),base=cfg.origin;
assert(base.startsWith('http://127.0.0.1:'));
const out=resolve(process.env.CLIENT_TEST_EVIDENCE||'docs/testing/evidence/tonight-complete-20261104/portal'),privateDir=resolve(process.env.CLIENT_TEST_PRIVATE_DIR||'.local/tonight-execution-20261104');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[],errors=[];let failure;
const resumed=process.argv[3]==='resume';
const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',...(resumed?{storageState:resolve(privateDir,'browser-a-state.json')}:{})});
await ctx.route('**/*',r=>new URL(r.request().url()).origin===base||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
const json=async(route)=>{const r=await ctx.request.get(base+route);assert.equal(r.status(),200);return r.json();};
try{
 await p.goto(base);await p.locator('#main').waitFor();
 const first=await json('/__test/bootstrap');assert.equal(await p.locator('#code,#scenario').count(),0);
 if(resumed){
  const before=JSON.parse(await readFile(resolve(privateDir,'browser-proof.json'),'utf8'));
  assert.equal(first.account_id,before.account_id);
  assert((await json('/__test/issues')).issues.some(i=>i.id===before.issue_id));
  results.push({name:'重启后原浏览器恢复本人账号和原问题',status:'PASS',account_id:first.account_id,issue_id:before.issue_id});
 }else{
  const b=await browser.newContext();await b.request.post(base+'/__test/enter',{headers:{Origin:base},data:{}});
  const second=await (await b.request.get(base+'/__test/bootstrap')).json();assert.notEqual(first.account_id,second.account_id);assert.notEqual(first.party_id,second.party_id);
  const aOrders=await ctx.request.get(base+'/api/v1/trade/records?kind=ORDER',{headers:{Authorization:'Bearer '+first.bearer_token,'X-Acting-Party':first.party_id}});
  const bOrders=await b.request.get(base+'/api/v1/trade/records?kind=ORDER',{headers:{Authorization:'Bearer '+second.bearer_token,'X-Acting-Party':second.party_id}});
  assert.equal(aOrders.status(),200);assert.equal(bOrders.status(),200);
  results.push({name:'两个浏览器真实业务账号及办理身份分离',status:'PASS',accounts:[first.account_id,second.account_id]});
  await b.close();
  for(const persona of cfg.open_exploration.personas){
   await p.locator('#personas').click();p.once('dialog',d=>d.accept());await Promise.all([p.waitForEvent('framenavigated',f=>f.parentFrame()!==null&&f.url().startsWith(base+persona.home.split('#')[0])),p.getByRole('button',{name:persona.title,exact:true}).click()]);
   const f=p.locator('#app').contentFrame();
   if(persona.home.startsWith('/workspace/'))await f.locator('h1').first().waitFor({timeout:60000});
   else{if(!await f.locator('flt-semantics').count()){await f.locator('flt-semantics-placeholder').waitFor({state:'attached',timeout:60000});await f.locator('flt-semantics-placeholder').evaluate(e=>e.click());}await f.locator('flt-semantics').first().waitFor({timeout:60000});}
   assert.equal((await json('/__test/me')).account,persona.account);
   assert(!/测试会话暂不可用|测试会话不可用/.test(await f.locator('body').innerText()));
   await p.screenshot({path:resolve(out,persona.account+'.png')});results.push({name:persona.title,status:'PASS'});
  }
  await p.locator('#personas').click();p.once('dialog',d=>d.accept());await p.getByRole('button',{name:cfg.open_exploration.personas[0].title,exact:true}).click();
  await p.locator('#feedback').click();await p.locator('#description').fill('今晚检查：同一浏览器重启后，订单与反馈继续保留。');await p.getByRole('button',{name:'提交问题',exact:true}).click();await p.locator('#feedbackDialog').waitFor({state:'hidden'});
  const issue=(await json('/__test/issues')).issues.at(-1);assert(issue?.id);
  await ctx.storageState({path:resolve(privateDir,'browser-a-state.json')});
  await writeFile(resolve(privateDir,'browser-proof.json'),JSON.stringify({account_id:first.account_id,issue_id:issue.id}));
  results.push({name:'实际页面提交问题并保存原浏览器恢复资料',status:'PASS',issue_id:issue.id});
 }
}catch(e){failure=e.message;process.exitCode=1;await p.screenshot({path:resolve(out,resumed?'resume-failed.png':'failed.png')}).catch(()=>{});}
finally{await ctx.storageState({path:resolve(privateDir,'browser-latest-state.json')}).catch(()=>{});await browser.close();await writeFile(resolve(out,resumed?'RESUME.json':'RESULTS.json'),JSON.stringify({source:cfg.version,synthetic_only:true,scope:'真实入口和岗位切换；不替代16岗位全部业务验收',results,errors,failure},null,2));console.log(JSON.stringify({checks:results.length,failure}));}
