#!/usr/bin/env node
/**
 * Real Vue + isolated #14 HTTP/MySQL browser acceptance.
 * Run scripts/pr14-ui-test-server.cjs --test-only and the Vue preview separately.
 * SMS and private storage are isolated substitutes; forms, auth, API writes,
 * permissions, contracts and database transactions are real. Never deploy this.
 * Example: PR14_UI_STATE_FILE=.local/pr14-ui-runtime.json node scripts/pr14-ui-browser-check.mjs
 */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, process.env.PR14_UI_STATE_FILE || '.local/pr14-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
for (const url of [state.apiUrl, state.controlUrl]) assert.equal(new URL(url).hostname, '127.0.0.1')
const base = process.env.BASE_URL || process.env.PR14_WEB_URL || 'http://127.0.0.1:5202'
const onlyAdaptation = process.argv.includes('--only-adaptation')
const onlyPendingNav = process.argv.includes('--only-pending-nav')
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const evidence = resolve(root, 'docs/ux/pr14-ui/evidence')
const shots = resolve(evidence, 'screenshots')
await mkdir(shots, { recursive: true })
const results = [], pageErrors = [], forbiddenConsole = []
const suffix = Date.now().toString(36)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const actors = {}
const redact = value => {
  let text = String(value)
  for (const secret of [state.controlToken, ...Object.values(actors).map(actor => actor.token)].filter(Boolean)) text = text.replaceAll(secret, '[REDACTED]')
  return text.replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
}

