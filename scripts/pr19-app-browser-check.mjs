#!/usr/bin/env node
/** Actual Flutter Web UI and isolated HTTP/MySQL, never native or production payments. */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const {chromium}=require('playwright-core')
const state=JSON.parse(await readFile(resolve(root,process.env.PR19_UI_STATE_FILE||'.local/pr19-ui-runtime.json'),'utf8'))
assert.equal(state.testOnly,true)
const base=process.env.PR19_APP_URL||'http://127.0.0.1:8777'
for(const url of [base,state.apiUrl,state.controlUrl])assert.equal(new URL(url).hostname,'127.0.0.1')
const evidence=resolve(root,'docs/ux/pr19-ui/evidence'),shots=resolve(evidence,'screenshots')
await mkdir(shots,{recursive:true})

const results=[],pageErrors=[],screenshots=[],routes=[],actors={},requests=[],verification=[]
let resumedPasses=0,revokedByCheck=false,verificationComplete=false,terminalError=null
const resumeHistory=[]
const resultPath=resolve(evidence,'app-browser-results.json')
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
let page
const buildHash=createHash('sha256').update(await readFile(resolve(root,'.local/pr19-app-web/main.dart.js'))).digest('hex')
if(process.argv.includes('--resume')){
 const previous=JSON.parse(await readFile(resultPath,'utf8'));assert.equal(previous.build_sha256,buildHash);
 if(previous.fixture){assert.equal(previous.fixture.pid,state.pid);assert.equal(previous.fixture.schema,state.schema)}
 else{assert(previous.routes.includes('/finance/record?recordId='+idFromState('appSettlementConfirmSettlement')));assert(previous.routes.includes('/finance/agreement?agreementId='+idFromState('appAvailableAgreement')))}
 results.push(...previous.results.filter(r=>r.result==='PASS'));screenshots.push(...previous.screenshots);routes.push(...previous.routes);pageErrors.push(...previous.pageErrors);resumedPasses=results.length;resumeHistory.push(...(previous.resume_history||(previous.resumed_passes?[previous.resumed_passes]:[])),resumedPasses);
}
function idFromState(key){return state.records[key].id}
async function save(){await writeFile(resultPath,JSON.stringify({synthetic_only:true,native_device:'CANCELLED_BY_USER_NOT_VERIFIED',source:'Flutter Web normal UI → isolated real HTTP/MySQL',build_sha256:buildHash,resumed_passes:resumedPasses,resume_history:resumeHistory,verification_complete:verificationComplete,error:terminalError,fixture:{pid:state.pid,schema:state.schema,apiUrl:state.apiUrl},results,routes,pageErrors,screenshots,verification,total:results.length,passed:results.filter(r=>r.result==='PASS').length},null,2)+'\n')}
const redact=v=>String(v).replaceAll(state.controlToken,'[REDACTED]').replace(/Bearer\s+\S+/g,'Bearer [REDACTED]')
async function check(label,task){if(results.some(r=>r.label===label&&r.result==='PASS'))return;const start=Date.now();console.log('→ '+label);try{await task();results.push({label,result:'PASS',elapsed_ms:Date.now()-start});console.log('✓ '+label);await save()}catch(e){results.push({label,result:'FAIL',error:redact(e.message).slice(0,1500)});await save();throw e}}
async function control(route,method='POST'){const r=await fetch(state.controlUrl+route,{method,headers:{Authorization:'Bearer '+state.controlToken}});assert(r.ok);return r.json()}
const id=key=>state.records[key].id
async function enable(){const n=page.locator('flt-semantics-placeholder');await n.waitFor({state:'attached'});await n.evaluate(e=>e.click());await page.getByRole('button').first().waitFor()}
async function go(route,first=false){await page.goto(base+'/#'+route);if(first)await enable();routes.push(route);await page.waitForTimeout(400)}
async function text(value){await top();const locator=page.getByText(value,{exact:false}).or(page.getByRole('textbox',{name:value,exact:true})).or(page.getByLabel(value,{exact:false})).first();for(let n=0;n<45;n++){if(await locator.count()&&await locator.isVisible())return;await page.mouse.move(180,520);await page.mouse.wheel(0,250);await page.waitForTimeout(350)}throw Error('Flutter text not found in the actual scroll view: '+value)}
const click=label=>page.getByRole('button',{name:label,exact:true}).click()
// Flutter paints its own scroll view. Physically scroll and click the canvas,
// rather than moving only the accessibility DOM onto a different widget.
async function visible(locator){for(let n=0;n<45;n++){const b=await locator.count()?await locator.boundingBox({timeout:300}).catch(()=>null):null;if(b&&b.y+b.height/2>=60&&b.y+b.height/2<=page.viewportSize().height-70)return locator;await page.mouse.move(180,520);await page.mouse.wheel(0,b?.y<50?-250:250);await page.waitForTimeout(350)}throw Error('Flutter control did not enter the actual scroll view')}
async function press(locator){await visible(locator);await page.waitForTimeout(350);const b=await locator.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(250)}
async function fill(name,value){
 const l=page.getByRole('textbox',{name}).first();
 // Merged Flutter field semantics can include the preceding checkbox: the
 // card centre hits that checkbox, while its lower edge lies in the TextField.
 const merged=await l.evaluate(n=>!!n.parentElement?.querySelector('[role="checkbox"]'));
 for(let n=0;n<45;n++){
  const b=await l.boundingBox();const y=b.y+(merged?b.height-15:b.height/2);
  if(y>=65&&y<=page.viewportSize().height-80){await page.mouse.click(b.x+b.width/2,y);break}
  await page.mouse.move(180,520);await page.mouse.wheel(0,y<65?-250:250);await page.waitForTimeout(350);
  assert(n<44,'Actual text input must enter the viewport');
 }
 // Keep Flutter's canvas-established edit focus. Focusing a ghost semantics
 // textarea directly can leave the controller empty despite its DOM value.
 await page.waitForTimeout(250);await page.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');await page.keyboard.insertText(value);await page.waitForTimeout(250);
 assert(await page.getByRole('textbox',{name}).evaluateAll((ns,v)=>ns.some(n=>n.value===v),value),'Actual Flutter field should reflect typed value');await page.keyboard.press('Tab');await page.waitForTimeout(250);
}
async function tick(name){const l=page.getByRole('checkbox',{name,exact:true});await press(l);if(await l.getAttribute('aria-checked')!=='true')await l.click();assert.equal(await l.getAttribute('aria-checked'),'true')}
async function top(){await page.mouse.move(180,350);await page.mouse.wheel(0,-20000);await page.waitForTimeout(250)}
async function shot(name,{scrollTop=true}={}){if(scrollTop)await top();await page.waitForTimeout(500);const file='screenshots/pr19-app-'+name+'-mobile.png';await page.screenshot({path:resolve(evidence,file)});screenshots.push({file,viewport:page.viewportSize()})}
const handled=p=>{p.catch(()=>{});return p}
const get=path=>handled(page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1'+path))
const post=path=>handled(page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1'+path))
async function data(r){const j=await r.json();assert(r.ok(),`App ${r.status()} ${j.error?.code||''}`);return j.data}
async function confirm(label,path){await press(page.getByRole('button',{name:label,exact:true}));await page.getByRole('alertdialog').waitFor();const r=post(path);await click('确认办理');return data(await r)}
async function select(label,option){console.log('UI select '+label);const trigger=page.getByRole('button',{name:new RegExp(label)}).or(page.getByLabel(label,{exact:true})).first();await press(trigger);await press(page.getByText(option,{exact:false}).or(page.getByLabel(option,{exact:false})).last())}
async function upload(){const chosen=page.waitForEvent('filechooser');await press(page.getByRole('button',{name:'选择并上传文件',exact:true}).first());const r=post('/supply/assets');await (await chosen).setFiles({name:'synthetic-proof.txt',mimeType:'text/plain',buffer:Buffer.from('ISOLATED TEST / SYNTHETIC ONLY\nActual local browser upload, never actual personal rights.')});const asset=await data(await r);assert(asset.id);return asset}
async function date(label,day){console.log('UI date '+label);await press(page.getByRole('button',{name:new RegExp('^'+label+'：')}));await page.getByRole('dialog').waitFor();const inputMode=page.getByRole('button',{name:/Switch to input|切换到输入/});if(await inputMode.count()){await inputMode.click();const field=page.getByRole('textbox').last();await press(field);await page.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');await page.keyboard.type(day,{delay:30});await page.keyboard.press('Tab');await page.waitForTimeout(200);assert.equal(await field.inputValue(),day);await click('OK')}else{throw Error('Date picker input toggle missing; inspect actual localized calendar')}
 await page.getByRole('button',{name:'Switch to text input mode',exact:true}).waitFor();await click('OK');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForTimeout(350);const chosen=await page.getByRole('button',{name:new RegExp('^'+label+'：')}).innerText();const expected=new Date(day);assert(chosen.includes(`${expected.getFullYear()}-${String(expected.getMonth()+1).padStart(2,'0')}-${String(expected.getDate()).padStart(2,'0')}`),'Calendar should retain actual typed day: '+chosen)}
async function login(name){
 const person=state.accounts[name],context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>pageErrors.push(redact(e.message)));
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/api/v1/finance/'))requests.push({path:new URL(r.url()).pathname,key:r.headers()['idempotency-key'],version:r.headers()['if-match'],body:r.postData()})});
 await go('/finance',true);await click('前往账号与身份');await text('手机号登录');await fill(/手机号/,person.phone);await click('获取验证码');await text('验证码已发送');await fill(/验证码/,(await control('/code?phone='+person.phone,'GET')).code);await click('同意用户协议与隐私政策');await click('登录 / 注册');await text('重新读取约定');
 if(name==='payer'){await go('/account');await text('选择办事身份');const org=page.getByRole('group',{name:/清风合成项目发起机构/});const choice=org.getByRole('button',{name:/^(正在)?使用此身份$/}).first();await visible(choice);if(await choice.innerText()==='使用此身份')await press(choice);await page.getByRole('button',{name:/^Back/}).first().click();await text('重新读取约定')}
 actors[name]={page,context};return page;
}
async function run(){
 if(resumedPasses)await login('recipient');
 await check('正常短信选择本人约定，余额只显示本人且付款申请与实付区分',async()=>{await login('recipient');await shot('agreements');await go('/finance/agreement?agreementId='+id('appAvailableAgreement'));await text('刷新本人结算');await shot('overview');assert.equal(await page.getByRole('tab').count(),0)});
 await check('准确结算只读本人投影，确认未知结果保留原编号与版本，GET核对本人确认',async()=>{const rid=id('appSettlementConfirmSettlement');const fetched=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/finance/records/'+rid);await go('/finance/record?recordId='+rid);const record=await data(await fetched);assert.equal(record.data.balances.length,1);assert.equal(record.data.balances[0].party_id,state.accounts.recipient.personalPartyId);await tick('已完整阅读本人份额与本版原约定');await fill('确认意见','本人仅确认可见份额与该准确版本，不冒称其他主体余额。');await shot('settlement-confirm');await control('/response-loss?operation=confirmation&mode=503');const start=requests.length;await press(page.getByRole('button',{name:'确认本次结算',exact:true}));await page.getByRole('alertdialog').waitFor();let response=post('/finance/records/'+rid+'/confirmations');await click('确认办理');assert.equal((await response).status(),503);await text('恢复原请求核对');const hash=new URL(page.url()).hash;await page.getByRole('button',{name:/^Back/}).first().click();assert.equal(new URL(page.url()).hash,hash);response=post('/finance/records/'+rid+'/confirmations');await press(page.getByRole('button',{name:'恢复原请求核对',exact:true}));const replay=await data(await response);assert.equal(replay.data.balances.length,1);const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);await text('本人已同意本版本。');await shot('settlement-confirmed')});
 await check('私有收款资料真实上传，申请金额精确到分且只进入REQUESTED',async()=>{await go('/finance/payout/new?agreementId='+id('appAvailableAgreement'));await fill('申请金额（元）','10.01');await upload();await fill('备注','仅隔离浏览器测试，申请不代表真实已付或自动转账。');await shot('payout-new');const row=await confirm('提交付款申请','/finance/agreements/'+id('appAvailableAgreement')+'/payouts');assert.equal(row.current_status,'REQUESTED');assert.equal(row.data.amount_minor,1001);await text('刷新结果');await shot('payout-requested');await go('/finance/record?recordId='+id('appPayoutPaidPayout'));await text('已核实真实外部付款。');await shot('payout-paid')});
 await check('结算或权利异议经真实证据提交，追加回复不自动退款或消除历史',async()=>{await go('/finance/dispute/new?recordId='+id('appAvailableSettlement'));await select('问题类型','结算');await fill('原因','仅合成异议，申请与实付及旧版仍各自保留。');await upload();await shot('dispute-new');const row=await confirm('提交异议','/finance/records/'+id('appAvailableSettlement')+'/disputes');assert.equal(row.current_status,'OPEN');await text('刷新结果');await fill('回复','本人补充合成说明，等待独立处理。');const response=await confirm('提交回复','/finance/disputes/'+row.id+'/responses');assert.equal(response.kind,'RESPONSE');await text('刷新结果');await shot('dispute-history')});
 await check('应收、部分到账、实收和待追回均按真实约定区分；流水通知可读',async()=>{for(const name of ['appRevenueUnreceived','appRevenuePartial','appRevenuePaid','appRevenueCorrected']){await go('/finance/agreement?agreementId='+id(name+'Agreement'));await text('刷新本人结算');await shot(name.replace('app','revenue-'))}await go('/finance/entries?agreementId='+id('appAvailableAgreement'));await text('重新读取流水');await shot('entries');await go('/finance/notifications');await text('重新读取通知');await shot('notifications')});
 await check('原退款页面正常、五tab稳定、320宽结算无底栏；失权清除私有内容',async()=>{await login('customer');await go('/trade/refund?paymentId='+id('appRefundReadyPayment'));await text('申请原因');await shot('refund');page=actors.recipient.page;await go('/my');for(const name of ['首页','入戏','培育','成角','我的']){await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.getByRole('tab').count(),5)}await page.setViewportSize({width:320,height:693});await go('/finance/record?recordId='+id('appSettlementConfirmSettlement'));await text('本人已同意本版本。');assert.equal(await page.getByRole('tab').count(),0);await shot('settlement-320');await control('/recipient-permission?enabled=false');revokedByCheck=true;await go('/finance/agreement?agreementId='+id('appAvailableAgreement'));await text('先确认办事身份');assert.equal(await page.getByText('本人金额',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'刷新本人结算',exact:true}).count(),0);assert.equal(await page.getByRole('textbox').count(),0);await shot('permission-revoked');await control('/recipient-permission?enabled=true');revokedByCheck=false;await press(page.getByRole('button',{name:'重新核对权限',exact:true}));await text('刷新本人结算')});
}
async function verifyReads(){
 page=actors.recipient.page;
 const rid=id('appSettlementConfirmSettlement'),readRecord=get('/finance/records/'+rid),readConfirmation=get('/finance/records/'+rid+'/confirmations');
 await go('/finance/record?recordId='+rid);const record=await data(await readRecord),confirmed=await data(await readConfirmation);assert.equal(record.data.balances.length,1);assert.equal(record.data.balances[0].party_id,state.accounts.recipient.personalPartyId);
 const mine=confirmed.items.find(c=>c.party_id===state.accounts.recipient.personalPartyId);assert(mine);assert.equal(mine.decision,'APPROVED');assert.equal(mine.content_sha256,record.content_sha256);assert.equal(mine.reason,'本人仅确认可见份额与该准确版本，不冒称其他主体余额。');verification.push({check:'GET exact recipient confirmation and original snapshot hash',record_id:rid,hash:mine.content_sha256,decision:mine.decision});
 const gid=id('appAvailableAgreement'),list=get('/finance/agreements/'+gid+'/records');await go('/finance/records?agreementId='+gid+'&kind=PAYOUT');const payouts=await data(await list),payout=payouts.items.find(p=>p.current_status==='REQUESTED'&&p.data.amount_minor===1001);assert(payout,'Actual UI-created request should be listed');
 const reread=get('/finance/records/'+payout.id);await go('/finance/record?recordId='+payout.id);const fresh=await data(await reread);assert.equal(fresh.current_status,'REQUESTED');assert.equal(fresh.data.amount_minor,1001);const asset=fresh.data.destination_asset_id;assert(asset);
 const proof=get('/finance/records/'+payout.id+'/evidence/'+asset),download=handled(page.waitForEvent('download'));await press(page.getByRole('button',{name:'读取材料 · '+asset.slice(0,8)+'…'+asset.slice(-4),exact:true}));const proofResponse=await proof;assert(proofResponse.ok());const bytes=await proofResponse.body(),expected=Buffer.from('ISOLATED TEST / SYNTHETIC ONLY\nActual local browser upload, never actual personal rights.');assert.deepEqual(bytes,expected);await download;await text('已按当前权限读取材料。');await shot('payout-private-proof');verification.push({check:'Actual UI-uploaded private proof reread with exact bytes/hash; request remains REQUESTED',record_id:payout.id,asset_id:asset,amount_minor:1001,current_status:fresh.current_status,byte_size:bytes.length,content_sha256:createHash('sha256').update(bytes).digest('hex')});
 for(const [name,received,receivable,recovery] of [['appRevenueUnreceived',0,80000,0],['appRevenuePartial',30000,50000,0],['appRevenuePaid',80000,0,0],['appRevenueCorrected',80000,-10000,1000]]){
  const gid=id(name+'Agreement'),read=get('/finance/agreements/'+gid+'/balances');await go('/finance/agreement?agreementId='+gid);const b=await data(await read);assert.equal(b.received_minor,received);assert.equal(b.receivable_minor,receivable);assert.equal(b.items.length,1);assert.equal(b.items[0].party_id,state.accounts.recipient.personalPartyId);assert.equal(b.items[0].recovery_due_minor,recovery);verification.push({check:'GET income vs cash vs recovery',agreement_id:gid,received_minor:b.received_minor,receivable_minor:b.receivable_minor,recovery_due_minor:b.items[0].recovery_due_minor});
 }
}
try{await run();await verifyReads();assert.equal(pageErrors.length,0,pageErrors.join('\n'));verificationComplete=true;console.log('✓ GET confirmation, private bytes/hash and four exact revenue balances')}catch(e){terminalError=redact(e.message).slice(0,1500);console.error(redact(e.stack));process.exitCode=1;if(page){await page.screenshot({path:resolve(shots,'debug-app.png')}).catch(()=>{});await writeFile(resolve(root,'.local/pr19-app-debug-semantics.json'),JSON.stringify(await page.locator('[role],[aria-label]').evaluateAll(ns=>ns.map(n=>({role:n.getAttribute('role'),label:n.getAttribute('aria-label'),text:n.textContent?.slice(0,160)}))).catch(()=>[]),null,2))}}finally{if(revokedByCheck)await control('/recipient-permission?enabled=true').catch(()=>{});await save();await browser.close()}
