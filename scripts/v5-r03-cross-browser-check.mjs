#!/usr/bin/env node
// Explicit synthetic loopback acceptance; production entry never imports fixture code.
import assert from 'node:assert/strict'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { resolve,join } from 'node:path'
const root=process.cwd(),f=JSON.parse(await readFile(process.env.ARTISTS_ACCESS_FILE,'utf8'))
assert(f.synthetic_only && new URL(f.base_url).hostname==='127.0.0.1')
const web=process.env.ARTISTS_WEB_URL||'http://127.0.0.1:5173',app=process.env.ARTISTS_APP_URL||'http://127.0.0.1:5500'
assert.equal(web,'http://127.0.0.1:5173');assert.equal(app,'http://127.0.0.1:5500')
const scope=process.env.ARTISTS_SCOPE||'web';assert(['web','app'].includes(scope))
const out=resolve(process.env.ARTISTS_EVIDENCE_DIR||'output/playwright/v5-r03');await mkdir(out,{recursive:true})
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const results=[],shots=[],errors=[],contexts=[]
let quoteId,orderId,serviceId,failure
async function check(label,fn){await fn();results.push({label,result:'PASS'})}
async function shot(page,name){await page.waitForLoadState('networkidle');await page.waitForTimeout(200);await page.mouse.move(0,0);const accessible=await page.locator('body').ariaSnapshot();for(const a of Object.values(f.accounts))assert(!accessible.includes(a.bearer_token));await page.screenshot({path:join(out,name+'.png'),fullPage:!page.url().startsWith(app)});shots.push({name,file:name+'.png',viewport:page.viewportSize()})}
async function webPage(role,path,width=1440){const a=f.accounts[role],c=await browser.newContext({viewport:{width,height:width<600?844:1000},locale:'zh-CN'});contexts.push(c);await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:a.bearer_token,party:role==='merchant'?f.merchant_party_id:role==='agency'?f.agency_party_id:a.party_id});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(web+path);await p.locator('h1').waitFor();await p.evaluate(()=>document.fonts.load('700 30px EditorialSerif'));return p}
async function press(page,target){for(let n=0;n<50;n++){const b=await target.count()?await target.boundingBox():null;if(b&&b.y>48&&b.y+b.height/2<840){await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(150);return}await page.mouse.move(190,430);await page.mouse.wheel(0,b?.y<55?-250:250);await page.waitForTimeout(100)}throw Error('App control outside viewport')}
try{
 if(scope==='web'){
  if(process.env.ARTISTS_PREFLIGHT_RESULTS){const prior=JSON.parse(await readFile(process.env.ARTISTS_PREFLIGHT_RESULTS,'utf8'));assert.equal(prior.result,'PASS');serviceId=prior.results.find(r=>r.service_id)?.service_id}
  else {const response=await fetch(f.base_url+'/artists/people/'+f.person_id+'/services',{method:'POST',headers:{Authorization:'Bearer '+f.accounts.artist.bearer_token,'X-Acting-Party':f.accounts.artist.party_id,'Idempotency-Key':randomUUID(),'Content-Type':'application/json'},body:JSON.stringify({avatar_id:f.avatar_id,spec_id:f.specs.AVATAR_CREATION,renewal_reminder:false})});assert(response.ok,'Fresh synthetic fixture must allow one creation request');serviceId=(await response.json()).data.id}
  assert(serviceId)
  const p=await webPage('merchant','/trade/quotes/new?artistService='+serviceId),writes=[],privateSourceReads=[]
  p.on('request',r=>{if(r.method()==='GET'&&r.url().includes('/artists/people/'))privateSourceReads.push(new URL(r.url()).pathname)})
  await check('实际平台商户按本人提供请求和已审商品填写一次服务报价，无私人SERVICE读取',async()=>{
   await p.getByTestId('trade-artist-request').waitFor();await p.getByTestId('trade-quote-buyer').fill(f.accounts.artist.party_id);await p.getByTestId('trade-quote-rule').fill(f.rule_id);await p.getByTestId('trade-quote-spec-0').selectOption(f.specs.AVATAR_CREATION);await p.getByTestId('trade-quote-channel').selectOption('ALIPAY');await p.getByTestId('trade-quote-expires').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await p.getByTestId('trade-quote-window').fill('30');assert.equal(await p.getByTestId('trade-quote-quantity-0').inputValue(),'1');assert.equal(await p.getByTestId('trade-quote-allocation-amount-0-0').inputValue(),'60.00');assert(await p.getByTestId('trade-quote-submit').isEnabled());assert.equal(privateSourceReads.length,0);await shot(p,'web-service-quote-form-1440')
  })
  let posted
  await p.route('**/api/v1/trade/quotes',async route=>{if(route.request().method()!=='POST')return route.continue();const r=route.request();writes.push({key:r.headers()['idempotency-key'],body:r.postData()});if(writes.length===1){const response=await route.fetch();assert(response.ok());posted=(await response.json()).data;await route.abort('failed')}else await route.continue()})
  await check('报价已落库丢回复后保留原键与原内容，先读取再重试而不另建',async()=>{
   await p.getByTestId('trade-quote-submit').click();await p.getByRole('button',{name:'先核对原记录',exact:true}).waitFor();await p.getByRole('button',{name:'先核对原记录',exact:true}).click();const retry=p.getByRole('button',{name:'使用原编号重试',exact:true});await retry.waitFor();await retry.click();await p.waitForURL(u=>/^\/trade\/quotes\/[a-f0-9-]+$/.test(u.pathname));quoteId=new URL(p.url()).pathname.split('/').at(-1);assert.equal(quoteId,posted.id);assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.equal(writes[0].body,writes[1].body);const body=JSON.parse(writes[0].body);assert.deepEqual(body.artist_service_source,{service_id:serviceId});assert.equal(posted.data.artist_service.service_id,serviceId);assert.equal(posted.data.total_minor,6000);await p.getByTestId('trade-artist-service-source').waitFor();await shot(p,'web-service-quote-saved-1440')
  })
  await check('独立账号按当前版本审核同一报价，当前手机宽度保留源信息和金额',async()=>{
   const r=await webPage('reviewer','/trade/reviews/quotes/'+quoteId);await r.getByTestId('trade-artist-service-source').waitFor();await r.getByTestId('trade-review-decision').selectOption('APPROVED');await r.getByTestId('trade-review-reason').fill('合成联调：已核对服务请求、商品、金额、一次付款和原约定。');await r.getByTestId('trade-review-submit').click();await r.getByText('报价已审，等待买方确认',{exact:true}).waitFor();await shot(r,'web-service-quote-review-1440');await r.setViewportSize({width:390,height:844});assert(await r.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(r,'web-service-quote-review-390')
  })
  await writeFile(join(out,'WEB_CROSS_RESULTS.json'),JSON.stringify({result:'PASS',synthetic_only:true,service_id:serviceId,quote_id:quoteId,results,shots,page_errors:errors},null,2)+'\n')
 }else{
  const previous=JSON.parse(await readFile(join(out,'WEB_CROSS_RESULTS.json'),'utf8'));assert.equal(previous.result,'PASS');quoteId=previous.quote_id;serviceId=previous.service_id
  const c=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));const quoteRead=p.waitForResponse(r=>r.url().endsWith('/trade/records/'+quoteId));await p.goto(app+'/#/trade/record?recordId='+quoteId);await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click())
  await check('App本人读取同一报价，核对具体真人数字人、服务和冻结费用',async()=>{
   await p.getByRole('group',{name:/^对应的真人与服务/}).waitFor();const q=(await (await quoteRead).json()).data;assert.equal(q.data.artist_service.person_id,f.person_id);assert.equal(q.data.artist_service.avatar_id,f.avatar_id);assert.equal(q.data.artist_service.service_id,serviceId);await shot(p,'app-service-quote-390')
  })
  await check('App按原报价指纹和版本确认，形成同一服务未付款未签署订单',async()=>{
   await press(p,p.getByRole('button',{name:'确认报价形成订单',exact:true}));await p.getByRole('button',{name:'确认办理',exact:true}).waitFor();await shot(p,'app-service-confirm-390');const response=p.waitForResponse(r=>r.url().endsWith('/trade/quotes/'+quoteId+'/acceptance')&&r.request().method()==='POST');await press(p,p.getByRole('button',{name:'确认办理',exact:true}));const res=await response;assert(res.ok());const o=(await res.json()).data;orderId=o.id;assert.equal(o.current_status,'OPEN');assert.equal(o.data.financial.received_minor,0);assert.equal(o.data.contract.signing_method,'NOT_SIGNED');assert.equal(o.data.quote.artist_service.service_id,serviceId);await p.getByRole('heading',{name:'订单详情',exact:true}).waitFor();await shot(p,'app-service-unpaid-order-390')
  })
  await check('网页读取同一订单，仍为原服务原金额而无付款或模型成功',async()=>{const w=await webPage('merchant','/trade/orders/'+orderId);await w.getByTestId('trade-artist-service-source').waitFor();await w.getByText('待付款',{exact:true}).waitFor();await shot(w,'web-service-unpaid-order-1440');await w.setViewportSize({width:390,height:844});assert(await w.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(w,'web-service-unpaid-order-390')})
 }
 assert.equal(errors.length,0)
}catch(e){failure=e.message;process.exitCode=1;console.error(e.stack)}finally{await writeFile(join(out,scope.toUpperCase()+'_RESULTS.json'),JSON.stringify({result:failure?'FAIL':'PASS',synthetic_only:true,scope,service_id:serviceId,quote_id:quoteId,order_id:orderId,results,shots,page_errors:errors,failure},null,2)+'\n');for(const c of contexts)await c.close();await browser.close()}
