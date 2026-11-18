import fs from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const envDirectory=path.resolve(process.argv[2]||'');
if(process.argv.length!==3||path.dirname(envDirectory)!==path.join(root,'.local/stock-sandbox')||!/^jx_test_stock_pm03_[a-f0-9]{24}$/.test(path.basename(envDirectory)))throw Error('OWN_BATCH_DIRECTORY_REQUIRED');
const environment=JSON.parse(await fs.readFile(path.join(envDirectory,'access.json'),'utf8'));
if(environment.synthetic_only!==true||environment.mode!=='BATCH'||Date.parse(environment.expires_at)<=Date.now())throw Error('LIVE_SYNTHETIC_BATCH_REQUIRED');
const outDir=path.join(envDirectory,'ui-observations');await fs.mkdir(outDir,{recursive:true});
const require=createRequire(import.meta.url),{chromium}=require('../晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/playwright-core');
const dir=envDirectory,f=JSON.parse(await fs.readFile(dir+'/ui-access.json','utf8')),created=JSON.parse(await fs.readFile(outDir+'/w18-created.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.PM03_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),events=[];
await page.addInitScript(({u,exp})=>{sessionStorage.setItem('ops.session.token',u.bearer_token);sessionStorage.setItem('ops.session.selected',u.party_id);sessionStorage.setItem('ops.session.expires_at',exp)},{u:f.accounts.reviewer,exp:f.expires_at});
page.on('response',async r=>{if(r.url().includes('/api/v1/')&&!r.url().includes('/auth/')){const j=await r.json().catch(()=>({}));events.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status(),id:j.data?.id,record_status:j.data?.current_status,error:j.error?.code})}});
try{
 await page.goto('http://127.0.0.1:5173/wallet-refunds/operations/'+created.id);await page.getByRole('button',{name:'取得本项依据',exact:true}).waitFor();
 const proof=page.waitForResponse(r=>r.url().includes('/evidence/')&&r.request().method()==='GET'&&r.status()===200);await page.getByRole('button',{name:'取得本项依据',exact:true}).click();await proof;const link=page.locator('a[download]');await link.waitFor();const blobUrl=await link.getAttribute('href');const bytes=Buffer.from(await page.evaluate(async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),blobUrl));assert.equal(bytes.toString(),'Synthetic guardian refund evidence only');
 await page.locator('select').first().selectOption('review');await page.locator('select').nth(1).selectOption('APPROVE');await page.locator('input[inputmode=decimal]').fill('1.00');await page.locator('textarea').fill('Synthetic independent verification of uploaded test evidence');
 for(const label of ['已实际核验申请人身份','已核验原充值来源','已核验退款依据','已核验真实有效监护关系','已核对本记录版本与上述操作，明确提交。'])await page.getByLabel(label,{exact:true}).check();
 const review=page.waitForResponse(r=>r.url().endsWith('/review')&&r.request().method()==='POST');await page.getByRole('button',{name:'提交本次办理',exact:true}).click();const rr=await review,rj=await rr.json();assert.equal(rr.status(),200,rj.error?.code);assert.equal(rj.data.current_status,'APPROVED');
 await page.locator('select').first().selectOption('scheduling');await page.getByLabel('已核对本记录版本与上述操作，明确提交。',{exact:true}).check();
 const schedule=page.waitForResponse(r=>r.url().endsWith('/scheduling')&&r.request().method()==='POST');await page.getByRole('button',{name:'提交本次办理',exact:true}).click();const sr=await schedule,sj=await sr.json();assert.equal(sr.status(),200,sj.error?.code);assert.equal(sj.data.task_scheduled,true);assert.equal(sj.data.current_status,'APPROVED');
 await page.screenshot({path:outDir+'/ops-refund-scheduled.png'});await fs.writeFile(outDir+'/refund-joint-result.json',JSON.stringify({status:'PASS',case_id:created.id,recharge_id:created.recharge_id,evidence_sha256:createHash('sha256').update(bytes).digest('hex'),events},null,2));console.log(JSON.stringify({status:'PASS',case_id:created.id,steps:'App submit, Web original evidence, independent review, durable scheduling; no settlement yet'}));
}catch(e){await page.screenshot({path:outDir+'/ops-refund-failed.png'});console.log((await page.locator('body').innerText()).slice(-3500));throw e}finally{await fs.writeFile(outDir+'/ops-refund-events.json',JSON.stringify(events,null,2));await browser.close()}
