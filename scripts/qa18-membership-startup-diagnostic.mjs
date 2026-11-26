// Bounded, read-only follow-up of ENV063 on the original /wallet/scout page.
// Compares page.close (old driver) with context.close; never repeats financial actions.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.resolve(process.env.QA18_OUTPUT_DIR);
assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));await fs.mkdir(out,{recursive:false});
const access=JSON.parse(await fs.readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(access.synthetic_only&&Date.parse(access.expires_at)>Date.now()&&new URL(access.base_url).hostname==='127.0.0.1');
const role='buyer',u=access.accounts[role],hash=b=>createHash('sha256').update(b).digest('hex');
const appRoot='晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app',old=path.join(root,'docs/testing/evidence/pm04-g1-t1-personal-ui-20261126');
const appSource=JSON.parse(await fs.readFile(path.join(old,'APP_SOURCE_MANIFEST.json'),'utf8'));
const appBuild=JSON.parse(await fs.readFile(path.join(old,'APP_BROWSER_BUILD_MANIFEST.json'),'utf8'));
async function verify(){
 for(const f of appSource.files){const b=await fs.readFile(path.join(root,f.path));assert.equal(hash(b.toString('utf8').replace(/\r\n/g,'\n')),f.sha256_utf8_lf,f.path);}
 for(const f of appBuild.files)assert.equal(hash(await fs.readFile(path.join(root,appRoot,'build/web',f.path))),f.sha256,f.path);
}
await verify();
const result={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),app_source:appSource.source,environment:'jx_test_stock_pm03_44b3c25a57e75c8701792dc1',
 started_at:new Date().toISOString(),account_id:null,page:'/wallet/scout',checks:[],arms:[],diagnostics:[],requests:[],complete:false,
 limits:['Current App and current synthetic wallet, not the old refund/order or old app build.','Only GET/HEAD/OPTIONS business requests allowed; no recharge/refund, expired-token restoration, clock change or third-party traffic.','Old ENV063 lacks telemetry; comparison may bound the recurrence without proving its historical cause.','This does not certify native-device behavior, final regression or formal acceptance.']};
