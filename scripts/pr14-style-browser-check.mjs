#!/usr/bin/env node
/** Read-only visual captures of real PR11–14 frontends; isolated synthetic auth only. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR14_UI_STATE_FILE || '.local/pr14-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const surface = process.argv.includes('--app') ? 'app' : 'web'
const base = process.env.BASE_URL || (surface === 'app' ? process.env.STYLE_APP_URL || 'http://127.0.0.1:8771' : process.env.STYLE_WEB_URL || 'http://127.0.0.1:5202')
for (const url of [state.apiUrl, state.controlUrl, base]) assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname))
const evidence = resolve(root, 'docs/ux/pr14-ui/evidence'), shots = resolve(evidence, 'screenshots')
const inventory = JSON.parse(await readFile(resolve(evidence, 'style-inventory.json'), 'utf8'))
const references = new Map(inventory.mappings.flatMap(m => m.references).map(r => [r.id, r]))
await mkdir(shots, { recursive: true })
const captures = [], results = [], errors = [], unexpectedWrites = [], actors = [], layoutIssues=[],partyNames=new Map(),observedRecords=new Map(),loadedBuildHashes=new WeakMap(),apiFailures=new Map()
const appBuildHash=surface==='app'?createHash('sha256').update(await readFile(resolve(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/web/main.dart.js'))).digest('hex'):null
if(process.argv.includes('--only-account')) {
  const prior=JSON.parse(await readFile(resolve(evidence,'style-app-runtime.json'),'utf8'))
  captures.push(...prior.captures.filter(c=>!c.name.startsWith('account-')))
  results.push(...prior.checks.filter(c=>c.label!=='account-regions'))
  errors.push(...prior.errors);layoutIssues.push(...(prior.layout_issues||[]));unexpectedWrites.push(...prior.unexpected_business_writes)
}
if(process.argv.includes('--only-grant-identifiers')||process.argv.includes('--only-licensing')||process.argv.includes('--only-contract')) {
  const prior=JSON.parse(await readFile(resolve(evidence,'style-web-runtime.json'),'utf8'))
  const licensingNames=['product-form','reading-form','catalog','product','reservation','evidence','grant','project-form','project-detail','binding','product-review','evidence-review','activation','grant-review','reading-review','grant-full-identifiers','controlled-reader']
  captures.push(...prior.captures.filter(c=>process.argv.includes('--only-contract')?!c.name.startsWith('contract'):process.argv.includes('--only-licensing')?!c.actual_url.includes('/licensing/')&&!(process.argv.includes('--refresh-mobile-shell')&&c.viewport.width!==1440&&/\/(supply|contracts)\//.test(c.actual_url)):c.name!=='grant-identifiers'))
  results.push(...prior.checks.filter(c=>process.argv.includes('--only-contract')?!['contract','contract-mobile-shell'].includes(c.label):process.argv.includes('--only-licensing')?!licensingNames.includes(c.label):c.label!=='grant-full-identifiers'))
  errors.push(...prior.errors);layoutIssues.push(...(prior.layout_issues||[]));unexpectedWrites.push(...prior.unexpected_business_writes)
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const clean = value => String(value).replaceAll(state.controlToken, '[REDACTED]').replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
async function check(label, task) {
  try { await task(); results.push({ label, result: 'PASS' }); console.log(`✓ ${label}`) }
  catch (cause) { results.push({ label, result: 'FAIL', error: clean(cause.message).slice(0, 1200) }); console.error(`${label}: ${clean(cause.message).slice(0,300)}`) }
}
async function newPage() {
  const context = await browser.newContext({ viewport: { width: surface === 'app' ? 390 : 1440, height: surface === 'app' ? 844 : 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage(); page.setDefaultTimeout(20000)
  page.on('pageerror', error => errors.push(clean(error.message)))
  page.on('response',async response=>{
    if(new URL(response.url()).origin===state.apiUrl&&response.status()>=400) {
      let code='HTTP_'+response.status();try{const data=await response.json();code=data.error?.code||code}catch{}
      const rows=apiFailures.get(page.url())||[];rows.push({path:new URL(response.url()).pathname,http_status:response.status(),code});apiFailures.set(page.url(),rows)
    }
    if(surface==='app'&&new URL(response.url()).pathname.endsWith('/main.dart.js')&&response.ok()) {
      try {const hash=createHash('sha256').update(await response.body()).digest('hex');loadedBuildHashes.set(page,hash);if(hash!==appBuildHash)errors.push('Actual loaded App bundle differs from frozen starting build')}catch{errors.push('Could not hash actual loaded App bundle')}
    }
    if(/\/api\/v1\/(?:licensing|supply)\/records\/[^/]+$/.test(new URL(response.url()).pathname)) {
      try {const data=(await response.json()).data;if(data?.id)observedRecords.set(data.id,{id:data.id,kind:data.kind,current_status:data.current_status,http_status:response.status()})}catch{}
    }
    if(new URL(response.url()).pathname==='/api/v1/me/parties'&&response.ok()) {
      try {const data=(await response.json()).data;for(const row of data.items||[])partyNames.set(row.party.id,row.party.display_name)}catch{}
    }
  })
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin === state.apiUrl && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/api/v1/auth/sms-challenges', '/api/v1/auth/sessions'].includes(url.pathname)) unexpectedWrites.push({ method: request.method(), path: url.pathname })
  })
  actors.push({ context, page }); return page
}
async function smsCode(phone) {
  const response = await fetch(state.controlUrl + '/code?phone=' + phone, { headers: { Authorization: `Bearer ${state.controlToken}` } })
  assert(response.ok); return (await response.json()).code
}
async function capture(page, name, galleryIds, { focus, noNavigation = false, stateNote = '' } = {}) {
  if (focus) await focus.scrollIntoViewIfNeeded()
  if(surface==='app') {await page.waitForLoadState('networkidle',{timeout:12000});assert.equal(loadedBuildHashes.get(page),appBuildHash,'Actual network-loaded App bundle matches frozen build')}
  await page.mouse.move(page.viewportSize().width-1,65)
  await page.waitForTimeout(350)
  const viewport = page.viewportSize(), file = `screenshots/style-${surface}-${name}-${viewport.width}.png`
  await page.screenshot({ path: resolve(evidence, file), fullPage: false })
  const raw = await readFile(resolve(evidence, file))
  assert.equal(raw.readUInt32BE(16), viewport.width); assert.equal(raw.readUInt32BE(20), viewport.height)
  const geometry = await page.evaluate(() => {
    const measure = selector => { const n = document.querySelector(selector); if (!n) return null; const s = getComputedStyle(n), r = n.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,font_size:s.fontSize,padding_left:s.paddingLeft,padding_right:s.paddingRight,background:s.backgroundColor,color:s.color,grid_columns:s.gridTemplateColumns,border_radius:s.borderRadius } }
    return { document_width: document.documentElement.scrollWidth, viewport_width: innerWidth,
      header:measure('.supply-header'),sidebar:measure('.supply-sidebar'),main:measure('main'),title:measure('h1'),first_card:measure('.supply-card'),grant_grid:measure('.license-overview-grid'),first_form_field:measure('.supply-field'),org_management:measure('.org-management'),members_card:measure('.members-card'),invite_card:measure('.invite-card'),
      navigation:[...document.querySelectorAll('nav[aria-label="工作区导航"]')].map(n=>({links:n.querySelectorAll('a').length,active:n.querySelectorAll('[aria-current=page]').length,width:n.getBoundingClientRect().width})),
      visible_headings:[...document.querySelectorAll('h1,h2,[role=heading]')].filter(n=>{const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(n=>n.textContent||n.getAttribute('aria-label')),
      visible_alerts:[...document.querySelectorAll('[role=alert]')].filter(n=>{const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(n=>n.textContent.trim()),
      visible_field_labels:[...document.querySelectorAll('input,textarea,[role=textbox],[role=combobox]')].filter(n=>{const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(n=>({role:n.getAttribute('role')||n.tagName.toLowerCase(),label:n.getAttribute('aria-label')||n.labels?.[0]?.textContent||'',readonly:n.hasAttribute('readonly')})),
      checks:[...document.querySelectorAll('input[type=checkbox]')].map(n=>({label:n.closest('label')?.textContent?.trim(),checked:n.checked,disabled:n.disabled})),
      visible_button_geometry:[...document.querySelectorAll('button,[role=button],.button-link')].map(n=>{const r=n.getBoundingClientRect();return{name:n.getAttribute('aria-label')||n.textContent,disabled:n.disabled===true||n.getAttribute('aria-disabled')==='true',width:r.width,height:r.height,x:r.x,y:r.y}}).filter(r=>r.y>=0&&r.y+r.height<=innerHeight)
    }
  })
  const matchedRecord=[...observedRecords.values()].find(r=>page.url().includes(r.id))
  const failures=apiFailures.get(page.url())||[]
  captures.push({ name, file, actual_url: page.url(), rendered_state:failures.length||geometry.visible_alerts.length?'ERROR_STATE':'CONTENT_OR_FORM',api_failures:failures,app_build_sha256:surface==='app'?loadedBuildHashes.get(page):null,observed_record:matchedRecord||null,state_note:stateNote, gallery_ids: galleryIds, gallery_references:galleryIds.map(id=>references.get(id)),viewport,geometry,png_sha256:createHash('sha256').update(raw).digest('hex') })
  if(failures.length)layoutIssues.push({name,width:viewport.width,issue:'Requested successful content has API error',failures})
  if (surface === 'web') {
    if(geometry.document_width>geometry.viewport_width) layoutIssues.push({name,width:viewport.width,issue:'Horizontal page overflow',document_width:geometry.document_width})
    if(!noNavigation&&geometry.navigation.length!==1) layoutIssues.push({name,width:viewport.width,issue:'Expected one workspace navigation',count:geometry.navigation.length})
  }
}
async function webLogin(name) {
  const person = state.accounts[name], page = await newPage()
  await page.goto(base + '/login')
  if (name === 'owner'&&!process.argv.includes('--only-licensing')&&!process.argv.includes('--only-contract')) {
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:width===1440?900:width===390?844:693})
      await capture(page,'login-empty',['WEB-01-01'],{noNavigation:true,stateNote:'Actual blank SMS login; no challenge requested or agreement prechecked.'})
    }
    await page.setViewportSize({width:1440,height:900})
  }
  await page.getByTestId('phone-input').fill(person.phone)
  await page.getByTestId('send-code').click()
  await page.getByTestId('code-input').waitFor()
  if (name==='owner'&&!process.argv.includes('--only-licensing')&&!process.argv.includes('--only-contract')) await capture(page,'login-code-empty',['WEB-01-01'],{noNavigation:true,stateNote:'Actual synthetic challenge sent; code input still blank. No OTP shown.'})
  await page.getByTestId('code-input').fill(await smsCode(person.phone))
  await page.getByTestId('submit-login').click()
  await page.waitForURL('**/workspace')
  await page.locator(`[data-party="${person.personalPartyId}"]`).click()
  return page
}
async function webWorkspace(page) {
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:width===1440?900:width===390?844:693})
    await page.goto(base+'/workspace')
    await page.locator(`[data-party="${state.accounts.owner.personalPartyId}"]`).click()
    await capture(page,'workspace-personal',['WEB-01-02','WEB-02-01'],{focus:width===1440?undefined:page.locator('main'),stateNote:'Consolidated account overview; no unsupported dashboard totals.'})
    await capture(page,'workspace-identities',['WEB-01-02'],{focus:page.locator('.identity-section')})
    await page.locator(`[data-party="${state.organizationId}"]`).click()
    await page.locator('.org-management').waitFor()
    await page.locator('.members-card [data-member]').first().waitFor()
    const capability=page.locator('.section').filter({has:page.getByRole('heading',{name:'业务能力',exact:true})})
    await capture(page,'workspace-org-capabilities',['WEB-03-01'],{focus:capability,stateNote:'Actual pending organization and actual capability statuses.'})
    const inviteButton=page.getByRole('button',{name:'发送邀请',exact:true})
    assert(await inviteButton.isDisabled(),'Blank invitation must be disabled')
    assert.equal(await page.locator('#invitee').inputValue(),'');assert.equal(await page.locator('#expiry').inputValue(),'')
    await capture(page,'workspace-members',['WEB-04-01'],{focus:page.locator('.members-card'),stateNote:'Real seeded organization members; same route, independently scrolled region.'})
    await capture(page,'workspace-invite-empty',['WEB-04-01'],{focus:page.locator('.invite-card'),stateNote:'Actual blank account/date fields and disabled send. No invitation created.'})
    await page.getByRole('button',{name:'收到的邀请',exact:true}).click()
    await page.getByRole('heading',{name:'收到的成员邀请',exact:true}).waitFor()
    const received=page.locator('.section').filter({has:page.getByRole('heading',{name:'收到的成员邀请',exact:true})})
    await capture(page,'workspace-received-invites',['WEB-04-02'],{focus:received,stateNote:'Actual received list, possibly empty; no synthetic invite manufactured for visual match.'})
    await page.getByRole('button',{name:'当前身份',exact:true}).click()
    await page.getByRole('button',{name:'＋ 创建机构',exact:true}).click()
    await capture(page,'workspace-create-org-empty',['WEB-01-02'],{focus:page.locator('.create-form'),stateNote:'Actual blank creation form; not submitted.'})
    await page.getByRole('button',{name:'收起创建',exact:true}).click()
    await page.locator(`[data-party="${state.accounts.owner.personalPartyId}"]`).click()
  }
}
async function webRoute(page, route, name, ids, widths = [1440, 390, 320]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : width === 390 ? 844 : 693 })
    await page.goto(base + route)
    await page.locator('nav[aria-label="工作区导航"]').waitFor()
    await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some(n => /正在读取当前身份与记录/.test(n.textContent)))
    const focus = width === 1440 ? undefined : page.locator('h1').first()
    await capture(page, name, ids, { focus })
    if(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+250)) {
      await page.mouse.move(width/2,width===1440?500:450);await page.mouse.wheel(0,12000);await page.waitForTimeout(200)
      await capture(page,name+'-lower',ids,{stateNote:'Actual lower viewport of same long page; no full-page raster stitching.'})
    }
  }
}
async function savedContractId(page) {
  if(process.env.STYLE_CONTRACT_SNAPSHOT_ID||state.contractSnapshotId)return process.env.STYLE_CONTRACT_SNAPSHOT_ID||state.contractSnapshotId
  const response = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/licensing/records/' + state.records.reservation.id)
  await page.goto(base + (surface === 'app' ? '/#/licensing/record?recordId=' : '/licensing/reservations/') + state.records.reservation.id)
  const raw = await response; assert(raw.ok())
  const record = (await raw.json()).data
  assert.equal(record.id, state.records.reservation.id)
  assert(record.data.contract.id)
  return record.data.contract.id
}
async function runWeb() {
  if(process.argv.includes('--only-contract')){
    const owner=await webLogin('owner'),id=await savedContractId(owner);await check('contract',()=>webRoute(owner,'/contracts/'+id,'contract',['WEB-34-01']));return
  }
  if(process.argv.includes('--only-grant-identifiers')) {
    const buyer=await webLogin('otherOwner');await check('grant-full-identifiers',()=>webGrantIdentifiers(buyer));return
  }
  const owner = await webLogin('owner'), buyer = await webLogin('otherOwner'), reviewer = await webLogin('reviewer')
  const r = state.records
  const snapshotId = process.argv.includes('--only-licensing')?'':await savedContractId(owner)
  const cases = [
    [owner, '/contracts/' + snapshotId, 'contract', ['WEB-34-01']],
    [owner, '/supply/profiles/' + r.ownerProfile.id, 'author-profile', ['WEB-05-01']],
    [owner, '/supply/works', 'works-list', ['WEB-07-01']],
    [owner, '/supply/works/' + r.draft.id, 'work-detail', ['WEB-07-01']],
    [owner, '/supply/works/new', 'work-form', ['WEB-07-02']],
    [owner, '/supply/works/' + r.history.id + '/revision', 'work-revision', ['WEB-07-02']],
    [owner, '/licensing/products/new', 'product-form', ['WEB-09-01']],
    [owner, '/licensing/readings/new', 'reading-form', ['WEB-12-01']],
    [buyer, '/licensing/catalog', 'catalog', ['APP-07-01']],
    [buyer, '/licensing/catalog/' + r.product.id, 'product', ['APP-08-01']],
    [buyer, '/licensing/reservations/' + r.held.id, 'reservation', ['WEB-10-01', 'WEB-10-02']],
    [buyer, '/licensing/evidence/' + r.pendingEvidence.id, 'evidence', ['WEB-10-02']],
    [buyer, '/licensing/grants/' + r.grant.id, 'grant', ['WEB-11-01']],
    [buyer, '/licensing/projects/new', 'project-form', ['WEB-11-02']],
    [buyer, '/licensing/projects/' + r.project.id, 'project-detail', ['WEB-11-02']],
    [buyer, '/licensing/bindings/' + r.binding.id, 'binding', ['WEB-11-02']],
    [buyer, '/supply/adaptations/' + r.binding.id + '/new', 'adaptation', ['WEB-07-02']],
    [reviewer, '/supply/reviews/profile', 'profile-review-list', ['WEB-05-02']],
    [reviewer, '/supply/reviews/profile/' + r.organizationProfile.id, 'profile-review', ['WEB-05-03']],
    [reviewer, '/supply/reviews/rights/' + r.pending.id, 'rights-review', ['WEB-08-01']],
    [reviewer, '/supply/reviews/content/' + r.pending.id, 'content-review', ['WEB-08-02']],
    [reviewer, '/licensing/reviews/products/' + r.pendingProduct.id, 'product-review', ['WEB-09-03']],
    [reviewer, '/licensing/reviews/evidence/' + r.pendingEvidence.id, 'evidence-review', ['WEB-10-03']],
    [reviewer, '/licensing/reviews/activation/' + r.held.id, 'activation', ['WEB-10-03']],
    [reviewer, '/licensing/reviews/grants/' + r.grant.id, 'grant-review', ['WEB-11-03']],
    [reviewer, '/licensing/reviews/readings/' + r.pendingReading.id, 'reading-review', ['WEB-12-02']],
  ]
  if(!process.argv.includes('--only-licensing'))await check('workspace-account-regions',()=>webWorkspace(owner))
  for (const [page, route, name, ids] of cases) {
    if(!process.argv.includes('--only-licensing')||route.startsWith('/licensing/'))await check(name, () => webRoute(page, route, name, ids))
    else if(process.argv.includes('--refresh-mobile-shell')&&/^\/(supply|contracts)\//.test(route))await check(name+'-mobile-shell',()=>webRoute(page,route,name,ids,[390,320]))
  }
  await check('grant-full-identifiers',()=>webGrantIdentifiers(buyer))
  await check('controlled-reader', async () => {
    for (const width of [1440, 390, 320]) {
      await buyer.setViewportSize({ width, height: width === 1440 ? 900 : width === 390 ? 844 : 693 })
      await buyer.bringToFront(); await buyer.goto(base + '/licensing/readings/' + r.reading.id)
      await buyer.getByRole('button', { name: '重新核验并读取带水印正文', exact: true }).click()
      const reader = buyer.locator('pre.controlled-reader'); await reader.waitFor()
      assert((await reader.innerText()).includes('<b>此文本不可执行</b>'))
      await capture(buyer, 'reader', ['WEB-12-03'], { focus: reader })
    }
  })
}
async function webGrantIdentifiers(buyer) {
    for (const width of [1440,390,320]) {
      await buyer.setViewportSize({width,height:width===1440?900:width===390?844:693})
      await buyer.goto(base+'/licensing/grants/'+state.records.grant.id)
      const summary=buyer.locator('summary').filter({hasText:'查看许可编号与关联身份'})
      await summary.first().click()
      await capture(buyer,'grant-identifiers',['WEB-11-01'],{focus:summary.first(),stateNote:'Actual expanded full record/party IDs, safely wrapping at narrow widths.'})
    }
}

async function enableApp(page) { await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' }); await page.locator('flt-semantics-placeholder').evaluate(n => n.click()); await page.getByRole('button').first().waitFor() }
async function appLogin(name) {
  const person = state.accounts[name], page = await newPage()
  await page.goto(base + '/#/enter'); await enableApp(page)
  await page.getByRole('button', { name: '前往账号与身份', exact: true }).click()
  if(name==='owner'&&!process.argv.includes('--only-account')) {
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:width===390?844:693})
      await capture(page,'login-empty',['APP-34-01'],{stateNote:'Actual blank phone/code form; agreement not selected; no SMS requested.'})
    }
    await page.setViewportSize({width:390,height:844})
  }
  await page.getByRole('textbox', { name: /^手机号/ }).click(); await page.waitForTimeout(300); await page.keyboard.type(person.phone, { delay: 45 })
  const sms = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/v1/auth/sms-challenges'))
  await page.getByRole('button', { name: '获取验证码', exact: true }).click(); assert((await sms).ok())
  if(name==='owner'&&!process.argv.includes('--only-account')) {
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:width===390?844:693})
      await capture(page,'login-code-empty',['APP-34-01'],{stateNote:'Actual synthetic SMS requested; blank code input; no code revealed.'})
    }
    await page.setViewportSize({width:390,height:844})
  }
  await page.getByRole('textbox', { name: /^验证码/ }).click(); await page.waitForTimeout(300); await page.keyboard.type(await smsCode(person.phone), { delay: 45 })
  await page.getByRole('button', { name: '同意用户协议与隐私政策', exact: true }).click()
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/v1/auth/sessions'))
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).click(); assert((await response).ok())
  await page.getByRole('tab', { name: '入戏', exact: true }).waitFor()
  return page
}
async function appScrollTo(page,label) {
  const width=page.viewportSize().width
  await page.mouse.move(width/2,350);await page.mouse.wheel(0,-14000);await page.waitForTimeout(300)
  for(let i=0;i<28;i++) {
    const aria=page.locator(`[aria-label*="${label}"]`),text=page.getByText(label,{exact:false})
    for(const candidates of [aria,text]) {
      for(let j=0;j<await candidates.count();j++) {
        const node=candidates.nth(j),box=await node.boundingBox({timeout:300})
        if(box&&box.y>=55&&box.y<page.viewportSize().height-70) {
          if(box.y>130){await page.mouse.wheel(0,box.y-100);await page.waitForTimeout(250)}
          return node
        }
      }
    }
    await page.mouse.move(width/2,450);await page.mouse.wheel(0,320);await page.waitForTimeout(200)
  }
  const diagnostic=await page.locator('[aria-label]').evaluateAll((nodes,label)=>nodes.map(n=>({label:n.getAttribute('aria-label'),y:n.getBoundingClientRect().y,height:n.getBoundingClientRect().height})).filter(n=>n.label?.includes(label)).slice(0,3),label)
  throw new Error('Actual account region not found by natural scrolling: '+label+' '+JSON.stringify(diagnostic))
}
async function appAccount(page) {
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:width===390?844:693})
    await page.goto(base+'/#/account');await page.waitForTimeout(800)
    await capture(page,'account-summary',['APP-34-02'],{stateNote:'Actual signed-in account; identity verification unavailable where backend has no provider.'})
    await appScrollTo(page,'选择办事身份')
    await capture(page,'account-identities',['APP-35-01'],{stateNote:'Actual personal and organization cards in consolidated account route.'})
    const orgName=partyNames.get(state.organizationId);assert(orgName,'Actual organization name read from normal UI API')
    const orgText=await appScrollTo(page,orgName)
    await orgText.click()
    await page.waitForTimeout(600)
    for(const [label,name,ids] of [
      ['当前身份编号','account-org-capabilities',['APP-35-02']],
      ['收到的机构邀请','account-received-invites',['APP-35-04']],
      ['邀请成员','account-invite-members',['APP-35-03']],
      ['机构成员','account-org-members',['APP-35-03']],
    ]) {
      await appScrollTo(page,label)
      await capture(page,name,ids,{stateNote:'Actual region in consolidated account route; real empty/list/status data retained.'})
    }
    await appScrollTo(page,'邀请成员')
    await page.getByRole('button',{name:'填写账号编号和截止时间',exact:true}).click()
    assert(await page.getByRole('button',{name:'发送邀请',exact:true}).isDisabled(),'Actual empty invitation is disabled before account/date are supplied')
    await capture(page,'account-invite-dialog-empty',['APP-35-03'],{stateNote:'Actual blank member invitation dialog; no invite sent.'})
    await page.getByRole('button',{name:'返回',exact:true}).click()
    await page.goto(base+'/#/account');await page.waitForTimeout(700)
    await appScrollTo(page,'选择办事身份')
    await appScrollTo(page,'选择办事身份')
    await page.getByRole('button',{name:'使用此身份',exact:true}).first().click()
  }
}
async function appRoute(page, route, name, ids) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 693 })
    await page.goto(base + '/#' + route)
    await page.waitForTimeout(850)
    await page.mouse.move(width / 2, 350); await page.mouse.wheel(0, -12000); await page.waitForTimeout(250)
    assert.equal(await page.getByText('页面不存在',{exact:true}).count(),0,`${route}: real route`)
    const recordId=new URL('http://local'+route).searchParams.get('recordId')
    if(recordId&&route.includes('/record')) assert(observedRecords.has(recordId),`${route}: actual record API returned`)
    await capture(page, name, ids)
    if(['product','work-form','work-revision','adaptation','author-form','evidence-form','project-form','binding-form','grant','contract','settings'].includes(name)) {
      await page.mouse.move(width/2,450);await page.mouse.wheel(0,10000);await page.waitForTimeout(250)
      await capture(page,name+'-lower',ids,{stateNote:'Actual lower viewport of long form/details; native scrolling only.'})
    }
  }
}
async function runApp() {
  if(process.argv.includes('--only-account')){const owner=await appLogin('owner');await check('account-regions',()=>appAccount(owner));return}
  const owner = await appLogin('owner'), buyer = await appLogin('otherOwner'), r = state.records
  const snapshotId = await savedContractId(owner)
  const cases = [
    [owner, '/home', 'home', ['APP-01-01']], [owner, '/my', 'my', ['APP-33-01']],
    [owner, '/supply', 'author-works', ['APP-36-01', 'APP-36-02']], [owner, '/supply/profile', 'author-form', ['APP-36-01']],
    [owner, '/supply/work/new', 'work-form', ['APP-36-03']], [owner, '/supply/work/new?previousId=' + r.history.id, 'work-revision', ['APP-36-03']],
    [owner, '/supply/record?recordId=' + r.draft.id, 'work-detail', ['APP-36-04']],
    [owner, '/contract?snapshotId=' + snapshotId, 'contract', ['APP-11-02']], [owner, '/settings', 'settings', ['APP-38-01']],
    [buyer, '/enter', 'catalog', ['APP-07-01']], [buyer, '/licensing/record?recordId=' + r.product.id, 'product', ['APP-08-01']],
    [buyer, '/licensing/record?recordId=' + r.held.id, 'reservation', ['APP-08-02']], [buyer, '/licensing/evidence?reservationId=' + r.held.id, 'evidence-form', ['APP-08-03']],
    [buyer, '/licensing?kind=GRANT', 'grants-list', ['APP-16-01']], [buyer, '/licensing/record?recordId=' + r.grant.id, 'grant', ['APP-16-02']],
    [buyer, '/licensing/project/new', 'project-form', ['APP-17-01']], [buyer, '/licensing/bind?grantId=' + r.grant.id, 'binding-form', ['APP-17-02']],
    [buyer, '/licensing/record?recordId=' + r.binding.id, 'binding', ['APP-17-02']], [buyer, '/supply/work/new?bindingId=' + r.binding.id, 'adaptation', ['APP-36-03']],
    [buyer, '/licensing?kind=READING', 'readings-list', ['APP-09-01']], [buyer, '/licensing/record?recordId=' + r.reading.id, 'reading-detail', ['APP-09-01']],
    [buyer, '/licensing/reading?recordId=' + r.reading.id, 'reader', ['APP-09-02']],
    [buyer, '/cultivate', 'cultivate-unopened', ['APP-19-01']], [buyer, '/roles', 'roles-unopened', ['APP-23-01']],
    [buyer, '/my-projects','my-projects',['APP-17-01','APP-17-02']],
    [owner, '/agreement','agreement',['APP-38-01']], [owner,'/privacy','privacy',['APP-38-01']],
  ]
  await check('account-regions',()=>appAccount(owner))
  for (const [page, route, name, ids] of cases) await check(name, () => appRoute(page, route, name, ids))
  await check('five-tabs-real-navigation',async()=>{
    await buyer.setViewportSize({width:390,height:844});await buyer.goto(base+'/#/home');await buyer.waitForTimeout(700)
    for(const name of ['入戏','培育','成角','我的','首页']){
      const tab=buyer.getByRole('tab',{name,exact:true});await tab.click();await buyer.waitForTimeout(550)
      assert.equal(await tab.getAttribute('aria-selected'),'true',name+' actual selected tab')
      for(const other of ['首页','入戏','培育','成角','我的'])assert.equal(await buyer.getByRole('tab',{name:other,exact:true}).count(),1,other+' remains present')
    }
    await capture(buyer,'five-tabs',['APP-01-01'],{stateNote:'All five actual tab clicks kept every tab present; no static mock navigation.'})
  })
}
try { await (surface === 'app' ? runApp() : runWeb()); assert.equal(unexpectedWrites.length, 0, 'Style run must not write business records'); assert.equal(errors.length, 0, 'Browser must have no unhandled errors') }
catch (cause) { console.error(clean(cause.message)); process.exitCode = 1 }
finally {
  const failed = results.filter(r => r.result === 'FAIL').length + unexpectedWrites.length + errors.length + layoutIssues.length
  if(failed)process.exitCode=1
  const report = { surface, captured_at: new Date().toISOString(), runtime_result: failed || process.exitCode ? 'FAIL' : 'PASS', visual_alignment: 'AWAITING_ACTUAL_IMAGE_COMPARISON', synthetic_only: true, base_url: base,
    limits: 'Read-only business routes. Only normal synthetic SMS/session form authentication writes. No injected browser sessions or production. Runtime PASS is not a claim of pixel-perfect visual alignment.', untriggered_states:['No new supply or licensing submissions','No review decisions, activation, suspension, revocation or payment','No real third-party identity, e-sign or payment provider','Future production/project/distribution business remains actually unavailable','Received invites retain actual empty state; no pending invite manufactured'],reference_inventory:'style-inventory.json',checks:results,errors,layout_issues:layoutIssues,unexpected_business_writes:unexpectedWrites,captures }
  if (surface === 'app') {report.app_build_sha256 = appBuildHash;report.capture_builds=[...new Set(captures.map(c=>c.app_build_sha256).filter(Boolean))]}
  await writeFile(resolve(evidence, `style-${surface}-runtime.json`), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
