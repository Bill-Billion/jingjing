#!/usr/bin/env node
/** Real Flutter Web + PR15 isolated HTTP/MySQL acceptance; no native device or real charge. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR15_UI_STATE_FILE || '.local/pr15-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const base = process.env.PR15_APP_URL || 'http://127.0.0.1:8772'
for (const url of [state.apiUrl, state.controlUrl, base]) assert.equal(new URL(url).hostname, '127.0.0.1')
const evidence = resolve(root, 'docs/ux/pr15-ui/evidence'), shots = resolve(evidence, 'screenshots')
await mkdir(shots, { recursive: true })
const onlyDisplay = process.argv.includes('--only-display')
const results = [], routes = [], pageErrors = [], screenshots = [], requests = []
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage(); page.setDefaultTimeout(20000)
page.on('pageerror', error => pageErrors.push(error.message))
page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/v1/trade/')) requests.push({ path: new URL(r.url()).pathname, key: r.headers()['idempotency-key'], body: r.postData() }) })
const buyer = state.accounts.buyer
const buildHash = createHash('sha256').update(await readFile(resolve(root, '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/web/main.dart.js'))).digest('hex')
const redact = value => String(value).replaceAll(state.controlToken, '[REDACTED]').replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
async function check(label, task) {
  const start = Date.now()
  try { await task(); results.push({ label, result: 'PASS', elapsed_ms: Date.now() - start }); console.log(`✓ ${label}`) }
  catch (cause) { results.push({ label, result: 'FAIL', error: redact(cause.message).slice(0, 1500) }); throw cause }
}
async function control(route, method = 'POST') { const r = await fetch(state.controlUrl + route, { method, headers: { Authorization: `Bearer ${state.controlToken}` } }); assert(r.ok); return r.json() }
async function enable() { const p = page.locator('flt-semantics-placeholder'); await p.waitFor({ state: 'attached' }); await p.evaluate(n => n.click()); await page.getByRole('button').first().waitFor() }
async function go(route, first = false) { await page.goto(base + '/#' + route); if (first) await enable(); routes.push(route); await page.waitForTimeout(350) }
const text = value => page.getByText(value, { exact: false }).or(page.getByRole('textbox', { name: value, exact: true })).first().waitFor()
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
async function shot(name, { scrollTop = true } = {}) { if (scrollTop) await top(); await page.waitForTimeout(600); const file = `screenshots/pr15-app-${name}-mobile.png`; await page.screenshot({ path: resolve(evidence, file) }); screenshots.push({ file, viewport: page.viewportSize() }) }
const post = route => page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/trade' + route)
async function data(r) { const j = await r.json(); assert(r.ok(), `App HTTP ${r.status()} ${j.error?.code || ''}`); return j.data }
async function confirm(label, route) { await (await scrollButton(label)).click(); await page.getByRole('alertdialog').waitFor(); const r = post(route); await click('确认办理'); return data(await r) }
let order, payment, refund
// Merchant-only quote creation is a prerequisite for the buyer App, exercised via normal HTTP auth.
async function freshQuote() {
  async function actor(name) {
    const person = state.accounts[name]
    const req = async (path, body) => { const r = await fetch(state.apiUrl + '/api/v1' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) }); assert(r.ok); return (await r.json()).data }
    const challenge = await req('/auth/sms-challenges', { phone: person.phone, purpose: 'LOGIN' })
    const result = await req('/auth/sessions', { phone: person.phone, challenge_id: challenge.challenge_id, code: (await control('/code?phone=' + person.phone, 'GET')).code })
    return { ...person, token: result.access_token }
  }
  const seller = await actor('seller'), reviewer = await actor('reviewer')
  async function write(person, path, body, version, party) {
    const r = await fetch(state.apiUrl + '/api/v1/trade' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + person.token, 'Idempotency-Key': crypto.randomUUID(), ...(party ? { 'X-Acting-Party': party } : {}), ...(version ? { 'If-Match': `"${version}"` } : {}) }, body: JSON.stringify(body) }); const j = await r.json(); assert(r.ok, `${path}: ${r.status} ${j.error?.code || ''}`); return j.data
  }
  const q = await write(seller, '/quotes', { buyer_party_id: buyer.personalPartyId, lines: [{ line_id: 'production', spec_id: state.records.publishedSpec.id, quantity: 1 }], installments: [{ key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'production', amount_minor: 500000 }], apple_product_id: null }], channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: state.ruleId, expires_at: '2099-01-01T00:00:00.000Z', payment_window_minutes: 30, license_reservation_id: null }, undefined, seller.personalPartyId)
  return write(reviewer, '/records/' + q.id + '/reviews', { decision: 'APPROVED', reason: 'App浏览器买方流程的独立合成报价核对。' }, q.object_version)
}
let approvedQuote
try {
  await check('实际390×844 App短信登录并选择买方负责人身份', async () => {
    await go('/orders', true); await click('前往账号与身份'); await text('手机号登录')
    await page.getByRole('textbox', { name: /手机号/ }).click(); await page.waitForTimeout(300); await page.keyboard.type(buyer.phone, { delay: 40 })
    await click('获取验证码'); await text('验证码已发送')
    await page.getByRole('textbox', { name: /验证码/ }).click(); await page.waitForTimeout(300); await page.keyboard.type((await control('/code?phone=' + buyer.phone, 'GET')).code, { delay: 40 })
    await click('同意用户协议与隐私政策'); await click('登录 / 注册')
    await text('订单与报价')
    // The login return page asks the user to select the active OWNER identity.
    if (await page.getByRole('button', { name: '前往账号与身份', exact: true }).count()) {
      await click('前往账号与身份'); await text('选择办事身份'); await page.getByRole('button', { name: /个人 ·/ }).click()
      await page.getByRole('button', { name: /^Back/ }).first().click()
    }
    await text('当前身份：'); await page.waitForTimeout(4500); await shot('orders')
  })
  if (!onlyDisplay) {
  await check('报价原金额和规格；买方按原指纹确认，合同尚未签署', async () => {
    approvedQuote = await freshQuote()
    await go('/trade/record?recordId=' + approvedQuote.id); await text('报价详情'); await shot('quote')
    order = await confirm('确认报价形成订单', '/quotes/' + approvedQuote.id + '/acceptance')
    assert.equal(order.current_status, 'OPEN'); assert.equal(order.data.contract.signing_method, 'NOT_SIGNED'); assert.equal(order.data.financial.received_minor, 0)
    const sent = requests.find(r => r.path.endsWith('/acceptance')); assert.deepEqual(Object.keys(JSON.parse(sent.body)), ['quote_sha256']); assert.match(JSON.parse(sent.body).quote_sha256, /^[0-9a-f]{64}$/)
    await text('订单详情'); await shot('order')
    await (await scrollButton('查看原合同内容')).click(); await text('订单合同与原约定'); await shot('contract')
    await page.getByRole('button', { name: /^Back/ }).first().click()
  })
  await check('建立付款记录≠到账；实际渠道查询改变付款及订单财务事实', async () => {
    payment = await confirm('建立付款记录', '/payments'); assert.equal(payment.current_status, 'PENDING'); assert.equal(payment.order_id, order.id)
    await text('付款详情'); await shot('payment')
    await control('/payment-query?payment_id=' + payment.id + '&result=SUCCEEDED')
    payment = await confirm('核对这笔付款', '/payments/' + payment.id + '/reconciliation'); assert.equal(payment.current_status, 'SUCCEEDED')
    await top(); await text('服务器已核实成功')
  })
  await check('退款按原付款明细申请，批准前仍未退款', async () => {
    await (await scrollButton('申请逐项退款')).click(); await text('申请退款')
    await fillField(/production 退款金额/, '12.34')
    await fillField(/说明与原约定有关的原因/, '合成浏览器申请；按原约定核对，不代表真实退款。')
    await shot('refund-form'); await scrollButton('提交退款审核'); await shot('refund-form-lower', { scrollTop: false })
    refund = await confirm('提交退款审核', '/refunds'); assert.equal(refund.current_status, 'REQUESTED'); assert.equal(refund.data.amount_minor, 1234)
    const sent = requests.find(r => r.path === '/api/v1/trade/refunds'); assert.equal(JSON.parse(sent.body).payment_id, payment.id)
    await text('退款详情'); await shot('refund-requested')
  })
  await check('未知原付款和Apple等待用户申请都不伪造已付款或已退款', async () => {
    await go('/trade/record?recordId=' + state.records.unknownPayment.id); await text('结果待核实'); await shot('unknown')
    await go('/trade/record?recordId=' + state.records.appleRefund.id); await text('等待用户'); await shot('apple-refund')
  })
  await check('App付款实际503拦截返回，原内容及编号恢复为同一UNKNOWN付款', async () => {
    const unknownQuote = await freshQuote()
    await go('/trade/record?recordId=' + unknownQuote.id); await text('报价详情')
    await confirm('确认报价形成订单', '/quotes/' + unknownQuote.id + '/acceptance'); await text('订单详情')
    await control('/payment-create?result=TIMEOUT')
    const start = requests.length
    await (await scrollButton('建立付款记录')).click(); await page.getByRole('alertdialog').waitFor()
    const first = post('/payments'); await click('确认办理'); assert.equal((await first).status(), 503)
    await top(); await page.getByRole('button', { name: '恢复原请求核对', exact: true }).waitFor()
    const before = new URL(page.url()).hash; await page.getByRole('button', { name: /^Back/ }).first().click(); assert.equal(new URL(page.url()).hash, before)
    const restored = await confirm('恢复原请求核对', '/payments'); assert.equal(restored.current_status, 'UNKNOWN')
    const sent = requests.slice(start).filter(r => r.path === '/api/v1/trade/payments'); assert.equal(sent.length, 2); assert.deepEqual(sent[0], sent[1])
    await text('付款详情'); await page.getByText('操作结果尚未确认，请先恢复原请求核对。', { exact: true }).waitFor({ state: 'hidden', timeout: 1000 }); await text('结果待核实'); await shot('unknown-recovered')
  })
  }
  await check('旧单99/4901元保留原状态，私有材料不追认为到账', async () => {
    await go('/orders?kind=LEGACY'); await text('旧记录'); await shot('legacy-list')
    const response = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/trade/records/' + state.records.legacyReference.id)
    await go('/trade/record?recordId=' + state.records.legacyReference.id)
    const legacy = await data(await response); assert.deepEqual(legacy.data.original_lines.map(l => [l.amount_minor, l.reported_status]), [[9900, 'REPORTED_PAID'], [490100, 'REPORTED_UNPAID']]); assert.equal(legacy.data.payment_verified, false)
    // SelectableText paints these values on Flutter's canvas, not DOM text.
    // Verify the real response here and inspect the final screenshot for display.
    await text('不追认'); await shot('legacy')
  })
  await check('关联许可仍独立办理；五主栏目、旧许可链接和返回均进入新版', async () => {
    await go('/trade/record?recordId=' + state.records.licenseOrder.id); await text('订单详情')
    await (await scrollButton('查看关联许可')).click(); await text('许可预留与合同')
    await go('/orders?kind=GRANT'); await text('我的许可与项目')
    await go('/my'); await page.getByRole('tab', { name: '我的', exact: true }).waitFor()
    for (const label of ['首页', '入戏', '培育', '成角', '我的']) {
      await page.getByRole('tab', { name: label, exact: true }).click()
      assert.equal(await page.getByRole('tab').count(), 5)
    }
    await shot('mine')
    await page.setViewportSize({ width: 320, height: 693 }); await go('/trade/record?recordId=' + state.records.pendingPayment.id); await text('付款详情'); await shot('payment-320')
    assert.equal(await page.getByRole('tab').count(), 0)
  })
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))
} catch (cause) { console.error(redact(cause.stack)); process.exitCode = 1; await page.screenshot({ path: resolve(shots, 'debug-app.png') }).catch(() => {}) }
finally {
  await writeFile(resolve(evidence, onlyDisplay ? 'app-display-results.json' : 'app-browser-results.json'), JSON.stringify({ synthetic_only: true, native_device: 'CANCELLED_BY_USER_NOT_VERIFIED', real_payment_sdk: 'NOT_VERIFIED', build_sha256: buildHash, results, routes, pageErrors, screenshots, total: results.length, passed: results.filter(r => r.result === 'PASS').length }, null, 2) + '\n')
  await browser.close()
}