const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));
async function summary(){const r=await fetch(access.base_url+'/wallet/summary',{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id},signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const j=await r.json();return j.data;}
result.before=await summary();result.account_id=result.before.account_id;
const served=await fetch(access.app_url+'/main.dart.js',{signal:AbortSignal.timeout(10000)});assert.equal(served.status,200);
result.served_main_sha256=hash(Buffer.from(await served.arrayBuffer()));assert.equal(result.served_main_sha256,appBuild.files.find(f=>f.path==='main.dart.js').sha256);
const {chromium}=createRequire(path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const diagnosticRequests=[];let phase='start';
async function arm(mode){
 const server=await chromium.launchServer({executablePath:process.env.CHROME_PATH,headless:true});
 const browser=await chromium.connect(server.wsEndpoint()),cdp=await browser.newBrowserCDPSession();
 const run={mode,reads:[],resources:[],result:'RUNNING',browser:browser.version()};result.arms.push(run);let current;
 async function resources(n){
  const info=await cdp.send('SystemInfo.getProcessInfo');const ids=info.processInfo.map(p=>Number(p.id)).filter(Number.isSafeInteger);
  assert(ids.length&&ids.every(id=>id>0));
  const cmd='Get-Process -Id '+ids.join(',')+' -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64,CPU | ConvertTo-Json -Compress';
  const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cmd],{encoding:'utf8',windowsHide:true});const j=JSON.parse(raw),ps=Array.isArray(j)?j:[j];
  const row={after_read:n,contexts:browser.contexts().length,processes:ps,private_bytes:ps.reduce((s,p)=>s+p.PrivateMemorySize64,0),working_set_bytes:ps.reduce((s,p)=>s+p.WorkingSet64,0)};
  run.resources.push(row);assert(row.private_bytes<3*1024**3,'BOUNDED_RESOURCE_GUARD');return row;
 }
 try{
  for(let n=1;n<=26;n++){
   phase=mode+'-'+n;assert.equal(browser.contexts().length,mode==='page-only'?n-1:0);
   const c=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
   await c.route('**/*',route=>{
    const q=route.request(),url=new URL(q.url());
    if(!['127.0.0.1','localhost'].includes(url.hostname)){result.diagnostics.push({phase,kind:'NONLOCAL_REQUEST_BLOCKED',path:url.pathname});return route.abort('blockedbyclient');}
    if(url.pathname.startsWith('/api/v1/')&&!['GET','HEAD','OPTIONS'].includes(q.method())){result.diagnostics.push({phase,kind:'MUTATION_BLOCKED',method:q.method(),path:url.pathname});return route.abort('blockedbyclient');}
    return route.continue();
   });
   const p=await c.newPage();current=p;p.setDefaultTimeout(18000);const tag=phase,start=Date.now();
   p.on('pageerror',e=>result.diagnostics.push({phase:tag,kind:'pageerror',message_sha256:hash(e.message)}));
   p.on('console',m=>{if(m.type()==='error')result.diagnostics.push({phase:tag,kind:'console-error',message_sha256:hash(m.text())});});
   p.on('crash',()=>result.diagnostics.push({phase:tag,kind:'page-crash'}));
   p.on('requestfailed',q=>result.diagnostics.push({phase:tag,kind:'requestfailed',method:q.method(),path:new URL(q.url()).pathname,error:q.failure()?.errorText}));
   p.on('response',rr=>{diagnosticRequests.push((async()=>{const url=new URL(rr.url()),req=rr.request();if(url.pathname.startsWith('/api/v1/')||rr.status()>=400){let sha256=null;try{sha256=hash(await rr.body());}catch{}result.requests.push({phase:tag,path:url.pathname,method:req.method(),status:rr.status(),sha256});}})());});
   await p.goto(access.app_url+'/?fixtureRole='+role+'#/wallet/scout');
   await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});const semantics_ms=Date.now()-start;
   await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.waitForLoadState('networkidle');
   await p.setViewportSize({width:390,height:6000});await p.getByRole('button',{name:'查看会员年与实际资格',exact:true}).click();await p.waitForLoadState('networkidle');
   const aria=await p.locator('body').ariaSnapshot(),m=result.before.membership;
   for(const text of ['当前有效等级: '+m.level,'已达到成长等级: '+m.attained_level,'当前有效会员: '+(m.active?'有效':'未生效或已到期'),m.active?'服务器当前会员资格有效':'会员特权当前未生效'])assert(aria.includes(text),'MEMBERSHIP_FACT_NOT_VISIBLE');
   const ps=await c.newCDPSession(p);await ps.send('Performance.enable');const metrics=await ps.send('Performance.getMetrics');
   const row={n,semantics_ms,total_ms:Date.now()-start,account_id:result.account_id,level:m.level,attained_level:m.attained_level,aria_sha256:hash(aria),metrics:metrics.metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Documents','Nodes','LayoutCount'].includes(m.name))};
   if([1,22,26].includes(n)){await fs.writeFile(path.join(out,mode+'-'+n+'.aria.txt'),aria);await p.screenshot({path:path.join(out,mode+'-'+n+'.png'),fullPage:true});}
   await ps.detach();if(mode==='page-only')await p.close();else await c.close();current=null;
   row.contexts_after_close=browser.contexts().length;assert.equal(row.contexts_after_close,mode==='page-only'?n:0);run.reads.push(row);
   if([1,10,22,26].includes(n))await resources(n);
   result.checks.push({name:phase+'-current-membership-facts',result:'PASS'});await save();
  }
  run.result='PASS';
 }catch(e){run.result='FAIL';run.error={name:e.name,message:e.message,phase};if(current&&!current.isClosed()){await fs.writeFile(path.join(out,mode+'-failure.aria.txt'),await current.locator('body').ariaSnapshot());await current.screenshot({path:path.join(out,mode+'-failure.png'),fullPage:true});}await resources(run.reads.length).catch(e=>{run.resource_error=e.name;});}
 finally{await browser.close();await server.close();await Promise.all(diagnosticRequests);await save();}
}
try{
 await arm('page-only');await arm('context-close');result.after=await summary();assert.deepEqual(result.after,result.before);await verify();result.product_and_build_unchanged=true;
 result.complete=result.arms.every(a=>a.result==='PASS')&&result.diagnostics.length===0;result.finished_at=new Date().toISOString();await save();
 console.log(JSON.stringify({complete:result.complete,arms:result.arms.map(a=>({mode:a.mode,result:a.result,reads:a.reads.length,error:a.error})),diagnostics:result.diagnostics.length,financial_state_unchanged:true}));
 if(!result.complete)process.exitCode=1;
}catch(e){result.error={name:e.name,message:e.message,phase};await save();console.error(e.message);process.exitCode=1;}
