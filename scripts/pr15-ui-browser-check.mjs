#!/usr/bin/env node
/** Real Vue + PR15 isolated HTTP/MySQL browser acceptance. Never use production. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR15_UI_STATE_FILE || '.local/pr15-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const base = process.env.PR15_WEB_URL || 'http://127.0.0.1:5204'
const onlyLogin = process.argv.includes('--only-login-return')
for (const url of [state.apiUrl, state.controlUrl, base]) assert.equal(new URL(url).hostname, '127.0.0.1')
const evidence = resolve(root, 'docs/ux/pr15-ui/evidence'), shots = resolve(evidence, 'screenshots')
await mkdir(shots, { recursive: true })
const results = [], pageErrors = [], screenshots = [], actors = {}, suffix = Date.now().toString(36)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const redact = value => {
  let text = String(value)
  for (const secret of [state.controlToken, ...Object.values(actors).map(a => a.token)].filter(Boolean)) text = text.replaceAll(secret, '[REDACTED]')
  return text.replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
}
async function check(label, task) {
  const start = Date.now()
  try { await task(); results.push({ label, result: 'PASS', elapsed_ms: Date.now() - start }); console.log(`✓ ${label}`) }
  catch (cause) { results.push({ label, result: 'FAIL', error: redact(cause.message).slice(0, 1200) }); throw cause }
}
async function control(route, method = 'POST') {
  const response = await fetch(state.controlUrl + route, { method, headers: { Authorization: `Bearer ${state.controlToken}` } })
  assert(response.ok, `private test control ${response.status}`)
  return response.json()
}
async function login(name, destination) {
  const person = state.accounts[name]
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => pageErrors.push(redact(error.message)))
  await page.goto(base + (destination || '/login'))
  if (destination) await page.waitForURL(url => url.pathname === '/login' && url.searchParams.get('redirect') === destination)
  await page.getByTestId('phone-input').fill(person.phone)
  const smsResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/sms-challenges')
  await page.getByTestId('send-code').click()
  const sms = await smsResponse; assert.equal(sms.status(), 200, 'SMS challenge must finish before reading its code')
  await page.getByTestId('code-input').waitFor()
  await page.getByTestId('code-input').fill((await control('/code?phone=' + person.phone, 'GET')).code)
  await page.getByTestId('submit-login').click()
  await page.waitForURL(url => url.pathname === (destination || '/workspace'))
  if (!destination) await page.locator(`[data-party="${person.personalPartyId}"]`).click()
  const token = await page.evaluate(() => sessionStorage.getItem('ops.session.token')); assert(token)
  return actors[name] = { ...person, token, page, context }
}
async function api(person, method, route, body, { party = person.personalPartyId, version, key = randomUUID() } = {}) {
  const response = await fetch(state.apiUrl + '/api/v1' + route, { method,
    headers: { Authorization: `Bearer ${person.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key,
      ...(party ? { 'X-Acting-Party': party } : {}), ...(version ? { 'If-Match': `"${version}"` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const parsed = await response.json(); assert(response.ok, `${method} ${route}: ${response.status} ${parsed.error?.code || ''}`)
  return parsed.data
}
async function ready(page) { await page.getByText('正在读取身份与交易记录…', { exact: true }).waitFor({ state: 'hidden' }) }
async function go(page, route) { await page.goto(base + route); await page.locator('.workspace-nav').waitFor(); if (route.startsWith('/trade/')) await ready(page) }
const post = (page, route) => page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/trade' + route)
async function data(response) { const parsed = await response.json(); assert(response.ok(), `UI HTTP ${response.status()} ${parsed.error?.code || ''}`); return parsed.data }
async function shot(page, name) {
  const file = `screenshots/pr15-web-${name}.png`
  await ready(page)
  await page.screenshot({ path: resolve(evidence, file), fullPage: true }); screenshots.push({ file, viewport: page.viewportSize() })
}
async function run() {
  if (onlyLogin) {
    await check('未登录直达退款申请，正常短信登录后返回原新版页面', async () => {
      const returned = await login('member', '/trade/refunds/new')
      await returned.page.getByRole('heading', { name: '退款申请', exact: true }).waitFor()
      assert.equal(new URL(returned.page.url()).pathname, '/trade/refunds/new')
    }); return
  }
  const seller = await login('seller'), buyer = await login('buyer'), reviewer = await login('reviewer'), legacyReviewer = await login('legacyReviewer')
  let spec, quote, order, payment, refund, legacy, conflictOrder
  const field = (page, name) => page.getByLabel(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  async function reviewRecord(record, section, who = reviewer) {
    const p = who.page; await go(p, `/trade/reviews/${section}/${record.id}`)
    await p.getByTestId('trade-review-decision').selectOption('APPROVED')
    await p.getByTestId('trade-review-reason').fill('隔离浏览器测试独立核对；合成资料，不能用于正式业务。')
    await shot(p, `review-${section}-desktop`)
    const r = post(p, `/records/${record.id}/reviews`)
    await p.getByRole('button', { name: '提交独立审核', exact: true }).click(); return data(await r)
  }
  await check('商家真实表单提交明确规格；版本独立审核', async () => {
    const p = seller.page; await go(p, '/trade/specifications/new')
    await field(p, '商品名称').fill('浏览器服务规格 ' + suffix + '（合成）')
    await field(p, '实际提供方主体编号').fill(seller.personalPartyId)
    await field(p, '服务明细类型').selectOption('OTHER')
    await field(p, '服务单价（人民币分）').fill('6000')
    await field(p, '服务档位').fill('明确合成服务档位')
    await field(p, '规格版本').fill('browser.1')
    await field(p, '样片时长（秒）').fill('0'); await field(p, '成片时长（秒）').fill('0'); await field(p, '可修改次数').fill('0')
    await field(p, '约定交付内容').fill('合成交付说明\n合成原条款核对记录')
    await field(p, '完整条款').fill('仅本机隔离测试，无真实收费、制作或许可。价格与数量由本次表单明确填写。')
    await shot(p, 'spec-form-desktop')
    const r = post(p, '/specifications'); await p.getByRole('button', { name: '提交规格审核', exact: true }).click(); spec = await data(await r)
    assert.equal(spec.current_status, 'IN_REVIEW'); assert.equal(spec.data.unit_minor, 6000)
    spec = await reviewRecord(spec, 'specifications'); assert.equal(spec.current_status, 'PUBLISHED')
  })
  await check('报价多行规格、数量及逐项分摊；独立审核不会建立订单', async () => {
    const p = seller.page; await go(p, '/trade/quotes/new')
    await field(p, '买方主体编号').fill(buyer.personalPartyId); await field(p, '规则编号').fill(state.ruleId)
    await field(p, '明细编号').fill('first-line'); await field(p, '已审服务规格').selectOption(spec.id); await field(p, '数量').fill('1')
    await p.getByRole('button', { name: '添加服务明细', exact: true }).click()
    await field(p, '明细编号').nth(1).fill('second-line'); await field(p, '已审服务规格').nth(1).selectOption(spec.id); await field(p, '数量').nth(1).fill('2')
    await field(p, '分期名称').fill('browser-first'); await field(p, '付款触发条件').selectOption('ORDER_ACCEPTED')
    await field(p, '关联明细编号').selectOption('first-line'); await field(p, '本期分摊金额').fill('6000')
    await p.getByRole('button', { name: '添加分摊', exact: true }).click()
    await field(p, '关联明细编号').nth(1).selectOption('second-line'); await field(p, '本期分摊金额').nth(1).fill('12000')
    await field(p, '交易责任方式').selectOption('DIRECT_SUPPLIER'); await field(p, '支付渠道').selectOption('ALIPAY')
    await field(p, '报价截止时间').fill('2099-01-01T18:00'); await field(p, '支付窗口（分钟）').fill('30')
    await shot(p, 'quote-form-desktop')
    const r = post(p, '/quotes'); await p.getByRole('button', { name: '提交报价审核', exact: true }).click(); quote = await data(await r)
    assert.equal(quote.data.lines.length, 2); assert.equal(quote.data.total_minor, 18000); assert.equal(quote.current_status, 'IN_REVIEW')
    quote = await reviewRecord(quote, 'quotes'); assert.equal(quote.current_status, 'APPROVED')
    await go(p, '/trade/quotes'); await shot(p, 'quotes-desktop')
  })
  await check('买方按当前报价指纹确认；断流后从原报价恢复已知订单且阻止普通换页', async () => {
    const p = buyer.page, seen = []
    await go(p, '/trade/quotes/' + quote.id)
    await field(p, '我已核对本报价的服务').check(); await shot(p, 'quote-confirm-desktop')
    const observe = r => { if (r.method() === 'POST' && r.url().endsWith('/acceptance')) seen.push({ key: r.headers()['idempotency-key'], body: r.postData() }) }; p.on('request', observe)
    await p.evaluate(() => { const original = Response.prototype.text; Response.prototype.text = async function () { const t = await original.call(this); if (this.url.endsWith('/acceptance')) { Response.prototype.text = original; throw new TypeError('synthetic disconnect after real order commit') } return t } })
    const r = post(p, '/quotes/' + quote.id + '/acceptance'); await p.getByRole('button', { name: '确认报价并建立订单', exact: true }).click(); order = await data(await r)
    assert.equal(order.current_status, 'OPEN'); assert.equal(order.data.contract.signing_method, 'NOT_SIGNED')
    await p.getByRole('button', { name: '先核对原记录', exact: true }).waitFor()
    await p.locator('.workspace-nav').getByRole('link', { name: '我的作品', exact: true }).click()
    await p.getByText('原操作结果尚未核对', { exact: false }).first().waitFor(); assert(new URL(p.url()).pathname.endsWith(quote.id))
    await p.getByRole('button', { name: '先核对原记录', exact: true }).click(); await p.waitForURL('**/trade/orders/' + order.id)
    assert.equal(seen.length, 1); assert.deepEqual(JSON.parse(seen[0].body), { quote_sha256: quote.content_sha256 }); p.off('request', observe)
    await p.getByText('合同内容已保存，尚未签署', { exact: false }).first().waitFor(); await shot(p, 'order-desktop')
  })
  await check('付款实际503保留原请求；核对列表再同编号重试，返回UNKNOWN原付款', async () => {
    const p = buyer.page, seen = []; await go(p, '/trade/payments/new')
    await p.getByTestId('trade-order-id').fill(order.id); await p.getByRole('button', { name: '读取原订单', exact: true }).click()
    await p.getByTestId('trade-installment').selectOption('browser-first'); await shot(p, 'payment-create-desktop')
    await control('/payment-create?result=TIMEOUT')
    const observe = r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/trade/payments') seen.push({ key: r.headers()['idempotency-key'], body: r.postData() }) }; p.on('request', observe)
    const first = post(p, '/payments'); await p.getByRole('button', { name: '建立本期付款记录', exact: true }).click(); assert.equal((await first).status(), 503)
    await p.getByRole('button', { name: '先核对原记录', exact: true }).click()
    const second = post(p, '/payments'); await p.getByRole('button', { name: '使用原编号重试', exact: true }).click(); payment = await data(await second)
    assert.equal(payment.current_status, 'UNKNOWN'); assert.equal(seen.length, 2); assert.deepEqual(seen[0], seen[1]); p.off('request', observe)
    await p.waitForURL('**/trade/payments/' + payment.id); await shot(p, 'payment-unknown-desktop')
  })
  await check('实际付款核实入账；原订单收款准确且不自报制作完成', async () => {
    const p = buyer.page; await control('/payment-query?payment_id=' + payment.id + '&result=SUCCEEDED')
    const r = post(p, '/payments/' + payment.id + '/reconciliation'); await p.getByRole('button', { name: '核实支付结果', exact: true }).click(); payment = await data(await r)
    assert.equal(payment.current_status, 'SUCCEEDED'); await go(p, '/trade/orders/' + order.id)
    order = await api(buyer, 'GET', '/trade/records/' + order.id); assert.equal(order.data.financial.received_minor, 18000); assert.equal(order.current_status, 'PAID')
    await p.getByRole('button', { name: '制作交付尚未开放', exact: true }).waitFor(); await shot(p, 'order-paid-desktop')
  })
  await check('退款逐项金额→独立复核→单独执行→实际渠道核实', async () => {
    const p = buyer.page; await go(p, '/trade/refunds/new'); await p.getByTestId('trade-refund-payment').selectOption(payment.id)
    await p.getByRole('button', { name: '读取原付款与明细', exact: true }).click()
    await field(p, '退款金额（人民币分）').first().fill('1234'); await field(p, '本次退款原因').fill('按原条款合成测试退款，无真实资金。'); await shot(p, 'refund-form-desktop')
    const r = post(p, '/refunds'); await p.getByRole('button', { name: '提交退款申请', exact: true }).click(); refund = await data(await r)
    assert.equal(refund.current_status, 'REQUESTED'); assert.equal(refund.data.amount_minor, 1234)
    refund = await reviewRecord(refund, 'refunds'); assert.equal(refund.current_status, 'APPROVED')
    const rp = reviewer.page; await field(rp, '我已核对已批准的原退款明细').check()
    const exec = post(rp, '/refunds/' + refund.id + '/execution'); await rp.getByRole('button', { name: '执行已审退款', exact: true }).click(); refund = await data(await exec)
    assert.equal(refund.current_status, 'PENDING'); await control('/refund-query?refund_id=' + refund.id + '&result=SUCCEEDED')
    await go(p, '/trade/refunds/' + refund.id); const verify = post(p, '/refunds/' + refund.id + '/reconciliation'); await p.getByRole('button', { name: '核实已有退款结果', exact: true }).click(); refund = await data(await verify)
    assert.equal(refund.current_status, 'SUCCEEDED'); order = await api(buyer, 'GET', '/trade/records/' + order.id); assert.equal(order.data.financial.refunded_minor, 1234)
    await shot(p, 'refund-result-desktop')
  })
  await check('历史99/4901元原条款登记、另一账号审核和私有原始材料下载', async () => {
    const p = reviewer.page; await go(p, '/trade/legacy/new')
    await field(p, '原系统名称').fill('synthetic.browser'); await field(p, '原订单编号').fill('99.4901.' + suffix)
    await field(p, '买方主体编号').fill(buyer.personalPartyId); await field(p, '商家主体编号').fill(seller.personalPartyId)
    await field(p, '明细编号').fill('sample'); await field(p, '原金额（人民币分）').fill('9900'); await field(p, '原系统申报状态').selectOption('REPORTED_PAID')
    await p.getByRole('button', { name: '添加原明细', exact: true }).click()
    await field(p, '明细编号').nth(1).fill('final'); await field(p, '原金额（人民币分）').nth(1).fill('490100'); await field(p, '原系统申报状态').nth(1).selectOption('REPORTED_UNPAID')
    await field(p, '原条款').fill('按原系统保留99元样片、4901元成片。仅材料依据，不能追认为渠道到账。'); await field(p, '原始证明编号').fill(state.assets.legacyEvidence.id)
    await shot(p, 'legacy-form-desktop'); const r = post(p, '/legacy-orders'); await p.getByRole('button', { name: '登记历史订单', exact: true }).click(); legacy = await data(await r)
    assert.equal(legacy.data.payment_verified, false); legacy = await reviewRecord(legacy, 'legacy', legacyReviewer); assert.equal(legacy.current_status, 'VERIFIED_REFERENCE_ONLY')
    const lp = legacyReviewer.page, download = lp.waitForEvent('download'); await lp.getByRole('button', { name: '下载本单私有原始材料', exact: true }).click(); assert((await download).suggestedFilename().includes(state.assets.legacyEvidence.id))
    await shot(lp, 'legacy-reviewed-desktop')
  })
  await check('撤销独立退款权限后清理已读私有记录，普通身份不取得审核权限', async () => {
    const p = reviewer.page; await go(p, '/trade/reviews/refunds/' + state.records.requestedRefund.id); await p.getByRole('heading', { name: '本次退款申请', exact: true }).waitFor()
    await control('/reviewer-permission?action=TRADE_REFUND&enabled=false')
    try {
      await p.getByRole('button', { name: '刷新当前记录', exact: true }).click(); await p.getByRole('alert').first().waitFor()
      assert.equal(await p.getByRole('heading', { name: '本次退款申请', exact: true }).count(), 0)
    } finally { await control('/reviewer-permission?action=TRADE_REFUND&enabled=true') }
  })
  await check('真实412重新读最新报价，清空原确认且不自动重放', async () => {
    let q = await api(seller, 'POST', '/trade/quotes', { buyer_party_id: buyer.personalPartyId, lines: [{ line_id: 'one', spec_id: spec.id, quantity: 1 }], installments: [{ key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'one', amount_minor: 6000 }], apple_product_id: null }], channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: state.ruleId, expires_at: '2099-01-01T00:00:00.000Z', payment_window_minutes: 30, license_reservation_id: null })
    q = await api(reviewer, 'POST', '/trade/records/' + q.id + '/reviews', { decision: 'APPROVED', reason: '本地版本冲突检查，合成资料。' }, { party: null, version: q.object_version })
    const p = buyer.page; await go(p, '/trade/quotes/' + q.id); await field(p, '我已核对本报价的服务').check()
    conflictOrder = await api(buyer, 'POST', '/trade/quotes/' + q.id + '/acceptance', { quote_sha256: q.content_sha256 }, { version: q.object_version })
    const r = post(p, '/quotes/' + q.id + '/acceptance'); await p.getByRole('button', { name: '确认报价并建立订单', exact: true }).click(); assert.equal((await r).status(), 412)
    await field(p, '我已核对最新记录').waitFor(); assert.equal(await field(p, '我已核对本报价的服务').isChecked(), false)
    assert(await p.getByRole('button', { name: '确认报价并建立订单', exact: true }).isDisabled())
  })
  await check('取消无付款订单保留原理由；Apple等待申请不显示已退款', async () => {
    const p = buyer.page; await go(p, '/trade/orders/' + conflictOrder.id)
    await field(p, '取消理由').fill('本地合成订单不继续办理。'); const r = post(p, '/orders/' + conflictOrder.id + '/cancellation')
    await p.getByRole('button', { name: '取消未付款订单', exact: true }).click(); assert.equal((await data(await r)).current_status, 'CANCELLED')
    await go(p, '/trade/refunds/' + state.records.appleRefund.id); await p.getByText('等待用户在 Apple', { exact: false }).first().waitFor(); await shot(p, 'apple-refund-desktop')
  })
  await check('共用菜单全部入口稳定，无旧壳；窄屏与登录返回进入新路由', async () => {
    const p = buyer.page; await go(p, '/trade/orders')
    const links = await p.locator('.workspace-nav a').evaluateAll(nodes => nodes.map(n => ({ label: n.textContent.trim(), href: n.getAttribute('href') })))
    for (const link of links) { await p.locator('.workspace-nav').getByRole('link', { name: link.label, exact: true }).click(); await p.waitForURL('**' + link.href); assert.equal(await p.locator('.workspace-nav a').count(), links.length); assert.equal(await p.locator('.workspace-nav a[aria-current="page"]').count(), 1); assert.equal(await p.getByRole('heading', { name: '页面不存在', exact: true }).count(), 0) }
    await p.setViewportSize({ width: 390, height: 844 }); await go(p, '/trade/orders/' + order.id); await shot(p, 'order-mobile')
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await go(p, '/trade/payments/' + payment.id); await shot(p, 'payment-mobile')
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const returned = await login('member', '/trade/refunds/new')
    await returned.page.getByRole('heading', { name: '退款申请', exact: true }).waitFor()
    assert.equal(new URL(returned.page.url()).pathname, '/trade/refunds/new')
  })
}
try {
  await run()
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))
} catch (cause) {
  console.error(redact(cause.stack)); process.exitCode = 1
  for (const [name, a] of Object.entries(actors)) await a.page.screenshot({ path: resolve(shots, `debug-${name}.png`), fullPage: true }).catch(() => {})
} finally {
  await writeFile(resolve(evidence, onlyLogin ? 'web-login-return-results.json' : 'web-browser-results.json'), JSON.stringify({ synthetic_only: true, source: 'Vue UI → actual isolated HTTP/MySQL; synthetic external transports', results, pageErrors, screenshots, total: results.length, passed: results.filter(r => r.result === 'PASS').length }, null, 2) + '\n')
  await browser.close()
}
