// Frozen-product browser journey. Business traffic always reaches the actual loopback API.
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join,resolve,sep } from 'node:path';
import { createRequire } from 'node:module';

const root=process.cwd();
const env=resolve(process.argv[2]||'');
const out=resolve(process.argv[3]||'');
const local=join(root,'.local','qa18')+sep;
assert(env.startsWith(local)&&out.startsWith(local));
const f=JSON.parse(await readFile(join(env,'access.private.json'),'utf8'));
const origin=new URL(f.base_url).origin;
assert(f.synthetic_only&&new URL(origin).hostname==='127.0.0.1'&&Date.now()<Date.parse(f.expires_at));
await mkdir(out,{recursive:true});
const checkpoint=join(out,'CHECKPOINT.private.json');
let s;
try{s=JSON.parse(await readFile(checkpoint,'utf8'));}
catch(e){if(e.code!=='ENOENT')throw e;s={database:f.database,steps:{},attempts:[]};}
assert.equal(s.database,f.database);
assert(!s.complete,'case already completed');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const started=new Date().toISOString();
const attempt={started_at:started,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),driver_sha256:hash(await readFile(process.argv[1])),checks:[],requests:[]};
s.attempts.push(attempt);
const save=()=>writeFile(checkpoint,JSON.stringify(s,null,2));
const pass=async(name,fields={})=>{attempt.checks.push({name,...fields});await save();console.log('PASS '+name);};
const claimantPath=id=>'/infringement/cases/'+id;
const operatorPath=id=>'/infringement/operations/cases/'+id;
const { chromium }=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const pages=[];
let phase='fixture';

