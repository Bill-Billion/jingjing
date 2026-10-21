#!/usr/bin/env node
// Read-only page captures after the real R01/R02 cross-flow has passed.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
const root = process.cwd()
const fixture = JSON.parse(await readFile(process.env.CUSTOMIZATION_ACCESS_FILE, 'utf8'))
assert(fixture.synthetic_only && new URL(fixture.base_url).hostname === '127.0.0.1')
const cross = JSON.parse(await readFile(process.env.CUSTOMIZATION_CROSS_RESULTS, 'utf8'))
assert.equal(cross.result, 'PASS')
const app = process.env.CUSTOMIZATION_APP_URL || 'http://127.0.0.1:5500'
assert(['http://127.0.0.1:5000','http://127.0.0.1:5500'].includes(app))
const web = 'http://127.0.0.1:5173'
const output = resolve(process.env.CUSTOMIZATION_EVIDENCE_DIR || 'output/playwright/v5-editorial/pages')
await mkdir(output,{recursive:true})
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const bundle=join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/editorial-app-build/main.dart.js')
const bundleHash=async()=>createHash('sha256').update(await readFile(bundle)).digest('hex')
const app_bundle_sha256=await bundleHash()
const results=[],errors=[],writes=[]
const scope=process.env.CUSTOMIZATION_CAPTURE_SCOPE || 'all'
assert(['all','app','shell','web','followups'].includes(scope))
function observe(page) {
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{if(r.url().startsWith(fixture.base_url) && !['GET','OPTIONS','HEAD'].includes(r.method())) writes.push({method:r.method(),path:new URL(r.url()).pathname})})
}
async function shot(page,name,reference) {
 await page.waitForLoadState('networkidle')
 await page.waitForTimeout(650)
 if (page.url().startsWith(app) && !name.includes('history-detail')) { await page.mouse.move(190,300); await page.mouse.wheel(0,-30000); await page.waitForTimeout(250) }
 if (page.url().startsWith(web) && !name.includes('content') && !name.includes('result')) await page.evaluate(()=>window.scrollTo(0,0))
 await page.mouse.move(0,0); await page.waitForTimeout(250)
 const accessible=await page.locator('body').ariaSnapshot()
 assert(!accessible.includes('页面暂时无法显示') && !accessible.includes('本机合成联调服务暂不可用'),name+' renders')
 for(const account of Object.values(fixture.accounts)) assert(!accessible.includes(account.bearer_token))
 await page.screenshot({path:join(output,name+'.png'),fullPage:name.startsWith('web-quote-form-') && !name.includes('content')})
 results.push({name,file:name+'.png',reference,viewport:page.viewportSize(),visible_text_characters:accessible.length})
}
async function appPage(route,width=390) {
 const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN'})
 const page=await context.newPage();observe(page)
 await page.goto(app+'/#'+route)
 await page.locator('flt-semantics-placeholder').waitFor({state:'attached'})
 await page.locator('flt-semantics-placeholder').evaluate(e=>e.click())
 await page.getByRole('button').first().waitFor()
 return {context,page}
}
async function press(page,locator) {
 for(let n=0;n<45;n++) {
  const b=await locator.count()?await locator.boundingBox():null
  if(b && b.y>55 && b.y+b.height<825) { await page.mouse.click(b.x+b.width/2,b.y+b.height/2); await page.waitForTimeout(200);return }
  await page.mouse.move(190,430);await page.mouse.wheel(0,b?.y<55?-240:240);await page.waitForTimeout(100)
 }
 throw Error('Control outside viewport')
}
async function webPage(role,route,width) {
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},locale:'zh-CN'})
 const account=fixture.accounts[role]
 await context.addInitScript(({account,party})=>{sessionStorage.setItem('ops.session.token',account.bearer_token);sessionStorage.setItem('ops.session.selected',party)}, {account,party:role==='merchant'?fixture.trade.merchant_party_id:account.party_id})
 const page=await context.newPage();observe(page)
 await page.goto(web+route);await page.locator('h1').waitFor()
 await page.evaluate(()=>document.fonts.load('700 30px EditorialSerif'))
 assert(await page.locator('.editorial-workspace').count(),route+' uses editorial theme')
 assert(await page.evaluate(()=>document.fonts.check('700 30px EditorialSerif')),'Bundled serif font loaded')
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' fits viewport')
 return {context,page}
}
let failure=null
try {
 const routes=[
 ['square','/square','20-five-main-tabs.png'],
 ['audition','/audition','20-five-main-tabs.png'],
 ['notices','/notices','20-five-main-tabs.png'],
 ['messages','/messages','20-five-main-tabs.png'],
 ['my','/my','20-five-main-tabs.png'],
 ['story-list','/customization','37-custom-top.png'],
 ['story-new','/customization/new','37-custom-top.png'],
 ['story-draft','/customization/'+fixture.requests.draft,'37-custom-top.png'],
 ['story-submitted','/customization/'+fixture.requests.submitted,'37-custom-top.png'],
 ['story-supplement','/customization/'+fixture.requests.supplement,'37-custom-top.png'],
 ['story-intake','/customization/'+cross.request_id,'37-custom-top.png'],
 ['quote-detail','/trade/record?recordId='+cross.quote_id,'34-orders-top.png'],
 ['orders','/orders','34-orders-top.png'],
 ['unpaid-order','/trade/record?recordId='+cross.order_id,'34-orders-top.png'],
 ]
 for(const [name,route,ref] of routes) {
  if(scope==='web' || scope==='shell' && !['square','audition','notices','messages','my'].includes(name) || scope==='followups' && !['story-intake','quote-detail'].includes(name)) continue
  const {context,page}=await appPage(route)
  await shot(page,'app-'+name+'-390',ref)
  if(name==='story-intake') {
   await press(page,page.getByRole('button',{name:'查看正式提交历史',exact:true}))
   await shot(page,'app-story-history-390','37-custom-top.png')
   await press(page,page.getByRole('button',{name:/^第 2 次正式提交/}))
   await shot(page,'app-story-history-detail-390','37-custom-top.png')
   await page.getByRole('button',{name:'Back',exact:true}).click()
   await press(page,page.getByRole('button',{name:'查看这份需求的报价与订单',exact:true}))
   await shot(page,'app-story-quotes-390','34-orders-top.png')
  }
  await context.close()
 }
 for(const width of ['all','app'].includes(scope)?[375,768]:[]) {
  const {context,page}=await appPage('/customization/'+fixture.requests.draft,width)
  await shot(page,'app-story-draft-'+width,'37-custom-top.png');await context.close()
 }
 const pages=[
 ['story-inbox','operator','/operations/customization','37-custom-top.png'],
 ['story-intake','operator','/operations/customization/'+cross.request_id,'37-custom-top.png'],
 ['quote-form','merchant','/trade/quotes/new?customizationRequest='+cross.request_id,'34-orders-top.png'],
 ['quote-review','reviewer','/trade/reviews/quotes/'+cross.quote_id,'34-orders-top.png'],
 ['order','merchant','/trade/orders/'+cross.order_id,'34-orders-top.png'],
 ['finance-preview','reviewer','/finance/marketplace-preview','33-wallet-extra.png'],
 ]
 for(const [name,role,route,ref] of pages) for(const width of ['all','web'].includes(scope)?[1440,390]:[]) {
  const {context,page}=await webPage(role,route,width)
  if(name==='quote-form') {
   await page.getByTestId('trade-quote-rule').fill(fixture.trade.rule_id)
   await page.getByTestId('trade-quote-line-0').fill('production')
   await page.getByTestId('trade-quote-spec-0').selectOption(fixture.trade.specification_id)
   await page.getByTestId('trade-quote-quantity-0').fill('1')
   for(let n=0;n<3;n++) {
    await page.getByTestId('trade-quote-installment-key-'+n).fill(['first','interim','last'][n])
    await page.getByTestId('trade-quote-allocation-line-'+n+'-0').selectOption('production')
    await page.getByTestId('trade-quote-allocation-amount-'+n+'-0').fill(['30.00','60.00','10.01'][n])
   }
  }
  if(name==='finance-preview') {
   await page.getByTestId('finance-preview-rule').fill(fixture.finance_preview.rule_id)
   await page.getByTestId('finance-preview-supplier').fill(fixture.finance_preview.supplier_party_id)
   await page.getByTestId('finance-preview-net').fill(String(fixture.finance_preview.net_minor))
   await page.getByTestId('finance-preview-submit').click()
   await page.getByTestId('finance-preview-result').waitFor()
  }
  await shot(page,'web-'+name+'-'+width,ref)
  if(['quote-form','quote-review','order'].includes(name) && width===390) {
   await page.locator('main').evaluate(e=>e.scrollIntoView())
   await page.mouse.move(190,400); await page.mouse.wheel(0,500)
   await shot(page,'web-'+name+'-content-390',ref)
  }
  if(name==='finance-preview') {
   await page.getByTestId('finance-preview-result').scrollIntoViewIfNeeded()
   await shot(page,'web-finance-result-'+width,ref)
  }
  const menu=page.locator('.workspace-nav a')
  assert.equal(await menu.count(),43,'All 43 workspace entrances remain')
  if(width===390) {
   await page.getByRole('button',{name:'工作区导航 展开'}).click()
   assert(await menu.first().isVisible(),'Collapsed menu opens')
   await page.getByRole('button',{name:'工作区导航 收起'}).click()
  }
  await context.close()
 }
 assert.equal(await bundleHash(),app_bundle_sha256,'App bundle stayed unchanged during capture')
 assert.equal(errors.length,0,'No unhandled page errors')
 assert.equal(writes.length,0,'Visual capture does not write business records')
} catch(e) {failure=e.message;process.exitCode=1;console.error(e.stack)}
finally {
 await writeFile(join(output,'VISUAL_CAPTURE.json'),JSON.stringify({result:failure?'FAIL':'PASS',synthetic_only:true,readonly:true,scope,app_bundle_sha256,pages:results.length,results,page_errors:errors,business_writes:writes,failure},null,2)+'\n')
 await browser.close()
}
