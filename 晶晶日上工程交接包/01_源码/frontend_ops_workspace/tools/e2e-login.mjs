#!/usr/bin/env node
/** Browser + real isolated #11 HTTP/MySQL tests. SMS delivery alone is synthetic.
 * Start scripts/pr11-ui-test-server.cjs --test-only separately, then point
 * PR11_UI_STATE_FILE to its private JSON. Never run against a deployed service.
 * Transport/403/412/429 cases are explicitly injected in the browser.
 */
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
const state = JSON.parse(await readFile(process.env.PR11_UI_STATE_FILE || '.local/pr11-ui-runtime.json', 'utf8'))
assert.equal(state.testOnly, true)
for (const url of [state.apiUrl, state.controlUrl]) assert.equal(new URL(url).hostname, '127.0.0.1')
const base = process.env.BASE_URL || 'http://127.0.0.1:5199'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const shots = process.env.SHOT_DIR || 'output/playwright'
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
let pass = 0
const pageErrors = []
const check = (label, value = true) => { assert(value, label); console.log(`✓ ${label}`); pass++ }
const waitText = (page, text) => page.getByText(text, { exact: false }).first().waitFor()
const token = page => page.evaluate(() => sessionStorage.getItem('ops.session.token'))
const accountId = page => page.locator('.account-number code').textContent()
async function api(t, method, path, body, version, party) {
 const res = await fetch(state.apiUrl + '/api/v1' + path, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(party ? { 'X-Acting-Party': party } : {}), ...(version ? { 'If-Match': `"${version}"` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
 const parsed = await res.json(); assert(res.ok, `${method} ${path}: ${res.status}`); return parsed.data
}
async function control(path) { const res = await fetch(state.controlUrl + path, { headers: { Authorization: `Bearer ${state.controlToken}` } }); assert(res.ok); return res.json() }
async function login(page, phone) {
 await page.goto(base + '/login'); await page.getByTestId('phone-input').fill(phone)
 await page.getByTestId('send-code').click(); await page.getByTestId('code-input').waitFor()
 const { code } = await control('/code?phone=' + phone)
 await page.getByTestId('code-input').fill(code); await page.getByTestId('submit-login').click()
 await page.waitForURL('**/workspace'); await page.locator('.identity').first().waitFor()
}
async function newPage() { const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' }); const page = await context.newPage(); page.on('pageerror', e => pageErrors.push(e.message)); return page }
async function confirm(page) { await page.locator('.el-message-box').getByRole('button', { name: '确认', exact: true }).click() }
async function replyOnce(page, pattern, status, code) {
 const handler = async route => { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ meta: { request_id: 'synthetic-error-case' }, error: { code, message: 'Synthetic error', retryable: false, details: [] } }) }); await page.unroute(pattern, handler) }
 await page.route(pattern, handler)
}
try {
 const owner = await newPage()
 const suffix = String(Date.now()).slice(-7)
 const phone = '1391' + suffix
 await owner.goto(base + '/login')
 await replyOnce(owner, '**/api/v1/auth/sms-challenges', 503, 'SMS_NOT_READY')
 await owner.getByTestId('phone-input').fill(phone); await owner.getByTestId('send-code').click(); await waitText(owner, '短信服务暂不可用')
 check('短信未启用时不显示已发送', await owner.getByTestId('code-input').count() === 0)
 await owner.getByTestId('send-code').click(); await owner.getByTestId('code-input').waitFor()
 await owner.getByTestId('code-input').fill('000000'); await owner.getByTestId('submit-login').click(); await waitText(owner, '手机号或验证码不正确')
 const { code } = await control('/code?phone=' + phone)
 await owner.getByTestId('code-input').fill(code); await owner.getByTestId('submit-login').click(); await owner.waitForURL('**/workspace'); await owner.locator('.identity').first().waitFor()
 check('真实 HTTP 登录、账号与个人身份读取通过')
 const ownerToken = await token(owner)
 const personId = await owner.locator('.identity').first().getAttribute('data-party')
 await owner.getByRole('button', { name: '＋ 创建机构' }).click(); await owner.getByLabel('机构名称', { exact: true }).fill('回执保护机构（隔离测试）')
 const createRequests = []
 owner.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/api/v1/organizations')) createRequests.push({ key: req.headers()['idempotency-key'], body: req.postData() }) })
 // Throw while reading a successful real POST response, after the backend committed.
 await owner.evaluate(() => {
   const original = Response.prototype.text
   Response.prototype.text = async function () {
     const text = await original.call(this)
     if (this.url.endsWith('/api/v1/organizations')) { Response.prototype.text = original; throw new TypeError('synthetic body stream disconnect') }
     return text
   }
 })
 await owner.getByRole('button', { name: '提交创建' }).click(); await owner.getByTestId('retry-original').waitFor(); await owner.waitForFunction(() => !document.querySelector('[data-testid=retry-original]')?.disabled)
 check('响应体断流后保留待核对操作', await owner.getByRole('button', { name: '提交创建' }).isDisabled())
 await owner.reload(); await owner.getByTestId('retry-original').waitFor(); await owner.getByTestId('retry-original').click()
 await waitText(owner, '机构已创建，当前为待审核。')
 check('刷新后重试复用原键和原内容', createRequests.length === 2 && createRequests[0].key === createRequests[1].key && createRequests[0].body === createRequests[1].body)
 const orgId = await owner.locator('.identity.chosen').getAttribute('data-party')
 const partyList = await api(ownerToken, 'GET', '/me/parties?limit=100')
 check('服务器只创建一条机构', partyList.items.filter(x => x.party.display_name === '回执保护机构（隔离测试）').length === 1)
 check('新机构如实展示待审核', await owner.locator('.identity.chosen').innerText().then(t => t.includes('待审核')))
 // Advance the backend object version while the browser still holds version one.
 await api(ownerToken, 'PATCH', '/parties/' + orgId, { display_name: '后台已更新（隔离测试）' }, 1, orgId)
 await owner.getByLabel('机构名称', { exact: true }).fill('页面改名（隔离测试）'); await owner.getByRole('button', { name: '保存名称' }).click(); await waitText(owner, '这条记录已被他人修改')
 await owner.waitForFunction(() => document.querySelector('#rename')?.value === '后台已更新（隔离测试）')
 check('412后刷新真实名称和版本，不覆盖他人修改')
 await owner.getByLabel('机构名称', { exact: true }).fill('青禾网页（隔离测试）'); await owner.getByRole('button', { name: '保存名称' }).click(); await waitText(owner, '更新机构名称已完成')
 for (const name of ['作者', '剧本供应方', '制作方', 'MCN 机构', '企业客户']) {
   const card = owner.locator('.capability').filter({ has: owner.getByText(name, { exact: true }) })
   await card.getByRole('button', { name: '申请', exact: true }).click(); await card.getByText('待审核', { exact: true }).waitFor()
 }
 check('五类能力均申请成功并显示待审核')
 const recipient = await newPage(); await login(recipient, '1381' + suffix); const recipientId = await accountId(recipient)
 await owner.getByLabel('对方的账号编号').fill(recipientId); await owner.getByLabel('邀请截止时间（本地时间）').fill('2000-01-01T12:00'); assert.equal(await owner.getByRole('button', { name: '发送邀请', exact: true }).isDisabled(), true)
 check('邀请截止时间必须由人选择且是未来时间，无效时按钮禁用')
 const future = new Date(Date.now() + 86400000); future.setMinutes(future.getMinutes() - future.getTimezoneOffset())
 await owner.getByLabel('邀请截止时间（本地时间）').fill(future.toISOString().slice(0,16)); await owner.getByRole('button', { name: '发送邀请', exact: true }).click(); await waitText(owner, '邀请已发出，等待对方确认')
 check('发送邀请保存真实回执，不把对方直接加入')
 await recipient.getByRole('button', { name: '收到的邀请', exact: true }).click(); await recipient.getByRole('button', { name: '刷新邀请', exact: true }).click(); await recipient.locator('.invitation').first().waitFor()
 await recipient.getByRole('button', { name: '接受', exact: true }).click(); await confirm(recipient); await waitText(recipient, '已接受邀请')
 await recipient.locator(`[data-party="${orgId}"]`).click(); await waitText(recipient, '当前身份没有管理机构成员的权限')
 check('本人接受后出现机构，普通成员看不到管理功能', await recipient.getByRole('button', { name: '发送邀请', exact: true }).count() === 0)
 await owner.getByRole('button', { name: '刷新成员', exact: true }).click(); await owner.locator(`[data-member="${recipientId}"]`).waitFor()
 check('负责人不可移除', await owner.locator(`[data-member="${await accountId(owner)}"]`).getByText('不可移除').count() === 1)
 await owner.locator(`[data-member="${recipientId}"]`).getByRole('button', { name: '移除', exact: true }).click(); await confirm(owner); await owner.locator(`[data-member="${recipientId}"]`).getByText('已移除', { exact: true }).waitFor()
 check('移除只修改本机构成员关系')
 await recipient.getByRole('button', { name: '刷新', exact: true }).click(); await recipient.waitForFunction(id => !document.querySelector(`[data-party="${id}"]`), orgId)
 check('被移除后刷新清理机构身份')
 // Send again, decline, send once more and revoke through the actual API.
 async function inviteAgain() { await owner.getByLabel('对方的账号编号').fill(recipientId); await owner.getByLabel('邀请截止时间（本地时间）').fill(future.toISOString().slice(0,16)); await owner.getByRole('button', { name: '发送邀请', exact: true }).click(); await waitText(owner, '邀请已发出，等待对方确认') }
 await inviteAgain(); await recipient.getByRole('button', { name: '收到的邀请', exact: true }).click(); await recipient.getByRole('button', { name: '刷新邀请', exact: true }).click(); await recipient.getByRole('button', { name: '拒绝', exact: true }).waitFor(); await recipient.getByRole('button', { name: '拒绝', exact: true }).click(); await confirm(recipient); await waitText(recipient, '已拒绝邀请。')
 check('收到邀请可以明确拒绝')
 await inviteAgain(); await owner.locator('.sent .list-row').first().getByRole('button', { name: '撤回', exact: true }).click(); await confirm(owner); await owner.locator('.sent .list-row').first().getByText('已撤回', { exact: false }).waitFor()
 check('邀请方可撤回刚发送的回执')
 // Pagination is a transport fixture because producing 20 unrelated members would test data setup.
 const actualMember = (await api(ownerToken, 'GET', `/parties/${orgId}/members?limit=100`, undefined, undefined, orgId)).items[0]
 let paged = 0
 const membersPattern = '**/api/v1/parties/' + orgId + '/members?*'
 await owner.route(membersPattern, async route => {
   paged++
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meta: {}, data: { items: [{ ...actualMember, id: paged === 1 ? actualMember.id : randomUUID(), account_id: paged === 1 ? actualMember.account_id : '99999999-9999-4999-8999-999999999999' }], next_cursor: paged === 1 ? 'opaque-test-page' : null } }) })
 })
 await owner.getByRole('button', { name: '刷新成员', exact: true }).click(); await owner.getByRole('button', { name: '加载更多成员' }).waitFor(); await owner.getByRole('button', { name: '加载更多成员' }).click(); await owner.locator('[data-member="99999999-9999-4999-8999-999999999999"]').waitFor()
 check('成员分页追加数据并使用服务器游标', paged === 2)
 await owner.unroute(membersPattern)
 // Delayed private member response must not restore content after identity switch.
 let release
 const gate = new Promise(resolve => { release = resolve })
 let delivered
 const deliveredPromise = new Promise(resolve => { delivered = resolve })
 const delay = async route => { const response = await route.fetch(); await gate; await route.fulfill({ response }); delivered() }
 await owner.route(membersPattern, delay)
 const requested = owner.waitForRequest(r => r.url().includes(`/parties/${orgId}/members`))
 await owner.getByRole('button', { name: '刷新成员', exact: true }).click(); await requested
 await owner.locator(`[data-party="${personId}"]`).click(); release(); await deliveredPromise; await owner.unroute(membersPattern, delay); await owner.waitForTimeout(300)
 check('切身份后旧成员响应不会回写', await owner.locator('[data-member]').count() === 0)
 await owner.locator(`[data-party="${orgId}"]`).click(); await owner.locator('[data-member]').first().waitFor()
 // Real authority loss is separately covered by remove; these check action error copy.
 await replyOnce(owner, '**/api/v1/parties/' + orgId, 403, 'PARTY_ACTION_FORBIDDEN')
 await owner.getByLabel('机构名称', { exact: true }).fill('应被拒绝'); await owner.getByRole('button', { name: '保存名称' }).click(); await waitText(owner, '当前身份没有这项操作的权限')
 check('403如实提示并重新核对权限')
 await owner.getByLabel('机构名称', { exact: true }).fill('应限流'); await replyOnce(owner, '**/api/v1/parties/' + orgId, 429, 'RATE_LIMITED'); await owner.getByRole('button', { name: '保存名称' }).click(); await waitText(owner, '操作过于频繁')
 check('429显示限流而不报保存成功')
 await owner.getByRole('button', { name: '刷新', exact: true }).click(); await owner.waitForFunction(() => document.querySelector('#rename')?.value === '青禾网页（隔离测试）')
 await owner.screenshot({ path: shots + '/pr11-web-desktop.png', fullPage: true })
 await owner.setViewportSize({ width: 375, height: 900 }); await owner.screenshot({ path: shots + '/pr11-web-mobile.png', fullPage: true })
 check('375宽无横向溢出', await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
 // Authentication failure on any account route must remove private data and redirect.
 await replyOnce(owner, '**/api/v1/me/invitations?*', 401, 'AUTHENTICATION_REQUIRED')
 await owner.getByRole('button', { name: '收到的邀请', exact: true }).click(); await owner.getByRole('button', { name: '刷新邀请', exact: true }).click(); await owner.waitForURL('**/login')
 check('401清理令牌、邀请回执及私有页面', await owner.evaluate(() => !sessionStorage.getItem('ops.session.token') && !sessionStorage.getItem('ops.session.receipts')))
 await recipient.getByRole('button', { name: '退出登录', exact: true }).click(); await recipient.locator('.el-message-box').getByRole('button', { name: '退出', exact: true }).click(); await recipient.waitForURL('**/login')
 check('退出返回登录页并清理私有状态', await recipient.evaluate(() => !sessionStorage.getItem('ops.session.token')))
 check('浏览器没有未捕获异常', pageErrors.length === 0)
 console.log(`PASS ${pass} checks; real isolated HTTP/MySQL; synthetic SMS; screenshots: ${shots}`)
} finally { await browser.close() }
