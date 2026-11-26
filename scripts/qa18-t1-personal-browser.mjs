import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
const root=process.cwd(),dir=path.resolve(process.env.QA18_PREPARED_DIR),out=path.resolve(process.env.QA18_OUTPUT_DIR);
assert(dir.startsWith(path.join(root,'.local/qa18')+path.sep)&&out.startsWith(path.join(root,'.local/qa18')+path.sep));
await fs.mkdir(out,{recursive:false});
const prepared=JSON.parse(await fs.readFile(path.join(dir,'prepared.json'),'utf8'));
const access=JSON.parse(await fs.readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(prepared.complete&&access.synthetic_only&&Date.parse(access.expires_at)>Date.now());
const mode=process.env.QA18_PERSONAL_MODE||'reader';assert(['reader','startup','library'].includes(mode));
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hash=b=>createHash('sha256').update(b).digest('hex');
const result={source,mode,environment:prepared.environment,order_id:prepared.order_id,agreement_id:prepared.agreement.id,checks:[],requests:[],diagnostics:[],complete:false};
const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));
const {chromium}=createRequire(path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const pages=[];
function observe(p,surface){
 p.on('pageerror',e=>result.diagnostics.push({surface,kind:'pageerror',message_sha256:hash(e.message)}));
 p.on('console',m=>{if(m.type()==='error')result.diagnostics.push({surface,kind:'console-error',message_sha256:hash(m.text())});});
 p.on('requestfailed',q=>result.diagnostics.push({surface,kind:'requestfailed',path:new URL(q.url()).pathname,error:q.failure()?.errorText}));
 p.on('response',async r=>{try{const u=new URL(r.url());if(u.pathname.startsWith('/api/v1/')||r.status()>=400){const bytes=await r.body();result.requests.push({surface,path:u.pathname,status:r.status(),sha256:hash(bytes)});}}catch{}});
}
async function context(){const c=await browser.newContext({viewport:{width:390,height:1800},locale:'zh-CN',timezoneId:'Asia/Shanghai'});await c.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'));return c;}
async function app(role='stock_buyer',section='income'){
 const c=await context(),p=await c.newPage();pages.push(p);p.setDefaultTimeout(18000);observe(p,'app-'+role);
 if(mode==='library')await p.route('**/synthetic-access.json',r=>r.fulfill({json:access}));
 const at=Date.now();await p.goto(access.app_url+'/?fixtureRole='+role+'#/library?section='+section);await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.waitForLoadState('networkidle');
 await p.getByRole('heading',{name:'我的业务目录',exact:true}).waitFor();await p.waitForTimeout(200);return {p,c,elapsed_ms:Date.now()-at};
}
async function web(role='stock_buyer'){
 const c=await context(),u=access.accounts[role];await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:u.bearer_token,party:u.party_id});
 const p=await c.newPage();pages.push(p);p.setDefaultTimeout(18000);observe(p,'vue-'+role);await p.goto(access.ops_url+'/me/business/income');await p.waitForLoadState('networkidle');return {p,c};
}
async function snap(p,name){await fs.writeFile(path.join(out,name+'.aria.txt'),await p.locator('body').ariaSnapshot());await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function seek(p,l){for(let n=0;n<60;n++){const box=await l.count()?await l.last().boundingBox():null;if(box&&box.y>=58&&box.y+box.height<p.viewportSize().height-10)return l.last();await p.mouse.move(180,420);await p.mouse.wheel(0,box?.y<58?-300:300);await p.waitForTimeout(100);}throw Error('Original control not reachable');}
async function action(p,locator){await(await seek(p,locator)).click();await p.waitForLoadState('networkidle');await p.waitForTimeout(200);}
async function incomeApi(role='stock_buyer'){
 const u=access.accounts[role],r=await fetch(access.base_url+'/me/business/income',{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id}});const bytes=Buffer.from(await r.arrayBuffer());result.requests.push({surface:'direct-api-'+role,path:'/me/business/income',status:r.status,sha256:hash(bytes)});assert.equal(r.status,200);return JSON.parse(bytes).data;
}
function exactIncome(data){const row=data.sections.find(s=>s.source==='FINANCE').items.find(r=>r.record_id===prepared.agreement.id);assert(row);assert.deepEqual(row.income,prepared.expected_income);return row;}
async function appMoney(p){const aria=await p.locator('body').ariaSnapshot();for(const text of ['币种: CNY','核算环境: 测试环境','已入账应计金额: ¥0.50','核验净支付: ¥0.20','账面待付: ¥0.30'])assert(aria.includes(text),'Missing readable current fact: '+text);assert(aria.includes('不是银行余额'));}
async function record(name,detail={}){result.checks.push({name,...detail});await save();}
const fault=operation=>JSON.parse(execFileSync(process.execPath,['scripts/qa18-t1-personal-fault.cjs',operation,dir],{encoding:'utf8',cwd:root}));
let damaged=false;
try{
 if(mode==='library'){
  // New normal SMS login; the previously revoked login remains revoked.
  const base=path.dirname(process.env.V5_ACCESS_FILE),original=JSON.parse(await fs.readFile(path.join(base,'access.json'),'utf8')),u=access.accounts.stock_buyer;
  const old=await fetch(access.base_url+'/me',{headers:{Authorization:'Bearer '+u.bearer_token}});assert.equal(old.status,401);
  async function post(route,body){const r=await fetch(access.base_url+route,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)}),j=await r.json();assert.equal(r.status,200,j.error?.code);return j.data;}
  const privateFile=path.join(dir,'library-session.private.json');let cached;
  try{cached=JSON.parse(await fs.readFile(privateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(cached){assert.equal(cached.environment,prepared.environment);const r=await fetch(access.base_url+'/me',{headers:{Authorization:'Bearer '+cached.token}});assert.equal(r.status,200);assert.equal((await r.json()).data.id,u.account_id);u.bearer_token=cached.token;}
  else{
   const phone=original.accounts.stock_buyer.phone,ch=await post('/auth/sms-challenges',{phone,purpose:'LOGIN'}),sms=JSON.parse(await fs.readFile(path.join(base,'sms',ch.challenge_id+'.json'),'utf8'));
   const fresh=await post('/auth/sessions',{phone,challenge_id:ch.challenge_id,code:sms.code});assert.equal(fresh.account.id,u.account_id);
   await fs.writeFile(privateFile,'',{flag:'wx',mode:0o600});await createRequire(import.meta.url)('./test-fixtures/private-state.cjs').protectPrivateState(privateFile);await fs.writeFile(privateFile,JSON.stringify({environment:prepared.environment,token:fresh.access_token}));u.bearer_token=fresh.access_token;
  }
  const a=await app('stock_buyer','works'),wanted='/api/v1/stock/purchases/'+prepared.order_id;
  const response=a.p.waitForResponse(r=>new URL(r.url()).pathname===wanted&&r.request().method()==='GET');
  await action(a.p,a.p.getByRole('button',{name:'回到原业务',exact:true}));const rr=await response;assert.equal(rr.status(),200);const body=await rr.json();assert.equal(body.data.order_id,prepared.order_id);await snap(a.p,'app-owned-work-original-order');
  await record('app-works-navigates-exact-owned-original-order',{order_id:prepared.order_id,status:200});
  result.limits=['Read-only owned-work navigation after a new normal synthetic SMS login; no restoration of revoked token.','Only initial test entry receives the actual new token; all business requests real. No new order/payment/refund.','This supplements a missing App works assertion, not a full G11 or native-device run.'];
 }else if(mode==='startup'){
  for(let n=1;n<=30;n++){
   assert.equal(browser.contexts().length,0);const {p,c,elapsed_ms}=await app('stock_seller');
   const aria=await p.locator('body').ariaSnapshot();assert(aria.includes('商家留存: ¥0.50'));assert(aria.includes('核验净支付: ¥0.00'));
   if([1,22,30].includes(n))await snap(p,'startup-'+n);await c.close();assert.equal(browser.contexts().length,0);
   await record('read-only-app-startup-'+n,{elapsed_ms,contexts_after_close:0});
  }
  result.limits=['30 fresh contexts using explicit context.close; current App only. No reproduction or retrospective attribution of old ENV063 root cause.','All business requests read-only; no duplicate payments or refunds.'];
 }else{
  const original=exactIncome(await incomeApi());const a=await app(),v=await web();
  await appMoney(a.p);await snap(a.p,'app-readable-income');
  const row=v.p.getByTestId('personal-item-FINANCE:'+prepared.agreement.id);for(const amount of ['¥0.50','¥0.20','¥0.30'])assert((await row.innerText()).includes(amount));
  await record('current-app-nonempty-income-three-amounts-and-environment',{income:original.income});
  const injected=fault('damage');damaged=true;result.fault=injected;
  const broken=await incomeApi();assert(broken.partial);const finance=broken.sections.find(s=>s.source==='FINANCE'),commissions=broken.sections.find(s=>s.source==='COMMISSIONS');assert.equal(finance.status,'UNAVAILABLE');assert(finance.retryable);assert.deepEqual(finance.items,[]);assert.equal(commissions.status,'AVAILABLE');
  await action(a.p,a.p.getByRole('button',{name:'刷新当前分类',exact:true}));await a.p.getByRole('button',{name:'重试这部分',exact:true}).waitFor();assert(!(await a.p.locator('body').ariaSnapshot()).includes('已入账应计金额: ¥0.50'));await snap(a.p,'app-actual-source-failure');
  await v.p.getByTestId('personal-refresh-FINANCE').click();await v.p.getByTestId('personal-retry-FINANCE').waitFor();assert.equal(await v.p.getByTestId('personal-section-COMMISSIONS').count(),1);assert.equal(await row.count(),0);await snap(v.p,'vue-actual-source-failure');
  await record('actual-backend-source-failure-clears-stale-income-keeps-independent-source',{finance,commission_status:commissions.status});
  result.restore=fault('restore');damaged=false;assert.equal(result.restore.restored_sha256,injected.original_sha256);
  await action(a.p,a.p.getByRole('button',{name:'重试这部分',exact:true}));await appMoney(a.p);await snap(a.p,'app-source-recovery');
  await v.p.getByTestId('personal-retry-FINANCE').click();await row.waitFor();exactIncome(await incomeApi());
  await record('same-source-retry-restores-original-id-and-identical-ledger');
  // Revoking the actual current login is a normal API action, not a forged 401.
  const u=access.accounts.stock_buyer,revoke=await fetch(access.base_url+'/auth/sessions/current',{method:'DELETE',headers:{Authorization:'Bearer '+u.bearer_token,'Idempotency-Key':randomUUID(),'Content-Type':'application/json'},body:'{}'});assert.equal(revoke.status,200);
  await action(a.p,a.p.getByRole('button',{name:'刷新当前分类',exact:true}));await v.p.getByTestId('personal-refresh-FINANCE').click();await v.p.waitForLoadState('networkidle');
  for(const [surface,p]of [['app',a.p],['vue',v.p]]){const aria=await p.locator('body').ariaSnapshot();assert(!aria.includes('¥0.50')&&!aria.includes('¥0.20')&&!aria.includes('¥0.30'));await snap(p,surface+'-session-revoked');}
  const denied=await fetch(access.base_url+'/me/business/income',{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id}});assert.equal(denied.status,401);
  await record('same-current-session-revoked-clears-mounted-private-income-on-reload',{status:401});
  result.limits=['Synthetic new environment and current App; no banking, real money or native device claim.','Source fault is owned isolated-row content/hash mismatch; restored exact original JSON, not fabricated client response.','Current stock_buyer login revoked using normal API and left revoked; no old credential restoration.','Only specified amount/source/identity assertions; complete original TASK11 normal and reverse clauses still assessed individually.'];
 }
 result.complete=true;await save();console.log(JSON.stringify({complete:true,mode,checks:result.checks.length,environment:result.environment}));
}catch(e){result.error={name:e.name,message:e.message,stack:e.stack};for(let n=0;n<pages.length;n++)if(!pages[n].isClosed())await snap(pages[n],'failure-'+n).catch(()=>{});await save();console.error(e.message);process.exitCode=1;}
finally{if(damaged){result.restore=fault('restore');result.fault_restored_after_failure=true;}await browser.close();await save();}
