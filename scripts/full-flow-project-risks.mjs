#!/usr/bin/env node
// Uses the isolated project fixture; no external service or real customer data.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const { chromium } = require('playwright-core')
const state = JSON.parse(await readFile(resolve(root, '.local/pr18-ui-runtime.json'), 'utf8'))
assert.equal(state.testOnly, true)
const base = 'http://127.0.0.1:5207'
for (const url of [base, state.apiUrl, state.controlUrl]) assert.equal(new URL(url).hostname, '127.0.0.1')
const evidence = resolve(root, process.env.JX_BROWSER_EVIDENCE_DIR || 'docs/testing/evidence/20261005/commercial-release/risks')
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
const results = [], errors = [], actors = {}
const redact = value => { let s = String(value); for (const secret of [state.controlToken, ...Object.values(actors).map(a => a.token)].filter(Boolean)) s = s.replaceAll(secret, '[REDACTED]'); return s.replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]') }
async function control(route, fixture = state) {
  const r = await fetch(fixture.controlUrl + route, { method: 'POST', headers: { Authorization: 'Bearer ' + fixture.controlToken } })
  assert.equal(r.status, 200); return r.json()
}
async function login(name, fixture = state, web = base) {
  const account = fixture.accounts[name], context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage()
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(redact(e.message)))
  await page.goto(web + '/login'); await page.getByTestId('phone-input').fill(account.phone)
  const sent = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/auth/sms-challenges'))
  await page.getByTestId('send-code').click(); assert.equal((await sent).status(), 200)
  const code = await fetch(fixture.controlUrl + '/code?phone=' + account.phone, { headers: { Authorization: 'Bearer ' + fixture.controlToken } }).then(r => r.json())
  await page.getByTestId('code-input').fill(code.code); await page.getByTestId('submit-login').click(); await page.waitForURL('**/workspace')
  await page.locator(`[data-party="${account.actingPartyId || account.personalPartyId}"]`).click()
  const token = await page.evaluate(() => sessionStorage.getItem('ops.session.token')); assert(token)
  return actors[name] = { ...account, page, token }
}
async function get(actor, route) {
  const r = await fetch(state.apiUrl + '/api/v1/projects' + route, { headers: { Authorization: 'Bearer ' + actor.token, ...(actor === actors.reviewer ? {} : { 'X-Acting-Party': actor.actingPartyId || actor.personalPartyId }) } })
  assert.equal(r.status, 200); return (await r.json()).data
}
const id = key => typeof state.records[key] === 'string' ? state.records[key] : state.records[key].id
async function go(page, route) {
  await page.goto(base + route)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.getByText('正在读取身份与项目记录…', { exact: true }).waitFor({ state: 'hidden' })
}
async function check(name, task) {
  try { await task(); results.push({ name, result: 'PASS' }); console.log('PASS ' + name) }
  catch (e) { results.push({ name, result: 'FAIL', error: redact(e.message).slice(0, 1000) }); throw e }
}
async function read(page, asset, status) {
  const reply = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('/evidence/' + asset))
  await page.getByTestId('project-read-evidence-' + asset).click(); assert.equal((await reply).status(), status)
}
async function fillReview(page) {
  for (const field of ['channel_verified', 'requirements_verified']) await page.getByTestId('review-' + field).check()
  await page.getByTestId('review-decision').selectOption('APPROVED')
  await page.getByTestId('review-reason').fill('仅本机模拟材料：检查读取失败不能沿用旧核验。')
}
let activePage
try {
  const reviewer = await login('reviewer'), sponsor = await login('sponsor'), page = reviewer.page
  activePage = page
  const channel = await get(reviewer, '/records/' + id('webChannelPending')), asset = channel.data.evidence_asset_id
  for (const [setting, label] of [['storage', '存储暂不可用'], ['evidence', '材料内容被改动']]) {
    await check(label + '后清除旧已读和核验选择，恢复后须重新阅读', async () => {
      await go(page, '/projects/reviews/channels/' + channel.id)
      await read(page, asset, 200); await page.getByText(/本次已读取/).waitFor(); await fillReview(page)
      assert.equal(await page.getByTestId('project-review-submit').isEnabled(), true)
      await control('/' + setting + '?enabled=false')
      try {
        await read(page, asset, 503); await page.getByRole('alert').waitFor()
        await page.screenshot({ path: resolve(evidence, setting + '-failed.png'), fullPage: true })
        assert.equal(await page.getByText(/本次已读取/).count(), 0, '读取失败后仍显示旧已读状态')
        assert.equal(await page.getByText('已通过当前权限接口读取私有材料。请实际核对内容后填写结论。', { exact: true }).count(), 0)
        assert.equal(await page.getByTestId('review-channel_verified').isChecked(), false)
        assert.equal(await page.getByTestId('project-review-submit').isDisabled(), true)
      } finally { await control('/' + setting + '?enabled=true') }
      await read(page, asset, 200); await page.getByText(/本次已读取/).waitFor()
      assert.equal(await page.getByTestId('project-review-submit').isDisabled(), true)
      await fillReview(page); assert.equal(await page.getByTestId('project-review-submit').isEnabled(), true)
    })
  }
  await check('审核权限撤销后旧材料和提交表单清除，恢复后重新加载', async () => {
    await control('/reviewer-permission?action=PROJECT_REVIEW&enabled=false')
    try { await read(page, asset, 403); await page.getByRole('alert').waitFor(); assert.equal(await page.getByTestId('review-reason').count(), 0) }
    finally { await control('/reviewer-permission?action=PROJECT_REVIEW&enabled=true') }
    await go(page, '/projects/reviews/channels/' + channel.id); await page.getByTestId('review-reason').waitFor()
  })
  activePage = sponsor.page
  for (const [key, label] of [['webBlocked', '演员已撤回公开授权'], ['appBlocked', '制作款发生退款']]) {
    await check(label + '时不得显示可以开工', async () => {
      const scenario = state.scenarios[key]
      assert(scenario, '缺少独立阻断场景')
      const response = await get(sponsor, '/projects/' + scenario.projectId + '/readiness')
      assert.notEqual(response.current_status, 'AVAILABLE')
      await go(sponsor.page, '/projects/projects/' + scenario.projectId + '/readiness')
      assert.equal(await sponsor.page.getByText('当前开工条件齐全', { exact: true }).count(), 0)
      const start = sponsor.page.getByTestId('project-start')
      assert.equal(await start.count() === 0 || await start.isDisabled(), true)
      await sponsor.page.screenshot({ path: resolve(evidence, key + '.png'), fullPage: true })
    })
  }
  await check('商单材料重复读取失败不保留旧成功提示，恢复后可重新下载', async () => {
    const gigs = JSON.parse(await readFile(resolve(root, '.local/pr17-ui-runtime.json'), 'utf8'))
    assert.equal(gigs.testOnly, true)
    for (const url of [gigs.apiUrl, gigs.controlUrl]) assert.equal(new URL(url).hostname, '127.0.0.1')
    const actor = await login('reviewer', gigs, 'http://127.0.0.1:5205'), p = actor.page
    activePage = p
    await p.goto('http://127.0.0.1:5205/gigs/reviews/requests/' + gigs.records.webGigPending.id)
    const button = p.getByRole('button', { name: '读取本记录私有证明', exact: true }).first()
    const download = async status => { const reply = p.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('/evidence/')); await button.click(); assert.equal((await reply).status(), status) }
    const notice = p.getByText('已按当前权限读取私有材料并发起下载。', { exact: true })
    await download(200); await notice.waitFor()
    await control('/storage?enabled=false', gigs)
    try { await download(503); await p.getByRole('alert').waitFor(); assert.equal(await notice.count(), 0); await p.screenshot({ path: resolve(evidence, 'gigs-storage-failed.png'), fullPage: true }) }
    finally { await control('/storage?enabled=true', gigs) }
    await download(200); await notice.waitFor()
  })
  assert.equal(errors.length, 0)
} catch (e) {
  console.error(redact(e.stack)); process.exitCode = 1
  await activePage?.screenshot({ path: resolve(evidence, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  await writeFile(resolve(evidence, 'results.json'), JSON.stringify({ syntheticOnly: true, fixture: { pid: state.pid, schema: state.schema }, results, pageErrors: errors, passed: results.filter(r => r.result === 'PASS').length, total: results.length }, null, 2) + '\n')
  await browser.close()
}
