#!/usr/bin/env node
// Real Flutter pages against an explicitly synthetic, loopback-only backend.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const f = JSON.parse(await readFile(process.env.DELIVERY_ACCESS_FILE, 'utf8'))
assert(f.synthetic_only && new URL(f.base_url).hostname === '127.0.0.1')
const app = process.env.DELIVERY_APP_URL || 'http://127.0.0.1:5500'
assert.equal(app, 'http://127.0.0.1:5500')
const out = resolve(process.env.DELIVERY_EVIDENCE_DIR || 'output/playwright/v5-r04/app')
assert(out.startsWith(resolve('output/playwright/v5-r04/')))
const phase = process.env.DELIVERY_APP_PHASE || 'all'
assert(['all', 'matrix', 'receipt', 'case', 'cross', 'download'].includes(phase))
await mkdir(out, { recursive: true })
const { chromium } = createRequire(join(process.cwd(), '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const tokens = Object.values(f.accounts).map(a => a.bearer_token)
const redact = value => tokens.reduce((s, t) => s.replaceAll(t, '[redacted]'), String(value))
const sha = value => createHash('sha256').update(value || '').digest('hex')
const checks = [], shots = [], errors = [], consoleErrors = [], reads = [], writes = []
const check = (name, ok = true) => { assert(ok, name); checks.push({ name, result: 'PASS' }); console.log('✓ ' + name) }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
let context, page, failure
async function api(path) {
  const a = f.accounts.buyer
  const r = await fetch(f.base_url + path, { headers: { Authorization: 'Bearer ' + a.bearer_token, 'X-Acting-Party': a.party_id }, signal: AbortSignal.timeout(10000) })
  assert(r.ok, 'Synthetic fixture read failed: ' + path + ' ' + r.status)
  return (await r.json()).data
}
async function open(route, heading, width = 390) {
  if (context) await context.close()
  context = await browser.newContext({ viewport: { width, height: width >= 768 ? 1024 : 844 }, locale: 'zh-CN', acceptDownloads: true })
  page = await context.newPage()
  page.on('pageerror', e => errors.push(redact(e.message)))
  page.on('console', m => { if (/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/i.test(m.text())) consoleErrors.push(redact(m.text())) })
  page.on('request', r => {
    if (!r.url().startsWith(f.base_url)) return
    const path = new URL(r.url()).pathname
    if (r.method() === 'GET') reads.push({ method: 'GET', path, search: new URL(r.url()).search })
    else if (r.method() !== 'OPTIONS') writes.push({ method: r.method(), path, body: r.postDataJSON(), body_sha256: sha(r.postData()), key_sha256: sha(r.headers()['idempotency-key']), version: r.headers()['if-match'], acting_party: r.headers()['x-acting-party'] || null })
  })
  await page.goto(app + '/#' + route)
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' })
  await page.locator('flt-semantics-placeholder').evaluate(e => e.click())
  await page.getByRole('heading', { name: heading, exact: true }).first().waitFor()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(250)
}
const button = name => page.getByRole('button', { name, exact: true })
async function reveal(target) {
  for (let n = 0; n < 65; n++) {
    const b = await target.count() ? await target.first().boundingBox() : null
    if (b && b.y + b.height / 2 > 58 && b.y + b.height / 2 < page.viewportSize().height - 10) return b
    await page.mouse.move(Math.min(page.viewportSize().width / 2, 190), 410)
    await page.mouse.wheel(0, b?.y < 58 ? -240 : 240)
    await page.waitForTimeout(85)
  }
  throw Error('Flutter control did not enter viewport')
}
async function press(target) {
  const b = await reveal(target)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(150)
}
async function fill(target, value) {
  await press(target)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type(value, { delay: 2 })
  await page.waitForTimeout(180)
  assert.equal(await target.inputValue(), value)
}
async function top() {
  await page.mouse.move(Math.min(page.viewportSize().width / 2, 190), 400)
  await page.mouse.wheel(0, -20000)
  await page.waitForTimeout(150)
}
async function shot(name, source, note = '') {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  const body = await page.locator('body').ariaSnapshot()
  tokens.forEach(token => assert(!body.includes(token)))
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
  await page.mouse.move(0, 0)
  await page.screenshot({ path: join(out, name + '.png') })
  shots.push({ file: name + '.png', route: new URL(page.url()).hash.slice(1), viewport: page.viewportSize(), source, note, result: 'CAPTURED' })
}
try {
  const s = f.scenarios
  if (['all', 'matrix'].includes(phase)) {
  await open('/production', '参与制作项目')
  check('实际项目列表读取当前fixture', reads.some(r => r.path === '/api/v1/production/projects'))
  await shot('01-projects-390', '37-custom-top.png / 65我参与的故事')

  await open('/production/project?projectId=' + s.unpaid.project_id, '制作项目')
  await page.getByRole('group', { name: /^给谁制作，使用谁的形象/ }).waitFor()
  await shot('02-project-unpaid-390', '37-custom-top.png / 66制作任务详情', '未付款与未开工分别显示；合成项目无虚构人物海报')
  await reveal(page.getByRole('group', { name: /^按原订单付款与验收/ }))
  await shot('03-original-installments-390', '34-orders-top.png / 55、57', '金额和期限取冻结订单')
  await open('/production/project?projectId=' + s.performer.project_id, '制作项目', 375)
  await page.getByRole('group', { name: /^给谁制作，使用谁的形象/ }).waitFor()
  await shot('04-cast-375', '37-custom-top.png / 66', '真实合成cast、独立造型/声音/同意引用；不代填示例人物')
  await open('/production/project?projectId=' + s.preview.project_id, '制作项目', 768)
  await shot('05-project-768', '37-custom-top.png / 66', '平板内容列')
  await open('/production/story?projectId=' + s.preview.project_id, '订单固定的原故事')
  await page.getByText('只读保存本单采用的正式故事。重新修改需求不会覆盖这里的原约定。', { exact: true }).waitFor()
  const originalStory = await api('/production/projects/' + s.preview.project_id + '/story')
  check('冻结故事按实际模板字段呈现并读取原答案', originalStory.answers.story.length > 0 && await page.getByRole('textbox', { name: originalStory.template_snapshot.fields.find(field => field.key === 'story').label, exact: true }).count() === 1)
  await shot('06-frozen-story-390', '37-custom-top.png / 64、66', '只读原订单冻结故事')

  for (const [name, id] of [['unpaid', s.unpaid.order_id], ['interim', s.preview.order_id], ['paid', s.final_paid.order_id]]) {
    await open('/trade/record?recordId=' + id, '订单详情')
    await shot('07-order-' + name + '-390', '34-orders-top.png / 55、57', '合成收款状态；没有真实渠道操作')
    await reveal(page.getByRole('group', { name: /^订单付款/ }))
    await shot('08-payment-' + name + '-390', '34-orders-top.png / 57收银台', '按原安装计划及实际里程碑判断可付节点')
  }
  await open('/production/aftercare?projectId=' + s.cancelled_refund.project_id, '售后与争议')
  await shot('09-refund-required-390', '35-orders-aftercare.png / 61售后争议', '应退与已核实实际退款分开')
  const beforeRefund = (await api('/production/projects/' + s.cancelled_refund.project_id + '/fulfillment')).cancellation.actual_refunded_minor
  await press(button('核对原项目实际收退款'))
  const afterRefund = await api('/production/projects/' + s.cancelled_refund.project_id + '/fulfillment')
  check('核对收退款没有虚构渠道退款', afterRefund.state === 'REFUND_REQUIRED' && afterRefund.cancellation.actual_refunded_minor === beforeRefund)
  await open('/production/aftercare?projectId=' + s.dispute.project_id, '售后与争议', 375)
  await shot('10-rights-dispute-375', '35-orders-aftercare.png / 61', '权利争议暂停，未冒称恢复')
  }

  if (['all', 'receipt'].includes(phase)) {
  const versionPath = '/production/version?versionId=' + s.preview.version_id
  await open(versionPath, '审阅样片')
  await shot('11-sample-before-open-390', '37-custom-top.png / 66及成片审阅', '仅显式读取私有预览，没有正式文件预取')
  await reveal(button('确认本次交付通知已读'))
  await reveal(button('明确确认本次交付已收到'))
  check('未打开视频不能确认通知或收讫', await button('确认本次交付通知已读').isDisabled() && await button('明确确认本次交付已收到').isDisabled())
  let failed = false
  await page.route('**/production/versions/' + s.preview.version_id + '/content?variant=preview', async route => { if (!failed) { failed = true; await route.abort('failed') } else await route.continue() })
  await top()
  await press(button('播放预览'))
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(250)
  await reveal(button('明确确认本次交付已收到'))
  check('预览失败仍禁用收讫', await button('明确确认本次交付已收到').isDisabled())
  await top()
  await shot('12-preview-failed-390', '46-states-d.png / 文件异常', '故障注入；不以HTTP尝试冒充已查看')
  await page.unroute('**/production/versions/' + s.preview.version_id + '/content?variant=preview')
  await press(button('播放预览'))
  await button('暂停预览').waitFor()
  await page.waitForTimeout(300)
  check('预览真实加载并成功播放可用合成MP4', await page.locator('video').evaluateAll(videos => videos.some(v => v.readyState >= 2 && v.currentTime > 0)))
  await top()
  await shot('13-sample-playing-390', '37-custom-top.png / 66', '可播放色条；不代表真实成片、水印、音画或AI标识验收')
  await press(button('确认本次交付通知已读'))
  await button('本次交付通知已读').waitFor()
  check('实际通知已读后刷新PROJECT版本再允许明确收讫', await button('明确确认本次交付已收到').isEnabled())
  await press(button('明确确认本次交付已收到'))
  await page.getByRole('alertdialog').waitFor()
  await shot('14-explicit-receipt-390', '37-custom-top.png / 66及交付通知', '明确确认对话；不是验收或付款')
  const receiptResponse = page.waitForResponse(r => r.url().endsWith('/production/projects/' + s.preview.project_id + '/delivery-receipt') && r.request().method() === 'POST')
  await press(button('确认办理'))
  const receipt = await receiptResponse
  assert(receipt.ok())
  const state = (await receipt.json()).data
  check('服务端当前正式版本收讫后记录明确起点及截止', !!state.receipt.started_at && !!state.receipt.deadline_at && state.receipt.version_id === s.preview.version_id)
  await reveal(page.getByRole('group', { name: /^先查看，再明确收讫/ }))
  await shot('15-receipt-deadline-390', '37-custom-top.png / 66', '截止直接取服务器，不在客户端臆算七天')

  await press(button('本版确认与修改意见'))
  await page.getByRole('heading', { name: '提交本版意见', exact: true }).waitFor()
  const feedbackNote = page.getByRole('textbox', { name: /本版修改意见/ })
  await reveal(feedbackNote)
  await fill(feedbackNote, '合成联调：按本单已确认的原约定纠正内容，不增加创作要求。')
  await shot('15b-platform-correction-390', '38-custom-extra.png / 本版意见', '平台纠错与创意追加分开，原合同不改写')
  const feedbackResponse = page.waitForResponse(r => r.url().endsWith('/production/versions/' + s.preview.version_id + '/feedback') && r.request().method() === 'POST')
  await press(button('提交修改意见'))
  await press(button('确认办理'))
  assert((await feedbackResponse).ok())
  await page.getByRole('heading', { name: '制作项目', exact: true }).waitFor()
  const corrected = await api('/production/projects/' + s.preview.project_id + '/fulfillment')
  check('平台纠错不扣创意次数并使旧收讫计时失效', corrected.creative_changes === 0 && corrected.receipt === null && writes.some(w => w.path.endsWith('/' + s.preview.version_id + '/feedback') && w.body.change_kind === 'PLATFORM_CORRECTION'))
  }

  if (['all', 'case'].includes(phase)) {
  const priorCaseCount = (await api('/production/projects/' + s.performer.project_id + '/fulfillment')).cases.filter(c => c.data.kind === 'EXTENSION').length
  await open('/production/aftercare?projectId=' + s.performer.project_id + '&kind=EXTENSION', '售后与争议')
  const reason = page.getByRole('textbox', { name: '问题说明 · 必填', exact: true })
  await reveal(reason)
  await fill(reason, '合成联调：申请延长核对时间，不改变原价或原合同。')
  await shot('16-extension-form-390', '35-orders-aftercare.png / 61', '尚未提交；不预选取消或伪造退款')
  const caseWrites = []
  await page.route('**/production/projects/' + s.performer.project_id + '/cases', async route => {
    const r = route.request()
    if (r.method() !== 'POST') return route.continue()
    caseWrites.push({ key: r.headers()['idempotency-key'], version: r.headers()['if-match'], body: r.postData() })
    if (caseWrites.length === 1) { const res = await route.fetch(); assert(res.ok()); await route.abort('failed') } else await route.continue()
  })
  await press(button('提交原项目问题'))
  await press(button('确认办理'))
  await button('恢复原问题请求核对').waitFor()
  await shot('17-case-unknown-390', '46-states-d.png / 未知结果', '服务端成功后丢回复；保留原请求核对')
  await press(button('恢复原问题请求核对'))
  const recoveredResponse = page.waitForResponse(r => r.url().endsWith('/production/projects/' + s.performer.project_id + '/cases') && r.request().method() === 'POST')
  await press(button('确认办理'))
  assert((await recoveredResponse).ok())
  const cases = (await api('/production/projects/' + s.performer.project_id + '/fulfillment')).cases.filter(c => c.data.kind === 'EXTENSION')
  check('未知工单以同一请求键、原版本和原说明恢复且只新增一案', caseWrites.length === 2 && caseWrites[0].key === caseWrites[1].key && caseWrites[0].version === caseWrites[1].version && caseWrites[0].body === caseWrites[1].body && cases.length === priorCaseCount + 1 && cases.filter(c => c.current_status === 'OPEN').length === 1)
  await top()
  await shot('18-extension-recorded-390', '35-orders-aftercare.png / 61', '延期申请暂停，独立处理仍未作出')
  }

  if (['all', 'cross'].includes(phase) && process.env.DELIVERY_CROSS_RESULTS) {
    const cross = JSON.parse(await readFile(process.env.DELIVERY_CROSS_RESULTS, 'utf8'))
    assert(cross.synthetic_only && cross.project_id === s.ready_to_start.project_id && cross.status === 'APPROVED')
    await open('/production/version?versionId=' + cross.version_id, '确认剧本')
    await press(button('完整阅读'))
    await button('返回审阅').waitFor()
    await shot('18b-web-uploaded-script-390', '38-custom-extra.png / 剧本确认', '网页受派上传并经独立岗位审核的同一私有文件')
    await press(button('返回审阅'))
    const beforeConfirmation = await api('/production/projects/' + cross.project_id + '/fulfillment')
    if (!beforeConfirmation.receipt?.started_at) {
      await press(button('确认本次交付通知已读'))
      await press(button('明确确认本次交付已收到'))
      await press(button('确认办理'))
    } else {
      check('同一已收讫剧本再次阅读沿用服务器原截止', !!beforeConfirmation.receipt.deadline_at)
    }
    await press(page.getByRole('checkbox', { name: '我已完整阅读本版剧本。', exact: true }))
    const note = page.getByRole('textbox', { name: /确认说明/ })
    await reveal(note)
    await fill(note, '合成联调：已核对网页交来的这一个具体剧本版本。')
    await shot('18c-script-confirm-390', '38-custom-extra.png / 剧本确认', '收讫、验收与付款各自确认')
    const accepted = page.waitForResponse(r => r.url().endsWith('/production/versions/' + cross.version_id + '/feedback') && r.request().method() === 'POST')
    await press(button('确认这版剧本'))
    await press(button('确认办理'))
    assert((await accepted).ok())
    await page.getByRole('heading', { name: '制作项目', exact: true }).waitFor()
    const pr = await api('/production/records/' + cross.project_id)
    check('网页派单开工上传独审后，App确认同一SCRIPT且不代替后续付款', pr.data.current.SCRIPT === cross.version_id && pr.data.accepted.SCRIPT === cross.version_id && (await api('/trade/records/' + cross.order_id)).data.financial.received_minor === 3000)
    await shot('18d-cross-script-accepted-390', '37-custom-top.png / 66', '同一原项目、原订单与版本的两端闭环')
  }

  if (['all', 'download'].includes(phase)) {
  await open('/production/works', '我的交付作品')
  await shot('18e-my-delivery-works-390', '39-story-top.png / 71已购作品与下载', '私人定制成片子集；现货与试镜作品另有业务入口')
  await open('/production/work?projectId=' + s.final_paid.project_id, '私人作品')
  await button('下载当前原片').waitFor()
  check('当前FINAL已确认且原款项付清才启用正式下载', await button('下载当前原片').isEnabled())
  check('进入作品页没有以正式文件GET探测资格', !reads.some(r => r.path.endsWith('/content') && r.search === '?variant=final'))
  await shot('19-private-work-390', '37-custom-top.png / 71作品库、39-story-top.png / 下载', '未取正式文件；下载资格和预览分别显示')
  const download = page.waitForEvent('download')
  const finalRead = page.waitForResponse(r => r.url().includes('/production/versions/' + s.final_paid.version_id + '/content?variant=final'))
  await press(button('下载当前原片'))
  assert((await finalRead).ok())
  const saved = await download
  check('买家明确下载才读取正式字节并交给浏览器保存', (await saved.failure()) === null && (await api('/production/projects/' + s.final_paid.project_id + '/fulfillment')).state === 'DELIVERED')
  await page.waitForLoadState('networkidle')
  const finalIndex = reads.findLastIndex(r => r.path.endsWith('/' + s.final_paid.version_id + '/content') && r.search === '?variant=final')
  const refreshedIndex = reads.findLastIndex(r => r.path === '/api/v1/production/projects/' + s.final_paid.project_id + '/fulfillment')
  check('保存交接后页面重新读取真实履约结果', refreshedIndex > finalIndex && finalIndex >= 0)
  await shot('20-formal-download-390', '39-story-top.png / 私人作品下载', '仅可播放色条，不是真实制作交付')
  }

  check('页面没有JS异常或Flutter溢出', errors.length === 0 && consoleErrors.length === 0)
} catch (e) { failure = redact(e.stack || e.message); console.error(failure); process.exitCode = 1 }
finally {
  const value = JSON.stringify({ result: failure ? 'FAIL' : 'PASS', phase, synthetic_only: true, media: f.synthetic_media, checks, shots, reads, writes, page_errors: errors, flutter_errors: consoleErrors, failure,
    limits: ['Chromium里的实际Flutter Web页面，未声称原生或真机验收', '可播放色条不证明真实成片、水印、音画或AI标识', '没有真实收退款、实名、OSS或制作'] }, null, 2) + '\n'
  for (const token of tokens) assert(!value.includes(token), 'Never persist credentials')
  await writeFile(join(out, phase === 'all' ? 'APP_RESULTS.json' : 'APP_' + phase.toUpperCase() + '_RESULTS.json'), value)
  if (context) await context.close()
  await browser.close()
}
