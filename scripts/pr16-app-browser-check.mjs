#!/usr/bin/env node
/** Real Flutter Web + PR16 isolated HTTP/MySQL acceptance; no native device or real charge. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR16_UI_STATE_FILE || '.local/pr16-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const base = process.env.PR16_APP_URL || 'http://127.0.0.1:8773'
for (const url of [state.apiUrl, state.controlUrl, base]) assert.equal(new URL(url).hostname, '127.0.0.1')
const evidence = resolve(root, 'docs/ux/pr16-ui/evidence'), shots = resolve(evidence, 'screenshots')
await mkdir(shots, { recursive: true })
const results = [], routes = [], pageErrors = [], screenshots = [], requests = []
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage(); page.setDefaultTimeout(20000)
page.on('pageerror', error => pageErrors.push(error.message))
page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/v1/production/')) requests.push({ path: new URL(r.url()).pathname, key: r.headers()['idempotency-key'], body: r.postData() }) })
const buyer = state.accounts.buyer
const buildHash = createHash('sha256').update(await readFile(resolve(root, process.env.PR16_APP_BUILD_FILE || '.local/pr16-app-web/main.dart.js'))).digest('hex')
const redact = value => String(value).replaceAll(state.controlToken, '[REDACTED]').replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
async function check(label, task) {
  if(process.argv.includes('--remaining')&&['具体剧本版本','样片真实私有'].some(v=>label.startsWith(v)))return
  const start = Date.now()
  try { await task(); results.push({ label, result: 'PASS', elapsed_ms: Date.now() - start }); console.log(`✓ ${label}`) }
  catch (cause) { results.push({ label, result: 'FAIL', error: redact(cause.message).slice(0, 1500) }); throw cause }
}
async function control(route, method = 'POST') { const r = await fetch(state.controlUrl + route, { method, headers: { Authorization: `Bearer ${state.controlToken}` } }); assert(r.ok); return r.json() }
async function enable() { const p = page.locator('flt-semantics-placeholder'); await p.waitFor({ state: 'attached' }); await p.evaluate(n => n.click()); await page.getByRole('button').first().waitFor() }
async function go(route, first = false) { await page.goto(base + '/#' + route); if (first) await enable(); routes.push(route); await page.waitForTimeout(350) }
const text = value => page.getByText(value, { exact: false }).or(page.getByRole('textbox', { name: value, exact: true })).or(page.getByLabel(value,{exact:false})).first().waitFor()
const click = label => page.getByRole('button', { name: label, exact: true }).click()
// Flutter paints the scroll view separately from its semantics DOM. Scroll the
// actual canvas before clicking; DOM scrollIntoView can hit a different widget.
async function scrollField(locator) {
  for (let i = 0; i < 40; i++) {
    const box = await locator.count() ? await locator.boundingBox({ timeout: 300 }).catch(() => null) : null
    if (box && box.y + box.height / 2 >= 60 && box.y + box.height / 2 <= page.viewportSize().height - 15) return locator
    await page.mouse.move(190, 540); await page.mouse.wheel(0, box?.y < 50 ? -250 : 250); await page.waitForTimeout(200)
  }
  throw new Error('Flutter field did not become visible in the real scroll view')
}
async function scrollButton(label) { return scrollField(page.getByRole('button', { name: label, exact: true }).first()) }
async function fillField(name, value) {
  const field = await scrollField(page.getByRole('textbox', { name }))
  const box = await field.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(300)
  await page.keyboard.type(value, { delay: 40 })
  assert.equal(await field.inputValue(), value)
}
async function top() { await page.mouse.move(180, 350); await page.mouse.wheel(0, -20000); await page.waitForTimeout(250) }
async function shot(name, { scrollTop = true } = {}) { if (scrollTop) await top(); await page.waitForTimeout(600); const file = `screenshots/pr16-app-${name}-mobile.png`; await page.screenshot({ path: resolve(evidence, file) }); screenshots.push({ file, viewport: page.viewportSize() }) }
const post = route => page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/production' + route)
async function data(r) { const j = await r.json(); assert(r.ok(), `App HTTP ${r.status()} ${j.error?.code || ''}`); return j.data }
async function confirm(label, route) { await (await scrollButton(label)).click(); await page.getByRole('alertdialog').waitFor(); const r = post(route); await click('确认办理'); return data(await r) }
const id = key => typeof state.records[key] === 'string' ? state.records[key] : state.records[key].id
async function press(locator) { await scrollField(locator); const b = await locator.boundingBox(); await page.mouse.click(b.x + b.width/2, b.y + b.height/2); await page.waitForTimeout(250) }
async function run() {
  await check('390×844 App正常短信登录返回新版制作项目', async () => {
    await go('/production', true); await click('前往账号与身份'); await text('手机号登录')
    await fillField(/手机号/, buyer.phone); await click('获取验证码'); await text('验证码已发送')
    await fillField(/验证码/, (await control('/code?phone=' + buyer.phone, 'GET')).code)
    await click('同意用户协议与隐私政策'); await click('登录 / 注册'); await text('参与制作项目')
    if (await page.getByRole('button', { name:'前往账号与身份',exact:true }).count()) {
      await click('前往账号与身份'); await text('选择办事身份'); await page.getByRole('button', {name:/个人 ·/}).click(); await page.getByRole('button', {name:/^Back/}).first().click()
    }
    await text('查看项目'); await shot('projects')
  })

  await check('具体剧本版本完整受控阅读后，买方实际确认本版', async () => {
    await go('/production/version?versionId=' + id('appScriptVersion')); await text('确认剧本'); await shot('script-before')
    const content=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/production/versions/'+id('appScriptVersion')+'/content')
    await press(page.getByRole('button',{name:'完整阅读',exact:true}));assert.equal((await content).status(),200);await click('返回审阅')
    await press(page.getByRole('checkbox',{name:'我已完整阅读本版剧本。',exact:true}));await fillField('确认说明','本机合成测试：已完整阅读当前具体剧本版本。')
    await shot('script-confirm',{scrollTop:false});const result=await confirm('确认这版剧本','/versions/'+id('appScriptVersion')+'/feedback')
    assert.equal(result.kind,'FEEDBACK');assert.equal(result.data.decision,'ACCEPT');assert.equal(result.data.version_id,id('appScriptVersion'));assert.deepEqual(result.data.checklist,{script_reviewed:true})
    await text('制作项目');await shot('project-after-script')
  })
  await check('样片真实私有预览；提交不明阻止返回，用原编号恢复一次修改意见', async () => {
    await go('/production/version?versionId='+id('appSampleVersion'));await text('审阅样片')
    const content=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/production/versions/'+id('appSampleVersion')+'/content')
    await press(page.getByRole('button',{name:'播放预览',exact:true}));assert.equal((await content).status(),200)
    await page.locator('video').waitFor({state:'attached'});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert(await page.locator('video').evaluate(v=>v.videoWidth>0&&v.duration>0))
    await shot('sample-preview');await press(page.getByRole('button',{name:'本版确认与修改意见',exact:true}));await fillField('本版修改意见','仅本机合成测试：请按这一版修改节奏。');await shot('feedback-form',{scrollTop:false})
    await control('/response-loss?operation=feedback&mode=503');const start=requests.length
    await press(page.getByRole('button',{name:'提交修改意见',exact:true}));await page.getByRole('alertdialog').waitFor();const first=post('/versions/'+id('appSampleVersion')+'/feedback');await click('确认办理');assert.equal((await first).status(),503)
    await top();await page.getByRole('button',{name:'恢复原请求核对',exact:true}).waitFor();const before=new URL(page.url()).hash;await page.getByRole('button',{name:/^Back/}).first().click();assert.equal(new URL(page.url()).hash,before)
    const result=await confirm('恢复原请求核对','/versions/'+id('appSampleVersion')+'/feedback');assert.equal(result.data.decision,'REQUEST_CHANGES');assert.equal(result.data.checklist,null)
    const sent=requests.slice(start).filter(r=>r.path.endsWith('/feedback'));assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);await text('制作项目');await shot('feedback-recovered')
  })
  await check('旧样片历史保留；新稿不会沿用旧稿确认', async () => {
    const actual=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/production/records/'+id('webHistoryProject'))
    await go('/production/project?projectId='+id('webHistoryProject'));const p=await data(await actual);assert.equal(p.data.current.SAMPLE,id('webHistoryNewSample'));assert.equal(p.data.accepted.SAMPLE,undefined);await text('制作项目');for(let n=0;n<12&&await page.getByLabel('版本记录与反馈历史',{exact:false}).count()===0;n++){await page.mouse.move(180,500);await page.mouse.wheel(0,450);await page.waitForTimeout(200)}await text('版本记录与反馈历史');await shot('version-history',{scrollTop:false})
    await go('/production/version?versionId='+id('webHistoryOldSample'));await text('历史版本');assert(await page.getByRole('button',{name:'本版确认与修改意见',exact:true}).isDisabled());await shot('old-version')
  })
  await check('成片待付款时禁用原片下载，已付清且验收才经权限接口下载', async () => {
    await go('/production/work?projectId='+id('webFinalProject'));await text('私人作品');await text('当前原片尚不可下载');assert(await (await scrollButton('下载当前原片')).isDisabled());await shot('final-unpaid')
    await go('/production/works');await text('我的交付作品');await shot('works')
    await go('/production/work?projectId='+id('appDownloadProject'));await text('私人作品');await shot('private-work')
    const content=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/production/versions/'+id('appDownloadFinal')+'/content'&&new URL(r.url()).searchParams.get('variant')==='final')
    const download=page.waitForEvent('download');await press(page.getByRole('button',{name:'下载当前原片',exact:true}));assert.equal((await content).status(),200);const d=await download;assert.equal(await d.failure(),null)
  })
  await check('退款和撤回继续拒绝读取原片，不显示已可用文件',async()=>{
    for(const key of ['appRefundProject','appWithdrawnProject']){await go('/production/work?projectId='+id(key));await text('私人作品');const blocked=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/content'));await press(page.getByRole('button',{name:'播放成片预览',exact:true}));assert.equal((await blocked).status(),409);await text(key==='appRefundProject'?'原订单当前财务状态':'本人同意当前不覆盖');assert.equal(await page.locator('video').count(),0);await shot(key)}
  })
  await check('五顶层入口保持稳定、旧项目/作品入口映射新版、320宽无底栏遮挡',async()=>{
    await go('/my');await page.getByRole('tab',{name:'我的',exact:true}).waitFor();for(const name of ['首页','入戏','培育','成角','我的']){await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.getByRole('tab').count(),5)}
    await go('/my-projects');await text('制作项目');await shot('legacy-project-route')
    await page.setViewportSize({width:320,height:693});await go('/production/version?versionId='+id('webHistoryNewSample'));await text('审阅样片');assert.equal(await page.getByRole('tab').count(),0);await shot('sample-320')
  })

}
try { await run(); assert(results.length > 0); assert.equal(pageErrors.length,0,pageErrors.join('\n')) }
catch(cause){console.error(redact(cause.stack));process.exitCode=1;await page.screenshot({path:resolve(shots,'debug-app.png')}).catch(()=>{})}
finally{await writeFile(resolve(evidence,process.argv.includes('--remaining')?'app-remaining-results.json':'app-browser-results.json'),JSON.stringify({synthetic_only:true,native_device:'CANCELLED_BY_USER_NOT_VERIFIED',real_generation_provider:'NOT_ENABLED',build_sha256:buildHash,results,routes,pageErrors,screenshots,total:results.length,passed:results.filter(r=>r.result==='PASS').length},null,2)+'\n');await browser.close()}
