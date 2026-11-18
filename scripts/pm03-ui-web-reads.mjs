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
async function run(role,route,label,action){const page=await browser.newPage({viewport:{width:1440,height:1000}}),u=f.accounts[role],events=[];
 await page.addInitScript(({u,exp})=>{sessionStorage.setItem('ops.session.token',u.bearer_token);sessionStorage.setItem('ops.session.selected',u.party_id);sessionStorage.setItem('ops.session.expires_at',exp)},{u,exp:f.expires_at});
 page.on('response',async r=>{if(r.url().includes('/api/v1/')&&!r.url().includes('/auth/')){const j=await r.json().catch(()=>({}));events.push({path:new URL(r.url()).pathname,status:r.status(),id:j.data?.id,version:j.data?.object_version,kind:j.data?.kind,record_status:j.data?.current_status,error:j.error?.code,rule_ids:j.data?.items?.filter(i=>i.rule_id).map(i=>i.rule_id)})}});
 try{await page.goto('http://127.0.0.1:5173'+route);await page.waitForTimeout(1500);await action(page,events);results.push({label,status:'PASS',events});}
 catch(e){results.push({label,status:'FAIL',message:e.message,body:(await page.locator('body').innerText()).slice(-4500),events});}
 finally{await page.screenshot({path:outDir+'/'+label+'.png'});await page.close()}
}
try{
 await run('buyer','/redemption/holds/'+p.records.hold_id,'ops-hold-current',async(page,e)=>assert(e.some(x=>x.path.endsWith('/holds/'+p.records.hold_id)&&x.status===200&&x.version===2)));
 await run('artist',`/participation/candidates/${f.scenarios.participation.candidate_id}?project_id=${f.scenarios.participation.project_id}`,'ops-participation-rules',async(page,e)=>{await page.getByRole('button',{name:'为已确认候选人填写参演约定',exact:true}).click();const b=page.getByRole('button',{name:'读取可选已审商业财务规则（纯收入分成留空）',exact:true});await b.click();await page.waitForTimeout(300);assert(e.some(x=>x.path.endsWith('/participation-rules')&&x.status===200&&x.rule_ids?.length));const select=page.locator('select').filter({has:page.locator('option',{hasText:'平台22%'})});await select.selectOption({index:1});assert(await select.inputValue());await select.scrollIntoViewIfNeeded();});
}finally{await fs.writeFile(outDir+'/ui-ops-read-results.json',JSON.stringify(results,null,2));await browser.close();console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.status!=='PASS')?1:0;}
