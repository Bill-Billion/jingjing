// PM04 G1: continue the App-created request in the pinned loopback environment.
// The input contains credentials and must stay in .local. Output never includes headers.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),env=resolve(process.argv[2]),out=resolve(process.argv[3]);
assert(env.includes('.local'));assert(out.startsWith(join(root,'.local')+'/')||out.startsWith(join(root,'.local')+'\\'));
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const access=await read(join(env,'access.json')),state=await read(join(env,'pm04-joint-private.json'));
assert.equal(access.synthetic_only,true);assert(Date.parse(access.expires_at)>Date.now());
assert.match(access.base_url,/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
const created=await read(join(env,'pm04-app-privacy-create-result.json')),requestId=created.request.id;
assert.match(requestId,/^[a-f0-9-]{36}$/);
await mkdir(dirname(out),{recursive:true});
await mkdir(out); // A run must never overwrite a prior failure or its evidence.
const report={frontend_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backend_sha:state.revision,request_id:requestId,order_id:state.order_id,synthetic_only:true,steps:[],requests:[],failures:[]};
const wr=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'));
const {chromium}=wr('playwright-core'),{preview}=await import(pathToFileURL(wr.resolve('vite')));
let web,browser;const pages=[];
const record=(name,data={})=>{report.steps.push({name,...data});console.log('PASS '+name)};
const save=()=>writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
async function api(role,path,expected=200){const r=await fetch(access.base_url+path,{headers:{Authorization:'Bearer '+state.people[role].token}});assert([].concat(expected).includes(r.status),`${path}: ${r.status}`);return r;}
async function actor(role,path){const a=state.people[role],memberships=(await (await api(role,'/me/parties')).json()).data.items;
 const personal=memberships.find(m=>m.party.kind==='PERSON'&&m.membership.current_status==='ACTIVE');assert(personal,'PERSONAL_UPLOAD_IDENTITY_REQUIRED');
 const c=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN'});await c.addInitScript(({token,party,expiry})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);sessionStorage.setItem('ops.session.expires_at',expiry)},{token:a.token,party:personal.party.id,expiry:access.expires_at});const p=await c.newPage();pages.push(p);p.setDefaultTimeout(12000);p.on('pageerror',e=>report.failures.push({kind:'pageerror',message:e.message}));p.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))report.requests.push({role,method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()})});await p.goto('http://127.0.0.1:5189'+path);await p.waitForLoadState('networkidle');return p;}
async function post(p,suffix,action){const waiting=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(suffix));waiting.catch(()=>{});await action();const r=await waiting,j=await r.json();assert.equal(r.status(),200,j.error?.code);await p.waitForLoadState('networkidle');return j.data;}
const agree=p=>p.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
try{
 web=await preview({root:join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace'),configFile:false,preview:{host:'127.0.0.1',port:5189,strictPort:true,proxy:{'/api':{target:new URL(access.base_url).origin}}}});
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
 const current=(await (await api('producer','/privacy/operations/requests/'+requestId)).json()).data;
 let asset;const previous=process.argv[4]?await read(resolve(process.argv[4])):null;
 if(previous){assert.equal(previous.request_id,requestId);assert.equal(previous.order_id,state.order_id);assert.match(previous.asset_id,/^[a-f0-9-]{36}$/);}
 if(current.current_status==='AWAITING_REVIEW'){
  assert(process.argv[4],'Use the preserved failed report to resume this same request');
  asset={id:previous.asset_id};report.asset_id=asset.id;report.resumed_from=process.argv[4];record('resume-original-pending-answer-without-reupload-or-resubmit');
 }else{
 const op=await actor('producer','/privacy/operations/'+requestId+'?action=start');
 if(current.current_status==='RECEIVED'){await agree(op);const started=await post(op,'/start',()=>op.getByTestId('business-start').click());assert.equal(started.id,requestId);record('operator-starts-same-app-request');}
 await op.goto('http://127.0.0.1:5189/privacy/operations/'+requestId+'?action=response');await op.waitForLoadState('networkidle');
 if(previous){
  assert.equal(current.current_status,'PROCESSING');asset={id:previous.asset_id};report.asset_id=asset.id;report.resumed_from=process.argv[4];record('resume-original-uploaded-file-without-reupload');
 }else{
 const panel=op.getByTestId('privacy-copy-panel');
 await panel.getByLabel('选择本次资料',{exact:true}).selectOption('account:ACCOUNT');
 await panel.getByRole('button',{name:'读取此类第一页',exact:true}).click();
 await panel.getByText('核对第 1 页实际资料',{exact:true}).waitFor();
 await panel.getByLabel('未提供内容、实际留存依据与后续处理',{exact:true}).fill('合成机测只提供已核对的账户与原订单资料；其他类别、原件、留存依据和后续处理仍待逐项办理。');
 await panel.getByRole('button',{name:'加入本次整理文件',exact:true}).click();
 await panel.getByLabel('选择本次资料',{exact:true}).selectOption('trade:SUMMARY');
 await panel.getByRole('button',{name:'读取本申请可选订单',exact:true}).click();
 await panel.getByLabel('具体订单',{exact:true}).selectOption(state.order_id);
 await panel.getByRole('button',{name:'读取此类第一页',exact:true}).click();
 await panel.getByText('核对第 1 页实际资料',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'加入本次整理文件',exact:true}).click();
 record('web-reads-account-and-original-order-for-same-request');
 await panel.getByRole('button',{name:'生成待核对文件，带入下方上传',exact:true}).click();
 const upload=op.locator('.business-upload');if(!await upload.getAttribute('open'))await upload.locator('summary').click();
 asset=await post(op,'/supply/assets',()=>upload.getByRole('button',{name:'上传私有材料',exact:true}).click());
 assert.equal(asset.current_status,'READY');
 report.asset_id=asset.id;await save();
 await upload.getByRole('status').filter({hasText:'读取可选已脱敏实际答复文件'}).waitFor();
 }
 await op.getByRole('button',{name:'读取可选已脱敏实际答复文件',exact:true}).click();
 const fileLabel=op.locator('#response-result-evidence_asset_ids-field label').filter({hasText:asset.id});await fileLabel.waitFor();assert.equal(await fileLabel.count(),1);await fileLabel.getByRole('checkbox').check();
 await op.locator('#response-result-response').fill('已提供本申请对应账户与原订单副本，其余类别保留后续逐项核对。');
 await op.locator('#response-result-outcome').selectOption('INFORMATION_PROVIDED');
 await op.locator('#response-result-remaining_actions').fill('其他类别及原件尚待逐项核对，不代表全库资料已交付或已删除。');
 await agree(op);const proposed=await post(op,'/response',()=>op.getByTestId('business-response').click());assert.equal(proposed.id,requestId);
 record('uploaded-file-selectable-and-submitted-for-independent-review',{asset_id:asset.id});
 }
 await api('stock_buyer','/privacy/requests/'+requestId+'/evidence/'+asset.id+'/content',[403,404,409]);
 record('applicant-cannot-download-before-review');
 const reviewer=await actor('reviewer','/privacy/operations/'+requestId+'?action=response-review');
 await reviewer.screenshot({path:join(out,'review-before.png'),fullPage:true});
 const evidencePanel=reviewer.getByTestId('privacy-evidence-review');await evidencePanel.waitFor();
 await reviewer.locator('#response-review-decision').selectOption('APPROVED');
 await reviewer.locator('#response-review-reason').fill('合成独审：实际读取同申请账户与原订单，确认脱敏并保留其他未完成项。');
 for(const field of ['evidence_verified','third_party_data_redacted','remaining_actions_checked'])await reviewer.locator('#response-review-'+field).check();
 await agree(reviewer);assert(await reviewer.getByTestId('business-response-review').isDisabled());
 record('approval-blocked-until-actual-proposal-file-read');
 const bytesResponse=reviewer.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/evidence/'+asset.id+'/content'));
 await evidencePanel.getByRole('button',{name:'读取本版实际文件',exact:true}).click();
 const bytes=await (await bytesResponse).body();assert.equal(JSON.parse(bytes.toString()).request_id,requestId);
 report.sha256=createHash('sha256').update(bytes).digest('hex');report.byte_size=bytes.length;
 await evidencePanel.getByText('本版列明文件均已取得并核对校验值，请继续人工确认内容。',{exact:true}).waitFor();
 await agree(reviewer);const approved=await post(reviewer,'/review',()=>reviewer.getByTestId('business-response-review').click());assert.equal(approved.id,requestId);assert.equal(approved.current_status,'FOLLOW_UP');
 record('separate-reviewer-reads-and-approves-same-attachment');
 await api('stock_outsider','/privacy/requests/'+requestId+'/evidence/'+asset.id+'/content',[403,404]);
 record('unrelated-account-cannot-download');
 assert.equal(report.failures.length,0);
 report.status='PASS';
}catch(e){report.status='FAIL';report.failures.push({message:e.message,stack:e.stack});console.error(e.message);for(const[i,p]of pages.entries()){await writeFile(join(out,'page-'+i+'.txt'),await p.locator('body').innerText()).catch(()=>{});await p.screenshot({path:join(out,'page-'+i+'.png'),fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{await save();await browser?.close();if(web)await new Promise(y=>web.httpServer.close(y));}
