import fs from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const envDirectory=path.resolve(process.argv[2]||'');
if(process.argv.length!==3||path.dirname(envDirectory)!==path.join(root,'.local/stock-sandbox')||!/^jx_test_stock_pm03_[a-f0-9]{24}$/.test(path.basename(envDirectory)))throw Error('OWN_BATCH_DIRECTORY_REQUIRED');
const environment=JSON.parse(await fs.readFile(path.join(envDirectory,'access.json'),'utf8'));
if(environment.synthetic_only!==true||environment.mode!=='BATCH'||Date.parse(environment.expires_at)<=Date.now())throw Error('LIVE_SYNTHETIC_BATCH_REQUIRED');
const outDir=path.join(envDirectory,'ui-observations');await fs.mkdir(outDir,{recursive:true});
const require=createRequire(import.meta.url),{chromium}=require('../晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/playwright-core');
const dir=envDirectory,f=JSON.parse(await fs.readFile(dir+'/ui-access.json','utf8')),created=JSON.parse(await fs.readFile(outDir+'/w18-created.json','utf8')),events=[];
const b=await chromium.launch({executablePath:process.env.PM03_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const app=await b.newPage({viewport:{width:420,height:900}});app.on('response',async r=>{if(r.request().method()==='GET'&&r.url().includes('/guardian-recharge-refunds/')){const j=await r.json();events.push({client:'APP',id:j.data?.id,status:j.data?.current_status,amount_minor:j.data?.amount_minor,http:r.status()})}});
 const listReply=app.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/guardian-recharge-refunds'));
 await app.goto('http://127.0.0.1:5500/?fixtureRole=stock_seller#/wallet/guardian-refunds');await app.waitForSelector('flt-glass-pane',{state:'attached'});await app.locator('flt-semantics-placeholder').evaluate(e=>e.click());const list=await (await listReply).json(),index=list.data.items.findIndex(r=>r.id===created.id);assert(index>=0);await app.getByRole('button',{name:'查看原退款申请',exact:true}).nth(index).click();await app.getByRole('button',{name:'重读当前申请',exact:true}).waitFor();await app.screenshot({path:outDir+'/app-refund-terminal.png'});assert(events.some(e=>e.id===created.id&&e.status==='SUCCEEDED'&&e.amount_minor===100));
 const web=await b.newPage({viewport:{width:1440,height:1000}});await web.addInitScript(({u,exp})=>{sessionStorage.setItem('ops.session.token',u.bearer_token);sessionStorage.setItem('ops.session.selected',u.party_id);sessionStorage.setItem('ops.session.expires_at',exp)},{u:f.accounts.reviewer,exp:f.expires_at});
 const terminal=web.waitForResponse(r=>r.url().endsWith('/operations/recharge-refunds/'+created.id));await web.goto('http://127.0.0.1:5173/wallet-refunds/operations/'+created.id);const r=await terminal,j=await r.json();assert.equal(j.data.current_status,'SUCCEEDED');events.push({client:'WEB',id:j.data.id,status:j.data.current_status,amount_minor:j.data.amount_minor,http:r.status()});await web.getByRole('heading',{name:'退款已核实成功',exact:true}).waitFor();await web.screenshot({path:outDir+'/ops-refund-terminal.png'});
 assert(Number.isSafeInteger(created.before_refunded_minor));
 const guardian=f.accounts.stock_seller,res=await fetch(f.base_url+'/wallet/guardian-recharge-refund-options?guardian_link_id='+f.scenarios.guardian_refund.guardian_link_id,{headers:{Authorization:'Bearer '+guardian.bearer_token}}),record=await res.json();assert.equal(res.status,200);const refunded=record.data.items.find(r=>r.id===created.recharge_id).refunded_minor;assert.equal(refunded,created.before_refunded_minor+100);events.push({client:'GUARDIAN_AUTHORIZED_SOURCE_HTTP',id:created.recharge_id,before_refunded_minor:created.before_refunded_minor,refunded_minor:refunded,http:res.status});
 console.log(JSON.stringify({status:'PASS',events}));
}finally{await fs.writeFile(outDir+'/refund-terminal-results.json',JSON.stringify(events,null,2));await b.close()}
