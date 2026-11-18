import fs from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const envDirectory=path.resolve(process.argv[2]||'');
if(process.argv.length!==3||path.dirname(envDirectory)!==path.join(root,'.local/stock-sandbox')||!/^jx_test_stock_pm03_[a-f0-9]{24}$/.test(path.basename(envDirectory)))throw Error('OWN_BATCH_DIRECTORY_REQUIRED');
const environment=JSON.parse(await fs.readFile(path.join(envDirectory,'access.json'),'utf8'));
if(environment.synthetic_only!==true||environment.mode!=='BATCH'||Date.parse(environment.expires_at)<=Date.now())throw Error('LIVE_SYNTHETIC_BATCH_REQUIRED');
const outDir=path.join(envDirectory,'ui-observations');await fs.mkdir(outDir,{recursive:true});
const require=createRequire(import.meta.url),{chromium}=require('../晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/playwright-core');
const dir=envDirectory,f=JSON.parse(await fs.readFile(dir+'/ui-access.json','utf8')),p=JSON.parse(await fs.readFile(dir+'/batch-smoke-private.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.PM03_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),results=[];
async function app(role,route,label,action){const page=await browser.newPage({viewport:{width:420,height:900}}),events=[];
 page.on('response',async r=>{if(r.url().includes('/api/v1/')&&!r.url().includes('/auth/')){const j=await r.json().catch(()=>({}));events.push({path:new URL(r.url()).pathname,status:r.status(),id:j.data?.id,version:j.data?.object_version,kind:j.data?.kind,record_status:j.data?.current_status,error:j.error?.code,rule_ids:j.data?.items?.filter(i=>i.rule_id).map(i=>i.rule_id)})}});
 try{await page.goto('http://127.0.0.1:5500/?fixtureRole='+role+'#'+route);await page.waitForSelector('flt-glass-pane',{state:'attached'});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click()).catch(()=>{});await page.waitForTimeout(1800);await action(page,events);await page.screenshot({path:outDir+'/'+label+'.png'});results.push({label,status:'PASS',events});}
 catch(e){await page.screenshot({path:outDir+'/'+label+'-failed.png'});results.push({label,status:'FAIL',message:e.message,body:(await page.locator('body').innerText()).slice(-2500),events});}
 finally{await page.close()}
}
async function reveal(page,locator){for(let n=0;n<28;n++){if(await locator.count()){await locator.scrollIntoViewIfNeeded();return;}await page.mouse.move(200,450);await page.mouse.wheel(0,450);await page.waitForTimeout(160)}throw Error('UI action not reachable');}
try{
 for(let i=0;i<2;i++)await app('buyer',`/redemption?view=checkout&recordId=${f.scenarios.coupon.grant_id}&quoteId=${f.scenarios.coupon.quote_id}`,'app-hold-reentry-'+i,async(page,events)=>{assert(events.some(e=>e.path.endsWith('/holds/'+p.records.hold_id)&&e.status===200&&e.record_status==='HELD'));const b=page.getByRole('button',{name:'重读本次占用',exact:true});await reveal(page,b);await b.click();await page.waitForTimeout(300);assert.equal(events.filter(e=>e.path.endsWith('/holds/'+p.records.hold_id)).length,2);});
 await app('artist',`/projects/participation?view=new&recordId=${f.scenarios.participation.candidate_id}`,'app-participation-rules',async(page,events)=>{const b=page.getByRole('button',{name:'读取当前角色可用规则',exact:true});await reveal(page,b);await b.click();await page.waitForTimeout(400);assert(events.some(e=>e.path.endsWith('/participation-rules')&&e.status===200&&e.rule_ids?.length));await page.mouse.move(200,450);await page.mouse.wheel(0,400);await page.waitForTimeout(250);await page.mouse.click(220,587);await page.waitForTimeout(250);await page.getByRole('menuitem').first().click();await page.getByRole('menuitem').first().waitFor({state:'hidden'});});
}finally{await fs.writeFile(outDir+'/ui-four-read-results.json',JSON.stringify(results,null,2));await browser.close();console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.status!=='PASS')?1:0;}
