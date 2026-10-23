#!/usr/bin/env node
import assert from'node:assert/strict';import{readFile,writeFile,mkdir}from'node:fs/promises';import{createRequire}from'node:module';import{createHash}from'node:crypto';import{resolve,join}from'node:path';
const f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const {chromium}=createRequire(resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const out=resolve('docs/testing/evidence/figma-frontend-restore-20261023/last-details/error-final');await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),bundle=sha(await readFile('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/figma-browser-final/main.dart.js'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),errors=[],writes=[],shots=[],results=[];
try{
 for(const[name,route,path,mode,id]of[
 ['catalog-read-failure','/notices/catalog','/notices/catalog','503','2004:6412'],
 ['own-records-read-failure','/notices/records?kind=NOTICE','/notices/records','503','2004:6412'],
 ['catalog-loading','/notices/catalog','/notices/catalog','delay','2004:6580'],
 ['session-401','/notices/records?kind=NOTICE','/notices/records','401','2004:6457']]){
  const ctx=await browser.newContext({locale:'zh-CN',viewport:{width:390,height:844}}),p=await ctx.newPage();let release;
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().startsWith(f.base_url)&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(new URL(r.url()).pathname);});
  const hold=new Promise(r=>release=r);let intercepted=0;
  await p.route(f.base_url+path+'**',async r=>{intercepted++;if(mode==='delay'){await hold;await r.continue();}else await r.fulfill({status:Number(mode),headers:{'content-type':'application/json','access-control-allow-origin':'http://127.0.0.1:5500'},body:JSON.stringify({error:{code:mode==='401'?'UNAUTHENTICATED':'SERVICE_UNAVAILABLE',message:'仅隔离页面故障注入'}})});});
  await p.goto('http://127.0.0.1:5500/?fixtureRole=notices_buyer#'+route);
  const placeholder=p.locator('flt-semantics-placeholder');await placeholder.waitFor({state:'attached'});await placeholder.evaluate(e=>e.click());
  if(mode==='delay'){for(let i=0;i<100&&!intercepted;i++)await p.waitForTimeout(100);assert(intercepted>0);await p.waitForTimeout(250);}else{await p.waitForLoadState('networkidle');await p.waitForTimeout(250);}
  const text=await p.locator('body').ariaSnapshot();assert(intercepted>0);assert(!text.includes('当前筛选没有仍有效的已审公开通告。'));assert(!text.includes('当前没有本类型的可读记录。'));
  if(mode==='401')assert(!text.includes('Synthetic film recruitment'));
  const file=name+'.png',bytes=await p.screenshot();await writeFile(join(out,file),bytes);shots.push({file,case:name,width:390,figmaIds:[id],sourceBundleSha256:bundle,sha256:sha(bytes),stateControl:mode==='delay'?'实际GET延迟后放行':'受控HTTP'+mode+'故障；不是正式服务状态'});results.push({name,route,mode,intercepted,text});
  release();await p.waitForLoadState('networkidle');await ctx.close();console.log(name+' CAPTURED');
 }
 assert.equal(errors.length,0);assert.equal(writes.length,0);
}catch(e){errors.push(e.stack);process.exitCode=1;}finally{await browser.close();await writeFile(join(out,'STATE_RESULTS.json'),JSON.stringify({result:errors.length?'FAIL':'CAPTURED_PENDING_VISUAL_REVIEW',synthetic_only:true,controlled_faults_not_business_facts:true,sourceBundleSha256:bundle,results,screenshots:shots,errors,business_writes:writes},null,2)+'\n');console.log(JSON.stringify({shots:shots.length,errors:errors.length,writes:writes.length}));}
