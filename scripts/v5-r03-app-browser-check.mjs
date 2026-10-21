#!/usr/bin/env node
// Final real Flutter pages against one synthetic loopback fixture. Only HALO service submission writes.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const root = process.cwd()
assert(process.env.ARTISTS_ACCESS_FILE, 'Provide the current local artists sandbox access file')
const fixture = JSON.parse(await readFile(process.env.ARTISTS_ACCESS_FILE, 'utf8'))
assert.equal(fixture.synthetic_only, true)
assert.equal(new URL(fixture.base_url).hostname, '127.0.0.1')
assert.equal(new URL(fixture.base_url).pathname, '/api/v1')
assert(Number(new URL(fixture.base_url).port) > 0)
const app = process.env.ARTISTS_APP_URL || 'http://127.0.0.1:5500'
assert.equal(app, 'http://127.0.0.1:5500')
const output = resolve(process.env.ARTISTS_EVIDENCE_DIR || 'output/playwright/v5-r03/app-pages')
assert(output.startsWith(resolve(root, 'output/playwright/v5-r03/app-pages')))
await mkdir(output, { recursive: true })
const { chromium } = createRequire(join(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const tokens = Object.values(fixture.accounts).map(a => a.bearer_token)
const redact = value => tokens.reduce((s, t) => s.replaceAll(t, '[redacted]'), String(value))
const sha = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')
const checks = [], shots = [], errors = [], consoleErrors = [], reads = [], writes = [], layout = []
const mutationFile = join(output, 'HALO_MUTATION.json')
let context, page, failure, haloServiceId, relationResponse
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const check = (name, value = true) => { assert(value, name); checks.push({ name, result: 'PASS' }); console.log('✓ ' + name) }
const button = name => page.getByRole('button', { name, exact: true })
const group = name => page.getByRole('group', { name })
async function api(path) {
  const a = fixture.accounts.artist
  const response = await fetch(fixture.base_url + path, { headers: { Authorization: 'Bearer ' + a.bearer_token, 'X-Acting-Party': a.party_id }, signal: AbortSignal.timeout(10000) })
  assert(response.ok, `Read-only fixture GET ${path}: ${response.status}`)
  return (await response.json()).data
}
async function open(route, heading, width = 390) {
  if (context) await context.close()
  context = await browser.newContext({ viewport: { width, height: width >= 768 ? 1024 : 844 }, locale: 'zh-CN' })
  page = await context.newPage()
  page.on('response', response => { if (response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/gigs/records') relationResponse = response })
  page.on('pageerror', e => errors.push(redact(e.message)))
  page.on('console', m => {
    if (m.type() === 'error' || /RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/i.test(m.text())) consoleErrors.push(redact(m.text()))
  })
  page.on('request', request => {
    if (!request.url().startsWith(fixture.base_url)) return
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET') reads.push({ method: 'GET', path })
    else if (request.method() !== 'OPTIONS') writes.push({ method: request.method(), path, body: request.postDataJSON(), body_sha256: sha(request.postData()), key_sha256: sha(request.headers()['idempotency-key'] || ''), acting_party: request.headers()['x-acting-party'] || null })
  })
  await page.goto(app + '/#' + route)
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' })
  await page.locator('flt-semantics-placeholder').evaluate(e => e.click())
  await page.getByRole('heading', { name: heading, exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(250)
  return page
}
async function top() {
  await page.mouse.move(Math.min(page.viewportSize().width / 2, 190), 380)
  await page.mouse.wheel(0, -20000)
  await page.waitForTimeout(150)
}
async function reveal(target) {
  const height = page.viewportSize().height
  for (let n = 0; n < 55; n++) {
    const b = await target.count() ? await target.first().boundingBox() : null
    if (b && b.y + b.height / 2 > 56 && b.y + b.height / 2 < height - 6) return b
    await page.mouse.move(Math.min(page.viewportSize().width / 2, 190), 420)
    await page.mouse.wheel(0, b?.y < 56 ? -230 : 230)
    await page.waitForTimeout(90)
  }
  throw new Error('Expected Flutter control did not enter viewport')
}
async function press(target) {
  const b = await reveal(target)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(150)
}
async function shot(name, source, note = '') {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(220)
  await page.mouse.move(0, 0)
  const text = await page.locator('body').ariaSnapshot()
  for (const token of tokens) assert(!text.includes(token), 'No credential in accessible page')
  const metrics = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, height: innerHeight }))
  assert(metrics.width <= metrics.viewport, 'No horizontal document overflow')
  const file = name + '.png'
  await page.screenshot({ path: join(output, file) })
  shots.push({ id: name.split('-').slice(0, -1).join('-'), result: 'PASS', file, route: new URL(page.url()).hash.slice(1), viewport: page.viewportSize(), source, note })
  layout.push({ file, ...metrics, result: 'PASS' })
}
async function safeJson(file, value) {
  const text = JSON.stringify(value, null, 2) + '\n'
  for (const token of tokens) assert(!text.includes(token), 'Never persist credentials')
  await writeFile(file, text)
}
try {
  const personRoute = '/artists/person?personId=' + fixture.person_id
  const form = (mode, avatar = false) => '/artists/form?mode=' + mode + '&personId=' + fixture.person_id + (avatar ? '&avatarId=' + fixture.avatar_id : '')
  const p = await api('/artists/people/' + fixture.person_id)
  assert.equal(p.person.owner_party_id, fixture.accounts.artist.party_id)
  check('真人与数字人来源为本次真实隔离API，未用示例人物覆盖', p.avatars.some(a => a.id === fixture.avatar_id))

  await open('/my-humans', '我的艺人')
  check('本人真实名单可见', (await page.locator('body').ariaSnapshot()).includes(p.person.display_name))
  check('App读取本次access所指的真实隔离API，没有沿用旧构建的接口', reads.some(r => r.path === '/api/v1/artists/people'))
  await shot('01-people-390', '27-avatar-top.png / 34我的艺人', '合成姓名；无虚构肖像')

  await open(personRoute, '艺人档案')
  await group(/^本人核验与归属/).waitFor()
  check('本人档案显示独立实名不可用状态，按钮禁用', await button('核对实名服务结果').isDisabled())
  await shot('02-person-390', '27-avatar-top.png / 34、36')
  await reveal(group(/^我的数字人/))
  await page.mouse.move(190, 420)
  await page.mouse.wheel(0, 470)
  await page.waitForTimeout(160)
  await shot('03-avatars-390', '27-avatar-top.png / 36数字人详情', '真实档案名称；明确长期模型未启用')

  await open(personRoute, '艺人档案', 768)
  await group(/^本人核验与归属/).waitFor()
  await shot('04-person-768', '27-avatar-top.png / 34、36', '560px内容列；平板适配')

  await open('/artists/record?personId=' + fixture.person_id + '&recordId=' + fixture.consent_id, '本人同意')
  check('本人同意原记录在真实页面可读', (await api('/artists/people/' + fixture.person_id + '/records/' + fixture.consent_id)).kind === 'CONSENT')
  await shot('05-consent-record-390', '27-avatar-top.png / 36权利与授权')
  await reveal(group(/^本人证据材料/))
  await page.mouse.move(190, 420)
  await page.mouse.wheel(0, 440)
  await page.waitForTimeout(160)
  await shot('06-private-materials-390', '27-avatar-top.png / 35、37', '只读元数据与受控下载入口，未上传或对外公开材料')
  const privateContent = page.waitForResponse(r => r.url().includes('/artists/assets/') && r.url().endsWith('/content'))
  await press(button('下载并核对材料').first())
  assert((await privateContent).ok())
  check('本人材料通过带身份的受控内容接口下载并核对，无私有URL回退', reads.some(r => r.path.includes('/artists/assets/') && r.path.endsWith('/content')))

  await open(form('CONSENT', true), '明确这次本人同意')
  await reveal(page.getByRole('checkbox', { name: '形象 / 脸部', exact: true }))
  check('同意表单不自动勾选形象或声音', !(await page.getByRole('checkbox', { name: '形象 / 脸部', exact: true }).isChecked()))
  await shot('07-consent-scope-390', '27-avatar-top.png / 37创建与本人同意', '只读取未提交；具体范围、用途与期限独立填写')

  await open(form('VARIANT', true), '保存造型与声音版本')
  await reveal(page.getByRole('button', { name: /^版本类型(?: |$)/ }))
  await shot('08-look-variant-390', '27-avatar-top.png / 36、37', '保持前一版本与原同意引用；未保存新版本')
  await press(page.getByRole('button', { name: /^版本类型(?: |$)/ }))
  await press(page.getByRole('menuitem', { name: '声音版本', exact: true }))
  await page.setViewportSize({ width: 375, height: 844 })
  await page.waitForTimeout(180)
  await shot('09-voice-variant-375', '27-avatar-top.png / 36、37', '声音独立版本，窄屏适配')
  check('造型与声音选择保留独立字段，无保存请求', writes.length === 0)

  await open(form('HALO'), '申请认证')
  await press(page.getByRole('button', { name: /^申请认证等级(?: |$)/ }))
  await press(page.getByRole('menuitem', { name: 'L2认证审核', exact: true }))
  await shot('11-halo-390', '30-cert-growth.png / 43、44', 'L1免费与L2独立服务；补件沿用原费用；未提交认证')

  await open(form('IDENTITY'), '核对实名服务结果')
  check('实名服务未启用不允许提交自称结果', await button('提交本次办理').isDisabled())
  await shot('12-identity-unavailable-390', '27-avatar-top.png / 37及46-states-d.png')

  await open(form('SERVICE', true), '选择创建与托管服务')
  await press(page.getByRole('button', { name: /^选择当前已审服务商品(?: |$)/ }))
  await press(page.getByRole('menuitem', { name: /AVATAR_CREATION/ }))
  await shot('13-service-offers-390', '27-avatar-top.png / 37、28-avatar-extra.png / 38', '价格、重试次数与期限来自已审规格；未提交此页')

  const hosting = await api('/artists/people/' + fixture.person_id + '/services/' + fixture.hosting_id)
  assert(hosting.order?.id)
  await open('/artists/record?personId=' + fixture.person_id + '&recordId=' + fixture.hosting_id, '创建与托管')
  await shot('14-hosting-390', '28-avatar-extra.png / 38托管管理', '原托管服务与原商品价格')
  await reveal(button('查看服务原订单'))
  await shot('15-hosting-order-link-390', '28-avatar-extra.png / 38托管管理', '有效期以服务记录为准；提醒不等于自动扣款')
  await press(button('查看服务原订单'))
  await page.getByRole('heading', { name: '订单详情', exact: true }).waitFor()
  await shot('16-original-hosting-order-390', '34-orders-top.png / 55订单详情', '该种子原订单具有合成实收，不把新请求混为已付')
  check('托管原订单链接指向同一实际订单', page.url().includes(hosting.order.id))

  await open('/artists/catalog', '公开艺人')
  await reveal(button('读取这份获准预览').first())
  await shot('17-catalog-390', '20-five-main-tabs.png / 广场艺人及27-avatar-top.png公开资料', '预览为1像素合成权限样本，不是真实肖像或视觉资产验收')
  const previewResponse = page.waitForResponse(r => r.url().includes('/artists/catalog/') && r.url().endsWith('/content'))
  await press(button('读取这份获准预览').first())
  assert((await previewResponse).ok())
  check('公开预览走指定listing受控内容接口，没有私有文件URL兜底', reads.some(r => r.path.includes('/artists/catalog/') && r.path.endsWith('/content')))
  assert.equal(writes.length, 0, 'All preceding page captures are read-only')

  await open(form('DELEGATION'), '本人确认机构委托')
  await press(page.getByRole('button', { name: /^已接受的机构合作关系(?: |$)/ }))
  await press(page.getByRole('menuitem', { name: /^机构 / }).first())
  check('委托选择显示真实已接受机构，未把空表单当成已授权', (await page.locator('body').ariaSnapshot()).includes(fixture.agency_party_id.slice(0, 8)))
  await shot('10-delegation-390', '29-avatar-last.png / 42我的MCN合作', '真实只读合作关系列表；未新建或撤回委托')
  assert(relationResponse?.ok(), 'Actual unmodified relation GET reaches the fixture')
  const relations = (await relationResponse.json()).data.items
  const actualRelation = relations.find(r => r.owner_party_id === fixture.agency_party_id && r.counterparty_id === fixture.accounts.artist.party_id)
  assert(actualRelation && actualRelation.current_status === 'ACTIVE')
  const relationFields = ['scope', 'terms', 'exclusive', 'commission', 'valid_from', 'accepted_by', 'valid_until', 'ended_reason', 'evidence_asset_ids']
  assert.equal(Object.keys(actualRelation.data).length, 9)
  assert(relationFields.every(k => Object.hasOwn(actualRelation.data, k)))
  assert.equal(actualRelation.data.accepted_by, fixture.accounts.artist.account_id)
  check('委托表单实际读取已接受合作关系，原GET返回完整9字段且本人已接受', reads.some(r => r.path === '/api/v1/gigs/records'))

  let priorMutation
  try { priorMutation = JSON.parse(await readFile(mutationFile, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (priorMutation) {
    assert.equal(priorMutation.person_id, fixture.person_id, 'Never reuse a mutation ledger from another fixture')
    assert.equal(priorMutation.status, 'CREATED', 'A previous uncertain submission must be reconciled before running a fresh write')
    haloServiceId = priorMutation.service_id
    const existing = await api('/artists/people/' + fixture.person_id + '/services/' + haloServiceId)
    assert.equal(existing.data.kind, 'HALO_REVIEW')
    assert.equal(existing.current_status, 'REQUESTED')
    assert.equal(existing.order, null)
    await open('/artists/record?personId=' + fixture.person_id + '&recordId=' + haloServiceId, '创建与托管')
    await shot('18-halo-service-request-390', '30-cert-growth.png / 43认证审核费用', '只读复核本工具此前记录的审核服务请求，未重复提交')
    check('已提交HALO请求只读复核，本次未重复提交', true)
  } else {
    const servicesResponse = await fetch(fixture.base_url + '/artists/services', { headers: { Authorization: 'Bearer ' + fixture.accounts.artist.bearer_token } })
    assert(servicesResponse.ok)
    const services = (await servicesResponse.json()).data
    const offer = services.offers.items.find(r => r.spec_id === fixture.specs.HALO_REVIEW)
    assert(offer)
    await open(form('SERVICE', true), '选择创建与托管服务')
    await press(page.getByRole('button', { name: /^选择当前已审服务商品(?: |$)/ }))
    await press(page.getByRole('menuitem', { name: offer.title, exact: false }))
    assert(await button('提交本次办理').isEnabled())
    await press(button('提交本次办理'))
    await button('确认办理').waitFor()
    await shot('18-halo-service-confirm-390', '30-cert-growth.png / 43认证审核费用', '只建立审核服务请求，不提交认证申请、不付款、不标通过')
    const expectedBody = { avatar_id: null, spec_id: fixture.specs.HALO_REVIEW, renewal_reminder: false }
    await safeJson(mutationFile, { status: 'INTENT', synthetic_only: true, person_id: fixture.person_id, expected_body: expectedBody })
    const received = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/artists/people/' + fixture.person_id + '/services')
    await press(button('确认办理'))
    const response = await received
    assert(response.ok(), 'Actual service request is accepted')
    const record = (await response.json()).data
    haloServiceId = record.id
    assert.equal(record.current_status, 'REQUESTED')
    assert.equal(record.avatar_id, null)
    assert.equal(record.data.kind, 'HALO_REVIEW')
    assert.equal(record.data.renewal_reminder, false)
    assert.equal(record.data.auto_debit_enabled, false)
    await safeJson(mutationFile, { status: 'CREATED', synthetic_only: true, person_id: fixture.person_id, service_id: record.id, expected_body: expectedBody, actual_status: record.current_status, auto_debit_enabled: record.data.auto_debit_enabled })
    const posted = writes.filter(r => r.method === 'POST' && r.path.endsWith('/services'))
    assert.equal(posted.length, 1)
    assert.deepEqual(posted[0].body, expectedBody)
    assert.notEqual(posted[0].key_sha256, sha(''), 'Actual request carries an idempotency key')
    const detail = await api('/artists/people/' + fixture.person_id + '/services/' + record.id)
    assert.equal(detail.order, null)
    assert.equal(detail.current_status, 'REQUESTED')
    await page.getByRole('heading', { name: '创建与托管', exact: true }).waitFor()
    check('实际App提交HALO审核服务：空数字人/不提醒/不扣款/无订单与已付款事实', true)
  }
  assert.equal(writes.length, priorMutation ? 0 : 1, 'Only the one authorized HALO service write occurred')
  check('JS与Flutter布局错误均为零', errors.length === 0 && consoleErrors.length === 0)
  check('18张逐页截图未出现横向文档溢出', shots.length === 18 && layout.every(r => r.result === 'PASS'))
} catch (e) {
  failure = redact(e.stack || e.message)
  process.exitCode = 1
  console.error(failure)
  if (page) await safeJson(join(output, 'FAILURE_PAGE.json'), { route: new URL(page.url()).hash.slice(1), aria: redact(await page.locator('body').ariaSnapshot().catch(() => '')), errors, consoleErrors }).catch(() => {})
} finally {
  await safeJson(join(output, 'APP_PAGES_RESULTS.json'), { result: failure ? 'FAIL' : 'PASS', captured_at: new Date().toISOString(), fixture_origin: new URL(fixture.base_url).origin, synthetic_only: true, person_id: fixture.person_id, avatar_id: fixture.avatar_id, halo_service_id: haloServiceId || null, checks, shots: shots.sort((a, b) => a.file.localeCompare(b.file)), layout, read_requests: reads, write_requests: writes, page_errors: errors, console_errors: consoleErrors, failure: failure || null, limitations: ['公开预览为1像素合成权限样本，不作真实肖像视觉验收。', '未发起实名/数字人创建/同意/委托/认证/付款/退款；唯一写入为明确记录的HALO_REVIEW服务请求。'] })
  if (context) await context.close()
  await browser.close()
}
