#!/usr/bin/env node
// Open/cancel the actual date and time dialogs. Never submit an artist form.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const fixture=JSON.parse(await readFile(process.env.ARTISTS_ACCESS_FILE,'utf8'));
assert(fixture.synthetic_only&&new URL(fixture.base_url).hostname==='127.0.0.1');
const tokens=Object.values(fixture.accounts).map(a=>a.bearer_token);
const clean=v=>tokens.reduce((s,t)=>s.replaceAll(t,'[redacted]'),String(v));
const {chromium}=createRequire(resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const out=resolve(process.env.FIGMA_DATE_OUTPUT||'docs/testing/evidence/figma-frontend-restore-20261023/followup/date-controls');
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const bundle=hash(await readFile('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/figma-browser-final/main.dart.js'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const screenshots=[],results=[],errors=[],writes=[],external=[];
let currentPage;
try{
 for(const width of [320,390]){
  const context=await browser.newContext({locale:'zh-CN',timezoneId:'Asia/Shanghai',viewport:{width,height:844}});
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(25000);
  page.on('pageerror',e=>errors.push(clean(e.message)));
  page.on('console',m=>{if(/overflowed by|RenderFlex.*overflow|EXCEPTION CAUGHT/.test(m.text()))errors.push(clean(m.text()));});
  page.on('request',r=>{
   if(r.url().startsWith(fixture.base_url)&&!['GET','OPTIONS','HEAD'].includes(r.method()))writes.push({method:r.method(),path:new URL(r.url()).pathname});
   if(r.url().startsWith('http')&&new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());
  });
  const route='/artists/form?mode=CONSENT&personId='+fixture.person_id;
  await page.goto('http://127.0.0.1:5500/?fixtureGroup=artists&fixtureRole=artist#'+route);
  await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});
  await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
  await page.getByRole('heading').first().waitFor();await page.waitForLoadState('networkidle');
  const field=page.getByRole('textbox',{name:/开始时间/}).first();
  for(let n=0;n<50;n++){
   const b=await field.count()?await field.boundingBox():null;
   if(b&&b.y>60&&b.y+b.height<824)break;
   await page.mouse.move(width/2,400);await page.mouse.wheel(0,250);await page.waitForTimeout(120);
  }
  const before=await field.inputValue();assert.equal(before,'');
  const b=await field.boundingBox();assert(b&&b.y>60&&b.y+b.height<824);
  await page.mouse.click(b.x+b.width/2,b.y+Math.min(20,b.height/2));
  await page.getByRole('dialog').waitFor();
  await page.getByRole('group',{name:/选择本地日期/}).waitFor();
  assert((await page.getByRole('dialog').ariaSnapshot()).includes('选择本地日期'));
  async function shot(name){
   await page.mouse.move(0,0);await page.waitForTimeout(250);
   const file=name+'-'+width+'.png',bytes=await page.screenshot();await writeFile(resolve(out,file),bytes);
   const text=clean(await page.locator('body').ariaSnapshot());tokens.forEach(t=>assert(!text.includes(t)));
   screenshots.push({file,case:name,width,route,figmaIds:['22:656','2004:1402'],sourceBundleSha256:bundle,sha256:hash(bytes)});
   return text;
  }
  await shot('artist-date-calendar');
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('group',{name:/选择本地时间/}).waitFor();
  assert((await page.getByRole('dialog').ariaSnapshot()).includes('选择本地时间'));
  await shot('artist-date-time');
  await page.getByRole('button',{name:'返回',exact:true}).click();
  assert.equal(await field.inputValue(),before,'Cancelling the time dialog must not write a partial date');
  const text=await shot('artist-date-cancelled');
  assert(text.includes('UTC+08:00')&&text.includes('提交时转为UTC'));
  results.push({name:'date-time-cancel-'+width,width,result:'PASS',empty_value_preserved:true,local_timezone:'Asia/Shanghai',business_write_count:0});
  await context.close();
 }
 assert.equal(writes.length,0);assert.equal(errors.length,0);assert.equal(external.length,0,'No external font/resource dependency');
}catch(e){
 errors.push(clean(e.stack));process.exitCode=1;
 if(currentPage){
  await currentPage.screenshot({path:resolve(out,'FAILED_CAPTURE.png')}).catch(()=>{});
  await writeFile(resolve(out,'FAILED_CAPTURE.aria.txt'),clean(await currentPage.locator('body').ariaSnapshot().catch(()=>''))).catch(()=>{});
 }
}
finally{
 await browser.close();await writeFile(resolve(out,'DATE_RESULTS.json'),JSON.stringify({result:errors.length?'FAIL':'CAPTURED_PENDING_VISUAL_REVIEW',synthetic_only:true,sourceBundleSha256:bundle,results,screenshots,errors,business_writes:writes,external_resources:external},null,2)+'\n');
 console.log(JSON.stringify({checks:results.length,shots:screenshots.length,errors:errors.length,writes:writes.length}));
}
