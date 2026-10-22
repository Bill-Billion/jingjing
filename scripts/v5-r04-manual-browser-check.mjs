#!/usr/bin/env node
// The artist agreement uses its own endpoint and never requires generic project access.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
const f = JSON.parse(await readFile(process.env.DELIVERY_ACCESS_FILE, 'utf8'))
assert(f.synthetic_only && new URL(f.base_url).hostname === '127.0.0.1')
const out = resolve('output/playwright/v5-r04/manual')
const prepared = JSON.parse(await readFile(join(out, 'MANUAL_PREPARE_RESULTS.json'), 'utf8'))
assert(prepared.result === 'PASS' && prepared.synthetic_only)
const id = prepared.request_id, a = f.accounts.artist, route = '/customization-requests/' + id + '/manual-sample'
const read = async () => { const r = await fetch(f.base_url + route, { headers: { Authorization: 'Bearer ' + a.bearer_token, 'X-Acting-Party': a.party_id } }); assert(r.ok); return (await r.json()).data }
const original = await read()
assert.equal(original.data.confirmation, null)
const { chromium } = createRequire(join(process.cwd(), '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 375, height: 844 }, locale: 'zh-CN' })
const reads = [], writes = [], checks = [], shots = [], errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (/overflowed by|EXCEPTION CAUGHT/i.test(m.text())) errors.push(m.text()) })
page.on('request', r => { if (r.url().startsWith(f.base_url)) { const p = new URL(r.url()).pathname; if (r.method() === 'GET') reads.push(p); else if (r.method() === 'POST') writes.push({ path: p, version: r.headers()['if-match'], body: r.postDataJSON() }) } })
async function press(target) {
  for (let n = 0; n < 60; n++) {
    const b = await target.count() ? await target.boundingBox() : null
    if (b && b.y + b.height / 2 > 58 && b.y + b.height / 2 < 834) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150); return }
    await page.mouse.move(180, 420); await page.mouse.wheel(0, b?.y < 58 ? -220 : 220); await page.waitForTimeout(85)
  }
  throw Error('Expected artist control is outside viewport')
}
async function shot(file, note) {
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(200)
  const body = await page.locator('body').ariaSnapshot()
  Object.values(f.accounts).forEach(x => assert(!body.includes(x.bearer_token)))
  await page.screenshot({ path: join(out, file) })
  shots.push({ file, route: '/production/manual-sample?requestId=' + id, viewport: page.viewportSize(), source: '37-custom-top.png / 66、38-custom-extra.png / 67及本人授权延伸', note })
}
let failure
try {
  await page.goto('http://127.0.0.1:5500/#/production/manual-sample?requestId=' + id)
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' }); await page.locator('flt-semantics-placeholder').evaluate(e => e.click())
  await page.getByRole('heading', { name: '人工样片本人约定', exact: true }).waitFor()
  await page.getByRole('group', { name: /^具体权利与委托/ }).waitFor()
  await shot('21-manual-agreement-375.png', '实际本人身份、已绑定具体cast与约定；无订单/付款/成片')
  const button = page.getByRole('button', { name: '本人确认这版委托', exact: true })
  assert(await button.isDisabled()); checks.push('本人未明确核对前禁止确认')
  await page.setViewportSize({ width: 390, height: 844 })
  await press(page.getByRole('checkbox', { name: '我已核对本版具体真人、数字人和委托条款', exact: true }))
  await press(button)
  await page.getByRole('alertdialog').waitFor()
  await shot('22-manual-self-confirm-390.png', '仅本人确认原绑定快照，不代替报价、付款或验收')
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(route + '/confirmation'))
  await press(page.getByRole('button', { name: '确认办理', exact: true }))
  assert((await response).ok())
  await page.waitForLoadState('networkidle')
  const current = await read(), post = writes.find(x => x.path.endsWith('/confirmation'))
  assert.equal(current.data.confirmation.account_id, a.account_id)
  assert.equal(post.version, '"' + original.object_version + '"')
  assert.equal(post.body.content_sha256, original.content_sha256)
  assert.equal(current.projects.length, 0)
  checks.push('实际本人用绑定记录原版本与哈希明确确认；项目、付款、交付仍为空')
  assert(!reads.some(p => p.startsWith('/api/v1/production/records/') || p.endsWith('/fulfillment') || p.endsWith('/content')))
  checks.push('专用本人约定页面不前置读取通用项目/履约，不探测成片')
  await shot('23-manual-confirmed-390.png', '本人确认已记录，仍未有订单或成片；50/50规则不混三期')
  assert.equal(errors.length, 0); checks.push('窄屏页面无运行异常或Flutter溢出')
} catch (e) {
  failure = e.message; process.exitCode = 1
  await writeFile(join(out, 'failure-diagnostic.txt'), await page.locator('body').ariaSnapshot()).catch(() => {})
  await page.screenshot({ path: join(out, 'failure-diagnostic.png') }).catch(() => {})
}
finally {
  const value = JSON.stringify({ result: failure ? 'FAIL' : 'PASS', synthetic_only: true, request_id: id, checks, screenshots: shots, reads, writes, errors, failure, limits: ['未创建人工样片订单或付费', '本人专用成片下载的权限另有专项测试，本次没有可下载成片', '浏览器Flutter页面，未声称原生真机'] }, null, 2) + '\n'
  Object.values(f.accounts).forEach(x => assert(!value.includes(x.bearer_token)))
  await writeFile(join(out, 'MANUAL_APP_RESULTS.json'), value)
  await browser.close()
  console.log(JSON.stringify({ result: failure ? 'FAIL' : 'PASS', checks: checks.length, screenshots: shots.length, failure }))
}
