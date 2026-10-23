#!/usr/bin/env node
// Real Flutter shell, isolated synthetic session, no business mutations.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
const root=process.cwd(), f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only && new URL(f.base_url).hostname==='127.0.0.1');
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const out=resolve(process.env.FIGMA_SHELL_OUTPUT||'output/playwright/figma-frontend-restore/shell');await mkdir(out,{recursive:true});
const bundleSha=createHash('sha256').update(await readFile(join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/figma-browser-final/main.dart.js'))).digest('hex');
const results=[],errors=[],writes=[];
const secret=Object.values(f.accounts).map(v=>v.bearer_token);
const clean=s=>secret.reduce((v,t)=>v.replaceAll(t,'[redacted]'),String(s));
async function open(route,width=390){
 const ctx=await browser.newContext({viewport:{width,height:width>=700?1024:844},locale:'zh-CN'}),page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(clean(e.message)));
 page.on('console',m=>{if(/overflowed by|RenderFlex.*overflow|EXCEPTION CAUGHT/.test(m.text()))errors.push(clean(m.text()));});
 page.on('request',r=>{if(r.url().startsWith(f.base_url)&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push({method:r.method(),path:new URL(r.url()).pathname});});
 await page.goto('http://127.0.0.1:5500/?fixtureRole=buyer#'+route);
 await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
 await page.getByRole('heading').first().waitFor();await page.waitForLoadState('networkidle');await page.waitForTimeout(250);
 return{ctx,page};
}
async function shot(page,name){
 const text=await page.locator('body').ariaSnapshot();assert(!text.includes('本机合成联调服务暂不可用')&&!text.includes('页面暂时无法显示'));
 secret.forEach(s=>assert(!text.includes(s)));await page.mouse.move(0,0);await page.waitForTimeout(550);
 const file=name+'.png', bytes=await page.screenshot({path:join(out,file)});
 results.push({name,file,url:page.url(),viewport:page.viewportSize(),sha256:createHash('sha256').update(bytes).digest('hex'),text:clean(text)});
}
try{
 for(const width of [320,390,768]){
  const {ctx,page}=await open('/square',width);await shot(page,'home-artists-'+width);
  await page.getByRole('button',{name:'视频',exact:true}).click();await shot(page,'home-videos-'+width);
  if(width===390){
   await page.getByRole('button',{name:'城市',exact:true}).click();await shot(page,'home-city-picker-'+width);
   await page.getByRole('textbox',{name:/城市名称/}).fill('郑州');await page.getByRole('button',{name:'确定',exact:true}).click();
   await shot(page,'home-videos-city-'+width);
  }
  for(let n=1;n<=4;n++){
   await page.getByRole('tab',{name:['','试镜','通告','消息','我的'][n],exact:true}).click();
   await page.waitForLoadState('networkidle');await page.waitForTimeout(250);await shot(page,['','audition','notices','messages','my'][n]+'-'+width);
   if(n===3){
    for(const [label,suffix] of [['投稿意向','submissions'],['活动投票','activities'],['系统通知','system']]){
     await page.getByRole('button',{name:label,exact:true}).click();
     await page.waitForTimeout(200);await shot(page,'messages-'+suffix+'-'+width);
    }
   }
  }
  await ctx.close();
 }
 for(const route of ['/account','/login','/settings','/agreement','/privacy','/missing-design-screen']){
  const {ctx,page}=await open(route);await shot(page,route.replaceAll('/','').replaceAll('?','-')+'-390');await ctx.close();
 }
 assert.equal(writes.length,0,'Read-only capture must not mutate business records');assert.equal(errors.length,0,'No runtime or overflow errors');
}catch(e){errors.push(clean(e.stack));process.exitCode=1;}
finally{await browser.close();await writeFile(join(out,'SHELL_RESULTS.json'),JSON.stringify({result:errors.length?'FAIL':'CAPTURED_PENDING_VISUAL_REVIEW',synthetic_only:true,app_bundle_sha256:bundleSha,results,errors,business_writes:writes},null,2)+'\n');console.log(JSON.stringify({shots:results.length,errors:errors.length,writes:writes.length}));}