function entry({role,surface,path,method,status,bytes,code,key,body}) {
  attempt.requests.push({role,surface,path,method,status,sha256:hash(bytes),...code?{code}:{},...key?{key_sha256:hash(key),body_sha256:hash(body||'')}:{}});
}
async function call(role,path,{data,version,ops=false,status=200,code}={}){
  const account=f.accounts[role];
  const method=data?'POST':'GET',key=data?randomUUID():null,body=data?JSON.stringify(data):null;
  const r=await fetch(f.base_url+path,{method,headers:{Authorization:'Bearer '+account.bearer_token,...ops?{}:{'X-Acting-Party':account.party_id},...version?{'If-Match':'"'+version+'"'}:{},...data?{'Idempotency-Key':key,'Content-Type':'application/json'}:{}},...body?{body}:{},signal:AbortSignal.timeout(10000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  const j=r.headers.get('content-type')?.includes('json')?JSON.parse(bytes):null;
  entry({role,surface:'api',path,method,status:r.status,bytes,code:j?.error?.code,key,body});
  await save();
  assert.equal(r.status,status,path+' '+j?.error?.code);
  if(code)assert.equal(j.error.code,code);
  return j?.data??bytes;
}
async function actor(role,surface,path) {
  const context=await browser.newContext({viewport:surface==='app'?{width:420,height:2900}:{width:1440,height:1050},locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block',acceptDownloads:true});
  await context.route('**/*',async route=>{
    const q=route.request(), u=new URL(q.url());
    if(u.protocol==='data:')return route.continue();
    assert.equal(u.hostname,'127.0.0.1');
    if(u.pathname==='/synthetic-access.json')return route.fulfill({json:{synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:f.expires_at,accounts:f.accounts}});
    const headers=Object.fromEntries(Object.entries(q.headers()).filter(([key])=>!['host','origin','referer'].includes(key)));
    const target=u.pathname.startsWith('/api/v1/')?origin+u.pathname+u.search:origin+'/__'+surface+u.pathname+u.search;
    return route.fulfill({response:await route.fetch({url:target,headers})});
  });
  if(surface==='web')await context.addInitScript(({a,expires})=>{
    sessionStorage.setItem('ops.session.token',a.bearer_token);
    sessionStorage.setItem('ops.session.selected',a.party_id);
    sessionStorage.setItem('ops.session.expires_at',expires);
  },{a:f.accounts[role],expires:f.expires_at});
  const page=await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(14000);
  const href=surface==='app'?'http://127.0.0.1:5500/?fixtureRole='+role+'#'+path:'http://127.0.0.1:5173'+path;
  await page.goto(href);
  if(surface==='app')await page.locator('flt-semantics-placeholder').evaluate(el=>el.click());
  await page.waitForLoadState('networkidle');
  return page;
}
async function react(page,role,surface,path,method,button) {
  const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+path&&r.request().method()===method);
  wait.catch(()=>{});
  await button();
  const r=await wait,q=r.request(),bytes=await r.body();
  const j=r.headers()['content-type']?.includes('json')?JSON.parse(bytes):null;
  entry({role,surface,path,method,status:r.status(),bytes,code:j?.error?.code,key:q.headers()['idempotency-key'],body:q.postData()});
  assert.equal(r.status(),200,path+' '+j?.error?.code);
  return j?.data??bytes;
}
async function choose(page,label,value) {
  const control=page.getByRole('button',{name:new RegExp(label)});
  await control.click();
  await page.getByRole('menuitem',{name:value,exact:true}).click();
}
async function fill(page,label,value) {
  const input=page.getByRole('textbox',{name:label,exact:true});
  await input.click({force:true,position:{x:28,y:10}});
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
  await page.waitForTimeout(120);
  assert.equal(await input.inputValue(),value);
  await page.keyboard.press('Tab');
}
async function capture(page,label){
  await page.waitForLoadState('networkidle');
  await writeFile(join(out,label+'.aria.txt'),await page.locator('body').ariaSnapshot());
}
async function appStep(role,label,name,fields={},option){
  if(s.steps[label])return;
  phase=label;
  const id=s.case_id;
  const page=await actor(role,'app','/contract-six/infringement'+(id?'?id='+id:''));
  await choose(page,'本次办理事项',name);
  if(option)await choose(page,...option);
  for(const [field,value] of Object.entries(fields))await fill(page,field,value);
  const url=id?claimantPath(id)+'/actions':'/infringement/cases';
  const result=await react(page,role,'app',url,'POST',()=>page.getByRole('button',{name:'提交本次明确办理',exact:true}).click());
  if(!id)s.case_id=result.id;
  assert.equal(result.id,s.case_id);
  s.steps[label]={id:result.id,version:result.object_version,status:result.current_status,restriction_active:result.restriction_active,deliveries:result.deliveries};
  await pass(label,s.steps[label]);
  await capture(page,label);
  await page.context().close();
}
async function webStep(role,label,key,fields={},disclosed){
  if(s.steps[label])return;
  phase=label;
  const path=operatorPath(s.case_id);
  const page=await actor(role,'web','/infringement/operations/'+s.case_id+'?action='+key);
  for(const [field,value] of Object.entries(fields)){
    const input=page.locator('#'+key+'-'+field);
    if(await input.evaluate(el=>el.tagName)==='SELECT')await input.selectOption(value);
    else await input.fill(value);
  }
  if(disclosed){
    const check=page.locator('#'+key+'-disclosed_asset_ids-field input[type=checkbox]');
    await check.waitFor();
    assert.equal(await check.count(),1);
    await check.check();
  }
  await page.locator('#'+key+'-reason').fill('合成材料经本次角色实际核查。');
  await page.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
  const result=await react(page,role,'web',path+'/actions','POST',()=>page.getByTestId('business-'+key).click());
  assert.equal(result.id,s.case_id);
  s.steps[label]={id:result.id,version:result.object_version,status:result.current_status,restriction_active:result.restriction_active};
  await pass(label,s.steps[label]);
  await capture(page,label);
  await page.context().close();
}
const privateEvidence='已有本人私有材料编号（可选，逗号分隔）';
const reason='本次明确理由';
const before='/stock/catalog/'+f.listing;
try{
  if(!s.steps.before){
    assert.equal((await call('buyer',before,{ops:true})).id,f.listing);
    s.steps.before=true;
    await pass('original-offer-readable-before-case',{listing:f.listing});
  }
  await appStep('buyer','app-open-original-infringement-notice','提出侵权通知',{
    '原对象编号':f.listing,'完整权利说明':'合成通知，拟核对本次现货原权利。','仅供运营联系，不自动转交对方':'SYNTHETIC_APPLICANT_CONTACT',[privateEvidence]:f.materials.applicant.id,
  },['具体涉案对象','现货影片']);
  const id=s.case_id, party=claimantPath(id), ops=operatorPath(id);
  if(!s.steps.before_delivery){
    await call('seller',party,{status:404,code:'INFRINGEMENT_NOT_FOUND'});
    await call('unrelated',ops,{ops:true,status:403,code:'INFRINGEMENT_OPERATOR_REQUIRED'});
    assert.equal(hash(await call('operator',ops+'/files/'+f.materials.applicant.id,{ops:true})),f.materials.applicant.sha256);
    s.steps.before_delivery=true;
    await pass('notice-hidden-before-delivery-operator-reads-correct-file');
  }
  await webStep('operator','vue-requires-supplement','request-info');
  await appStep('buyer','app-supplements-original-notice','按要求补件',{
    '完整权利说明':'同案补件，已说明合成权利来源，请核原件。',[privateEvidence]:f.materials.applicant.id,[reason]:'按运营要求补正。',
  });
  await webStep('operator','vue-freezes-original-offer','freeze');
  if(!s.steps.frozen){
    await call('buyer',before,{ops:true,status:409,code:'CONTENT_RESTRICTED'});
    s.steps.frozen=true;
    await pass('same-offer-read-denied-by-actual-case-freeze');
  }
  await webStep('operator','vue-delivers-redacted-notice','deliver-notice',{statement:'仅转交本案必要、已脱敏通知。'});
  if(!s.steps.redacted_notice){
    const delivered=await call('seller',party);
    assert.deepEqual(delivered.notice.evidence_asset_ids,[]);
    assert.equal(delivered.notice.contact,undefined);
    assert.equal(delivered.deliveries.notice.read_at,null);
    await call('seller',party+'/files/'+f.materials.applicant.id,{status:404,code:'INFRINGEMENT_NOT_FOUND'});
    s.steps.redacted_notice=true;
    await pass('reading-detail-does-not-acknowledge-or-expose-undisclosed-original');
  }
  await appStep('seller','app-explicitly-acknowledges-notice','明确确认已读送达材料',{[reason]:'本人明确读到该已脱敏通知。'});
  assert(s.steps['app-explicitly-acknowledges-notice'].deliveries.notice.read_at);
  await appStep('seller','app-files-counter-notice-on-same-case','提交反通知',{
    '完整权利说明':'本人提交同案反通知，附指定合成依据。','仅供运营联系，不自动转交对方':'SYNTHETIC_RESPONDENT_CONTACT',[privateEvidence]:f.materials.respondent.id,[reason]:'实际提交同一件反通知。',
  });
  if(!s.steps.counter_hidden){
    assert.equal((await call('buyer',party)).counter,null);
    assert.equal(hash(await call('operator',ops+'/files/'+f.materials.respondent.id,{ops:true})),f.materials.respondent.sha256);
    s.steps.counter_hidden=true;
    await pass('counter-private-until-delivery-and-handler-reads-original');
  }
  await webStep('operator','vue-delivers-selected-counter-file','deliver-counter',{statement:'仅转交已脱敏反通知和选中的一个依据。'},true);
  if(!s.steps.counter_delivered){
    const delivered=await call('buyer',party);
    assert.equal(delivered.counter.contact,undefined);
    assert.deepEqual(delivered.counter.evidence_asset_ids,[f.materials.respondent.id]);
    const file=await call('buyer',party+'/files/'+f.materials.respondent.id);
    assert.equal(hash(file),f.materials.respondent.sha256);
    await call('unrelated',party,{status:404,code:'INFRINGEMENT_NOT_FOUND'});
    s.steps.counter_delivered=true;
    await pass('only-authorized-party-receives-exact-selected-counter-file',{sha256:hash(file),bytes:file.length});
  }
  await webStep('operator','vue-proposes-restoring-only-this-case','propose',{decision:'RESTORE'});
  if(!s.steps.self_review){
    const proposal=await call('operator',ops,{ops:true});
    await call('operator',ops+'/actions',{ops:true,version:proposal.object_version,data:{action:'REVIEW',decision:'APPROVE',reason:'合成自审拒绝断言。'},status:403,code:'INDEPENDENT_RIGHTS_REVIEW_REQUIRED'});
    await call('buyer',before,{ops:true,status:409,code:'CONTENT_RESTRICTED'});
    s.steps.self_review=true;
    await pass('self-review-rejected-and-proposal-does-not-restore');
  }
  await webStep('independent','vue-independent-approval-restores-original-case','review',{decision:'APPROVE'});
  phase='final-same-case-and-offer';
  const result=await call('buyer',party);
  assert.equal(result.current_status,'RESOLVED');
  assert.equal(result.restriction_active,false);
  assert.equal(result.resolution.decision,'RESTORE');
  assert.equal(result.target_id,f.listing);
  assert.equal((await call('buyer',before,{ops:true})).id,f.listing);
  assert.equal((await call('buyer','/infringement/cases')).items.filter(x=>x.target_id===f.listing).length,1);
  const a=await actor('buyer','app','/contract-six/infringement?id='+id);
  const aria=await a.locator('body').ariaSnapshot();
  assert(aria.includes('本案已有独立复核结论')&&aria.includes('本案未限制或已解除'),aria.slice(0,3500));
  await capture(a,'app-final-resolved');
  await a.context().close();
  await pass('app-reads-same-resolved-case-and-original-offer-is-readable',{id,version:result.object_version,listing:f.listing,status:'RESOLVED'});
  s.complete=true;
  attempt.result='PASS';
}catch(error){
  attempt.result='FAIL';
  attempt.failure={phase,message:error.message.split('\n').slice(0,16).join('\n')};
  for(const [i,page] of pages.entries())if(!page.isClosed())await capture(page,'failure-'+s.attempts.length+'-'+i).catch(()=>{});
  console.error(phase+': '+error.message);
  process.exitCode=1;
}finally{
  attempt.finished_at=new Date().toISOString();
  await save();
  await writeFile(join(out,'RESULT.json'),JSON.stringify({product:f.product,database:f.database,case_id:s.case_id,listing:f.listing,complete:!!s.complete,steps:s.steps,attempts:s.attempts},null,2)+'\n');
  await browser.close();
}
