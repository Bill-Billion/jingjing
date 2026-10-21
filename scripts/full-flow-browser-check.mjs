import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const state=JSON.parse(await readFile(resolve(root,'.local/pr20-ui-runtime.json'),'utf8'));
assert(state.testOnly && state.syntheticOnly && state.scenarios.fullFlow);
const web='http://127.0.0.1:5211',app='http://127.0.0.1:8780';
for(const u of [web,app,state.apiUrl,state.controlUrl])assert.equal(new URL(u).hostname,'127.0.0.1');
const out=resolve(root,'docs/testing/evidence/20261005');await mkdir(out,{recursive:true});
const results=[],errors=[],requests=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
let active;
const record=(name,details={})=>{results.push({name,status:'PASS',...details});console.log('PASS '+name);};
const control=async path=>{const r=await fetch(state.controlUrl+path,{headers:{Authorization:'Bearer '+state.controlToken}});assert.equal(r.status,200);return r.json();};
async function pageFor(viewport){const c=await browser.newContext({viewport,locale:'zh-CN',timezoneId:'Asia/Shanghai'});const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))requests.push({method:r.request().method(),path:u.pathname,status:r.status()});});return p;}
const response=(p,method,path)=>{const r=p.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname==='/api/v1'+path);r.catch(()=>{});return r;};
let failure;
try {
  const p=active=await pageFor({width:1440,height:1000}),buyer=state.accounts.payer;
  await p.goto(web+'/login');await p.getByTestId('phone-input').fill(buyer.phone);
  const sms=response(p,'POST','/auth/sms-challenges');await p.getByTestId('send-code').click();assert.equal((await sms).status(),200);
  await p.getByTestId('code-input').fill((await control('/code?phone='+buyer.phone)).code);
  await p.getByTestId('submit-login').click();await p.waitForURL(u=>u.pathname==='/workspace');
  await p.locator(`[data-party="${buyer.actingPartyId}"]`).click();
  record('工作台通过模拟验证码正常登录并选择机构身份');
  for(const [i,j] of state.scenarios.fullFlow.journeys.entries()) {
    const path=j.productionId?'/production/projects/'+j.productionId:j.orderId?'/trade/orders/'+j.orderId:'/trade/quotes/'+j.quoteId;
    const api=j.productionId?'/production/records/'+j.productionId:'/trade/records/'+(j.orderId||j.quoteId);
    const r=response(p,'GET',api);await p.goto(web+path);const reply=await r;assert.equal(reply.status(),200);
    const business=(await reply.json()).data;assert.equal(business.id,j.productionId||j.orderId||j.quoteId);
    await p.getByRole('heading',{level:1}).waitFor();await p.locator('.workspace-nav').waitFor();
    await p.getByText(/^正在读取身份与(?:交易|制作)记录…$/).waitFor({state:'hidden'});
    await p.locator('.supply-card').first().waitFor();
    await p.getByText(business.id,{exact:true}).first().waitFor({state:'attached'});
    await p.screenshot({path:resolve(out,`web-checkpoint-${i+1}.png`),fullPage:true});
    record('业务记录实际显示：'+j.name,{path,recordId:business.id,status:business.current_status,steps:j.steps});
  }
  const quote=state.scenarios.fullFlow.journeys.find(j=>j.stop==='quote');
  await p.goto(web+'/trade/quotes/'+quote.quoteId);await p.getByLabel('我已核对本报价的服务、分期、期限和条款。').check();
  let r=response(p,'POST',`/trade/quotes/${quote.quoteId}/acceptance`);await p.getByRole('button',{name:'确认报价并建立订单',exact:true}).click();
  assert.equal((await r).status(),200);record('通过页面确认准确报价并创建订单');
  const sample=state.scenarios.fullFlow.journeys.find(j=>j.stop==='sample');
  await p.goto(web+'/production/versions/'+sample.versionId);await p.getByTestId('production-read-preview').click();
  await p.getByTestId('production-feedback-decision').selectOption('REQUEST_CHANGES');
  await p.getByTestId('production-feedback-note').fill('模拟客户浏览器反馈：片头请放慢。');
  r=response(p,'POST',`/production/versions/${sample.versionId}/feedback`);await p.getByTestId('production-feedback-submit').click();
  assert.equal((await r).status(),200);record('通过页面读取私有样片并提交修改意见');
  await p.screenshot({path:resolve(out,'web-feedback.png'),fullPage:true});

  const a=active=await pageFor({width:390,height:844});
  await a.goto(app+'/#/messages');const semantics=a.locator('flt-semantics-placeholder');await semantics.waitFor({state:'attached'});await semantics.evaluate(e=>e.click());
  async function press(locator){for(let n=0;n<45;n++){const b=await locator.count()?await locator.boundingBox({timeout:300}).catch(()=>null):null;if(b&&b.y+b.height/2>=10&&b.y+b.height/2<=810){await locator.click();return;}await a.mouse.move(180,500);await a.mouse.wheel(0,b&&b.y<10?-300:300);await a.waitForTimeout(150);}throw Error('App control unavailable: '+locator);}
  const button=name=>a.getByRole('button',{name,exact:true});
  const label=value=>a.getByText(value,{exact:false}).or(a.getByLabel(value,{exact:false}));
  await press(button('前往账号与身份'));await a.getByRole('textbox',{name:/手机号/}).fill(buyer.phone);
  r=response(a,'POST','/auth/sms-challenges');await press(button('获取验证码'));assert.equal((await r).status(),200);
  await a.getByRole('textbox',{name:/验证码/}).fill((await control('/code?phone='+buyer.phone)).code);
  await press(button('同意用户协议与隐私政策'));
  r=response(a,'POST','/auth/sessions');await press(button('登录 / 注册'));assert.equal((await r).status(),200);
  await button('刷新通知').waitFor();
  record('App通过模拟验证码正常登录并返回业务通知');
  await a.goto(app+'/#/account');await a.getByText('选择办事身份',{exact:true}).waitFor();
  const detailRequests=()=>requests.filter(r=>r.method==='GET'&&/^\/api\/v1\/parties\/[^/]+$/.test(r.path)).length;
  // Reproduce the old restricted gateway without modifying the real API or permissions.
  await a.route('**/api/v1/parties/*',route=>{
    if(/^\/api\/v1\/parties\/[^/]+$/.test(new URL(route.request().url()).pathname))return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'TEST_ACCESS_RESTRICTED',message:'仅模拟详情入口受限',retryable:false,details:[]}})});
    return route.continue();
  });
  await press(button('刷新'));
  await label(/部分身份暂时无法访问/).first().waitFor();await a.waitForTimeout(1500);
  const stable=detailRequests();await a.waitForTimeout(2000);assert.equal(detailRequests(),stable,'Identity requests must stop after denial');
  await a.screenshot({path:resolve(out,'app-identity-denied.png')});record('真实App网页在身份详情404后停止跳动和重复请求',{stableRequestCount:stable});
  await a.unroute('**/api/v1/parties/*');await press(button('刷新'));await a.getByText('选择办事身份',{exact:true}).waitFor();
  await a.waitForTimeout(300);assert.equal(await label(/部分身份暂时无法访问/).count(),0);
  await a.screenshot({path:resolve(out,'app-identity-restored.png')});record('恢复接口后手动刷新重新取得身份');
  await press(button('退出登录'));await press(button('确认'));await label('已退出登录。').first().waitFor();record('App正常退出且清除登录态');
  assert.equal(errors.length,0,JSON.stringify(errors));
} catch(e) {failure=String(e.stack).replaceAll(state.controlToken,'[redacted]');console.error(failure);process.exitCode=1;if(active)await active.screenshot({path:resolve(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally {await writeFile(resolve(out,'browser-results.json'),JSON.stringify({syntheticOnly:true,nativeAndroidRetest:false,results,errors,requests,complete:!failure,failure},null,2)+'\n');await browser.close();}
