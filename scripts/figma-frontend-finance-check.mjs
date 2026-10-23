#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import{createRequire}from'node:module';import{createHash}from'node:crypto';import{join,resolve}from'node:path';
const state=JSON.parse(await readFile('.local/pr19-ui-runtime.json','utf8'));
assert(state.testOnly&&state.syntheticOnly&&state.apiUrl==='http://127.0.0.1:3342');
const person=state.accounts.recipient,base='http://127.0.0.1:8777';
const widths=(process.env.FIGMA_FINANCE_WIDTHS||process.env.FIGMA_FINANCE_WIDTH||'390').split(',').map(Number);assert(widths.length>0&&widths.every(w=>[320,390].includes(w)));let width=widths[0];
const {chromium}=createRequire(resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const out=resolve(process.env.FIGMA_FINANCE_OUTPUT||'docs/testing/evidence/figma-frontend-restore-20261023/last-details/finance'+(width===390?'':'/320'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({locale:'zh-CN',viewport:{width,height:844}}),page=await context.newPage();page.setDefaultTimeout(25000);
const errors=[],network=[],writes=[],screenshots=[],results=[];let capturing=false;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/overflowed by|EXCEPTION CAUGHT|RenderFlex.*overflow/.test(m.text()))errors.push(m.text());});
page.on('response',r=>{if(r.url().startsWith(state.apiUrl))network.push({path:new URL(r.url()).pathname,status:r.status()});});
page.on('request',r=>{if(capturing&&r.url().startsWith(state.apiUrl)&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push({path:new URL(r.url()).pathname,method:r.method()});});
const sha=b=>createHash('sha256').update(b).digest('hex');const bundle=sha(await readFile('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/figma-finance-check/main.dart.js'));
async function semantics(){await page.locator('flt-semantics-placeholder,flt-semantics').first().waitFor({state:'attached'});const p=page.locator('flt-semantics-placeholder');if(await p.count())await p.evaluate(e=>e.click());await page.locator('flt-semantics').first().waitFor({state:'attached'});await page.waitForLoadState('networkidle');}
try{
 await page.goto(base+'/#/login?returnRoute=%2Ffinance');await semantics();
 await page.getByRole('textbox',{name:/手机号/}).fill(person.phone);const challenge=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/sms-challenges'&&r.request().method()==='POST');await page.getByRole('button',{name:'获取验证码',exact:true}).click();assert.equal((await challenge).status(),200);
 const r=await fetch(state.controlUrl+'/code?phone='+person.phone,{headers:{Authorization:'Bearer '+state.controlToken}});assert(r.ok);const code=(await r.json()).code;assert(typeof code==='string');
 assert.equal(code.length,6);
 const otp=page.getByRole('textbox',{name:/验证码/});await otp.click();await page.waitForTimeout(300);await page.keyboard.press('Meta+A');await page.keyboard.type(code,{delay:100});await page.waitForTimeout(200);assert.equal((await otp.inputValue()).length,6,'Wait for the actual Flutter text client before typing');
 const agreement=page.getByRole('checkbox');
 for(let n=0;n<20;n++){const b=await agreement.boundingBox();if(b&&b.y>60&&b.y+b.height<740){await page.mouse.click(b.x+Math.min(12,b.width/2),b.y+b.height/2);break;}await page.mouse.move(195,400);await page.mouse.wheel(0,220);await page.waitForTimeout(120);}
 await page.waitForTimeout(250);assert.equal(await agreement.getAttribute('aria-checked'),'true','Actual agreement checkbox must be checked');
 await page.getByRole('button',{name:'登录并继续',exact:true}).click();
 // Wait for the returned page rather than a directory action below the
 // viewport. The matrix then verifies actual successful finance HTTP reads.
 await page.getByRole('heading',{name:'我的收入',exact:true}).first().waitFor();
 await page.waitForLoadState('networkidle');
 assert(network.some(r=>r.path==='/api/v1/auth/sessions'&&r.status===200));
 assert(network.some(r=>r.path==='/api/v1/me/parties'&&r.status===200));
 const loginToast=page.locator('flt-semantics').getByText('验证码已发送，请查收短信',{exact:true});
 if(await loginToast.count())await loginToast.waitFor({state:'hidden',timeout:12000});
 await context.storageState({path:'.local/figma-finance-browser-state.json'});await chmod('.local/figma-finance-browser-state.json',0o600);capturing=true;
 const matrix=[['income-agreements','/finance','2004:2640'],['income-overview','/finance/agreement?agreementId='+state.records.appAvailableAgreement.id,'2004:2640'],['settlement-detail','/finance/record?recordId='+state.records.appAvailableSettlement.id,'2004:2726'],['settlement-awaiting-confirmation','/finance/record?recordId='+state.records.appSettlementConfirmSettlement.id,'2004:2726'],['payout-application','/finance/payout/new?agreementId='+state.records.appAvailableAgreement.id,'2004:2818'],['income-entries','/finance/entries?agreementId='+state.records.appAvailableAgreement.id,'2004:2539']];
 for(const captureWidth of widths){
 width=captureWidth;await page.setViewportSize({width,height:844});
 for(const [name,route,id]of matrix.filter(x=>width===390||['settlement-detail','settlement-awaiting-confirmation','payout-application'].includes(x[0]))){
  await page.goto(base+'/#'+route);await semantics();await page.mouse.move(195,350);await page.mouse.wheel(0,-20000);await page.waitForTimeout(200);
  const text=await page.locator('body').ariaSnapshot();assert(!text.includes(state.controlToken)&&!text.includes('需要重新登录'));let prior,n=0,bottom=false;
  for(let i=0;i<24;i++){
   await page.mouse.move(0,0);await page.waitForTimeout(180);const bytes=await page.screenshot(),hash=sha(bytes);
   if(hash===prior){if(++n>=2){bottom=true;break;}}else{n=0;const file=(widths.length>1?width+'-':'')+name+'-'+i+'.png';await writeFile(join(out,file),bytes);screenshots.push({file,case:name,width,figmaIds:[id],sourceBundleSha256:bundle,sha256:hash});}
   prior=hash;await page.mouse.move(195,400);await page.mouse.wheel(0,600);await page.waitForTimeout(180);
  }
  assert(bottom,'Scroll bottom not reached');results.push({name,width,route,figmaId:id,text,network:network.slice()});console.log(name+' CAPTURED');
 }
 }
 assert.equal(writes.length,0);assert.equal(errors.length,0);assert(network.some(n=>n.path==='/api/v1/finance/records/'+state.records.appAvailableSettlement.id&&n.status===200));
}catch(e){errors.push(e.stack);process.exitCode=1;}
finally{await browser.close();await writeFile(join(out,'FINANCE_RESULTS.json'),JSON.stringify({result:errors.length?'FAIL':'CAPTURED_PENDING_VISUAL_REVIEW',synthetic_only:true,normal_entrypoint:true,login:'真实隔离短信HTTP登录；同一会话顺序切换宽度，截图阶段无业务写入',sourceBundleSha256:bundle,results,screenshots,network,business_writes:writes,errors},null,2)+'\n');console.log(JSON.stringify({pages:results.length,shots:screenshots.length,errors:errors.length,writes:writes.length}));}
