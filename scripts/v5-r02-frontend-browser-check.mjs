#!/usr/bin/env node
// Real Flutter/Vue pages share one isolated MySQL story; no fixture tokens in results.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(join(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
assert(process.env.CUSTOMIZATION_ACCESS_FILE, 'Use this invocation of customization-sandbox')
const fixture = JSON.parse(await readFile(process.env.CUSTOMIZATION_ACCESS_FILE, 'utf8'))
assert.equal(fixture.synthetic_only, true)
assert.equal(new URL(fixture.base_url).hostname, '127.0.0.1')
assert.equal(new URL(fixture.base_url).protocol, 'http:')
const requestId = process.env.CUSTOMIZATION_REQUEST_ID
assert(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId || ''), 'Use the story just submitted in the R01 App browser check')
const web = process.env.CUSTOMIZATION_WEB_URL || 'http://127.0.0.1:5173'
const app = process.env.CUSTOMIZATION_APP_URL || 'http://127.0.0.1:5000'
assert.equal(new URL(web).origin, 'http://127.0.0.1:5173')
assert(['http://127.0.0.1:5000', 'http://127.0.0.1:5500'].includes(new URL(app).origin), 'Local App acceptance port only')
const output = resolve(process.env.CUSTOMIZATION_EVIDENCE_DIR || join(root, 'output/playwright/v5-r02'))
await mkdir(output, { recursive: true })
const checks = [], errors = [], writes = [], screenshots = [], contexts = []
const check = (name, value = true) => { assert(value, name); checks.push(name); console.log('✓ ' + name) }
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function api(who, path, party = null) {
  const r = await fetch(fixture.base_url + path, { headers: { Authorization: 'Bearer ' + fixture.accounts[who].bearer_token, ...(party ? { 'X-Acting-Party': party } : {}) }, signal: AbortSignal.timeout(10000) })
  assert(r.ok, `Real sandbox GET ${path}: ${r.status}`)
  return (await r.json()).data
}
async function received(r) { assert(r.ok(), `Real UI HTTP ${r.status()}`); return (await r.json()).data }
function response(page, method, path) {
  const p = page.waitForResponse(r => r.request().method() === method && new URL(r.url()).pathname === '/api/v1' + path)
  p.catch(() => {})
  return p
}
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' })
function observe(page, label) {
  page.on('pageerror', e => errors.push({ page: label, message: e.message }))
  page.on('request', r => {
    if (r.url().startsWith(fixture.base_url) && !['GET', 'OPTIONS'].includes(r.method())) {
      const h = r.headers()
      writes.push({ page: label, method: r.method(), path: new URL(r.url()).pathname, body_sha256: sha(r.postData()), key: h['idempotency-key'] || null, version: h['if-match'] || null, acting_party: h['x-acting-party'] || null, bearer_present: !!h.authorization })
    }
  })
}
async function shot(page, name, fullPage = false) {
  await page.evaluate(() => document.fonts.ready)
  // Flutter route slides can outlast the successful HTTP response.
  await page.waitForTimeout(500)
  const text = await page.locator('body').innerText()
  for (const a of Object.values(fixture.accounts)) assert(!text.includes(a.bearer_token), 'No credentials in visible content')
  await page.screenshot({ path: join(output, name + '.png'), fullPage }); screenshots.push(name + '.png')
}
async function webPage(role, path, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, locale: 'zh-CN' })
  contexts.push(context)
  const account = fixture.accounts[role]
  await context.addInitScript(({ account, merchant }) => {
    sessionStorage.setItem('ops.session.token', account.bearer_token)
    sessionStorage.setItem('ops.session.selected', merchant || account.party_id)
  }, { account, merchant: role === 'merchant' ? fixture.trade.merchant_party_id : null })
  const page = await context.newPage(); observe(page, role)
  await page.goto(web + path)
  return page
}
async function appPage(path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
  contexts.push(context)
  const page = await context.newPage(); observe(page, 'App buyer')
  await page.goto(app + '/#' + path)
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' })
  await page.locator('flt-semantics-placeholder').evaluate(e => e.click())
  await page.getByRole('button').first().waitFor()
  await page.waitForLoadState('networkidle')
  return page
}
async function press(page, locator) {
  for (let n = 0; n < 50; n++) {
    const box = await locator.count() ? await locator.boundingBox() : null
    if (box && box.y + box.height / 2 > 65 && box.y + box.height / 2 < 820) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(150); return
    }
    await page.mouse.move(185, 450); await page.mouse.wheel(0, box?.y < 65 ? -260 : 260); await page.waitForTimeout(130)
  }
  throw new Error('Flutter control did not enter viewport: ' + await locator.count())
}
async function fillApp(page, locator, value) {
  await press(page, locator)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.insertText(value)
  await page.keyboard.press('Tab')
}
async function topApp(page) {
  await page.mouse.move(185, 350); await page.mouse.wheel(0, -20000); await page.waitForTimeout(200)
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
let quoteId = null, orderId = null, failure = null, firstSubmission = null, latestSubmission = null
try {
  const buyer = fixture.accounts.buyer.party_id
  const original = await api('buyer', '/customization-requests/' + requestId, buyer)
  assert.equal(original.current_status, 'SUBMITTED')
  firstSubmission = original.submission
  // The stage functions below exercise UI writes; direct GETs only confirm facts.
  const operator = await webPage('operator', '/operations/customization/' + requestId)
  await operator.getByTestId('customization-submission').waitFor()
  let waiting = response(operator, 'POST', '/operations/customization-requests/' + requestId + '/intake')
  await operator.getByTestId('customization-intake').click(); await received(await waiting)
  await operator.getByTestId('customization-supplement-field-0').selectOption('story')
  const reason = '合成验收：请说明重逢的时间顺序'
  const instruction = '请补充故事结尾，并逐项说明这次修改。'
  await operator.getByTestId('customization-supplement-reason-0').fill(reason)
  await operator.getByTestId('customization-supplement-instruction-0').fill(instruction)
  waiting = response(operator, 'POST', '/operations/customization-requests/' + requestId + '/supplements')
  await operator.getByTestId('customization-supplement-submit').click(); await received(await waiting)
  check('运营在实际受理后为原模板字段提出逐项补件', (await api('buyer', '/customization-requests/' + requestId + '/supplement', buyer)).supplement.items[0].instruction === instruction)
  check('发补件不改第一版正式故事', sha((await api('buyer', '/customization-requests/' + requestId, buyer)).submission) === sha(firstSubmission))
  await shot(operator, 'web-supplement-desktop')
  await operator.setViewportSize({ width: 390, height: 844 })
  await operator.getByTestId('customization-supplement-context').scrollIntoViewIfNeeded()
  check('运营补件在390视口内可读且无页面横向溢出', await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await shot(operator, 'web-supplement-390')

  let user = await appPage('/customization/' + requestId)
  await user.getByText('还需要你补充一些内容', { exact: true }).waitFor()
  const finalStory = '合成第二轮故事：一家人在毕业十年后重逢，按约定补上时间线和故事结尾。'
  const reply = '已经补充重逢时间、先后顺序及结尾，请重新查看。'
  // The reply's accessible label also includes the requested story field name.
  // In this family template the reply is first and the actual story input is last.
  assert.equal(await user.getByRole('textbox').count(), 2)
  await fillApp(user, user.getByRole('textbox').last(), finalStory)
  await fillApp(user, user.getByRole('textbox', { name: /这一项的回复/ }), reply)
  // Let the real server commit the save, then lose its response once.
  let lostResponse = false
  const savePath = '/api/v1/customization-requests/' + requestId + '/supplement'
  await user.route('**' + savePath, async route => {
    if (route.request().method() !== 'PATCH' || lostResponse) { await route.continue(); return }
    lostResponse = true
    const committed = await route.fetch(); assert(committed.ok(), 'Lost response must follow a real successful save')
    await route.abort('failed')
  })
  await press(user, button(user, '保存补充草稿'))
  await button(user, '重试原操作').waitFor()
  check('补件保存响应丢失后保留原操作供核对', lostResponse)
  waiting = response(user, 'PATCH', '/customization-requests/' + requestId + '/supplement')
  await press(user, button(user, '重试原操作')); await received(await waiting)
  const saves = writes.filter(w => w.page === 'App buyer' && w.method === 'PATCH' && w.path === savePath)
  check('未知结果重试沿用原键、原正文与原版本', saves.length === 2 && saves[0].key === saves[1].key && saves[0].body_sha256 === saves[1].body_sha256 && saves[0].version === saves[1].version)
  const saved = await api('buyer', '/customization-requests/' + requestId + '/supplement', buyer)
  check('补件保存完整保留故事、原选项和逐项回复', saved.draft.answers.story === finalStory && saved.draft.answers.tone === '温暖' && saved.draft.responses.story === reply)
  check('私有补件草稿不暴露给运营', (await api('operator', '/customization-requests/' + requestId + '/supplement')).draft === null)
  check('保存草稿尚未改变正式稿', sha((await api('buyer', '/customization-requests/' + requestId, buyer)).submission) === sha(firstSubmission))
  await shot(user, 'app-supplement-saved-390')
  await user.context().close(); contexts.splice(contexts.indexOf(user.context()), 1)
  user = await appPage('/customization/' + requestId)
  await user.getByText('还需要你补充一些内容', { exact: true }).waitFor()
  await press(user, user.getByRole('textbox').last())
  check('重新打开恢复已保存补充内容', await user.getByRole('textbox').evaluateAll((nodes, expected) => nodes.some(n => n.value === expected), finalStory))
  await press(user, user.getByRole('textbox', { name: /这一项的回复/ }))
  check('重新打开恢复逐项回复', await user.getByRole('textbox').evaluateAll((nodes, expected) => nodes.some(n => n.value === expected), reply))
  waiting = response(user, 'POST', '/customization-requests/' + requestId + '/supplement-submissions')
  await press(user, button(user, '正式重提补充'))
  await user.getByRole('alertdialog').waitFor(); await press(user, button(user, '确认'))
  await received(await waiting)
  const resubmitted = await api('buyer', '/customization-requests/' + requestId, buyer)
  latestSubmission = resubmitted.submission
  check('正式重提产生新快照并回到平台待查看', resubmitted.current_status === 'SUBMITTED' && latestSubmission.id !== firstSubmission.id && latestSubmission.answers.story === finalStory)
  const versions = await api('buyer', '/customization-requests/' + requestId + '/submissions', buyer)
  check('正式历史保留两版且不重复提交', versions.items.length === 2)
  const old = await api('buyer', '/customization-requests/' + requestId + '/submissions/' + firstSubmission.id, buyer)
  check('重提后第一版快照和摘要保持原样', sha(old.submission) === sha(firstSubmission))
  await shot(user, 'app-supplement-resubmitted-390')

  await operator.setViewportSize({ width: 1440, height: 1000 })
  await operator.reload()
  await operator.getByTestId('customization-formal-response').waitFor()
  check('运营只在正式重提后读到新故事和正式回复', (await operator.getByTestId('customization-submission').innerText()).includes(finalStory) && (await operator.getByTestId('customization-formal-response').innerText()).includes(reply))
  waiting = response(operator, 'POST', '/operations/customization-requests/' + requestId + '/intake')
  await operator.getByTestId('customization-intake').click(); await received(await waiting)
  check('新版本经运营实际重新受理', (await api('operator', '/customization-requests/' + requestId)).current_status === 'INTAKE')
  await operator.getByTestId('customization-load-history').click()
  await operator.getByTestId('customization-history-1').click()
  await operator.getByTestId('customization-history-version').filter({ hasText: '第 1 版' }).waitFor()
  check('运营可回看第一版正式故事', (await operator.getByTestId('customization-history').innerText()).includes(firstSubmission.answers.story))
  await operator.getByTestId('customization-history-2').click()
  await operator.getByTestId('customization-history-version').filter({ hasText: '第 2 版' }).waitFor()
  check('第二版历史带当时补件原因及正式回复', (await operator.getByTestId('customization-history').innerText()).includes(reply) && (await operator.getByTestId('customization-history').innerText()).includes(reason))
  await shot(operator, 'web-formal-history-desktop')

  const merchant = await webPage('merchant', '/operations/customization/' + requestId)
  await merchant.getByTestId('customization-create-quote').click()
  await merchant.getByTestId('trade-customization-source').waitFor()
  check('从故事进入平台报价时自动绑定当前正式提交', (await merchant.getByTestId('trade-customization-source').innerText()).includes(latestSubmission.id))
  await merchant.getByTestId('trade-quote-rule').fill(fixture.trade.rule_id)
  await merchant.getByTestId('trade-quote-line-0').fill('production')
  await merchant.getByTestId('trade-quote-spec-0').selectOption(fixture.trade.specification_id)
  await merchant.getByTestId('trade-quote-quantity-0').fill('1')
  for (let n = 0; n < 3; n++) {
    await merchant.getByTestId('trade-quote-installment-key-' + n).fill(['first', 'interim', 'last'][n])
    await merchant.getByTestId('trade-quote-allocation-line-' + n + '-0').selectOption('production')
    await merchant.getByTestId('trade-quote-allocation-amount-' + n + '-0').fill(['30.00', '60.00', '10.01'][n])
  }
  await merchant.getByTestId('trade-quote-channel').selectOption('ALIPAY')
  const expiry = new Date(Date.now() + 1800000)
  const localExpiry = new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  await merchant.getByTestId('trade-quote-expires').fill(localExpiry)
  await merchant.getByTestId('trade-quote-window').fill('30')
  await shot(merchant, 'web-story-quote-form-desktop', true)
  if (process.env.CUSTOMIZATION_VISUAL_CAPTURE === '1') { await merchant.setViewportSize({ width: 390, height: 844 }); await shot(merchant, 'web-story-quote-form-390', true); await merchant.setViewportSize({ width: 1440, height: 1000 }) }
  waiting = response(merchant, 'POST', '/trade/quotes')
  await merchant.getByTestId('trade-quote-submit').click()
  const quoted = await received(await waiting); quoteId = quoted.id
  check('平台按第二版故事和已批准商品提交报价', quoted.current_status === 'IN_REVIEW' && quoted.data.customization.submission_id === latestSubmission.id && quoted.data.lines[0].product_profile.type === 'PRIVATE_CUSTOMIZATION')
  check('报价保存明确三期金额与同一财务约定', quoted.data.installments.map(i => i.allocations[0].amount_minor).join(',') === '3000,6000,1001' && quoted.data.customization_finance.rule_snapshot.content.id === fixture.trade.rule_id)
  const reviewer = await webPage('reviewer', '/trade/reviews/quotes/' + quoteId)
  await reviewer.getByTestId('trade-review-decision').selectOption('APPROVED')
  await reviewer.getByTestId('trade-review-reason').fill('仅合成验收：独立核对同一故事版本和明确规格、价格、财务条款。')
  if (process.env.CUSTOMIZATION_VISUAL_CAPTURE === '1') { await shot(reviewer, 'web-independent-quote-pending-desktop', true); await reviewer.setViewportSize({ width: 390, height: 844 }); await shot(reviewer, 'web-independent-quote-pending-390', true); await reviewer.setViewportSize({ width: 1440, height: 1000 }) }
  waiting = response(reviewer, 'POST', '/trade/records/' + quoteId + '/reviews')
  await reviewer.getByTestId('trade-review-submit').click()
  const approved = await received(await waiting)
  check('另一位独立人员通过真实网页复核报价', approved.current_status === 'APPROVED' && approved.data.review.account_id === fixture.accounts.reviewer.account_id && approved.created_by === fixture.accounts.merchant.account_id)
  await shot(reviewer, 'web-independent-quote-review-desktop', true)

  await user.context().close(); contexts.splice(contexts.indexOf(user.context()), 1)
  user = await appPage('/customization/' + requestId)
  await press(user, button(user, '查看这份需求的报价与订单'))
  await press(user, button(user, '查看规格、价格与条款'))
  if (process.env.CUSTOMIZATION_VISUAL_CAPTURE === '1') { await topApp(user); await shot(user, 'app-quote-detail-390') }
  await press(user, button(user, '确认报价形成订单'))
  await user.getByRole('alertdialog').waitFor()
  waiting = response(user, 'POST', '/trade/quotes/' + quoteId + '/acceptance')
  await press(user, button(user, '确认办理'))
  const ordered = await received(await waiting); orderId = ordered.id
  await topApp(user)
  await user.getByText(/^订单已生成，合同内容已保存/).waitFor()
  check('App确认同一报价后形成未付款、未签署订单', ordered.current_status === 'OPEN' && ordered.data.financial.received_minor === 0 && ordered.data.contract.signing_method === 'NOT_SIGNED')
  check('真实App订单页说明未签署且尚未开放定制付款', (await user.locator('body').ariaSnapshot()).includes('尚未签署') && await button(user, '确认报价形成订单').count() === 0)
  check('订单固定第二版故事与原报价财务快照', ordered.data.quote.customization.submission_id === latestSubmission.id && ordered.data.quote.customization_finance.rule_snapshot.content.content_sha256 === quoted.data.customization_finance.rule_snapshot.content.content_sha256)
  await shot(user, 'app-unpaid-order-390')
  await user.context().close(); contexts.splice(contexts.indexOf(user.context()), 1)
  user = await appPage('/customization/' + requestId)
  await press(user, button(user, '查看这份需求的报价与订单'))
  await press(user, button(user, '查看已形成的原订单'))
  await topApp(user)
  await user.getByText(/^订单已生成，合同内容已保存/).waitFor()
  check('重新打开需求可以进入已形成的同一订单', (await api('buyer', '/customization-requests/' + requestId + '/quotes', buyer)).items.filter(q => q.order_id === orderId).length === 1)
  check('只发生一次真实订单确认', writes.filter(w => w.path === '/api/v1/trade/quotes/' + quoteId + '/acceptance').length === 1)
  await shot(user, 'app-restored-order-390')

  await reviewer.goto(web + '/finance/marketplace-preview')
  await reviewer.getByTestId('finance-preview-rule').fill(fixture.finance_preview.rule_id)
  await reviewer.getByTestId('finance-preview-supplier').fill(fixture.finance_preview.supplier_party_id)
  await reviewer.getByTestId('finance-preview-net').fill(String(fixture.finance_preview.net_minor))
  waiting = response(reviewer, 'GET', '/finance/marketplace-preview')
  await reviewer.getByTestId('finance-preview-submit').click()
  const preview = await received(await waiting)
  await reviewer.getByTestId('finance-preview-result').waitFor()
  check('财务页面显示服务器只读两层试算', preview.meaning === 'PREVIEW_ONLY_NOT_ORDER_OR_PAYABLE' && preview.amounts.entries.reduce((sum, e) => sum + e.amount_minor, 0) === fixture.finance_preview.net_minor)
  check('试算没有发起财务写入或真实付款', !writes.some(w => /\/(finance|trade\/payments)\//.test(w.path)))
  await shot(reviewer, 'web-finance-preview-desktop')
  await reviewer.setViewportSize({ width: 390, height: 844 })
  await reviewer.getByTestId('finance-preview-result').scrollIntoViewIfNeeded()
  check('财务试算390视口无页面横向溢出', await reviewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await shot(reviewer, 'web-finance-preview-390')
  check('所有实际写入携带幂等键与必要版本', writes.every(w => w.bearer_present && w.key && (w.path.endsWith('/trade/quotes') || /^"\d+"$/.test(w.version || ''))))
  check('运营补件受理与复核均不携带代办主体头', writes.filter(w => w.page === 'operator' || w.page === 'reviewer').every(w => !w.acting_party))
  check('浏览器无未处理页面异常', errors.length === 0)
} catch (e) {
  failure = e.message; process.exitCode = 1
  console.error(e.stack)
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages().at(-1)
    if (page) {
      await page.screenshot({ path: join(output, 'debug-' + i + '.png') }).catch(() => {})
      await writeFile(join(output, 'debug-' + i + '-semantics.txt'), await page.locator('body').ariaSnapshot().catch(() => '')).catch(() => {})
    }
  }
} finally {
  const report = { result: failure ? 'FAIL' : 'PASS', synthetic_only: true, real_http_mysql: true, request_id: requestId, quote_id: quoteId, order_id: orderId, first_submission_sha256: firstSubmission && sha(firstSubmission), latest_submission_sha256: latestSubmission && sha(latestSubmission), passed: checks.length, checks, page_errors: errors, writes, screenshots, failure, real_payment: 'NOT_RUN', native_device: 'NOT_RUN' }
  await writeFile(join(output, 'CROSS_RESULTS.json'), JSON.stringify(report, null, 2) + '\n')
  for (const context of contexts) await context.close()
  await browser.close()
}
