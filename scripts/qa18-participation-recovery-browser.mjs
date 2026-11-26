// T1 missing client obligations on a new clone of the original E2E12 project.
// Real API response is discarded only after the server commits; no mock business result.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=resolve(process.env.QA18_OUTPUT_DIR),access=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(out.startsWith(join(root,'.local/qa18')+sep));assert(access.synthetic_only&&Date.parse(access.expires_at)>Date.now());assert.equal(new URL(access.base_url).hostname,'127.0.0.1');
await mkdir(out,{recursive:true});const sha=b=>createHash('sha256').update(b).digest('hex'),source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const s={source,environment:access.database,original_environment:access.source_database,started_at:new Date().toISOString(),checks:[],requests:[],drops:[],scope:'Targeted browser checkout recovery/duplicate, stale-hash refusal and private-contract authorization on original E2E12 records. Not whole18/12 or full recovery across every operation.'};
const save=()=>writeFile(join(out,'RESULT.json'),JSON.stringify(s,null,2));
const done=async(name,data={})=>{s.checks.push({name,...data});await save();console.log('PASS '+name);};
for(const [name,manifest,dir]of[
 ['app','docs/testing/evidence/pm04-g1-t1-personal-ui-20261126/APP_BROWSER_BUILD_MANIFEST.json','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/web'],
 ['web','docs/testing/evidence/pm04-g1-recommendations-20261126-46/VUE_BUILD_MANIFEST.json','晶晶日上工程交接包/01_源码/frontend_ops_workspace/dist']]){
 const m=JSON.parse(await readFile(manifest,'utf8'));for(const f of m.files){const b=await readFile(join(dir,f.path));assert.equal(sha(b),f.sha256,name+' build mismatch '+f.path);}
 s[name+'_build']={manifest,source:m.source,files:m.files.length,all_bytes_verified:true};
}
const agreementId='59afd06a-d038-4802-88a2-29e9bf200dcd',orderId='08834e9a-d780-4bbe-8994-c503b8077f6f',projectId='7700df91-5cb6-4135-b180-949ee9031da8';
Object.assign(s,{agreement_id:agreementId,order_id:orderId,project_id:projectId});
async function api(role,path){const u=access.accounts[role],r=await fetch(access.base_url+path,{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id}}),b=Buffer.from(await r.arrayBuffer()),j=JSON.parse(b);s.requests.push({surface:'api-prerequisite',role,path,status:r.status,sha256:sha(b)});assert.equal(r.status,200,path+' '+j.error?.code);return j.data;}
const agreement=await api('buyer','/projects/records/'+agreementId);assert.equal(agreement.data.fee_minor,5000);assert.equal(agreement.current_status,'APPROVED');
const order=await api('buyer','/trade/records/'+orderId);assert.equal(order.data.financial.net_minor,5000);
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true}),pages=[];
let phase='start';
async function snapshot(p,name){await p.screenshot({path:join(out,name+'.png'),fullPage:true});await writeFile(join(out,name+'.aria.txt'),await p.locator('body').ariaSnapshot());}
async function idle(p){await p.waitForLoadState('networkidle');await p.waitForTimeout(250);}
async function actor(surface,role,routePath,{drop=false}={}){
 const c=await browser.newContext({viewport:surface==='app'?{width:600,height:5000}:{width:1440,height:1400},locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
 let dropped=false;
 await c.route('**/*',async route=>{
  const q=route.request(),u=new URL(q.url());if(u.protocol==='data:')return route.continue();assert.equal(u.hostname,'127.0.0.1','NO_EXTERNAL_NETWORK');
  if(u.pathname==='/synthetic-access.json')return route.fulfill({json:{synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:access.expires_at,accounts:access.accounts}});
  const headers=Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer'].includes(k)));
  const target=u.pathname.startsWith('/api/v1/')?access.base_url+u.pathname.slice('/api/v1'.length)+u.search:new URL(access.base_url).origin+'/__'+surface+u.pathname+u.search;
  const response=await route.fetch({url:target,headers});
  if(u.pathname.startsWith('/api/v1/')){
   const b=await response.body();let j;try{j=JSON.parse(b);}catch{}
   const entry={surface,role,path:u.pathname,method:q.method(),status:response.status(),code:j?.error?.code,record_id:j?.data?.id,sha256:sha(b),...q.method()==='POST'?{key_sha256:sha(q.headers()['idempotency-key']||''),body_sha256:sha(q.postDataBuffer()||Buffer.alloc(0))}:{}};
   s.requests.push(entry);
   if(drop&&!dropped&&u.pathname==='/api/v1/trade/participation-checkout'&&q.method()==='POST'){
    dropped=true;assert.equal(response.status(),200);assert.equal(j.data.id,orderId);s.drops.push(entry);await save();await new Promise(r=>setTimeout(r,300));return route.abort('failed');
   }
  }
  return route.fulfill({response});
 });
 if(surface==='web')await c.addInitScript(({u,expires})=>{sessionStorage.setItem('ops.session.token',u.bearer_token);sessionStorage.setItem('ops.session.selected',u.party_id);sessionStorage.setItem('ops.session.expires_at',expires);},{u:access.accounts[role],expires:access.expires_at});
 const p=await c.newPage();pages.push(p);p.setDefaultTimeout(20000);p.on('dialog',d=>d.accept());
 await p.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole='+role+'#'+routePath:'http://127.0.0.1:5173'+routePath);
 if(surface==='app'){await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());}
 await idle(p);return p;
}
const appPath=hash=>'/trade/participation-checkout?agreementId='+agreementId+'&agreementSha256='+hash;
const webPath='/participation/agreements/'+agreementId+'?action=checkout&project_id='+projectId;
async function fillCheckout(p,hash){await p.locator('#checkout-agreement_id').fill(agreementId);await p.locator('#checkout-agreement_sha256').fill(hash);await p.locator('#checkout-channel').selectOption('ALIPAY');await p.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();}
try{
 phase='app-original-checkout-recovery';
 let p=await actor('app','buyer',appPath(agreement.content_sha256),{drop:true});
 await p.getByRole('button',{name:'按原约定建立付款订单',exact:true}).click();await p.getByRole('button',{name:'确认办理',exact:true}).click();
 await p.getByRole('button',{name:'恢复原订单请求',exact:true}).waitFor();await idle(p);await snapshot(p,'app-unknown-original-order');
 const start=s.requests.filter(x=>x.surface==='app'&&x.method==='POST'&&x.path==='/api/v1/trade/participation-checkout');assert.equal(start.length,1);
 // Leave the page and return inside the same authenticated App session.
 await p.evaluate(()=>{location.hash='#/trade';});await idle(p);await p.evaluate(path=>{location.hash='#'+path;},appPath(agreement.content_sha256));await idle(p);
 await p.getByRole('button',{name:'恢复原订单请求',exact:true}).click();await p.getByRole('button',{name:'确认办理',exact:true}).click();
 await p.waitForURL('**/*recordId='+orderId);await idle(p);await snapshot(p,'app-recovered-same-order');
 const appWrites=s.requests.filter(x=>x.surface==='app'&&x.method==='POST'&&x.path==='/api/v1/trade/participation-checkout');assert.equal(appWrites.length,2);assert(appWrites.every(x=>x.status===200&&x.record_id===orderId));assert.equal(appWrites[0].key_sha256,appWrites[1].key_sha256);assert.equal(appWrites[0].body_sha256,appWrites[1].body_sha256);
 await done('app-lost-response-leave-return-restores-original-key-body-and-order',{requests:2,order_id:orderId});await p.context().close();
 phase='web-original-checkout-recovery';p=await actor('web','buyer',webPath,{drop:true});await fillCheckout(p,agreement.content_sha256);
 await p.getByTestId('business-checkout').dblclick();await p.getByRole('heading',{name:'原请求结果待核对',exact:true}).waitFor();await idle(p);await snapshot(p,'web-unknown-original-order');
 assert.equal(s.requests.filter(x=>x.surface==='web'&&x.method==='POST'&&x.path==='/api/v1/trade/participation-checkout').length,1);
 await p.reload();await idle(p);await p.getByRole('heading',{name:'原请求结果待核对',exact:true}).waitFor();
 await p.getByRole('button',{name:'核对原记录',exact:true}).click();await idle(p);await p.getByRole('button',{name:'恢复同一次请求',exact:true}).click();await idle(p);
 await p.getByText('出品方按原参演约定建立付款订单已由服务器记录。',{exact:true}).waitFor();await snapshot(p,'web-recovered-same-order');
 const webWrites=s.requests.filter(x=>x.surface==='web'&&x.method==='POST'&&x.path==='/api/v1/trade/participation-checkout');assert.equal(webWrites.length,2);assert(webWrites.every(x=>x.status===200&&x.record_id===orderId));assert.equal(webWrites[0].key_sha256,webWrites[1].key_sha256);assert.equal(webWrites[0].body_sha256,webWrites[1].body_sha256);
 await done('vue-double-click-lost-response-reload-restores-original-key-body-order',{requests:2,order_id:orderId});await p.context().close();
 phase='app-stale-contract-hash';p=await actor('app','buyer',appPath('0'.repeat(64)));assert(await p.getByRole('button',{name:'按原约定建立付款订单',exact:true}).isDisabled());await snapshot(p,'app-stale-hash-blocked');await done('app-stale-contract-hash-refuses-checkout-before-send');await p.context().close();
 phase='web-stale-contract-hash';p=await actor('web','buyer',webPath);await fillCheckout(p,'0'.repeat(64));const n=s.requests.length;await p.getByTestId('business-checkout').click();await idle(p);const denial=s.requests.slice(n).find(x=>x.method==='POST'&&x.path==='/api/v1/trade/participation-checkout');assert(denial&&denial.status===409&&denial.code==='PARTICIPATION_VERSION_MISMATCH');await snapshot(p,'web-stale-hash-blocked');await done('vue-stale-contract-hash-rejected-and-shown',{status:denial.status,code:denial.code});await p.context().close();
 for(const surface of ['app','web']){
  phase=surface+'-unrelated-private-contract';const n=s.requests.length;
  p=await actor(surface,'outsider',surface==='app'?'/projects/participation?view=agreement&recordId='+agreementId:webPath);
  const denied=s.requests.slice(n).find(x=>x.path==='/api/v1/projects/records/'+agreementId&&x.status===404);assert(denied);
  const text=await p.locator('body').innerText();assert(!text.includes(agreement.content_sha256));await snapshot(p,surface+'-unrelated-private-contract-refused');await done(surface+'-unrelated-account-private-contract-denied',{status:denied.status,code:denied.code});await p.context().close();
 }
 s.result='PASS_TARGETED';s.complete=true;
}catch(e){s.result='FAIL';s.failure={phase,message:e.message,stack:e.stack};for(const[i,p]of pages.entries())if(!p.isClosed())await snapshot(p,'failure-'+i).catch(()=>{});console.error(phase+': '+e.message);process.exitCode=1;}
finally{s.finished_at=new Date().toISOString();await save();await browser.close();console.log(JSON.stringify({result:s.result,phase,checks:s.checks.length,requests:s.requests.length,complete:!!s.complete}));}
