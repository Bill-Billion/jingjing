// Original E2E11, actual Flutter and Vue builds; transport proxy only, no fake business API responses.
import assert from 'node:assert/strict';
import{readFile,writeFile,mkdir}from'node:fs/promises';import{join,resolve,dirname,sep}from'node:path';import{createRequire}from'node:module';import{createHash,randomUUID}from'node:crypto';import{execFileSync}from'node:child_process';
const root=process.cwd(),access=resolve(process.env.V5_ACCESS_FILE),f=JSON.parse(await readFile(access,'utf8')),prep=JSON.parse(await readFile(join(dirname(access),'prepared.json'),'utf8')),out=resolve(process.env.QA18_OUTPUT_DIR);assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1'&&Date.parse(f.expires_at)>Date.now());assert(out.startsWith(join(root,'.local')+sep));await mkdir(out,{recursive:true});
let s;const checkpoint=join(out,'checkpoint.json');try{s=JSON.parse(await readFile(checkpoint,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;s={environment:f.database,attempts:[],requests:[],checks:[],ops:{}};}assert(s.environment===f.database&&!s.complete);
const hash=b=>createHash('sha256').update(b).digest('hex'),attempt=String(Date.now()),source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();s.attempts.push({attempt,source,started_at:new Date().toISOString()});const save=()=>writeFile(checkpoint,JSON.stringify(s,null,2));async function done(name,data={}){s.checks.push({attempt,name,...data});await save();console.log('PASS '+name);}
async function api(role,path,{body,party=path.startsWith('/privacy/')?null:f.accounts[role].party_id,version,allowed=[200],op=path,raw=false}={}){const headers={Authorization:'Bearer '+f.accounts[role].bearer_token,...party?{'X-Acting-Party':party}:{},...version?{'If-Match':'"'+version+'"'}:{}};if(body!==undefined){s.ops[role+op]??=randomUUID();Object.assign(headers,{'Idempotency-Key':s.ops[role+op],'Content-Type':raw?'application/octet-stream':'application/json'});await save();}const r=await fetch(f.base_url+path,{method:body===undefined?'GET':'POST',headers,...body===undefined?{}:{body:raw?body:JSON.stringify(body)}}),bytes=Buffer.from(await r.arrayBuffer());let j;try{j=JSON.parse(bytes);}catch{}s.requests.push({attempt,role,path,method:body===undefined?'GET':'POST',status:r.status,code:j?.error?.code,sha256:hash(bytes)});await save();assert(allowed.includes(r.status),path+' '+r.status+' '+j?.error?.code);return j?.data??bytes;}
async function control(path){const r=await fetch(new URL(f.base_url).origin+path,{method:'POST',headers:{'X-QA-Control':f.control_key}});assert.equal(r.status,200);return r.json();}
const{chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core'),browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true}),pages=[];
function observe(p,role){p.on('response',async r=>{if(!r.url().includes('/api/v1/'))return;try{const b=await r.body(),q=r.request();s.requests.push({attempt,role,path:new URL(r.url()).pathname,method:q.method(),status:r.status(),sha256:hash(b),...['POST','PATCH'].includes(q.method())?{key_sha256:hash(q.headers()['idempotency-key']||''),body_sha256:hash(q.postDataBuffer()||Buffer.alloc(0))}:{}});}catch{}});}
async function snap(p,label){await p.screenshot({path:join(out,attempt+'-'+label+'.png'),fullPage:true});await writeFile(join(out,attempt+'-'+label+'.aria.txt'),await p.locator('body').ariaSnapshot());}
async function idle(p){await p.waitForLoadState('networkidle');await p.waitForTimeout(200);}
async function actor(role,surface,path){const c=await browser.newContext({viewport:surface==='app'?{width:390,height:844}:{width:1440,height:1100},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true,serviceWorkers:'block'});
 await c.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());if(u.protocol==='data:')return route.continue();assert.equal(u.hostname,'127.0.0.1','NO_EXTERNAL_RESOURCES');if(u.pathname==='/synthetic-access.json')return route.fulfill({json:{synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:f.expires_at,accounts:f.accounts}});const headers=Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer'].includes(k)));const target=u.pathname.startsWith('/api/v1/')?f.base_url+u.pathname.slice('/api/v1'.length)+u.search:new URL(f.base_url).origin+'/__'+surface+u.pathname+u.search;const r=await route.fetch({url:target,headers});await route.fulfill({response:r});});
 if(surface==='web')await c.addInitScript(({token,party,expires})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);sessionStorage.setItem('ops.session.expires_at',expires);},{token:f.accounts[role].bearer_token,party:path.startsWith('/privacy/')?f.accounts[role].personal_party_id:f.accounts[role].party_id,expires:f.expires_at});
 const p=await c.newPage();pages.push(p);p.setDefaultTimeout(18000);p.on('dialog',d=>d.accept());observe(p,role+'-'+surface);await p.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole='+role+'#'+path:'http://127.0.0.1:5173'+path);if(surface==='app'){await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());}await idle(p);return p;
}
async function seek(p,l){if(!await l.count()){await p.mouse.move(175,420);await p.mouse.wheel(0,-20000);await p.waitForTimeout(150);}for(let n=0;n<55;n++){const b=await l.count()?await l.last().boundingBox():null;if(b&&b.y+b.height/2>=58&&b.y+b.height/2<p.viewportSize().height-8)return l.last();await p.mouse.move(175,420);await p.mouse.wheel(0,b?.y<58?-260:260);await p.waitForTimeout(100);}throw Error('App control not reachable '+l);}
async function click(p,name,role='button'){await(await seek(p,p.getByRole(role,{name,exact:true}))).click();}
async function fill(p,name,value){const l=await seek(p,p.getByRole('textbox',{name}));await l.click();await p.keyboard.press('ControlOrMeta+A');await p.keyboard.insertText(value);await p.waitForTimeout(100);assert.equal(await l.inputValue(),value);await p.keyboard.press('Tab');}
async function request(p,path,action,{allowed=[200],slot}={}){const wait=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+path&&r.request().method()==='POST').then(async r=>({status:r.status(),j:await r.json()}));wait.catch(()=>{});await action();const {status,j}=await wait;assert(allowed.includes(status),path+' '+status+' '+j.error?.code);if(slot){s[slot]=j.data;await save();}await idle(p);return j.data;}
async function pollGeneration(id){for(let n=0;n<40;n++){await control('/__qa/tick');const r=await api('producer','/production/records/'+id);if(r.current_status==='SUCCEEDED')return r;await new Promise(r=>setTimeout(r,350));}throw Error('Generation has not completed within actual worker polling window');}
const scopedWithdrawal=process.env.QA18_S3A_WITHDRAWAL==='1';
const agree=p=>p.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
let phase='vue-create-model';
try{
 if(!s.creation){const p=await actor('producer','web','/production/projects/'+prep.project.id+'/generation');await p.getByTestId('production-generation-operation').selectOption('CREATE_LONG_LIVED');await p.getByTestId('production-avatar-id').fill(prep.avatar.id);await p.getByTestId('production-generation-consent').selectOption(prep.consent.id);await request(p,'/production/projects/'+prep.project.id+'/generation',()=>p.getByRole('button',{name:'建立实际生成请求',exact:true}).click(),{slot:'creation'});await snap(p,'vue-model-queued');await p.context().close();await done('vue-queues-real-generation-with-reviewed-face-voice-consent');}
 if(!s.asset){s.creation=await pollGeneration(s.creation.id);s.asset=await api('producer','/production/records/'+s.creation.data.result.asset_id);assert.equal(s.asset.current_status,'READY');await done('original-provider-key-submit-once-query-confirms-synthetic-model',{model_id:s.asset.id});}
 if(scopedWithdrawal&&!s.protected_preview_verified){
  phase='approved-private-preview-before-withdrawal';
  const script=Buffer.from('S3A synthetic private production script for the approved face and voice project.');
  const projectPath='/production/projects/'+prep.project.id;
  if(!s.protected_file){
   s.protected_file=await api('producer',projectPath+'/files?media_type=text%2Fplain',{body:script,raw:true});
   await save();
  }
  if(!s.protected_version){
   const current=await api('producer','/production/records/'+prep.project.id);
   s.protected_version=await api('producer',projectPath+'/versions',{version:current.object_version,body:{stage:'SCRIPT',file_id:s.protected_file.id,preview_file_id:s.protected_file.id,note:'Synthetic private script for the S3-A withdrawal check'}});
   await save();
  }
  if(s.protected_version.current_status==='IN_REVIEW'){
   const p=await actor('reviewer','web','/production/reviews/versions/'+s.protected_version.id);
   await p.getByTestId('production-read-preview').click();
   await p.locator('.production-text-preview').getByText(script.toString(),{exact:true}).waitFor();
   await p.getByTestId('production-check-script').check();
   await p.getByTestId('production-review-decision').selectOption('APPROVED');
   await p.getByTestId('production-review-reason').fill('Independently read the synthetic private script.');
   await request(p,'/production/records/'+s.protected_version.id+'/reviews',()=>p.getByTestId('production-review-submit').click(),{slot:'protected_version'});
   await p.context().close();
  }
  assert.equal(s.protected_version.current_status,'APPROVED');
  const contentPath='/production/versions/'+s.protected_version.id+'/content?variant=preview';
  const preview=await api('buyer',contentPath);
  assert.deepEqual(preview,script);
  await api('outsider',contentPath,{allowed:[403,404]});
  s.protected_preview_verified={path:contentPath,sha256:hash(preview),bytes:preview.length};
  await done('buyer-reads-one-independently-approved-private-preview-outsider-denied',s.protected_preview_verified);
 }
 phase='app-create-deletion-request';
 if(!s.privacy){const p=await actor('buyer','app','/privacy?view=new');await click(p,'希望办理的事项 查询本人资料');await click(p,'删除资料','menuitem');await click(p,'数字人模型','checkbox');await click(p,'交易记录','checkbox');await fill(p,'具体说明','本人撤回本项目脸部和声音使用授权，停止新增任务并清理指定模型。请核对原订单处置、保留范围和供应商回执，不将提交视为全部删除。');await request(p,'/privacy/requests',()=>click(p,'提交本次申请'),{slot:'privacy'});await snap(p,'app-request-created');await p.context().close();await done('app-creates-one-personal-model-and-order-request',{request_id:s.privacy.id});}
 await api('outsider','/privacy/requests/'+s.privacy.id,{allowed:[403,404]});await api('outsider','/privacy/requests/'+s.privacy.id+'/model-assets',{allowed:[403,404]});
 phase='app-withdraw-face-voice';
 if(!s.withdrawal){const p=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);await fill(p,'撤回授权的明确原因','本人撤回该项目脸部及声音授权；停止后续使用，原订单及已发生费用需另行办理。');await request(p,'/privacy/requests/'+s.privacy.id+'/consent-withdrawals',async()=>{await click(p,'撤回这份本人授权');await click(p,'本人明确确认');},{slot:'withdrawal'});assert.equal(s.withdrawal.request_completion,'NOT_CONFIRMED');await snap(p,'app-consent-withdrawn');await p.context().close();await done('app-withdraws-original-face-and-voice-consent-without-claiming-erasure');}
 const currentProject=await api('producer','/production/records/'+prep.project.id);
 if(!s.new_work_denied){await api('producer','/production/projects/'+prep.project.id+'/generation',{version:currentProject.object_version,body:{operation:'CREATE_LONG_LIVED',avatar_id:prep.avatar.id,asset_id:null,consent_id:prep.consent.id},allowed:[409],op:'withdrawn-new-generation'});assert.equal(s.requests.at(-1).code,'PRODUCTION_CONSENT_NOT_AVAILABLE');s.new_work_denied=true;await done('same-withdrawn-consent-blocks-new-work-before-provider-send');}
 if(scopedWithdrawal&&!s.old_preview_denied){
  phase='same-private-preview-after-withdrawal';
  assert(s.protected_preview_verified);
  await api('buyer',s.protected_preview_verified.path,{allowed:[409]});
  assert.equal(s.requests.at(-1).code,'PRODUCTION_CONSENT_NOT_AVAILABLE');
  await api('outsider',s.protected_preview_verified.path,{allowed:[403,404]});
  s.old_preview_denied=true;
  await done('withdrawal-blocks-original-preview-for-buyer-and-keeps-outsider-denied',{path:s.protected_preview_verified.path});
 }
 for(let n=0;n<8;n++){await control('/__qa/tick');s.asset=await api('producer','/production/records/'+s.asset.id);if(s.asset.current_status!=='READY')break;}
 assert(['DELETE_REQUIRED','DELETING','DELETED'].includes(s.asset.current_status));
 if(!s.old_order_preserved){const old=await api('buyer','/trade/records/'+prep.order.id);assert.equal(old.current_status,'PARTIALLY_PAID');assert.equal(old.data.financial.received_minor,3000);assert.equal(old.data.financial.refunded_minor,0);assert.deepEqual(old.data.contract,prep.order.data.contract);s.old_order_preserved=true;await done('withdrawal-preserves-original-paid-order-and-contract-pending-separate-disposition');}
 phase='app-register-deletion';
 if(!s.deletion){const p=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);await request(p,'/privacy/requests/'+s.privacy.id+'/model-deletions',async()=>{await click(p,'登记删除这个模型');await click(p,'本人明确确认');},{slot:'deletion'});assert.equal(s.deletion.request_completion,'NOT_CONFIRMED');await snap(p,'app-delete-request-not-completed');await p.context().close();await done('app-registers-single-model-deletion-still-not-complete');}
 if(!s.pending_delete_verified){for(let n=0;n<6;n++){await control('/__qa/tick');await new Promise(r=>setTimeout(r,300));}const actions=await api('buyer','/privacy/requests/'+s.privacy.id+'/actions');const action=actions.items.find(x=>x.action_id===s.deletion.action_id||x.id===s.deletion.action_id);assert(action,'deletion action must be present');assert.notEqual(action.status,'MODEL_DELETED');assert.equal(actions.request_completion,'NOT_CONFIRMED');s.pending_delete_verified=actions;const p=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);await p.setViewportSize({width:390,height:6000});await idle(p);const aria=await p.locator('body').ariaSnapshot();assert(!aria.includes('模型已删除'));await snap(p,'app-provider-still-pending');await p.context().close();await done('provider-pending-does-not-become-model-deleted-or-request-complete');}
 phase='provider-result-confirmed';
 if(!s.deleted){await control('/__qa/release-deletion');for(let n=0;n<50;n++){await control('/__qa/tick');const actions=await api('buyer','/privacy/requests/'+s.privacy.id+'/actions');if(actions.items.some(x=>x.status==='MODEL_DELETED')){s.deleted=actions;break;}await new Promise(r=>setTimeout(r,350));}assert(s.deleted,'supplier deletion receipt still missing');assert.equal(s.deleted.request_completion,'NOT_CONFIRMED');await done('original-delete-key-query-confirms-one-synthetic-model-not-all-data');}
 phase='app-and-vue-read-result';
 if(!s.results_read){const p=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);await p.setViewportSize({width:390,height:6000});await idle(p);await snap(p,'app-model-deleted-with-remaining-work');const aria=await p.locator('body').ariaSnapshot();assert(aria.includes('该模型已确认删除'));assert(!aria.includes('模型进展: DELETED'));assert(!aria.includes('所用授权: 已退出'));assert(aria.includes('所用授权: 已撤回'));await p.context().close();const w=await actor('producer','web','/privacy/operations/'+s.privacy.id);assert(s.requests.some(r=>r.path==='/api/v1/privacy/operations/requests/'+s.privacy.id&&r.status===200));assert((await w.locator('body').innerText()).includes('本人撤回本项目脸部和声音使用授权'));await snap(w,'vue-same-request-result');await w.context().close();s.results_read=true;await done('app-and-vue-read-same-request-after-supplier-result');}

 phase='vue-detailed-answer';
 if(!s.answer){
  const p=await actor('producer','web','/privacy/operations/'+s.privacy.id+'?action=response');
  const old=await api('buyer','/trade/records/'+prep.order.id);
  const document={synthetic_only:true,request_id:s.privacy.id,model_id:s.asset.id,consent_id:prep.consent.id,features:prep.consent.data.consent.features,actions:s.deleted,order:{id:old.id,status:old.current_status,financial:old.data.financial,contract_sha256:old.data.contract.content_sha256},confirmed:'Only this synthetic provider model has a verified deletion result. New work using the withdrawn face/voice consent is blocked.',remaining:['Original 3000 minor payment disposition remains separate and unfinished.','Multi-party contract and financial retention basis still requires responsible review.','Original files, historical copies, backups and any real supplier assets are not confirmed erased.']};
  const bytes=Buffer.from(JSON.stringify(document,null,2));s.answer_sha256=hash(bytes);s.answer_bytes=bytes.length;await save();
  if(!s.answer_asset){const upload=p.locator('.business-upload');if(!await upload.getAttribute('open'))await upload.locator('summary').click();await p.locator('#business-purpose').selectOption('REVIEW_EVIDENCE');await p.locator('#business-upload-file').setInputFiles({name:'qa27-privacy-receipt.json',mimeType:'text/plain',buffer:bytes});await request(p,'/supply/assets',()=>upload.getByRole('button',{name:'上传私有材料',exact:true}).click(),{slot:'answer_asset'});}
  await p.getByRole('button',{name:'读取可选已脱敏实际答复文件',exact:true}).click();const check=p.locator('#response-result-evidence_asset_ids-field').getByRole('checkbox',{name:new RegExp(s.answer_asset.id+'$')});await check.waitFor();await check.check();await p.locator('#response-result-response').fill('已核对同一脸声授权撤回和指定模型删除回执；新增任务被拒绝。此处是隔离合成供应商结果，不代表真实供应商已接入。原订单、原始文件和备份仍按附件所列事项继续办理。');await p.locator('#response-result-outcome').selectOption('DELETION_REQUESTED');await p.locator('#response-result-remaining_actions').fill('原订单首款30元的售后处置仍待单独办理。\n多方合同及钱账的正式分类留存依据待负责人核验。\n原始文件、历史副本、备份及真实供应商资料尚未确认全部清理。');await agree(p);await request(p,'/privacy/operations/requests/'+s.privacy.id+'/response',()=>p.getByTestId('business-response').click(),{slot:'answer'});assert.equal(s.answer.current_status,'AWAITING_REVIEW');await snap(p,'vue-answer-awaits-independent-review');await p.context().close();await done('vue-uploads-actual-same-request-receipt-and-records-unfinished-order-retention');
 }
 phase='independent-answer-review';
 if(!s.answer_reviewed){
  await api('buyer','/privacy/requests/'+s.privacy.id+'/evidence/'+s.answer_asset.id+'/content',{allowed:[403,404,409]});
  await api('producer','/privacy/operations/requests/'+s.privacy.id+'/review',{version:s.answer.object_version,body:{decision:'APPROVED',reason:'Self-review must be rejected',proposal_sha256:s.answer.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true},allowed:[403],op:'self-review-negative'});assert.equal(s.requests.at(-1).code,'SELF_REVIEW_FORBIDDEN');
  const p=await actor('reviewer','web','/privacy/operations/'+s.privacy.id+'?action=response-review');await p.locator('#response-review-decision').selectOption('APPROVED');await p.locator('#response-review-reason').fill('独立核对同申请、同模型、脸声范围及合成回执；原订单处置和保留依据未完，不签全部删除。');for(const k of ['evidence_verified','third_party_data_redacted','remaining_actions_checked'])await p.locator('#response-review-'+k).check();await agree(p);assert(await p.getByTestId('business-response-review').isDisabled());
  const panel=p.getByTestId('privacy-evidence-review');const waiting=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/evidence/'+s.answer_asset.id+'/content'));await panel.getByRole('button',{name:'读取本版实际文件',exact:true}).click();const r=await waiting;assert.equal(r.status(),200);assert.equal(hash(await r.body()),s.answer_sha256);await panel.getByText('本版列明文件均已取得并核对校验值，请继续人工确认内容。',{exact:true}).waitFor();await agree(p);await request(p,'/privacy/operations/requests/'+s.privacy.id+'/review',()=>p.getByTestId('business-response-review').click(),{slot:'answer_reviewed'});assert.equal(s.answer_reviewed.current_status,'FOLLOW_UP');await snap(p,'vue-independent-answer-approved-with-remaining-work');await p.context().close();await done('independent-review-requires-actual-file-read-and-keeps-follow-up');
 }
 phase='app-download-approved-receipt';
 if(!s.answer_downloaded){
  await api('outsider','/privacy/requests/'+s.privacy.id+'/evidence/'+s.answer_asset.id+'/content',{allowed:[403,404]});
  const p=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);const waiting=p.waitForEvent('download');await click(p,'领取这份审核答复附件');const download=await waiting;const downloaded=join(out,attempt+'-approved-receipt.bin');await download.saveAs(downloaded);assert.equal(hash(await readFile(downloaded)),s.answer_sha256);await snap(p,'app-saved-same-approved-receipt');s.answer_downloaded={file:attempt+'-approved-receipt.bin',sha256:s.answer_sha256,bytes:s.answer_bytes};await p.context().close();await done('app-saves-exact-approved-receipt-unrelated-account-denied');
 }

 phase='app-original-request-recovery';
 if(!scopedWithdrawal&&s.reopen_committed&&!s.reopen_recovered&&!s.reopen_readback){const r=await api('buyer','/privacy/requests/'+s.privacy.id);assert.equal(r.current_status,'REOPENED');assert.equal(r.object_version,s.reopen_committed.data.object_version);s.reopen_readback={id:r.id,version:r.object_version,status:r.current_status,ui_original_key_recovery:'NOT_COMPLETED_ORIGINAL_BROWSER_ENDED',no_second_post:true};await done('read-original-committed-reopen-after-driver-failure-without-repeating-operation');}
 if(!scopedWithdrawal&&!s.reopen_recovered&&!s.reopen_committed){
  const p=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);let dropped=false;
  await p.context().route('**/api/v1/privacy/requests/'+s.privacy.id+'/reopen',async route=>{
   const q=route.request();if(q.method()!=='POST')return route.fallback();const wire={key_sha256:hash(q.headers()['idempotency-key']||''),body_sha256:hash(q.postDataBuffer()),version:q.headers()['if-match']};
   const headers=Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer'].includes(k)));const r=await route.fetch({url:f.base_url+'/privacy/requests/'+s.privacy.id+'/reopen',headers});assert.equal(r.status(),200);
   if(!dropped){dropped=true;s.reopen_committed=await r.json();s.reopen_wire=wire;await save();return route.abort('failed');}
   assert.deepEqual(wire,s.reopen_wire);return route.fulfill({response:r});
  });
  await fill(p,'需要重新处理的原因','指定模型回执已领取，但原订单首款处置和保留范围尚未完成，请继续按原记录跟进。');await click(p,'提交本次异议');await seek(p,p.getByRole('button',{name:'先核对当前记录',exact:true}));assert(dropped);await snap(p,'app-reopen-result-unknown');await click(p,'先核对当前记录');await idle(p);await request(p,'/privacy/requests/'+s.privacy.id+'/reopen',()=>click(p,'使用原编号继续核对'),{slot:'reopen_recovered'});assert.equal(s.reopen_recovered.current_status,'REOPENED');assert.equal(s.reopen_recovered.object_version,s.reopen_committed.data.object_version);await snap(p,'app-original-reopen-recovered');await p.context().close();await done('app-unknown-reopen-replays-exact-original-key-body-and-version-once');
 }
 phase='final-current-build-read';
 const finalApp=await actor('buyer','app','/privacy?view=request&recordId='+s.privacy.id);await finalApp.setViewportSize({width:390,height:6000});await idle(finalApp);const finalAria=await finalApp.locator('body').ariaSnapshot();assert(finalAria.includes('该模型已确认删除')&&finalAria.includes('所用授权: 已撤回'));assert(!finalAria.includes('模型进展: DELETED')&&!finalAria.includes('所用授权: 已退出'));await snap(finalApp,'final-app-current-model-and-original-answer');await finalApp.context().close();await done('final-current-app-explains-model-and-consent-with-original-answer-retained');
 s.attempts.at(-1).result=scopedWithdrawal?'PASS_S3A_WITHDRAWAL_AND_REVIEWED_RESPONSE':s.reopen_recovered?'PASS_WITHDRAWAL_DELETION_AND_REVIEWED_RESPONSE':'PASS_SCOPED_READBACK_WITH_UI_RECOVERY_LIMIT';s.model_chain_complete=true;await save();
}catch(e){s.attempts.at(-1).result='FAIL';s.attempts.at(-1).failure={phase,message:e.message,stack:e.stack};console.error(phase+': '+e.message);for(const[i,p]of pages.entries())if(!p.isClosed())await snap(p,'failure-'+i).catch(()=>{});process.exitCode=1;}
finally{s.attempts.at(-1).finished_at=new Date().toISOString();await save();await writeFile(join(out,attempt+'-result.json'),JSON.stringify(s,null,2));await browser.close();}

