#!/usr/bin/env node
/** Vue UI with actual PR16 isolated HTTP/MySQL. Synthetic external transports only. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR16_UI_STATE_FILE || '.local/pr16-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const base = process.env.PR16_WEB_URL || 'http://127.0.0.1:5206'
for (const url of [state.apiUrl, state.controlUrl, base]) assert.equal(new URL(url).hostname, '127.0.0.1')
const evidence = resolve(root, 'docs/ux/pr16-ui/evidence'), shots = resolve(evidence, 'screenshots')
await mkdir(shots, { recursive: true })
const results = [], pageErrors = [], screenshots = [], actors = {}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const redact = value => { let text = String(value); for (const s of [state.controlToken, ...Object.values(actors).map(a => a.token)].filter(Boolean)) text = text.replaceAll(s, '[REDACTED]'); return text.replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]') }
async function check(label, task) { if(process.argv.includes('--remaining')&&['原订单制作明细','商家负责人更换','实际被指派成员','买方实际读取本版剧本'].some(s=>label.startsWith(s)))return; const start = Date.now(); try { await task(); results.push({ label, result: 'PASS', elapsed_ms: Date.now() - start }); console.log(`✓ ${label}`) } catch (cause) { results.push({ label, result: 'FAIL', error: redact(cause.message).slice(0, 1200) }); throw cause } }
async function control(route, method = 'POST') { const r = await fetch(state.controlUrl + route, { method, headers: { Authorization: `Bearer ${state.controlToken}` } }); assert(r.ok, `test control ${r.status}`); return r.json() }
async function login(name, destination) {
  const person = state.accounts[name], context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' }), page = await context.newPage(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => pageErrors.push(redact(error.message)))
  await page.goto(base + (destination || '/login'))
  await page.getByTestId('phone-input').fill(person.phone)
  const sms = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/sms-challenges')
  await page.getByTestId('send-code').click(); assert.equal((await sms).status(), 200)
  await page.getByTestId('code-input').fill((await control('/code?phone=' + person.phone, 'GET')).code)
  await page.getByTestId('submit-login').click(); await page.waitForURL(u => u.pathname === (destination || '/workspace'))
  if (!destination) await page.locator(`[data-party="${person.actingPartyId || person.personalPartyId}"]`).click()
  const token = await page.evaluate(() => sessionStorage.getItem('ops.session.token')); assert(token)
  return actors[name] = { ...person, token, page, context }
}
async function api(person, method, route, body, { party = person.actingPartyId || person.personalPartyId, version, key = randomUUID() } = {}) {
  const r = await fetch(state.apiUrl + '/api/v1' + route, { method, headers: { Authorization: `Bearer ${person.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(party ? { 'X-Acting-Party': party } : {}), ...(version ? { 'If-Match': `"${version}"` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const parsed = await r.json(); assert(r.ok, `${method} ${route}: ${r.status} ${parsed.error?.code || ''}`); return parsed.data
}
const id = key => typeof state.records[key] === 'string' ? state.records[key] : state.records[key].id
async function go(page, route) { await page.goto(base + route); await page.locator('.workspace-nav').waitFor(); await page.getByRole('heading', { level: 1 }).waitFor(); await page.getByText('正在读取身份与制作记录…',{exact:true}).waitFor({state:'hidden'}) }
const post = (page, route) => page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/production' + route)
async function data(r) { const j = await r.json(); assert(r.ok(), `UI ${r.status()} ${j.error?.code || ''}`); return j.data }
async function shot(page, name) { await page.getByText('正在读取身份与制作记录…',{exact:true}).waitFor({state:'hidden'}); const file = `screenshots/pr16-web-${name}.png`; await page.screenshot({ path: resolve(evidence, file), fullPage: true }); screenshots.push({ file, viewport: page.viewportSize() }) }
async function run() {
  const seller = await login('seller'), buyer = await login('buyer'), reviewer = await login('reviewer'), member = await login('producerMember')
  let project, version, file
  const set = async(page,name,value)=>{const field=page.getByTestId(name);if(await field.evaluate(n=>n.tagName)==='SELECT')await field.selectOption(value);else await field.fill(value)}
  async function review(row,section) {
    const p=reviewer.page;await go(p,`/production/reviews/${section}/${row.id}`)
    if(section==='projects'){
      const evidence=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname===`/api/v1/production/projects/${row.id}/evidence`)
      await p.getByTestId('production-read-evidence').click();assert.equal((await evidence).status(),200)
      await p.getByTestId('production-contract-hash').fill(row.data.contract_sha256)
      for(const k of ['identity','signatures','rights'])await p.getByTestId('production-check-'+k).check()
    }else{
      const content=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname===`/api/v1/production/versions/${row.id}/content`)
      await p.getByTestId('production-read-preview').click();assert.equal((await content).status(),200);await p.getByText('已实际读取本版预览；请按看过的内容填写检查。',{exact:true}).waitFor()
      if(row.data.stage!=='SCRIPT'){await p.locator('video').waitFor();await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await p.locator('video').evaluate(async v=>{await v.play()});await p.waitForTimeout(400);await p.locator('video').evaluate(v=>v.pause())}
      for(const k of row.data.stage==='SCRIPT'?['script']:['script','specification','audio','branding'])await p.getByTestId('production-check-'+k).check()
    }
    await p.getByTestId('production-review-decision').selectOption('APPROVED');await p.getByTestId('production-review-reason').fill('仅本机隔离测试：已实际读取合成材料并按本版逐项核对。')
    await shot(p,'review-'+section+(section==='versions'?'-'+row.data.stage.toLowerCase():'')+'-desktop');const r=post(p,'/records/'+row.id+'/reviews');await p.getByTestId('production-review-submit').click();return data(await r)
  }
  await check('原订单制作明细→商家真实新建项目，制作规格不改价',async()=>{
    const p=seller.page,c=state.creation;await go(p,'/production/projects');await shot(p,'projects-desktop');await go(p,'/production/projects/new')
    await p.getByTestId('production-order-id').fill(c.orderId);await p.getByRole('button',{name:'读取原订单',exact:true}).click();await p.getByTestId('production-line-id').selectOption(c.lineId)
    await p.getByTestId('production-script-id').fill(c.scriptVersionId);await set(p,'production-assignee',c.assigneeAccountId);await p.getByTestId('production-purpose').fill(c.purpose);await p.getByTestId('production-territory').fill(c.territory);await p.getByTestId('production-consents').fill(c.consentIds.join('\n'));await p.getByTestId('production-evidence-id').fill(c.evidenceAssetId)
    await shot(p,'create-desktop');const r=post(p,'/projects');await p.getByTestId('production-create').click();project=await data(await r);assert.equal(project.current_status,'IN_REVIEW');assert.equal(project.data.producer_party_id,state.producerPartyId)
    project=await review(project,'projects');assert.equal(project.current_status,'READY')
  })
  await check('商家负责人更换请求丢回复，保留原内容与编号恢复',async()=>{
    const p=seller.page;await go(p,`/production/projects/${project.id}/assignment`);await set(p,'production-new-assignee',state.accounts.producerMember.accountId);await p.getByTestId('production-assignment-reason').fill('仅合成测试：继续指派制作方当前成员。');await shot(p,'assignment-desktop')
    const seen=[],observe=r=>{if(r.method()==='POST'&&r.url().endsWith('/assignment'))seen.push({key:r.headers()['idempotency-key'],body:r.postData(),version:r.headers()['if-match']})};p.on('request',observe)
    await control('/response-loss?operation=assignment&mode=503');const first=post(p,`/projects/${project.id}/assignment`);await p.getByRole('button',{name:'保存负责人变更',exact:true}).click();assert.equal((await first).status(),503)
    await p.getByRole('button',{name:'先核对原记录',exact:true}).waitFor();await p.locator('.workspace-nav').getByRole('link',{name:'我的作品',exact:true}).click();assert(new URL(p.url()).pathname.endsWith('/assignment'))
    await p.getByRole('button',{name:'先核对原记录',exact:true}).click();const r=post(p,`/projects/${project.id}/assignment`);await p.getByRole('button',{name:'使用原编号重试',exact:true}).click();project=await data(await r);assert.equal(project.data.assignee_account_id,state.accounts.producerMember.accountId);assert.equal(seen.length,2);assert.deepEqual(seen[0],seen[1]);p.off('request',observe)
  })
  await check('实际被指派成员上传私有文本、提交不可覆盖剧本版、独立审片',async()=>{
    const p=member.page;await go(p,`/production/projects/${project.id}`);await shot(p,'project-files-desktop')
    await p.getByTestId('production-file').setInputFiles({name:'isolated-script.txt',mimeType:'text/plain',buffer:Buffer.from('ISOLATED TEST / SYNTHETIC ONLY\n第一场 旧车站\n这是浏览器测试合成台词，不代表真实作品或权利。')})
    const upload=post(p,`/projects/${project.id}/files`);await p.getByRole('button',{name:'上传私有制作文件',exact:true}).click();file=await data(await upload);assert.equal(file.current_status,'READY')
    await go(p,`/production/projects/${project.id}/versions`);await p.getByTestId('production-stage').selectOption('SCRIPT');await p.getByTestId('production-version-file').selectOption(file.id);await p.getByTestId('production-version-preview').selectOption(file.id);await p.getByTestId('production-version-note').fill('仅隔离测试，提交第一个实际私有文本版本。');await shot(p,'version-submit-desktop')
    const r=post(p,`/projects/${project.id}/versions`);await p.getByTestId('production-version-submit').click();version=await data(await r);assert.equal(version.current_status,'IN_REVIEW');version=await review(version,'versions');assert.equal(version.current_status,'APPROVED')
  })
  await check('买方实际读取本版剧本后反馈；审核通过不代替客户验收',async()=>{
    const p=buyer.page;await go(p,'/production/versions/'+version.id);assert(await p.getByTestId('production-feedback-submit').isDisabled());await p.getByTestId('production-read-preview').click();await p.locator('.production-text-preview').waitFor();assert((await p.locator('.production-text-preview').innerText()).includes('SYNTHETIC ONLY'))
    await p.getByTestId('production-check-script').check();await p.getByTestId('production-feedback-decision').selectOption('ACCEPT');await p.getByTestId('production-feedback-note').fill('仅隔离测试：已完整核对这一版剧本。');await shot(p,'customer-script-desktop')
    const r=post(p,'/versions/'+version.id+'/feedback');await p.getByTestId('production-feedback-submit').click();const f=await data(await r);assert.equal(f.data.version_id,version.id);assert.equal(f.data.decision,'ACCEPT')
  })
  await check('样片私有视频可播放，逐版修改意见不会伪造验收',async()=>{
    const pendingSample=await api(buyer,'GET','/production/records/'+id('webSampleVersion'));if(pendingSample.current_status==='IN_REVIEW')await review(pendingSample,'versions');const p=buyer.page;await go(p,'/production/versions/'+id('webSampleVersion'));await p.getByTestId('production-read-preview').click();await p.locator('video').waitFor();await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert(await p.locator('video').evaluate(v=>v.videoWidth>0&&v.duration>0));await shot(p,'sample-preview-desktop')
    await p.getByTestId('production-feedback-decision').selectOption('REQUEST_CHANGES');await p.getByTestId('production-feedback-note').fill('仅合成测试：请调整本版样片节奏。');const r=post(p,'/versions/'+id('webSampleVersion')+'/feedback');await p.getByTestId('production-feedback-submit').click();const f=await data(await r);assert.equal(f.data.decision,'REQUEST_CHANGES');assert.equal(f.data.checklist,null)
    const current=await api(buyer,'GET','/production/records/'+id('webSampleProject'));assert.equal(current.data.change_requests,1);assert.equal(current.data.accepted.SAMPLE,undefined)
  })
  await check('历史确认失效与原意见保留；并发版本变化要求重读确认',async()=>{
    const p=buyer.page;await go(p,'/production/projects/'+id('webHistoryProject'));await shot(p,'history-desktop');const history=await api(buyer,'GET','/production/records/'+id('webHistoryProject'));assert.equal(history.data.current.SAMPLE,id('webHistoryNewSample'));assert.equal(history.data.accepted.SAMPLE,undefined)
    await go(p,'/production/versions/'+id('webHistoryOldSample'));assert(await p.getByTestId('production-feedback-submit').isDisabled())
    await go(p,'/production/versions/'+id('raceScript'));await p.getByTestId('production-read-preview').click();await p.locator('.production-text-preview').waitFor();await p.getByTestId('production-check-script').check();await p.getByTestId('production-feedback-decision').selectOption('ACCEPT');await p.getByTestId('production-feedback-note').fill('原页面看到的版本，稍后竞争修改。')
    const original=await api(buyer,'GET','/production/records/'+id('raceScript'));await api(buyer,'POST','/production/versions/'+id('raceScript')+'/feedback',{decision:'ACCEPT',note:'另一个正常会话合成并发确认。',checklist:{script_reviewed:true}},{version:original.object_version})
    const r=post(p,'/versions/'+id('raceScript')+'/feedback');await p.getByTestId('production-feedback-submit').click();assert.equal((await r).status(),412);await p.getByTestId('production-reconfirm').waitFor();assert.equal(await p.getByTestId('production-check-script').isChecked(),false);assert(await p.getByTestId('production-feedback-submit').isDisabled());await shot(p,'version-conflict-desktop')
  })
  await check('最终验收与尾款分开，付清前接口拒绝原片，已付清可受控下载',async()=>{
    const pendingFinal=await api(buyer,'GET','/production/records/'+id('webFinalVersion'));if(pendingFinal.current_status==='IN_REVIEW')await review(pendingFinal,'versions');const p=buyer.page;await go(p,'/production/versions/'+id('webFinalVersion'));await p.getByTestId('production-read-preview').click();await p.locator('video').waitFor();await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2)
    for(const k of ['script','specification','audio','branding'])await p.getByTestId('production-check-'+k).check();await p.getByTestId('production-feedback-decision').selectOption('ACCEPT');await p.getByTestId('production-feedback-note').fill('合成测试：按本版逐项核对并验收，尚未付清尾款。');await shot(p,'customer-final-desktop')
    const r=post(p,'/versions/'+id('webFinalVersion')+'/feedback');await p.getByTestId('production-feedback-submit').click();assert.equal((await data(await r)).data.decision,'ACCEPT')
    const blocked=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/production/versions/'+id('webFinalVersion')+'/content'&&new URL(r.url()).searchParams.get('variant')==='final');await p.getByTestId('production-download-final').click();assert.equal((await blocked).status(),409)
    await go(p,'/production/versions/'+id('appDownloadFinal'));const download=p.waitForEvent('download');await p.getByTestId('production-download-final').click();assert.equal(await (await download).failure(),null);await shot(p,'final-delivered-desktop')
  })
  await check('生成默认未启用，不排假任务；实际任务仅按原请求恢复',async()=>{
    const p=member.page;await go(p,'/production/projects/'+id('webScriptProject')+'/generation');await p.getByText('未启用',{exact:false}).first().waitFor();assert(await p.getByRole('button',{name:'建立实际生成请求',exact:true}).isDisabled());await shot(p,'generation-disabled-desktop')
    if(state.records.recoveryGeneration){const rp=reviewer.page;await go(rp,'/production/reviews/generations/'+id('recoveryGeneration'));await rp.getByTestId('production-retry-reason').fill('synthetic.browser.recovery');const r=post(rp,'/generations/'+id('recoveryGeneration')+'/retry');await rp.getByTestId('production-retry-submit').click();assert.equal((await data(await r)).id,id('recoveryGeneration'));await go(rp,'/production/reviews/generations/'+id('recoveryGeneration'));await rp.getByRole('heading',{name:'实际任务状态',exact:true}).waitFor();await shot(rp,'job-recovery-desktop')}
  })
  await check('角色撤权清除私有证据，所有主入口稳定且窄屏不溢出',async()=>{
    const rp=reviewer.page;await go(rp,'/production/reviews/projects/'+id('webReviewProject'));await control('/reviewer-permission?action=PRODUCTION_REVIEW&enabled=false');await rp.getByTestId('production-read-evidence').click();await rp.getByRole('alert').waitFor();assert.equal(await rp.getByTestId('production-contract-hash').count(),0);await control('/reviewer-permission?action=PRODUCTION_REVIEW&enabled=true')
    const p=buyer.page;await go(p,'/production/projects');const links=await p.locator('.workspace-nav a').evaluateAll(ns=>ns.map(n=>({label:n.textContent.trim(),href:n.getAttribute('href')})))
    for(const link of links){await p.locator('.workspace-nav').getByRole('link',{name:link.label,exact:true}).click();await p.waitForURL(u=>u.pathname===link.href);assert.equal(await p.locator('.workspace-nav a').count(),links.length);assert.equal(await p.locator('.workspace-nav a[aria-current="page"]').count(),1);assert.equal(await p.getByRole('heading',{name:'页面不存在',exact:true}).count(),0)}
    await p.setViewportSize({width:390,height:844});for(const route of ['/production/projects','/production/versions/'+id('webHistoryNewSample'),'/production/projects/'+id('webHistoryProject')]){await go(p,route);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(p,'mobile-'+(route==='/production/projects'?'project-list':route.includes('/versions/')?'version':'project-detail'))}
  })
  await check('未登录直达制作项目，正常短信登录返回同一新版',async()=>{const a=await login('outsider','/production/projects');await a.page.getByRole('heading',{name:'我参与的制作项目',exact:true}).waitFor();assert.equal(new URL(a.page.url()).pathname,'/production/projects')})
  assert(results.length >= (process.argv.includes('--remaining') ? 6 : 10))

}
try { await run(); assert.equal(pageErrors.length, 0, pageErrors.join('\n')) }
catch (cause) { console.error(redact(cause.stack)); process.exitCode = 1; for (const [name, a] of Object.entries(actors)) await a.page.screenshot({ path: resolve(shots, `debug-${name}.png`), fullPage: true }).catch(() => {}) }
finally { await writeFile(resolve(evidence,process.argv.includes('--remaining')?'web-remaining-results.json':'web-browser-results.json'), JSON.stringify({ synthetic_only: true, source: 'Vue UI → actual isolated HTTP/MySQL; synthetic external transports', results, pageErrors, screenshots, total: results.length, passed: results.filter(r => r.result === 'PASS').length }, null, 2) + '\n'); await browser.close() }
