#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const suite=process.env.FIGMA_FOUNDATION_SUITE||'story';assert(['story','extra'].includes(suite));
const f=JSON.parse(await readFile(suite==='story'?process.env.CUSTOMIZATION_ACCESS_FILE:process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const {chromium}=createRequire(join(process.cwd(),'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const out=resolve(process.env.FIGMA_STORY_OUTPUT||'output/playwright/figma-frontend-restore/'+suite);await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const secrets=Object.values(f.accounts).map(v=>v.bearer_token);const clean=v=>secrets.reduce((s,t)=>s.replaceAll(t,'[redacted]'),String(v));
const bundle=await readFile('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/figma-browser-final/main.dart.js');
const sha=v=>createHash('sha256').update(v).digest('hex');
const matrix=process.env.FIGMA_CAPTURE_CASES_FILE?JSON.parse(await readFile(process.env.FIGMA_CAPTURE_CASES_FILE,'utf8')):suite==='story'?[
 ['story-list','buyer','/customization','2004:3737'],
 ['story-new','buyer','/customization/new','2004:3737'],
 ['story-new-family','buyer','/customization/new','2004:3737'],
 ['story-new-life','buyer','/customization/new','2004:3737'],
 ['story-attachment-blocked','buyer','/customization/new','2004:3737'],
 ...Object.entries(f.requests).map(([k,id])=>['story-'+k,'buyer','/customization/'+id,'2004:3737']),
 ['quote-detail','merchant','/trade/record?recordId='+f.trade.quote_id,'2004:3091'],
 ['orders','buyer','/orders','2004:2898'],
 ['contract-directory','buyer','/contract','2004:3302'],
 ['private-forbidden','outsider','/customization/'+f.requests.draft,'2004:6502'],
]:[
 ['search','buyer','/search','22:738'],
 ['producer-public','buyer',UriRoute('/producers/public',f.scenarios.design_publisher),'22:1031'],
 ['invoices','buyer','/invoices','2004:3564'],
 ['saved','buyer','/saved','2004:4444'],
 ['help','buyer','/help','2004:4618'],
 ['approved-quote','buyer','/trade/record?recordId='+f.scenarios.full_coupon.quote_id,'2004:3091'],
 ['stock-unlisted-public','stock_buyer','/stock/video?listingId='+f.scenarios.stock_unlisted.listing_id,'2004:6541'],
 ['public-empty','buyer','/stock/catalog?city='+encodeURIComponent('不存在的隔离城市'),'2004:6374'],
];
function UriRoute(path,p){return path+'?'+new URLSearchParams({partyId:p.party_id,city:p.city});}

const screenshots=[],results=[],errors=[],writes=[],external=[],expected=[];
const widths=(process.env.FIGMA_STORY_WIDTHS||'390,320,768').split(',').map(Number);assert(widths.every(x=>[320,390,768].includes(x)));
const only=(process.env.FIGMA_STORY_CASES||'').split(',').filter(Boolean);
try{
for(const width of widths)for(const [name,role,route,figmaId]of matrix){
 if(only.length&&!only.includes(name))continue;
 if(!process.env.FIGMA_CAPTURE_CASES_FILE&&width!==390&&!(suite==='story'?['story-draft','story-new','quote-detail']:['search','producer-public','help']).includes(name))continue;
 const context=await browser.newContext({locale:'zh-CN',viewport:{width,height:width===768?1024:844}}),page=await context.newPage();page.setDefaultTimeout(25000);
 const network=[];
 page.on('pageerror',e=>errors.push({name,width,error:clean(e.message)}));
 page.on('console',m=>{if(/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/.test(m.text()))errors.push({name,width,error:clean(m.text())});});
 page.on('request',r=>{const u=new URL(r.url());if(r.url().startsWith(f.base_url)&&!['GET','OPTIONS','HEAD'].includes(r.method()))writes.push({method:r.method(),path:u.pathname});if(u.protocol.startsWith('http')&&u.hostname!=='127.0.0.1')external.push({name,url:r.url()});});
 page.on('response',r=>{if(r.url().startsWith(f.base_url))network.push({path:new URL(r.url()).pathname,status:r.status()});});
 try{
  await page.goto(`http://127.0.0.1:5500/?fixtureGroup=${suite==='story'?'story':'r05r12'}&fixtureRole=${role}#${route}`);
  await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
  await page.getByRole('heading').first().waitFor();await page.waitForLoadState('networkidle');
  if (['story-new-family','story-new-life','story-attachment-blocked'].includes(name)) {
   const pattern = name === 'story-new-family' ? /^测试用家庭故事/ : name === 'story-new-life' ? /^测试用人生片段/ : /^测试用必填附件场景/;
   const target = page.getByRole('button',{name:pattern});
   for(let n=0;n<20;n++){
    const box=await target.count()?await target.boundingBox():null;
    if(box&&box.y>55&&box.y+box.height<page.viewportSize().height-20){await page.mouse.click(box.x+box.width/2,box.y+box.height/2);break;}
    await page.mouse.move(width/2,350);await page.mouse.wheel(0,250);await page.waitForTimeout(100);
   }
   await page.waitForLoadState('networkidle');
  }
  // Wide layouts centre the scrollable column; scrolling in the left margin
  // neither reaches its beginning nor proves that its last action is visible.
  await page.mouse.move(width/2,350);await page.mouse.wheel(0,-20000);await page.waitForTimeout(200);
  const text=await page.locator('body').ariaSnapshot();assert(!/本机合成联调服务暂不可用|页面暂时无法显示/.test(text));secrets.forEach(t=>assert(!text.includes(t)));
  let previous,unchanged=0,bottom=false;
  for(let index=0;index<24;index++){
   await page.mouse.move(0,0);await page.waitForTimeout(100);const bytes=await page.screenshot();const hash=sha(bytes);
   if(hash===previous){if(++unchanged>=2){bottom=true;break;}}else{
    unchanged=0;const file=`${name}-${width}-${index}.png`;await writeFile(join(out,file),bytes);screenshots.push({file,name,figmaId,route,role,width,position:index,sha256:hash});
   }
   previous=hash;await page.mouse.move(width/2,400);await page.mouse.wheel(0,600);await page.waitForTimeout(120);
  }
  results.push({name,width,route,status:bottom?'CAPTURED_FULL_SCROLL':'CAPTURED_SCROLL_LIMIT',figmaId,text:clean(text),network});assert(bottom,name+' did not reach a stable bottom');
  console.log(name+' '+width+' CAPTURED');
 }catch(e){errors.push({name,width,error:clean(e.stack)});results.push({name,width,route,status:'FAIL'});process.exitCode=1;}
 await context.close();
}
assert.equal(writes.length,0,'No business mutations');
}finally{
await browser.close();await writeFile(join(out,suite==='story'?'STORY_RESULTS.json':'EXTRA_RESULTS.json'),JSON.stringify({result:errors.length?'FAIL':'CAPTURED_PENDING_VISUAL_REVIEW',synthetic_only:true,app_bundle_sha256:sha(bundle),results,screenshots,errors,business_writes:writes,external_resources:external},null,2)+'\n');console.log(JSON.stringify({pages:results.length,shots:screenshots.length,errors:errors.length,writes:writes.length}));}
