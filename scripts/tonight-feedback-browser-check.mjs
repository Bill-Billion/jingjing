import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join,sep} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import http from 'node:http';

const require=createRequire(resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'));
const {chromium}=require('playwright-core');
const {createPortal}=require(resolve('scripts/client-testing/server.cjs'));
const {sha}=require(resolve('scripts/client-testing/store.cjs'));
const {captureBuildManifest}=require(resolve('scripts/client-testing/build-manifest.cjs'));
const root=resolve('.local/client-testing'),out=resolve('.local/tonight-feedback-20261104');
await mkdir(root,{recursive:true});await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(root,'tonight-synthetic-'));
assert(dir.startsWith(root+sep));
const result={synthetic_only:true,started_at:new Date().toISOString(),steps:[],cleanup:{},passed:false};
const watched=['scripts/tonight-feedback-browser-check.mjs','scripts/client-testing/server.cjs','scripts/client-testing/explore-client.js','scripts/client-testing/client.js','scripts/client-testing/bridge.js'];
async function hashes(){return Object.fromEntries(await Promise.all(watched.map(async p=>[p,createHash('sha256').update(await readFile(resolve(p))).digest('hex')])));}
let server,browser;
try{
 result.source_sha256=await hashes();
 const build=join(dir,'build');await mkdir(build);
 await writeFile(join(build,'index.html'),'<!doctype html><html><head><meta charset="utf-8"></head><body><h1>合成业务表单</h1><label>未提交内容<textarea id="business"></textarea></label></body></html>');
 const probe=http.createServer();await new Promise((ok,bad)=>{probe.once('error',bad);probe.listen(0,'127.0.0.1',ok)});const port=probe.address().port;await new Promise(ok=>probe.close(ok));
 const origin=`http://127.0.0.1:${port}`,version='b0ed887871ea07f8dcaf2c5e4258042a99d7b82c';
 const cfg={synthetic_only:true,origin,port,version,expires_at:new Date(Date.now()+3600000).toISOString(),data_dir:join(dir,'records'),routes:[],builds:{app:build,workspace:build},accounts:{buyer:{base_url:'http://127.0.0.1:39999/api/v1',bearer_token:'synthetic-upstream-only',party_id:'buyer',account_id:'buyer'}},invites:[{id:'synthetic-reviewer',name:'测试负责人',reviewer:true,code_hash:sha(randomUUID())}],open_exploration:{visitor_secret:randomBytes(32).toString('hex'),default_account:'buyer',personas:[{account:'buyer',title:'客户',home:'/app/#/square'}]}};
 cfg.build_manifest=captureBuildManifest(cfg.builds,version);server=createPortal(cfg);await new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',ok)});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});const page=await context.newPage();
 await page.goto(origin);await page.locator('#main').waitFor({state:'visible'});const frame=page.frameLocator('#app');await frame.locator('#business').fill('合成业务草稿，不应因反馈丢失');
 await frame.locator('#business').evaluate(()=>{location.hash='/wallet/records?orderId=synthetic-order-1&token=synthetic-secret'});
 await page.waitForTimeout(400);await page.locator('#feedback').click();await page.locator('#description').fill('合成问题：保存后断线');await page.locator('#expected').fill('保留原请求后恢复');await page.locator('#reference').fill('synthetic-order-1');
 const displayed=await page.locator('#context').innerText();assert(displayed.includes('orderId=synthetic-order-1'),'business reference missing');result.context_exposed_secret=displayed.includes('synthetic-secret');
 const writes=[];let dropped=false;await page.route('**/__test/issues',async route=>{const req=route.request();if(req.method()!=='POST')return route.continue();writes.push({key:req.headers()['idempotency-key'],body:req.postData()});if(!dropped){dropped=true;const response=await route.fetch();assert.equal(response.status(),201);return route.abort('failed')}return route.continue()});
 await page.locator('#feedbackForm button[type=submit]').click();await page.getByText('结果尚未核实', {exact:false}).waitFor();
 assert.equal(await page.locator('#description').inputValue(),'合成问题：保存后断线');assert(await page.locator('#description').isDisabled());assert.equal(await frame.locator('#business').inputValue(),'合成业务草稿，不应因反馈丢失');
 await page.screenshot({path:join(out,'feedback-pending.png'),fullPage:true});result.steps.push('response-lost-retains-feedback-and-business-draft');
 await page.getByRole('button',{name:'恢复刚才的提交'}).click();await page.locator('#feedbackDialog').waitFor({state:'hidden'});assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.equal(writes[0].body,writes[1].body);result.request_exposed_secret=writes[0].body.includes('synthetic-secret');assert(!result.context_exposed_secret,'feedback context exposes URL secret');assert(!result.request_exposed_secret,'request transmits URL secret');
 await page.locator('#showIssues').click();await page.locator('.issue').first().waitFor();assert.equal(await page.locator('.issue').count(),1);const rows=await page.evaluate(async()=>await (await fetch('/__test/issues')).json());assert.equal(rows.issues.length,1);assert(rows.issues[0].context.route.includes('orderId=synthetic-order-1'));assert(!JSON.stringify(rows).includes('synthetic-secret'));assert.equal(rows.issues[0].context.version,version);result.issue_id=rows.issues[0].id;result.steps.push('same-key-one-issue-sanitized-context');
 await page.reload();await page.locator('#main').waitFor({state:'visible'});await page.locator('#showIssues').click();await page.locator('.issue').first().waitFor();assert.equal(await page.locator('.issue').count(),1);await page.screenshot({path:join(out,'feedback-restored.png'),fullPage:true});result.steps.push('reload-restores-original-visitor-issue');
 await context.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));
 const invitation='synthetic-invitation-code-123456';
 const invited={...cfg,data_dir:join(dir,'invited-records'),open_exploration:undefined,invites:[{id:'synthetic-buyer',name:'合成买方',reviewer:false,account:'buyer',code_hash:sha(invitation)}],routes:[{id:'wallet',title:'合成钱包',path:'/app/#/wallet/records?orderId=synthetic-order-2&token=synthetic-secret',instructions:'合成表单',accounts:['buyer']}]};
 server=createPortal(invited);await new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',ok)});
 const invitedContext=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'}),invitedPage=await invitedContext.newPage();await invitedPage.goto(origin);await invitedPage.locator('#code').fill(invitation);await invitedPage.getByRole('button',{name:'进入测试'}).click();await invitedPage.locator('#main').waitFor({state:'visible'});await invitedPage.locator('#start').click();await invitedPage.frameLocator('#app').locator('#business').waitFor();await invitedPage.waitForTimeout(300);await invitedPage.locator('#feedback').click();
 const inviteContext=await invitedPage.locator('#context').innerText();assert(inviteContext.includes('orderId=synthetic-order-2'));assert(!inviteContext.includes('synthetic-secret'));await invitedPage.locator('#description').fill('合成邀请模式反馈');let submitted;invitedPage.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/__test/issues'))submitted=r.postData()});await invitedPage.locator('#feedbackForm button[type=submit]').click();await invitedPage.locator('#feedbackDialog').waitFor({state:'hidden'});assert(submitted&&!submitted.includes('synthetic-secret'));result.steps.push('invited-mode-sanitizes-before-display-and-submit');await invitedContext.close();
 assert.deepEqual(await hashes(),result.source_sha256,'source changed during browser check');result.passed=true;
}catch(e){result.error=e.stack;process.exitCode=1;console.error(e.stack)}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));result.cleanup.server_stopped=true}await rm(dir,{recursive:true,force:true});result.cleanup.synthetic_directory_removed=true;result.finished_at=new Date().toISOString();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));}
