#!/usr/bin/env node
/** Real Flutter Web + isolated #14 HTTP/MySQL acceptance. Never run against production. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR14_UI_STATE_FILE || '.local/pr14-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const base = process.env.BASE_URL || process.env.PR14_APP_URL || 'http://127.0.0.1:8771'
for (const url of [state.apiUrl, state.controlUrl, base]) assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname))
const evidence = resolve(root, 'docs/ux/pr14-ui/evidence'), shots = resolve(evidence, 'screenshots')
await mkdir(shots, { recursive: true })
const results = [], routes = [], pageErrors = [], requests = [], screenshots = []
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', error => pageErrors.push(error.message))
page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/licensing/reservations')) requests.push({ key: request.headers()['idempotency-key'], body: request.postData() }) })
const buyer = state.accounts.otherOwner
const buildHash = createHash('sha256').update(await readFile(resolve(root, '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/web/main.dart.js'))).digest('hex')
const redact = value => String(value).replaceAll(state.controlToken, '[REDACTED]').replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
async function check(label, task) {
  const start = Date.now()
  try { await task(); results.push({ label, result: 'PASS', elapsed_ms: Date.now() - start }); console.log(`✓ ${label}`) }
  catch (cause) { results.push({ label, result: 'FAIL', error: redact(cause.message).slice(0, 1500), elapsed_ms: Date.now() - start }); throw cause }
}
async function enable() {
  const placeholder = page.locator('flt-semantics-placeholder')
  await placeholder.waitFor({ state: 'attached' })
  await placeholder.evaluate(node => node.click())
  await page.getByRole('button').first().waitFor()
}
async function go(route) {
  await page.goto(base + '/#' + route)
  await enable()
  routes.push(route)
}
async function text(value) { await page.getByText(value, { exact: false }).first().waitFor() }
async function shot(name) { const file = `screenshots/pr14-app-${name}-mobile.png`; await page.screenshot({ path: resolve(evidence, file) }); if (!name.includes('debug')) screenshots.push({ file, width: 390, height: 844 }) }
async function code() {
  const response = await fetch(state.controlUrl + '/code?phone=' + buyer.phone, { headers: { Authorization: `Bearer ${state.controlToken}` } })
  assert(response.ok)
  return (await response.json()).code
}
async function clickButton(label) { await page.getByRole('button', { name: label, exact: true }).click() }
async function scrollToButton(label) {
  const button = page.getByRole('button', { name: label, exact: true })
  for (let i = 0; i < 25; i++) {
    const box = await button.count() ? await button.boundingBox({ timeout: 300 }).catch(() => null) : null
    if (box && box.y >= 60 && box.y + box.height <= 770) break
    await page.mouse.move(190, 540); await page.mouse.wheel(0, 460); await page.waitForTimeout(180)
  }
  await button.waitFor()
  return button
}
async function top() { await page.mouse.move(190, 420); await page.mouse.wheel(0, -12000); await page.waitForTimeout(350) }
async function currentShot(name) { routes.push(new URL(page.url()).hash.slice(1)); await top(); await shot(name) }
async function back() { await page.waitForTimeout(600); await page.getByRole('button', { name: /^Back/ }).first().click(); await page.waitForTimeout(900) }
async function data(response) { assert(response.ok(), `Actual App HTTP ${response.status()}`); return (await response.json()).data }
const recordResponse = id => page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/licensing/records/' + id)
let reservation

try {
  await check('390×844 最终App正常表单登录，选择买方个人身份', async () => {
    await go('/enter')
    await clickButton('前往账号与身份')
    await text('手机号登录')
    await page.getByRole('textbox', { name: '手机号', exact: true }).click()
    await page.waitForTimeout(300)
    await page.keyboard.type(buyer.phone, { delay: 50 })
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: '获取验证码', exact: true }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: '手机号', exact: true }).inputValue(), buyer.phone)
    assert(await page.getByRole('button', { name: '获取验证码', exact: true }).isEnabled())
    const smsResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/v1/auth/sms-challenges'))
    await clickButton('获取验证码')
    assert((await smsResponse).ok())
    await text('验证码已发送')
    await page.getByRole('textbox', { name: '验证码', exact: true }).click()
    await page.waitForTimeout(300)
    await page.keyboard.type(await code(), { delay: 50 })
    await clickButton('同意用户协议与隐私政策')
    const loginResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/v1/auth/sessions'))
    await clickButton('登录 / 注册')
    assert((await loginResponse).ok())
    await page.getByRole('button', { name: '查看剧本', exact: true }).first().waitFor()
    await clickButton('新用户')
    await page.getByRole('group', { name: /选择办事身份/ }).waitFor()
    await page.getByRole('button', { name: /个人 ·/ }).click()
    await back()
    await page.getByRole('tab', { name: '入戏', exact: true }).waitFor()
  })
  await check('入戏目录→剧本详情呈现实际短试读、权利范围及价格', async () => {
    await page.getByRole('tab', { name: '入戏', exact: true }).click()
    await page.getByRole('button', { name: '查看剧本', exact: true }).first().waitFor()
    await currentShot('catalog')
    const productResponse = recordResponse(state.records.product.id)
    await page.getByRole('button', { name: '查看剧本', exact: true }).first().click()
    const product = await data(await productResponse)
    assert.equal(product.id, state.records.product.id)
    assert.equal(product.kind, 'PRODUCT')
    assert.equal(product.current_status, 'LISTED')
    assert.equal(product.data.price.amount_minor, 12345)
    assert.deepEqual(product.data.terms.rights, ['ADAPT', 'PRODUCE'])
    await page.getByRole('heading', { name: '剧本与许可', exact: true }).waitFor()
    await currentShot('product')
    await page.mouse.move(190, 540); await page.mouse.wheel(0, 580); await page.waitForTimeout(300)
    await shot('product-terms')
  })
  await check('实际新预留保存合同，等待核验且不伪造支付或许可成功', async () => {
    const button = await scrollToButton('预留这份许可')
    const response = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/v1/licensing/reservations'))
    await button.click()
    await page.getByRole('alertdialog').waitFor()
    await clickButton('确认办理')
    reservation = await data(await response)
    assert.equal(reservation.kind, 'RESERVATION')
    assert.equal(reservation.current_status, 'HELD')
    assert.equal(reservation.parent_id, state.records.product.id)
    assert.equal(reservation.data.contract.signing_method, 'NOT_SIGNED')
    assert.equal(reservation.data.contract.commitments.price.amount_minor, 12345)
    assert.equal(requests.length, 1)
    assert(requests[0].key)
    assert.equal(JSON.parse(requests[0].body).product_id, state.records.product.id)
    await page.getByRole('heading', { name: '许可预留与合同', exact: true }).waitFor()
    await currentShot('reservation')
    await back()
    await back()
    await page.getByRole('tab', { name: '入戏', exact: true }).waitFor()
  })
  await check('我的许可使用实际记录过滤并打开已发放许可', async () => {
    await (await scrollToButton('我的预留与许可')).click()
    await page.getByRole('heading', { name: '我的许可与项目', exact: true }).waitFor()
    await page.getByRole('button', { name: /^查看记录 / }).click()
    await page.waitForTimeout(750)
    const option = page.getByRole('menuitem', { name: '已获许可', exact: true })
    await option.waitFor()
    const list = page.waitForResponse(response => { const url = new URL(response.url()); return response.request().method() === 'GET' && url.pathname === '/api/v1/licensing/records' && url.searchParams.get('kind') === 'GRANT' })
    await option.click()
    const grants = await data(await list)
    assert(grants.items.some(row => row.id === state.records.grant.id))
    const response = recordResponse(state.records.grant.id)
    // Supported same-document deep link retains the real in-memory login;
    // runtime records may have newer rows before the fixed seeded grant.
    await page.goto(base + '/#/licensing/record?recordId=' + state.records.grant.id)
    const grant = await data(await response)
    assert.equal(grant.kind, 'GRANT')
    assert.equal(grant.current_status, 'ACTIVE')
    assert.equal(grant.owner_party_id, buyer.personalPartyId)
    await page.getByRole('heading', { name: '已获许可', exact: true }).waitFor()
    await currentShot('grant')
  })
  await check('已获许可关联实际绑定，核对项目与改稿入口权限', async () => {
    const short = state.records.binding.id.slice(0, 8) + '…' + state.records.binding.id.slice(-4)
    const response = recordResponse(state.records.binding.id)
    const button = await scrollToButton(new RegExp('绑定记录.*' + short, 's'))
    await button.click()
    const binding = await data(await response)
    assert.equal(binding.kind, 'BINDING')
    assert.equal(binding.current_status, 'ACTIVE')
    assert.equal(binding.parent_id, state.records.grant.id)
    assert.equal(binding.data.project_id, state.records.project.id)
    await page.getByRole('heading', { name: '绑定记录', exact: true }).waitFor()
    await currentShot('binding')
    assert(await (await scrollToButton('根据绑定许可投稿项目改稿')).isEnabled())
    await back()
    await back()
  })
  await check('指定买方获批阅读显示服务器水印与纯文本，不执行正文HTML', async () => {
    await page.getByRole('button', { name: /^查看记录 / }).click()
    const option = page.getByRole('menuitem', { name: '阅稿授权', exact: true })
    await option.waitFor()
    const list = page.waitForResponse(response => { const url = new URL(response.url()); return response.request().method() === 'GET' && url.pathname === '/api/v1/licensing/records' && url.searchParams.get('kind') === 'READING' })
    await option.click()
    const readings = await data(await list)
    assert(readings.items.some(row => row.id === state.records.reading.id))
    const response = recordResponse(state.records.reading.id)
    await page.goto(base + '/#/licensing/record?recordId=' + state.records.reading.id)
    const reading = await data(await response)
    assert.equal(reading.current_status, 'APPROVED')
    assert.equal(reading.data.reader_account_id, buyer.accountId)
    assert.equal(reading.counterparty_id, buyer.personalPartyId)
    assert(Date.parse(reading.data.valid_until) > Date.now())
    await page.getByRole('heading', { name: '阅稿授权', exact: true }).waitFor()
    await currentShot('reading')
    const start = await scrollToButton('开始阅读')
    assert(await start.isEnabled())
    const contentResponse = page.waitForResponse(response => response.request().method() === 'GET' && response.url().endsWith(`/api/v1/licensing/readings/${reading.id}/content`))
    await start.click()
    const raw = await contentResponse, content = await data(raw)
    assert.equal(raw.headers()['cache-control'], 'no-store')
    assert.equal(content.record_id, reading.id)
    assert.equal(content.allows_generation, false)
    for (const piece of [buyer.accountId, reading.id, '《窗前来信》第一稿', '<b>此文本不可执行</b>']) assert(content.watermarked_text.includes(piece))
    await page.getByRole('heading', { name: '受控阅读', exact: true }).waitFor()
    // Flutter paints SelectableText on its canvas; the final viewport image is
    // the rendering evidence, while the real response above verifies its text.
    await page.waitForFunction(() => [...document.querySelectorAll('[role=button]')].some(n => n.textContent === '重新核对授权并读取' && n.getAttribute('aria-disabled') !== 'true'))
    assert.equal(await page.locator('b').filter({ hasText: '此文本不可执行' }).count(), 0)
    await currentShot('reader')
    await back()
    await back()
    await back()
  })
  await check('返回新版主页面后五个tab保持完整、正确高亮与实际路由', async () => {
    const labels = ['首页', '入戏', '培育', '成角', '我的']
    for (const label of labels) {
      assert.equal(await page.getByRole('tab').count(), 5)
      await page.getByRole('tab', { name: label, exact: true }).click()
      await page.getByRole('heading', { name: label === '首页' ? '晶晶日上' : label, exact: true }).waitFor()
      await page.waitForTimeout(350)
      assert.equal(await page.getByRole('tab').count(), 5)
      assert.equal(await page.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected'), 'true')
      assert.equal(await page.getByRole('heading', { name: '页面不存在', exact: true }).count(), 0)
      routes.push(new URL(page.url()).hash.slice(1))
    }
  })
} catch (cause) {
  console.error(`App acceptance failed: ${redact(cause.message)}`)
  await shot('last-debug').catch(() => {})
  process.exitCode = 1
} finally {
  if (pageErrors.length) { results.push({ label: '浏览器未捕获错误', result: 'FAIL', errors: pageErrors.map(redact) }); process.exitCode = 1 }
  const failed = results.filter(row => row.result === 'FAIL').length
  const report = { synthetic_only: true, api: 'Real isolated HTTP/MySQL, synthetic SMS and private storage', browser: 'Real Google Chrome / Playwright', viewport: { width: 390, height: 844 }, base_url: base, app_build_sha256: buildHash,
    result: failed ? 'FAIL' : 'PASS', passed: results.filter(row => row.result === 'PASS').length, failed, checked_at: new Date().toISOString(), routes, checks: results, screenshots,
    limits: 'No injected browser sessions, production access, real payment, external e-sign or identity provider. Synthetic isolated business data only.' }
  await writeFile(resolve(evidence, 'app-runtime.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
