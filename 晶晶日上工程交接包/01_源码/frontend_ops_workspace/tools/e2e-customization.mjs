#!/usr/bin/env node
// Real isolated R01 HTTP/MySQL + browser verification; fixture sessions are read locally.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright-core'

assert(process.env.CUSTOMIZATION_ACCESS_FILE,'Set CUSTOMIZATION_ACCESS_FILE to the local sandbox access.json')
const fixture = JSON.parse(await readFile(process.env.CUSTOMIZATION_ACCESS_FILE,'utf8'))
assert.equal(fixture.synthetic_only,true)
assert.equal(new URL(fixture.base_url).hostname,'127.0.0.1')
const web = process.env.CUSTOMIZATION_WEB_URL || 'http://127.0.0.1:5173'
assert.equal(new URL(web).hostname,'127.0.0.1')
const requestId = process.env.CUSTOMIZATION_REQUEST_ID || fixture.requests.submitted
assert(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId))
const output = resolve(process.env.CUSTOMIZATION_EVIDENCE_DIR || 'output/playwright/customization')
await mkdir(output,{recursive:true})
const checks=[], errors=[], requests=[]
const check = (name,value=true) => { assert(value,name);checks.push(name);console.log('✓ '+name) }
async function api(account,path) {
  const r=await fetch(fixture.base_url+path,{headers:{Authorization:`Bearer ${account.bearer_token}`},cache:'no-store'})
  assert(r.ok,`Real sandbox GET ${path}: ${r.status}`)
  return (await r.json()).data
}
const original = await api(fixture.accounts.operator,`/customization-requests/${requestId}`)
assert(original.submission && ['SUBMITTED','INTAKE'].includes(original.current_status))
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'})
await context.addInitScript(account=>{
  if (!sessionStorage.getItem('ops.session.token')) {
    sessionStorage.setItem('ops.session.token',account.bearer_token)
    sessionStorage.setItem('ops.session.selected',account.party_id)
  }
},fixture.accounts.operator)
const page=await context.newPage()
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{
  if(r.url().includes('/api/v1/') && r.url().includes('customization')) {
    const h=r.headers()
    requests.push({method:r.method(),path:new URL(r.url()).pathname,bearerPresent:!!h.authorization,actingPartyPresent:!!h['x-acting-party'],ifMatch:h['if-match']||null,keyPresent:!!h['idempotency-key']})
  }
})
async function screenshot(name,fullPage=true) {
  const body=await page.locator('body').innerText()
  for(const account of Object.values(fixture.accounts))assert(!body.includes(account.bearer_token),'No session credential in screenshot body')
  await page.screenshot({path:join(output,name+'.png'),fullPage})
}
const painted = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const readableInViewport = locator => locator.evaluate(el => {
  const r=el.getBoundingClientRect(),style=getComputedStyle(el)
  const visibleHeight=Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top))
  return style.display!=='none' && style.visibility!=='hidden' && r.width>0 && r.left>=0 && r.right<=innerWidth && visibleHeight>=Math.min(r.height,240)
})
let performed=false
try {
  await page.goto(web+'/operations/customization')
  await page.getByTestId('customization-status').waitFor()
  await page.waitForFunction(()=>!document.querySelector('[data-testid="customization-refresh"]')?.disabled)
  if(original.current_status==='INTAKE')await page.getByTestId('customization-status').selectOption('INTAKE')
  await page.getByTestId('customization-open-'+requestId).waitFor()
  check('真实运营收件列表找到指定提交')
  check('运营列表没有故事正文',await page.getByTestId('customization-submission').count()===0)
  await screenshot('web-intake-list-desktop')
  await page.getByTestId('customization-open-'+requestId).click()
  await page.getByTestId('customization-submission').waitFor()
  const submittedText=await page.getByTestId('customization-submission').innerText()
  check('详情展示原提交模板标签及答案',original.submission.template_snapshot.fields.every(f=>submittedText.includes(f.label)) && Object.values(original.submission.answers).filter(Boolean).every(a=>submittedText.includes(a)))
  if(original.current_status==='SUBMITTED') {
    await page.getByTestId('customization-intake').click()
    await page.waitForFunction(()=>document.querySelector('[data-testid="customization-current-status"]')?.textContent?.includes('受理中'))
    performed=true
  }
  const current=await api(fixture.accounts.operator,`/customization-requests/${requestId}`)
  check('真实后台状态为受理中',current.current_status==='INTAKE')
  check('真实受理人员和时间显示',await page.getByTestId('customization-intake-by').textContent().then(t=>t.includes(current.intake_by)) && await page.getByTestId('customization-intake-at').textContent().then(t=>t.includes(current.intake_at)))
  check('受理保留同一提交内容和模板',JSON.stringify(current.submission)===JSON.stringify(original.submission))
  await screenshot('web-intake-detail-desktop')
  await page.setViewportSize({width:390,height:844})
  await page.evaluate(()=>{window.scrollTo(0,0);return document.fonts.ready})
  await painted()
  const menu=page.getByTestId('customization-menu-toggle')
  check('390窄屏默认收起完整菜单，故事标题进入首屏',await menu.getAttribute('aria-expanded')==='false' && await readableInViewport(page.locator('.supply-main h1')))
  await menu.click()
  const links=page.locator('#customization-workspace-menu .workspace-nav a')
  check('390窄屏可展开全部41项工作区入口',await menu.getAttribute('aria-expanded')==='true' && await links.count()===41 && await links.evaluateAll(rows=>rows.every(r=>getComputedStyle(r).display!=='none' && r.getClientRects().length>0 && r.getAttribute('href')) && new Set(rows.map(r=>r.getAttribute('href'))).size===41))
  await screenshot('web-intake-menu-390',false)
  await menu.press('Enter')
  await painted()
  const firstAnswer=Object.values(current.submission.answers).find(Boolean)
  assert(firstAnswer,'This browser scenario needs one actual submitted text answer')
  const story=page.getByTestId('customization-submission').locator('dd.long-text').filter({hasText:firstAnswer}).first()
  await story.scrollIntoViewIfNeeded()
  await painted()
  check('390窄屏实际读到提交正文且正文进入视口',await story.textContent().then(t=>t.includes(firstAnswer)) && await readableInViewport(story))
  await screenshot('web-intake-detail-390',false)
  const intake=page.getByTestId('customization-intake-actions')
  await intake.scrollIntoViewIfNeeded()
  await painted()
  check('390窄屏实际读到受理人员与时间',await readableInViewport(page.getByTestId('customization-intake-by')) && await readableInViewport(page.getByTestId('customization-intake-at')) && await intake.textContent().then(t=>t.includes(current.intake_by)&&t.includes(current.intake_at)))
  await screenshot('web-intake-record-390',false)
  check('390窄屏页头和菜单只有一份',await page.locator('.supply-header').count()===1 && await page.locator('.workspace-nav').count()===1)
  check('390窄屏没有页面横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
  await page.setViewportSize({width:1440,height:1000})
  await painted()
  // Replace the fixture session in the existing app, then use real /me and detail reads.
  await page.evaluate(async account=>{
    const session=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session')
    session.token=account.bearer_token;session.account=null;session.revision++
    sessionStorage.setItem('ops.session.token',account.bearer_token)
    await session.loadAccount()
  },fixture.accounts.outsider)
  await page.getByTestId('customization-error').waitFor()
  check('换成无权会话后真实接口拒绝详情且旧正文清空',await page.getByTestId('customization-submission').count()===0 && await page.getByTestId('customization-intake-actions').count()===0 && await page.getByTestId('customization-error').textContent().then(t=>t.includes('CUSTOMIZATION_NOT_FOUND')||t.includes('CUSTOMIZATION_FORBIDDEN')))
  await screenshot('web-intake-forbidden-cleared')
  check('运营故事请求没有携带主体头',requests.length>0 && requests.every(r=>r.bearerPresent&&!r.actingPartyPresent))
  if(performed)check('受理写入携带版本和幂等键',requests.some(r=>r.method==='POST'&&r.path.endsWith('/intake')&&r.ifMatch===`"${original.object_version}"`&&r.keyPresent))
  check('浏览器无未处理页面异常',errors.length===0)
  const result={synthetic_only:true,real_backend:true,request_id:requestId,intake_performed:performed,checks,passed:checks.length,page_errors:errors,viewports:[1440,390],narrow_capture:'viewport_after_scroll_and_paint',screenshots:['web-intake-list-desktop.png','web-intake-detail-desktop.png','web-intake-menu-390.png','web-intake-detail-390.png','web-intake-record-390.png','web-intake-forbidden-cleared.png']}
  await writeFile(join(output,'WEB_RESULTS.json'),JSON.stringify(result,null,2)+'\n')
  console.log(`${checks.length} real customization browser checks passed. Intake ${performed?'performed':'already present'}; results: ${join(output,'WEB_RESULTS.json')}`)
} finally { await context.close();await browser.close() }
