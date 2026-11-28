// Read the original COPY request on the actual App entry, with the same retained backend.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=resolve(process.env.QA18_OUTPUT_DIR);
assert(out.startsWith(join(root,'.local','qa18')+sep));
const access=JSON.parse(await readFile(process.env.QA18_PRIVACY_ACCESS,'utf8'));
const prior=JSON.parse(await readFile(process.env.QA18_PRIVACY_PRIOR,'utf8'));
assert.equal(prior.status,'PASS');assert(access.synthetic_only&&new URL(access.base_url).hostname==='127.0.0.1'&&Date.parse(access.session_expires_at)>Date.now());
const path='/privacy/requests/'+prior.request_id,file=path+'/evidence/'+prior.asset_id+'/content';
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const report={request_id:prior.request_id,asset_id:prior.asset_id,database:access.database,observations:[]};
try{
 for(const role of ['buyer','outsider']){
  const c=await browser.newContext({viewport:{width:550,height:2300},locale:'zh-CN',serviceWorkers:'block',acceptDownloads:true});
  await c.route('**/synthetic-access.json',route=>route.fulfill({json:{synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:access.expires_at,accounts:{[role]:access.accounts[role]}}}));
  await c.route('**/api/v1/**',async route=>{
   const q=route.request(),u=new URL(q.url());
   const headers=Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer'].includes(k)));
   const r=await route.fetch({url:access.base_url+u.pathname.slice(7)+u.search,headers});
   report.observations.push({role,method:q.method(),path:u.pathname,status:r.status()});await route.fulfill({response:r});
  });
  const p=await c.newPage();p.setDefaultTimeout(16000);
  await p.goto('http://127.0.0.1:5500/?fixtureRole='+role+'#/privacy?view=request&recordId='+prior.request_id);
  await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.waitForLoadState('networkidle');
  const take=p.getByRole('button',{name:'领取这份审核答复附件',exact:true});
  if(role==='buyer'){
   await take.waitFor();assert.equal(await p.getByRole('button',{name:'撤回这份本人授权',exact:true}).count(),0);
   const next=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+file);
   await take.click();const r=await next;assert.equal(r.status(),200);const bytes=await r.body();
   report.file_bytes=bytes.length;report.file_sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(report.file_sha256,prior.sha256);
  }else{
   assert(report.observations.some(x=>x.role===role&&x.path==='/api/v1'+path&&x.status===404));
   assert.equal(await take.count(),0);assert.equal(await p.getByRole('button',{name:'撤回这份本人授权',exact:true}).count(),0);
  }
  await p.screenshot({path:join(out,'privacy-'+role+'.png'),fullPage:true});await c.close();
 }
 report.result='PASS_COPY_ACCESS_ONLY';console.log(JSON.stringify(report));
}catch(e){report.result='FAIL';report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{await writeFile(join(out,'privacy-page.json'),JSON.stringify(report,null,2));await browser.close();}
