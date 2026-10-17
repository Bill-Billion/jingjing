#!/usr/bin/env node
// Compiled Flutter UI -> isolated real HTTP/MySQL. Never persist fixture sessions.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(resolve(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
assert(process.env.CUSTOMIZATION_ACCESS_FILE, 'Set CUSTOMIZATION_ACCESS_FILE to the running local sandbox')
const fixture = JSON.parse(await readFile(process.env.CUSTOMIZATION_ACCESS_FILE, 'utf8'))
assert.equal(fixture.synthetic_only, true)
assert.equal(new URL(fixture.base_url).hostname, '127.0.0.1')
const base = process.env.CUSTOMIZATION_APP_URL || 'http://127.0.0.1:5000'
assert.equal(new URL(base).origin, 'http://127.0.0.1:5000')
const output = resolve(process.env.CUSTOMIZATION_EVIDENCE_DIR || join(root, 'output/playwright/v5-r01-app-final'))
await mkdir(output, { recursive: true })
const verifyIntake = process.argv.includes('--verify-intake')
const resultFile = join(output, verifyIntake ? 'APP_INTAKE_RESULTS.json' : 'APP_RESULTS.json')
const checks = [], errors = [], requests = [], screenshots = []
let requestId = process.env.CUSTOMIZATION_REQUEST_ID || null, submissionHash = null, failure = null
const check = (name, value = true) => { assert(value, name); checks.push(name); console.log('✓ ' + name) }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const buyer = fixture.accounts.buyer
async function api(path) {
  const r = await fetch(fixture.base_url + path, { headers: { Authorization: 'Bearer ' + buyer.bearer_token, 'X-Acting-Party': buyer.party_id } })
  assert(r.ok, `Isolated GET ${path}: ${r.status}`)
  return (await r.json()).data
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
page.on('pageerror', e => errors.push(e.message))
page.on('request', r => {
  if (r.url().startsWith(fixture.base_url) && r.url().includes('customization')) {
    const h = r.headers()
    requests.push({ method: r.method(), path: new URL(r.url()).pathname, bearer_present: !!h.authorization, acting_party_present: !!h['x-acting-party'], if_match: h['if-match'] || null, key_present: !!h['idempotency-key'] })
  }
})
const button = name => page.getByRole('button', { name, exact: typeof name === 'string' })
const response = (method, path) => {
  const p = page.waitForResponse(r => r.request().method() === method && new URL(r.url()).pathname === '/api/v1' + path)
  p.catch(() => {})
  return p
}
async function data(r) { assert(r.ok(), `Real UI HTTP ${r.status()}`); return (await r.json()).data }
async function top() { await page.mouse.move(185, 350); await page.mouse.wheel(0, -20000); await page.waitForTimeout(250) }
async function press(locator) {
  for (let n = 0; n < 35; n++) {
    const b = await locator.count() ? await locator.boundingBox() : null
    if (b && b.y + b.height / 2 > 60 && b.y + b.height / 2 < 825) {
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
      await page.waitForTimeout(250)
      return
    }
    await page.mouse.move(185, 450); await page.mouse.wheel(0, b?.y < 60 ? -240 : 240); await page.waitForTimeout(180)
  }
  throw new Error('Flutter control did not enter viewport')
}
async function fill(value) {
  const field = page.getByRole('textbox').first()
  await press(field)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.insertText(value)
  await page.waitForTimeout(200)
  // Canvas rebuilds replace Flutter's native editing proxy. Verify exact text in
  // the real saved response below, rather than reading a detached editing input.
  await page.keyboard.press('Tab')
}
async function draftSettled() {
  await page.getByText('故事草稿已保存，可以从“我的需求”继续填写。', { exact: true }).waitFor()
  await button('保存业务草稿').click({ trial: true })
}
async function shot(name) {
  await top(); await page.evaluate(() => document.fonts.ready)
  const body = await page.locator('body').innerText()
  for (const a of Object.values(fixture.accounts)) assert(!body.includes(a.bearer_token), 'No credential in visible UI')
  await page.screenshot({ path: join(output, name + '.png') }); screenshots.push(name + '.png')
}
async function start(route) {
  await page.goto(base + '/#' + route)
  const semantics = page.locator('flt-semantics-placeholder')
  await semantics.waitFor({ state: 'attached' }); await semantics.evaluate(e => e.click())
  await page.getByRole('button').first().waitFor()
  await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready)
}
try {
  if (verifyIntake) {
    assert(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId || ''))
    const prior = JSON.parse(await readFile(join(output, 'APP_RESULTS.json'), 'utf8'))
    assert.equal(prior.request_id, requestId)
    const received = response('GET', '/customization-requests/' + requestId)
    await start('/customization/' + requestId)
    const current = await data(await received)
    check('App重新打开同一故事，真实状态为平台受理中', current.current_status === 'INTAKE')
    check('受理前后正式提交内容与模板保持相同', hash(current.submission) === prior.submission_sha256)
    await button('重新读取当前进度').waitFor()
    const visible = await page.locator('body').ariaSnapshot()
    check('App显示平台受理中及实际受理时间', !!current.intake_at && visible.includes('平台受理中') && visible.includes('开始受理：'))
    check('已提交故事不能继续保存或提交', await button('保存业务草稿').count() === 0 && await button('正式提交需求').count() === 0)
    submissionHash = hash(current.submission)
    await shot('app-story-intake-390')
  } else {
    await start('/square')
    assert.equal(await page.getByRole('tab').count(), 5)
    for (const name of ['广场', '试镜', '通告', '消息', '我的']) assert.equal(await page.getByRole('tab', { name, exact: true }).count(), 1)
    check('广场显示五个V5主入口')
    await shot('app-square-390')
    const categories = response('GET', '/customization-categories')
    await press(button(/^把我的故事拍成片/)); await data(await categories)
    await press(button(/^测试用必填附件场景/))
    check('必填私有附件未开放时正式提交禁用', await button('正式提交需求').isDisabled())
    await shot('app-required-attachment-blocked-390')
    await press(button(/^测试用人生片段/))
    check('切换品类使用真实模板的不同问题', await page.getByRole('textbox').count() === 2)
    await press(button(/^测试用家庭故事/))
    await press(button('正式提交需求'))
    check('必填缺失显示字段提示，未发提交请求', await page.getByText('这一项尚未填写。', { exact: true }).count() === 2 && !requests.some(r => r.path.endsWith('/submissions')))
    await fill('合成联调草稿：记录一家人团聚的片段。')
    const created = response('POST', '/customization-requests')
    await press(button('保存业务草稿'))
    const draft = await data(await created); requestId = draft.id
    check('App真实保存不完整业务草稿', draft.current_status === 'DRAFT' && draft.answers.story.includes('合成联调草稿') && draft.answers.tone === '')
    await draftSettled()
    await button('Back').click()
    await page.getByRole('tab', { name: '我的', exact: true }).click()
    const listed = response('GET', '/customization-requests')
    await press(button(/^我的故事与草稿/)); const list = await data(await listed)
    check('从我的找回刚保存的草稿', list.items.some(r => r.id === requestId && r.current_status === 'DRAFT'))
    const restored = response('GET', '/customization-requests/' + requestId)
    await press(button(new RegExp('^测试用家庭故事[\\s\\S]*编号 ' + requestId.slice(0, 8)))); await data(await restored)
    await page.getByRole('textbox').first().waitFor()
    await page.waitForTimeout(450)
    // Flutter populates its native editing input when the canvas field receives focus.
    await press(page.getByRole('textbox').first())
    check('重新打开草稿恢复已保存文字', await page.getByRole('textbox').evaluateAll((nodes, expected) => nodes.some(n => n.value === expected), draft.answers.story))
    await shot('app-restored-draft-390')
    await fill('')
    let saved = response('PATCH', '/customization-requests/' + requestId)
    await press(button('保存业务草稿')); await data(await saved); await draftSettled()
    check('清空后保存真实替换原答案，不恢复旧值', (await api('/customization-requests/' + requestId)).answers.story === '')
    const finalStory = '合成联调正式故事：记录一家人团聚，保留普通生活中的温暖瞬间。'
    await fill(finalStory)
    await press(button('请选择'))
    await press(page.getByRole('menuitem', { name: '温暖', exact: true }))
    saved = response('PATCH', '/customization-requests/' + requestId)
    await press(button('保存业务草稿'))
    const completeDraft = await data(await saved); await draftSettled()
    check('实际页面填写的完整故事与选项已保存', completeDraft.answers.story === finalStory && completeDraft.answers.tone === '温暖')
    await shot('app-story-draft-390')
    const submitted = response('POST', '/customization-requests/' + requestId + '/submissions')
    await press(button('正式提交需求'))
    await page.getByRole('alertdialog').waitFor(); await press(button('确认'))
    const actual = await data(await submitted)
    check('正式提交真实写入同一需求，保存原模板与完整答案', actual.current_status === 'SUBMITTED' && actual.submission.answers.story === finalStory && actual.submission.answers.tone === '温暖' && actual.submission.template_snapshot.title === draft.template_snapshot.title)
    submissionHash = hash(actual.submission)
    await button('保存业务草稿').waitFor({ state: 'hidden' })
    check('App显示平台待查看，不能继续保存或重复提交', (await page.locator('body').ariaSnapshot()).includes('平台待查看') && await button('保存业务草稿').count() === 0 && await button('正式提交需求').count() === 0)
    await shot('app-story-submitted-390')
    const writes = requests.filter(r => !['GET', 'OPTIONS'].includes(r.method))
    check('写入携带原操作幂等键和正确版本', writes.length === 4 && writes.every(r => r.bearer_present && r.acting_party_present && r.key_present && (r.path === '/api/v1/customization-requests' || /^"\d+"$/.test(r.if_match || ''))))
  }
  check('浏览器无未处理页面异常', errors.length === 0)
} catch (e) {
  failure = e.message; process.exitCode = 1
  console.error(e.stack)
  await page.screenshot({ path: join(output, 'app-debug.png') }).catch(() => {})
  await writeFile(join(output, 'app-debug-semantics.txt'), await page.locator('body').ariaSnapshot().catch(() => '')).catch(() => {})
} finally {
  await writeFile(resultFile, JSON.stringify({ synthetic_only: true, real_backend: true, native_device_verified: false, request_id: requestId, submission_sha256: submissionHash, checks, passed: checks.length, complete: !failure, failure, page_errors: errors, screenshots, requests }, null, 2) + '\n')
  await browser.close()
}