async function check(label, task) {
  const start = Date.now()
  try { await task(); results.push({ label, result: 'PASS', elapsed_ms: Date.now() - start }); console.log(`✓ ${label}`) }
  catch (cause) { results.push({ label, result: 'FAIL', error: redact(cause.message).slice(0, 1200), elapsed_ms: Date.now() - start }); throw cause }
}
const waitText = (page, text) => page.getByText(text, { exact: false }).first().waitFor()
async function control(route, method = 'GET') {
  const response = await fetch(state.controlUrl + route, { method, headers: { Authorization: `Bearer ${state.controlToken}` } })
  assert(response.ok, `private test control: ${response.status}`)
  return response.json()
}
async function api(person, method, route, body, { party = person.personalPartyId, version, key = randomUUID() } = {}) {
  assert(person.token)
  const response = await fetch(state.apiUrl + '/api/v1' + route, {
    method,
    headers: { Authorization: `Bearer ${person.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key,
      ...(party ? { 'X-Acting-Party': party } : {}), ...(version ? { 'If-Match': `"${version}"` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const parsed = await response.json()
  assert(response.ok, `${method} ${route}: ${response.status} ${parsed.error?.code || ''}`)
  return parsed.data
}
async function login(name) {
  const person = state.accounts[name]
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', entry => { if (entry.type() === 'error' && !/Failed to load resource/.test(entry.text())) forbiddenConsole.push(entry.text().slice(0, 300)) })
  await page.goto(base + '/login')
  await page.getByTestId('phone-input').fill(person.phone)
  await page.getByTestId('send-code').click()
  await page.getByTestId('code-input').waitFor()
  const { code } = await control('/code?phone=' + person.phone)
  await page.getByTestId('code-input').fill(code)
  await page.getByTestId('submit-login').click()
  await page.waitForURL('**/workspace')
  await page.locator(`[data-party="${person.personalPartyId}"]`).waitFor()
  await page.locator(`[data-party="${person.personalPartyId}"]`).click()
  const token = await page.evaluate(() => sessionStorage.getItem('ops.session.token'))
  assert(token)
  return actors[name] = { ...person, token, context, page }
}
async function shot(page, filename) { await page.screenshot({ path: resolve(shots, filename), fullPage: true }) }
async function record(person, id) { return api(person, 'GET', '/licensing/records/' + id) }
async function go(page, route, heading) {
  await page.goto(base + route)
  if (heading) await page.getByRole('heading', { name: heading, exact: true }).first().waitFor()
}
function licensingPost(page, end) {
  return page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/licensing' + end)
}
async function take(response) {
  const data = await response.json()
  assert(response.ok(), `UI write: ${response.status()} ${data.error?.code || ''}`)
  return data.data
}

async function runPendingNavigation() {
  const buyer = await login('otherOwner'), page = buyer.page, requests = []
  await go(page, '/licensing/catalog/' + state.records.product.id)
  await page.getByRole('heading', { name: '许可范围与期限', exact: true }).waitFor()
  await page.getByLabel('我已核对本商品全部权利', { exact: false }).check()
  const route = new URL(page.url()).pathname
  const observe = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/licensing/reservations') requests.push({ key: request.headers()['idempotency-key'], body: request.postData() }) }
  page.on('request', observe)
  await page.evaluate(() => {
    const original = Response.prototype.text
    Response.prototype.text = async function () {
      const text = await original.call(this)
      if (this.url.endsWith('/api/v1/licensing/reservations')) { Response.prototype.text = original; throw new TypeError('synthetic body disconnection after real commit') }
      return text
    }
  })
  const firstResponse = licensingPost(page, '/reservations')
  await page.getByRole('button', { name: '预留权利并保存本次合同', exact: true }).click()
  const first = await take(await firstResponse)
  await page.getByRole('button', { name: '重试原操作', exact: true }).waitFor()
  await page.locator('.workspace-nav').getByRole('link', { name: '项目与绑定', exact: true }).click()
  await page.getByText('原操作的结果还未核对，暂不能切换页面。', { exact: false }).first().waitFor()
  assert.equal(new URL(page.url()).pathname, route)
  assert.equal(requests.length, 1)
  const againResponse = licensingPost(page, '/reservations')
  await page.getByRole('button', { name: '重试原操作', exact: true }).click()
  const again = await take(await againResponse)
  await page.waitForURL(`**/licensing/reservations/${again.id}`)
  assert.deepEqual(first, again)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].key, requests[1].key)
  assert.equal(requests[0].body, requests[1].body)
  assert.equal(again.current_status, 'HELD')
  page.off('request', observe)
  await page.locator('.workspace-nav').getByRole('link', { name: '项目与绑定', exact: true }).click()
  await page.waitForURL('**/licensing/projects')
  // Capture final folded contract and the valid adaptation entry, without replaying other mutations.
  for (const [route, file] of [[`/licensing/grants/${state.records.grant.id}`, 'pr14-web-license-desktop.png'], [`/licensing/bindings/${state.records.binding.id}`, 'pr14-web-project-binding-desktop.png']]) {
    await go(page, route)
    await page.locator('.supply-card').first().waitFor()
    await shot(page, file)
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await go(page, '/licensing/grants/' + state.records.grant.id)
  await page.locator('.supply-card').first().waitFor()
  await shot(page, 'pr14-web-license-mobile.png')
}

async function runAdaptation() {
  const buyer = await login('otherOwner'), page = buyer.page
  const binding = await record(buyer, state.records.binding.id)
  assert.equal(binding.kind, 'BINDING')
  const project = await record(buyer, binding.data.project_id)
  await go(page, '/licensing/bindings/' + binding.id)
  await page.getByRole('heading', { name: '按此项目许可提交改稿', exact: true }).waitFor()
  const menus = await page.locator('.workspace-nav a').count()
  await page.getByRole('link', { name: '按此绑定提交项目改稿', exact: true }).click()
  await page.waitForURL(`**/supply/adaptations/${binding.id}/new`)
  await page.getByRole('heading', { name: '按许可提交项目改稿', exact: true }).waitFor()
  await page.locator(`dd[title="${binding.data.work_version_id}"]`).waitFor()
  assert.equal(await page.locator(`dd[title="${binding.data.project_id}"]`).count(), 1)
  assert(await page.locator('#work-kind').getAttribute('readonly') !== null)
  assert.equal(await page.locator('#work-kind').inputValue(), '项目改稿（从已绑定许可进入）')
  assert.equal(await page.locator('.workspace-nav a').count(), menus)
  assert.equal(await page.locator('.workspace-nav a[aria-current="page"]').count(), 1)
  await page.getByLabel('作品标题', { exact: false }).fill(`浏览器项目改稿 ${suffix}（合成测试）`)
  async function upload(label, content) {
    const box = page.locator('.upload-box').filter({ has: page.getByLabel(`选择${label}文件`, { exact: true }) })
    await box.locator('input[type=file]').setInputFiles({ name: `adaptation-${suffix}.txt`, mimeType: 'text/plain', buffer: Buffer.from(content) })
    await box.locator('select').selectOption('text/plain')
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/supply/assets')
    await box.getByRole('button', { name: '上传私有材料', exact: true }).click()
    const asset = await take(await response)
    await box.locator(`[aria-label="${asset.id}"]`).waitFor()
    return asset
  }
  await upload('作品正文', '按真实绑定创建的合成项目改稿，不复制卖方私有原文。')
  await upload('作品证明材料', '本次项目改稿的合成权利证明，不代表真实权利。')
  await page.getByLabel('权利关系1主体编号', { exact: true }).fill(buyer.personalPartyId)
  await page.getByLabel('权利关系1角色', { exact: true }).selectOption('RIGHTS_HOLDER')
  await upload('权利关系 1 证明', '该合成权利关系的独立证明，不代表正式权利审查通过。')
  await shot(page, 'pr14-web-adaptation-form-desktop.png')
  await page.setViewportSize({ width: 390, height: 1000 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await shot(page, 'pr14-web-adaptation-form-mobile.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/supply/work-versions')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  const draft = await take(await response)
  await page.waitForURL(`**/supply/works/${draft.id}`)
  await page.getByRole('heading', { name: '作品版本详情', exact: true }).waitFor()
  assert.equal(draft.kind, 'WORK_VERSION')
  assert.equal(draft.current_status, 'DRAFT')
  assert.equal(draft.data.version.content.kind, 'PROJECT_ADAPTATION')
  assert.equal(draft.data.version.content.source_version_id, binding.data.work_version_id)
  assert.equal(draft.data.version.content.project_id, project.id)
  assert.equal(draft.data.version.reviews.length, 0)
  await shot(page, 'pr14-web-adaptation-saved.png')
  await page.locator('.workspace-nav').getByRole('link', { name: '我的作品', exact: true }).click()
  await page.waitForURL('**/supply/works')
  assert.equal(await page.locator('.workspace-nav a').count(), menus)
  // A missing binding never grants permission merely because the buyer has a profile.
  await go(page, `/supply/adaptations/${randomUUID()}/new`)
  await page.getByTestId('supply-error').waitFor()
  const save = page.getByRole('button', { name: '保存草稿', exact: true })
  if (await save.count()) assert(await save.isDisabled())
  assert.equal(await page.getByRole('heading', { name: '页面不存在', exact: true }).count(), 0)
  await page.locator('.workspace-nav').getByRole('link', { name: '项目与绑定', exact: true }).click()
  await page.waitForURL('**/licensing/projects')
  assert.equal(await page.locator('.workspace-nav a').count(), menus)
}

try {
  if (!onlyAdaptation && !onlyPendingNav) {
  await check('真实表单登录四类账号，选择身份而不注入会话', async () => {
    for (const name of ['owner', 'otherOwner', 'reviewer', 'member']) await login(name)
  })
  const owner = actors.owner, buyer = actors.otherOwner, reviewer = actors.reviewer, member = actors.member
  await check('全部旧新工作区菜单在桌面与390宽稳定显示、正确高亮及跳转', async () => {
    const page = buyer.page
    const links = await page.locator('.workspace-nav a').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), label: node.textContent.trim() })))
    assert(links.length >= 11, 'Six previous menus plus at least five licensing menus must be present')
    assert.equal(new Set(links.map(link => link.href)).size, links.length)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const link of links) {
        await page.locator('.workspace-nav a').filter({ hasText: link.label }).click()
        await page.waitForURL(url => url.pathname === link.href)
        await page.locator('.workspace-nav').waitFor()
        assert.equal(await page.locator('.workspace-nav a').count(), links.length, `${link.label}: stable menus`)
        assert.equal(await page.locator('.workspace-nav a[aria-current="page"]').count(), 1, `${link.label}: one active menu`)
        assert.equal(await page.getByRole('heading', { name: '页面不存在', exact: true }).count(), 0, `${link.label}: no route 404`)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${link.label}: ${width}px overflow`)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  })
  await check('未知地址清楚返回新版工作台', async () => {
    await go(buyer.page, '/not-a-real-pr14-route', '页面不存在')
    await buyer.page.getByRole('button', { name: '回到工作台', exact: true }).click()
    await buyer.page.waitForURL('**/workspace')
    await buyer.page.locator('.workspace-nav').waitFor()
  })
  let reservation, evidenceRow, grant, project, readingRow, createdProduct
  const newProductTitle = `浏览器新许可 ${suffix}（合成测试）`
  const readExpected = '《窗前来信》第一稿'
  const readLiteral = '<b>此文本不可执行</b>'
  const field = (page, label) => page.getByLabel(label, { exact: false })
  async function uploadFile(page, label) {
    const box = page.locator('.upload-box').filter({ has: page.getByLabel(`选择${label}文件`, { exact: true }) })
    await box.locator('input[type="file"]').setInputFiles({ name: `synthetic-${suffix}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`浏览器上传合成材料 ${label} ${suffix}。不代表真实签约或付款。`) })
    await box.locator('select').selectOption('text/plain')
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/supply/assets')
    await box.getByRole('button', { name: '上传私有材料', exact: true }).click()
    const uploaded = await take(await response)
    await box.locator(`[aria-label="${uploaded.id}"]`).waitFor()
    assert.equal(uploaded.current_status, 'READY')
    return uploaded
  }
  async function decide(page, reason) {
    await field(page, '审核结论').selectOption('APPROVED')
    await field(page, '核验理由').fill(reason)
    const button = page.getByRole('button', { name: '提交独立核验结论', exact: true })
    await button.waitFor()
    assert(await button.isEnabled(), 'Explicit review conditions completed')
    const id = new URL(page.url()).pathname.split('/').at(-1)
    const response = licensingPost(page, `/records/${id}/reviews`)
    await button.click()
    const row = await take(await response)
    await waitText(page, '独立核验已处理')
    return row
  }
  await check('目录仅有上架商品和短试读，详情完整展示明确权利与期限', async () => {
    await go(buyer.page, '/licensing/catalog', '选剧本')
    const card = buyer.page.locator('.script-card').filter({ has: buyer.page.getByText('窗前来信 · 私人改编制作许可（隔离测试）', { exact: true }) })
    await card.waitFor()
    assert.equal(await buyer.page.getByText('窗前来信 · 新价格版本待核验（隔离测试）', { exact: true }).count(), 0)
    assert.equal(await buyer.page.getByText(readExpected, { exact: false }).count(), 0)
    await shot(buyer.page, 'pr14-web-catalog-desktop.png')
    await card.getByRole('link', { name: '核对范围与短试读', exact: true }).click()
    await buyer.page.waitForURL(`**/licensing/catalog/${state.records.product.id}`)
    await buyer.page.getByRole('heading', { name: '许可范围与期限', exact: true }).waitFor()
    const body = await buyer.page.locator('main').innerText()
    for (const word of ['改稿', '制作', 'CN', 'zh', '开发截止', '有效截止', '项目', '123.45']) assert(body.includes(word), `Actual detail field: ${word}`)
    assert.equal(await buyer.page.locator('.controlled-reader').count(), 0)
    assert(await buyer.page.getByRole('button', { name: '预留权利并保存本次合同', exact: true }).isDisabled())
    await shot(buyer.page, 'pr14-web-product-desktop.png')
  })
  await check('真实预留在回执断流后复用原请求，保存当时合同且不显示已获许可', async () => {
    const page = buyer.page, requests = []
    const observe = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/licensing/reservations') requests.push({ key: request.headers()['idempotency-key'], body: request.postData() }) }
    page.on('request', observe)
    await field(page, '我已核对本商品全部权利').check()
    await page.evaluate(() => {
      const original = Response.prototype.text
      Response.prototype.text = async function () {
        const text = await original.call(this)
        if (this.url.endsWith('/api/v1/licensing/reservations')) { Response.prototype.text = original; throw new TypeError('synthetic response body disconnection after actual commit') }
        return text
      }
    })
    const firstResponse = licensingPost(page, '/reservations')
    await page.getByRole('button', { name: '预留权利并保存本次合同', exact: true }).click()
    const first = await take(await firstResponse)
    await page.getByRole('button', { name: '重试原操作', exact: true }).waitFor()
    assert(await page.getByRole('button', { name: '预留权利并保存本次合同', exact: true }).isDisabled())
    const againResponse = licensingPost(page, '/reservations')
    await page.getByRole('button', { name: '重试原操作', exact: true }).click()
    reservation = await take(await againResponse)
    await page.waitForURL(`**/licensing/reservations/${reservation.id}`)
    await page.getByRole('heading', { name: '本次不可变合同', exact: true }).waitFor()
    page.off('request', observe)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].key, requests[1].key)
    assert.equal(requests[0].body, requests[1].body)
    assert.deepEqual(first, reservation)
    assert.equal(reservation.current_status, 'HELD')
    assert.equal(reservation.data.contract.signing_method, 'NOT_SIGNED')
    assert.equal(reservation.data.contract.commitments.price.amount_minor, 12345)
    await waitText(page, '预留和保存合同均不代表已取得许可')
    await shot(page, 'pr14-web-reservation-desktop.png')
  })
  await check('四份真实文件完成私有上传，提交后仅等待独立核验', async () => {
    const page = buyer.page
    for (const label of ['卖方签署材料', '买方签署材料', '身份核验依据', '付款材料']) await uploadFile(page, label)
    await field(page, '外部材料参考编号').fill('synthetic.browser.external.' + suffix)
    const response = licensingPost(page, '/evidence')
    await page.getByRole('button', { name: '提交材料等待独立核验', exact: true }).click()
    evidenceRow = await take(await response)
    await page.waitForURL(`**/licensing/evidence/${evidenceRow.id}`)
    await page.getByRole('heading', { name: '外部签署与付款依据', exact: true }).waitFor()
    assert.equal(evidenceRow.current_status, 'IN_REVIEW')
    assert.equal(evidenceRow.data.payment_channel_result, 'NOT_REPORTED')
    assert.equal((await record(buyer, reservation.id)).current_status, 'HELD')
    await shot(page, 'pr14-web-evidence-submitted.png')
  })
  await check('独立核验初始未勾选，读取实际材料并逐项核验签署身份和实收', async () => {
    const page = reviewer.page
    await go(page, '/licensing/reviews/evidence/' + evidenceRow.id)
    await page.getByRole('heading', { name: '独立核验结论', exact: true }).waitFor()
    for (const label of ['已核实双方身份', '已核实卖方签署', '已核实买方签署']) assert.equal(await field(page, label).isChecked(), false)
    await field(page, '审核结论').selectOption('APPROVED')
    await field(page, '核验理由').fill('仅合成浏览器核验，先读取文件、再核对事实。')
    assert(await page.getByRole('button', { name: '提交独立核验结论', exact: true }).isDisabled())
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '读取关联材料', exact: true }).first().click()
    const item = await download
    assert.match(item.suggestedFilename(), /\.bin$/)
    await field(page, '已签合同内容指纹').fill(reservation.data.contract.content_sha256)
    for (const label of ['已核实双方身份', '已核实卖方签署', '已核实买方签署']) await field(page, label).check()
    await field(page, '实收币种').fill('CNY')
    await field(page, '实际收款（整数最小币种单位）').fill('12345')
    await field(page, '实际收款主体编号').fill(owner.personalPartyId)
    await field(page, '收款凭证参考编号').fill('synthetic.browser.receipt.' + suffix)
    await shot(page, 'pr14-web-independent-review-desktop.png')
    evidenceRow = await decide(page, '逐项核对合成身份、签署、合同、收款方与金额；不代表真实支付。')
    assert.equal(evidenceRow.current_status, 'APPROVED')
    assert.equal(evidenceRow.data.payment_channel_result, 'NOT_REPORTED')
    assert.equal((await record(buyer, reservation.id)).current_status, 'HELD')
  })
  await check('核验通过后单独发放许可，取得真实GRANT并保留历史合同', async () => {
    const page = reviewer.page
    await go(page, '/licensing/reviews/activation/' + reservation.id)
    await field(page, '本预留已批准的证据').waitFor()
    await field(page, '本预留已批准的证据').selectOption(evidenceRow.id)
    await field(page, '发放理由').fill('合成材料已逐项核验，依据约定发放隔离测试许可。')
    const response = licensingPost(page, '/reservations/' + reservation.id + '/activation')
    await page.getByRole('button', { name: '核对并发放许可', exact: true }).click()
    grant = await take(await response)
    await page.waitForURL(`**/licensing/reviews/grants/${grant.id}`)
    await page.getByRole('heading', { name: '本次不可变合同', exact: true }).waitFor()
    assert.equal(grant.kind, 'GRANT')
    assert.equal(grant.current_status, 'ACTIVE')
    assert.deepEqual(grant.data.contract, reservation.data.contract)
    assert.equal((await record(buyer, reservation.id)).current_status, 'COMMITTED')
    await go(buyer.page, '/licensing/grants/' + grant.id)
    await buyer.page.getByRole('heading', { name: '项目额度与使用条件', exact: true }).waitFor()
    await shot(buyer.page, 'pr14-web-license-desktop.png')
  })
  await check('项目用途主动填写，绑定实际许可且额度不能重复使用', async () => {
    const page = buyer.page
    await go(page, '/licensing/projects/new')
    await field(page, '项目标题').fill(`浏览器私人项目 ${suffix}（合成测试）`)
    await field(page, '实际用途').selectOption('PRIVATE')
    await field(page, '国家代码').fill('CN')
    await field(page, '语言代码').fill('zh')
    await field(page, '项目集数').fill('1')
    const createResponse = licensingPost(page, '/projects')
    await page.getByRole('button', { name: '建立项目', exact: true }).click()
    project = await take(await createResponse)
    await page.waitForURL(`**/licensing/projects/${project.id}`)
    assert.equal(project.data.purpose, 'PRIVATE')
    await go(page, '/licensing/grants/' + grant.id)
    await field(page, '将额度分配给哪个项目').selectOption(project.id)
    const bindResponse = licensingPost(page, '/grants/' + grant.id + '/bindings')
    await page.getByRole('button', { name: '确认分配一个项目额度', exact: true }).click()
    await page.locator('.el-message-box').getByRole('button', { name: '确认绑定', exact: true }).click()
    const binding = await take(await bindResponse)
    await page.waitForURL(`**/licensing/bindings/${binding.id}`)
    assert.equal(binding.data.project_id, project.id)
    assert.equal(binding.parent_id, grant.id)
    await go(page, '/licensing/grants/' + grant.id)
    await field(page, '将额度分配给哪个项目').selectOption(project.id)
    await waitText(page, '已分配 1 / 2 个项目额度')
    assert(await page.getByRole('button', { name: '确认分配一个项目额度', exact: true }).isDisabled())
    await shot(page, 'pr14-web-project-binding-desktop.png')
  })
  await check('作者指定账号、身份与期限并上传真实阅稿依据，提交后仍禁止正文', async () => {
    const page = owner.page
    await go(page, '/licensing/readings/new')
    await field(page, '已完成双审的原作').selectOption(state.records.history.id)
    await field(page, '指定阅读账号编号').fill(buyer.accountId)
    await field(page, '该账号代表的身份编号').fill(buyer.personalPartyId)
    const local = new Date(Date.now() + 86400000 + 8 * 3600000).toISOString().slice(0, 16)
    await field(page, '阅读截止（本地时间）').fill(local)
    await field(page, '依据类型').selectOption('NDA')
    await uploadFile(page, '保密或评估授权依据')
    const response = licensingPost(page, '/readings')
    await page.getByRole('button', { name: '提交阅稿申请', exact: true }).click()
    readingRow = await take(await response)
    await page.waitForURL(`**/licensing/readings/${readingRow.id}`)
    assert.equal(readingRow.current_status, 'IN_REVIEW')
    await go(buyer.page, '/licensing/readings/' + readingRow.id)
    await buyer.page.getByRole('heading', { name: '受控评估阅读', exact: true }).waitFor()
    assert(await buyer.page.getByRole('button', { name: '重新核验并读取带水印正文', exact: true }).isDisabled())
    assert.equal(await buyer.page.locator('.controlled-reader').count(), 0)
  })
  await check('独立批准指定人阅读，正文为实际水印纯文本且不执行HTML', async () => {
    const page = reviewer.page
    await go(page, '/licensing/reviews/readings/' + readingRow.id)
    await page.getByRole('heading', { name: '独立核验结论', exact: true }).waitFor()
    readingRow = await decide(page, '核对合成NDA、账号、身份及期限，仅授评估阅读。')
    assert.equal(readingRow.current_status, 'APPROVED')
    await go(buyer.page, '/licensing/readings/' + readingRow.id)
    const response = buyer.page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/licensing/readings/${readingRow.id}/content`)
    await buyer.page.getByRole('button', { name: '重新核验并读取带水印正文', exact: true }).click()
    const result = await response
    assert.equal(result.headers()['cache-control'], 'no-store')
    await buyer.page.locator('.controlled-reader').waitFor()
    const text = await buyer.page.locator('.controlled-reader').innerText()
    assert(text.includes(readExpected))
    assert(text.includes(readLiteral))
    assert(text.includes(buyer.accountId))
    assert.equal(await buyer.page.locator('.controlled-reader b').count(), 0)
    assert.equal(await buyer.page.getByRole('link', { name: '下载原稿', exact: true }).count(), 0)
    await shot(buyer.page, 'pr14-web-controlled-reader-desktop.png')
    await buyer.page.setViewportSize({ width: 390, height: 1000 })
    assert(await buyer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await shot(buyer.page, 'pr14-web-controlled-reader-mobile.png')
    await buyer.page.setViewportSize({ width: 1440, height: 1000 })
  })
  await check('窗口失焦清空正文，作者同一身份也不能读取指定给他人的全文', async () => {
    await buyer.page.evaluate(() => window.dispatchEvent(new Event('blur')))
    assert.equal(await buyer.page.locator('.controlled-reader').count(), 0)
    await buyer.page.getByRole('button', { name: '重新核验并读取带水印正文', exact: true }).click()
    await buyer.page.locator('.controlled-reader').waitFor()
    await go(owner.page, '/licensing/readings/' + readingRow.id)
    await owner.page.getByRole('heading', { name: '受控评估阅读', exact: true }).waitFor()
    assert(await owner.page.getByRole('button', { name: '重新核验并读取带水印正文', exact: true }).isDisabled())
    assert.equal(await owner.page.locator('.controlled-reader').count(), 0)
    await go(member.page, '/licensing/readings/' + readingRow.id)
    await member.page.locator('.workspace-nav').waitFor()
    await waitText(member.page, '当前身份')
    assert.equal(await member.page.locator('.controlled-reader').count(), 0)
  })
  await check('撤销真实阅稿后刷新核验不再保留旧正文', async () => {
    const current = await record(owner, readingRow.id)
    await api(owner, 'POST', `/licensing/records/${readingRow.id}/closures`, { reason: '浏览器验证撤销专用合成阅稿，不修改种子记录。' }, { version: current.object_version })
    await buyer.page.reload()
    await buyer.page.getByRole('heading', { name: '受控评估阅读', exact: true }).waitFor()
    assert.equal(await buyer.page.locator('.controlled-reader').count(), 0)
    assert(await buyer.page.getByRole('button', { name: '重新核验并读取带水印正文', exact: true }).isDisabled())
    await waitText(buyer.page, '已撤销')
  })
  await check('新商品无默认商业条件，按明确原作与规则提交独立核验', async () => {
    const page = owner.page
    await go(page, '/licensing/products/new')
    await field(page, '已完成双审的原作版本').selectOption(state.records.history.id)
    for (const label of ['总价（整数最小币种单位）', '生效前应付（整数最小币种单位）', '预留时长（分钟）', '项目数量上限', '每项目集数上限']) assert.equal(await field(page, label).inputValue(), '')
    await field(page, '商品标题').fill(newProductTitle)
    await field(page, '经人工核验的短试读').fill('仅浏览器测试的已核验短试读，不展示私有原稿。')
    await field(page, '是否独家').selectOption('no')
    await page.getByLabel('改稿', { exact: true }).check()
    await page.getByLabel('制作', { exact: true }).check()
    await page.getByLabel('私下使用', { exact: true }).check()
    await field(page, '地域代码').fill('CN')
    await field(page, '语言代码').fill('zh')
    const local = day => new Date(Date.now() + day * 86400000 + 8 * 3600000).toISOString().slice(0,16)
    await field(page, '许可开始（本地时间）').fill(local(-1))
    await field(page, '开发截止（本地时间）').fill(local(365))
    await field(page, '有效截止（本地时间）').fill(local(730))
    await field(page, '项目数量上限').fill('2')
    await field(page, '每项目集数上限').fill('2')
    await field(page, '完整约定条款').fill('隔离测试明确许可：私人改稿与制作，不含发行或AI训练。')
    await field(page, '币种（大写三位代码）').fill('CNY')
    await field(page, '总价（').fill('12345')
    await field(page, '生效前应付（').fill('12345')
    await field(page, '预留时长（分钟）').fill('60')
    await field(page, '已核验生效的规则版本编号').fill(state.ruleId)
    await shot(page, 'pr14-web-product-form-desktop.png')
    const response = licensingPost(page, '/products')
    await page.getByRole('button', { name: '提交许可商品审核', exact: true }).click()
    createdProduct = await take(await response)
    await page.waitForURL(`**/licensing/products/${createdProduct.id}`)
    assert.equal(createdProduct.current_status, 'IN_REVIEW')
    assert.equal(createdProduct.data.price.amount_minor, 12345)
  })
  await check('412读取实际新版本并清空旧决定，未经重新确认不得重放审批', async () => {
    const page = reviewer.page
    await go(page, '/licensing/reviews/products/' + createdProduct.id)
    await page.getByRole('heading', { name: '独立核验结论', exact: true }).waitFor()
    await field(page, '审核结论').selectOption('APPROVED')
    await field(page, '核验理由').fill('页面持有旧版本的明确决定。')
    await api(reviewer, 'POST', `/licensing/records/${createdProduct.id}/reviews`, { decision: 'APPROVED', reason: '模拟另一已完成核验操作，使原页面版本过旧。' }, { party: null, version: createdProduct.object_version })
    const response = licensingPost(page, `/records/${createdProduct.id}/reviews`)
    await page.getByRole('button', { name: '提交独立核验结论', exact: true }).click()
    const stale = await response
    assert.equal(stale.status(), 412)
    await waitText(page, '记录已有变化')
    await page.getByRole('button', { name: '提交独立核验结论', exact: true }).waitFor({ state: 'detached' })
    assert.equal(await page.getByRole('button', { name: '提交独立核验结论', exact: true }).count(), 0)
    const current = await api(reviewer, 'GET', '/licensing/records/' + createdProduct.id, undefined, { party: null })
    assert.equal(current.object_version, createdProduct.object_version + 1)
    assert.equal(current.current_status, 'LISTED')
  })
  await check('审核权限真实撤销后清理记录，恢复后重新核验才可显示', async () => {
    const page = reviewer.page
    await go(page, '/licensing/reviews/evidence/' + state.records.pendingEvidence.id)
    await page.getByRole('heading', { name: '独立核验结论', exact: true }).waitFor()
    await control('/reviewer-permission?action=LICENSE_REVIEW&enabled=false', 'POST')
    try {
      await page.getByRole('button', { name: '刷新当前记录', exact: true }).click()
      await waitText(page, '尚未取得独立许可核验权限')
      assert.equal(await page.getByRole('heading', { name: '外部签署与付款依据', exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: '读取关联材料', exact: true }).count(), 0)
    } finally { await control('/reviewer-permission?action=LICENSE_REVIEW&enabled=true', 'POST') }
    await page.getByRole('button', { name: '刷新当前记录', exact: true }).click()
    await page.getByRole('heading', { name: '独立核验结论', exact: true }).waitFor()
  })
  await check('仅选择而未上传的私有文件在身份切换后清空', async () => {
    const page = owner.page
    await go(page, '/licensing/readings/new')
    const input = page.getByLabel('选择保密或评估授权依据文件', { exact: true })
    await input.setInputFiles({ name: `private-selection-${suffix}.txt`, mimeType: 'text/plain', buffer: Buffer.from('仅选择、未上传的合成私有文件。') })
    assert.equal(await input.evaluate(node => node.files.length), 1)
    await page.locator('#license-party').selectOption(state.organizationId)
    await page.waitForFunction(() => [...document.querySelectorAll('input[type=file]')].every(node => !node.value && node.files.length === 0))
    assert.equal(await page.getByText(`private-selection-${suffix}.txt`, { exact: false }).count(), 0)
    await page.locator('#license-party').selectOption(owner.personalPartyId)
  })
  await check('身份切换清理私有记录，机构普通成员不取得许可办理权限', async () => {
    const page = owner.page
    await go(page, '/licensing/readings/' + readingRow.id)
    await page.getByRole('heading', { name: '指定人阅稿授权', exact: true }).waitFor()
    await page.locator('#license-party').selectOption(state.organizationId)
    await waitText(page, '当前身份无权查看')
    assert.equal(await page.getByRole('heading', { name: '指定人阅稿授权', exact: true }).count(), 0)
    await go(member.page, '/licensing/catalog')
    await member.page.locator('#license-party').selectOption(state.organizationId)
    await waitText(member.page, '请使用有效负责人身份')
    assert.equal(await member.page.locator('.script-card').count(), 0)
  })
  await check('本批核心页面390宽无横向溢出，退出后私有页面回到登录', async () => {
    const page = buyer.page
    await page.setViewportSize({ width: 390, height: 1000 })
    for (const [route, filename] of [[`/licensing/catalog/${state.records.product.id}`, 'pr14-web-product-mobile.png'], [`/licensing/reservations/${reservation.id}`, 'pr14-web-reservation-mobile.png'], [`/licensing/grants/${grant.id}`, 'pr14-web-license-mobile.png'], [`/licensing/projects/${project.id}`, 'pr14-web-project-mobile.png']]) {
      await go(page, route)
      await page.locator('.supply-card').first().waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}: 390px overflow`)
      await shot(page, filename)
    }
    await page.getByRole('button', { name: '退出', exact: true }).click()
    await page.waitForURL('**/login')
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ops.session.token')), null)
    await page.goto(base + '/licensing/grants/' + grant.id)
    await page.waitForURL(url => url.pathname === '/login' && url.searchParams.has('redirect'))
  })
  }
  if (!onlyPendingNav) await check('有效项目绑定进入改稿、真实保存草稿与无效绑定拒绝、返回统一导航', runAdaptation)
  if (onlyPendingNav) await check('未知写入阻止菜单跳转、保留原请求重试、成功后恢复导航', runPendingNavigation)
} catch (cause) {
  console.error(`Browser acceptance failed: ${redact(cause.message)}`)
  for (const [name, actor] of Object.entries(actors)) await shot(actor.page, `pr14-web-last-${name}.png`).catch(() => {})
  process.exitCode = 1
} finally {
  if (pageErrors.length) { results.push({ label: '浏览器未捕获错误', result: 'FAIL', errors: pageErrors.map(redact) }); process.exitCode = 1 }
  if (forbiddenConsole.length) { results.push({ label: '浏览器控制台错误', result: 'FAIL', errors: forbiddenConsole.map(redact) }); process.exitCode = 1 }
  const failed = results.filter(row => row.result === 'FAIL').length
  const report = { synthetic_only: true, api: 'Real isolated HTTP/MySQL, synthetic SMS and private storage', browser: 'Real Google Chrome / Playwright',
    base_url: base, scope: onlyPendingNav ? 'PENDING_NAVIGATION_ONLY' : onlyAdaptation ? 'PROJECT_ADAPTATION_ONLY' : 'FULL_LICENSING_AND_ADAPTATION', result: failed ? 'FAIL' : 'PASS', passed: results.filter(row => row.result === 'PASS').length, failed,
    checked_at: new Date().toISOString(), checks: results,
    limits: 'No production access, payment provider, real identity vendor, e-sign vendor or deployment. Screenshots contain synthetic test identities only.' }
  await writeFile(resolve(evidence, onlyPendingNav ? 'web-pending-navigation-runtime.json' : onlyAdaptation ? 'web-adaptation-runtime.json' : 'web-runtime.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
