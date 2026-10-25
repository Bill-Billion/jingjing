#!/usr/bin/env node
// Actual Flutter Web captures using existing disposable loopback fixtures.
// This script never submits a form, confirms a receipt or reads a final file.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const root = process.cwd()
const out = resolve(process.env.FIGMA_CATALOG_OUTPUT || 'docs/testing/evidence/figma-frontend-restore-20261023/app-r03-r04')
const app = 'http://127.0.0.1:5500'
const files = {
  r05r12: process.env.R05_R12_ACCESS_FILE || '.local/v5-r05-r12-sandbox/jx_test_r05r12_96809_98b9c83d1e49/access.json',
  artists: process.env.ARTISTS_ACCESS_FILE || '.local/artists-sandbox/jx_test_artists_17750_da3cfe65fded/access.json',
  delivery: process.env.DELIVERY_ACCESS_FILE || '.local/customization-delivery-sandbox/jx_test_delivery_9110_4e071239895b/access.json',
}
const fixtures = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([group, file]) => {
  const value = JSON.parse(await readFile(resolve(file), 'utf8'))
  assert(value.synthetic_only && new URL(value.base_url).hostname === '127.0.0.1' && new URL(value.base_url).pathname === '/api/v1')
  return [group, value]
})))
const tokens = Object.values(fixtures).flatMap(f => Object.values(f.accounts).map(a => a.bearer_token))
const redact = v => tokens.reduce((s, token) => s.replaceAll(token, '[redacted]'), String(v))
const hash = v => createHash('sha256').update(v).digest('hex')
const reviews = JSON.parse(await readFile('docs/testing/evidence/figma-remaining-calibration-20261023/REVIEWS.json', 'utf8')).reviews
const source = id => {
  const row = reviews.find(r => r.id === id)
  assert(row, 'Known reviewed Figma node ' + id)
  return { node_id: id, name: row.currentName || row.name,
    reference: 'docs/testing/evidence/figma-remaining-calibration-20261023/' + row.finalScreenshot }
}
await mkdir(out, { recursive: true })
const { chromium } = createRequire(join(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const results = [], shots = [], reads = [], prohibited = [], pageErrors = [], layoutErrors = []
let context, page, currentCase, buildProof, caseNo = 0
const scope = process.env.CATALOG_DELIVERY_SCOPE || 'all'
const selection = new Set((process.env.CATALOG_DELIVERY_CASES || '').split(',').filter(Boolean))
const runTag = process.env.CATALOG_DELIVERY_RUN_TAG || ''
const expectPlayable = process.env.CATALOG_DELIVERY_EXPECT_PLAYABLE === '1'
assert(/^[a-z0-9-]*$/.test(runTag))
assert(['all', 'artists', 'delivery'].includes(scope))
const expectedOrigins = new Set(Object.values(fixtures).map(f => new URL(f.base_url).origin))
const button = name => page.getByRole('button', { name, exact: true })
async function save(name, value) {
  const text = JSON.stringify(value, null, 2) + '\n'
  for (const token of tokens) assert(!text.includes(token), 'Credential never written')
  await writeFile(join(out, name), text)
}
async function api(group, role, path) {
  const f = fixtures[group], a = f.accounts[role]
  const response = await fetch(f.base_url + path, {
    headers: { Authorization: 'Bearer ' + a.bearer_token, 'X-Acting-Party': a.party_id },
    signal: AbortSignal.timeout(15000),
  })
  assert(response.ok, 'Read-only fixture GET ' + path + ': ' + response.status)
  reads.push({ source: 'preflight', group, role, path: '/api/v1' + path, status: response.status })
  return (await response.json()).data
}
async function open(group, role, route, heading, width = 390) {
  if (context) await context.close()
  context = await browser.newContext({ viewport: { width, height: width >= 768 ? 1024 : 844 }, locale: 'zh-CN', acceptDownloads: true })
  await context.route('**/api/v1/**', async route => {
    const request = route.request()
    if (!expectedOrigins.has(new URL(request.url()).origin)) return route.continue()
    if (!['GET', 'OPTIONS'].includes(request.method())) {
      prohibited.push({ case: currentCase, method: request.method(), path: new URL(request.url()).pathname })
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  page = await context.newPage()
  const activeRequests = new Set()
  page.on('request', request => activeRequests.add(request))
  page.on('requestfinished', request => activeRequests.delete(request))
  page.on('requestfailed', request => activeRequests.delete(request))
  page.setDefaultTimeout(16000)
  page.on('pageerror', e => pageErrors.push({ case: currentCase, message: redact(e.message) }))
  page.on('console', m => {
    if (/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/i.test(m.text())) layoutErrors.push({ case: currentCase, message: redact(m.text()) })
  })
  page.on('response', r => {
    const url = new URL(r.url())
    if (expectedOrigins.has(url.origin) && r.request().method() === 'GET') reads.push({ case: currentCase, group, role, path: url.pathname, search: url.search, status: r.status() })
  })
  await page.goto(app + '/?fixtureGroup=' + group + '&fixtureRole=' + role + '#' + route)
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' })
  await page.locator('flt-semantics-placeholder').evaluate(e => e.click())
  if (heading) await page.getByRole('heading', { name: heading, exact: true }).first().waitFor()
  const idle = await page.waitForLoadState('networkidle', { timeout: 12000 }).then(() => true, () => false)
  // Flutter fallback font traffic can continue after the route is usable. The
  // source of any pending request is recorded rather than treated as app data.
  if (!idle) {
    results.at(-1).network_idle_timeout = true
    results.at(-1).pending_requests = [...activeRequests].map(r => ({ origin: new URL(r.url()).origin, path: new URL(r.url()).pathname, method: r.method() }))
  }
  await page.waitForTimeout(500)
}
async function reveal(target) {
  for (let n = 0; n < 70; n++) {
    const box = await target.count() ? await target.first().boundingBox() : null
    if (box && box.y + box.height / 2 > 57 && box.y + box.height / 2 < page.viewportSize().height - 12) return box
    await page.mouse.move(Math.max(5, (page.viewportSize().width - Math.min(page.viewportSize().width, 560)) / 2 + 5), 410)
    await page.mouse.wheel(0, box?.y < 58 ? -240 : 240)
    await page.waitForTimeout(85)
  }
  throw Error('Flutter control did not enter viewport: ' + target)
}
async function press(target) {
  const box = await reveal(target)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)
}
async function top() {
  await page.mouse.move(Math.max(5, (page.viewportSize().width - Math.min(page.viewportSize().width, 560)) / 2 + 5), 410)
  await page.mouse.wheel(0, -50000)
  await page.waitForTimeout(180)
}
async function snap(suffix, refs, note) {
  await page.waitForTimeout(180)
  const aria = redact(await page.locator('body').ariaSnapshot())
  for (const token of tokens) assert(!aria.includes(token))
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal document overflow')
  await page.mouse.move(0, 0)
  const file = currentCase + (runTag ? '-' + runTag : '') + '-' + suffix + '.png'
  const bytes = await page.screenshot({ path: join(out, file) })
  shots.push({ case: currentCase, file, route: new URL(page.url()).hash.slice(1), viewport: page.viewportSize(),
    references: refs.map(source), note, capture_sha256: hash(bytes), result: 'CAPTURED_PENDING_VISUAL_REVIEW' })
  await writeFile(join(out, currentCase + (runTag ? '-' + runTag : '') + '-' + suffix + '.aria.txt'), aria + '\n')
  return { sha: hash(bytes), aria }
}
async function capture(refs, note, full = false, phase = '') {
  const prefix = phase ? phase + '-' : ''
  await top()
  let prior = await snap(prefix + 'top', refs, note)
  if (!full) return
  for (let n = 1; n <= 18; n++) {
    await page.mouse.move(Math.max(5, (page.viewportSize().width - Math.min(page.viewportSize().width, 560)) / 2 + 5), 410)
    await page.mouse.wheel(0, page.viewportSize().height - 150)
    await page.waitForTimeout(150)
    const next = await snap(prefix + 'scroll-' + String(n).padStart(2, '0'), refs, note + '；连续滚动覆盖')
    if (next.sha === prior.sha) {
      const duplicate = shots.pop()
      await rm(join(out, duplicate.file))
      await rm(join(out, duplicate.file.replace('.png', '.aria.txt')))
      results.at(-1).scroll_stop = { reason: 'identical_rendered_pixels', iteration: n }
      return
    }
    prior = next
    if (n === 18) results.at(-1).scroll_limit_reached = true
  }
}
async function previewPlayback(row, playName, refs) {
  await top()
  const play = button(playName)
  assert(await play.count(), 'Controlled preview action exists')
  const before = reads.length
  await press(play)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  let playing
  if (expectPlayable) {
    // The disposable color-bar video is one second long. Save the observed
    // playing state inside the browser instead of sampling after it has ended.
    const observed = await page.waitForFunction(() => {
      const states = [...document.querySelectorAll('video')].map(v => ({ ready_state: v.readyState, duration: Number.isFinite(v.duration) ? v.duration : null, current_time: v.currentTime, width: v.videoWidth, height: v.videoHeight, paused: v.paused, ended: v.ended, error: v.error?.code || null }))
      return states.some(v => v.ready_state >= 2 && !v.paused && v.current_time > 0 && v.width > 0) ? states : false
    }, null, { timeout: 10000 })
    playing = await observed.jsonValue()
    await observed.dispose()
  } else {
    await page.waitForTimeout(1000)
    playing = await page.locator('video').evaluateAll(videos => videos.map(v => ({ ready_state: v.readyState, duration: Number.isFinite(v.duration) ? v.duration : null, current_time: v.currentTime, width: v.videoWidth, height: v.videoHeight, paused: v.paused, ended: v.ended, error: v.error?.code || null })))
  }
  if (expectPlayable) assert(playing.some(v => v.ready_state >= 2 && !v.paused && v.current_time > 0 && v.duration > 0 && v.width > 0 && v.error === null), 'Browser actually decoded and advanced synthetic video')
  const pause = button('暂停预览')
  if (await pause.count()) await press(pause)
  const paused = await page.locator('video').evaluateAll(videos => videos.map(v => ({ ready_state: v.readyState, current_time: v.currentTime, paused: v.paused, error: v.error?.code || null })))
  if (expectPlayable) assert(paused.some(v => v.paused && v.current_time > 0 && v.error === null), 'Preview can be paused after decoding')
  const content = reads.slice(before).filter(r => r.path.endsWith('/content'))
  assert(content.every(r => !r.search.includes('variant=final')), 'No final-file download')
  row.checks.push({ name: '明确播放才核权读取预览，并实际解码/暂停', read_count: content.length, media: playing, paused_media: paused,
    result: expectPlayable ? 'OBSERVED_DECODE_PLAY_AND_PAUSE' : 'OBSERVED_ACTUAL_MEDIA_STATE', note: '色条仅证明受控媒体链路与播放器，不能代表真实作品质量。' })
  await capture(refs, '明确播放后的实际状态，未提交通知已读、收讫、验收或下载原片；合成媒体不代表真实质量。', true, 'after-play')
}
async function run(name, group, role, route, heading, refs, note, options = {}) {
  const sequence = ++caseNo
  if (scope !== 'all' && scope !== group || selection.size && !selection.has(name)) return
  currentCase = String(sequence).padStart(2, '0') + '-' + name
  const row = { case: currentCase, group, role, route, width: options.width || 390, references: refs.map(source), note, checks: [], result: 'RUNNING' }
  results.push(row)
  try {
    await open(group, role, route, heading, options.width || 390)
    if (options.before) await options.before(row)
    await capture(refs, note, options.full ?? true)
    if (options.after) await options.after(row)
    row.result = 'CAPTURED_PENDING_VISUAL_REVIEW'
    console.log('CAPTURED ' + currentCase)
  } catch (error) {
    row.result = 'FAIL'
    row.failure = redact(error.stack || error.message)
    console.error('FAIL ' + currentCase + ': ' + redact(error.message))
    if (page) {
      await writeFile(join(out, currentCase + (runTag ? '-' + runTag : '') + '-failure.aria.txt'), redact(await page.locator('body').ariaSnapshot().catch(() => '')))
      await page.screenshot({ path: join(out, currentCase + (runTag ? '-' + runTag : '') + '-failure.png') }).catch(() => {})
    }
  }
}

try {
  const buildResponse = await fetch(app + '/main.dart.js', { signal: AbortSignal.timeout(15000) })
  assert(buildResponse.ok, 'Current loopback Flutter build is readable')
  const buildBytes = Buffer.from(await buildResponse.arrayBuffer())
  buildProof = { file: 'main.dart.js', byte_size: buildBytes.length, sha256: hash(buildBytes) }
  const a = fixtures.artists, d = fixtures.delivery, r5 = fixtures.r05r12
  const person = '/artists/person?personId=' + a.person_id
  const form = (mode, avatar = false) => '/artists/form?mode=' + mode + '&personId=' + a.person_id + (avatar ? '&avatarId=' + a.avatar_id : '')
  if (scope !== 'delivery') {
    const actual = await api('artists', 'artist', '/artists/people/' + a.person_id)
    assert(actual.avatars.some(v => v.id === a.avatar_id))
  }
  await run('artist-owner-list', 'artists', 'artist', '/my-humans', '我的艺人', ['2004:1230'], '现有合成真人名单；没有样例肖像。')
  await run('artist-person', 'artists', 'artist', person, '艺人档案', ['2004:1230', '2004:1402'], '真实本人档案、核验、数字人及授权入口。', {
    after: async row => {
      await top()
      const detail = button('查看数字人档案').first()
      await press(detail)
      await page.getByRole('heading', { name: '数字人详情', exact: true }).waitFor()
      await page.waitForTimeout(250)
      await capture(['2004:1402'], '独立数字人详情重新核权读取，整幅封面槽+黑色身份条；不把私人材料自动当肖像。', true, 'avatar-detail')
      row.checks.push({ name: '独立数字人详情使用当前本人档案权限', result: 'ROUTE_AND_READ_OBSERVED' })
    },
  })
  await run('artist-person-tablet', 'artists', 'artist', person, '艺人档案', ['2004:1402'], '768宽内容列，原生业务信息完整。', { width: 768 })
  for (const [mode, heading, refs, note] of [
    ['PERSON', '建立本人真人档案', ['2004:1230'], '已有本人档案条件下的真实表单；不提交。'],
    ['AVATAR', '建立数字人档案', ['2004:1487'], '数字人建档与付费创建请求分别办理；不提交。'],
    ['CONSENT', '明确这次本人同意', ['22:656', '2004:1487'], '脸部、声音、用途与期限逐项独立，未自动授予商用或长期模型。'],
    ['VARIANT', '保存造型与声音版本', ['2004:1402'], '造型与声音独立版本，保留原同意引用。'],
    ['DELEGATION', '本人确认机构委托', ['2004:1871'], '仅读取已接受合作关系，不代替本人授权或修改佣金。'],
    ['HALO', '申请认证', ['2004:1951', '2004:2031'], '只读申请表单，认证不以缴费自动通过。'],
    ['IDENTITY', '核对实名服务结果', ['22:593'], '真实服务配置不可用状态，不自填实名结果。'],
    ['SERVICE', '选择创建与托管服务', ['2004:1487', '2004:1567'], '商品条款由已审目录读取，不提交创建或托管。'],
    ['LISTING', '申请公开展示', ['2004:1322', '2004:1800'], '公开展示材料范围与实际公开目录分开核对。'],
  ]) await run('artist-form-' + mode.toLowerCase(), 'artists', 'artist', form(mode, ['AVATAR', 'CONSENT', 'VARIANT', 'SERVICE', 'LISTING'].includes(mode)), heading, refs, note, {
    after: mode === 'VARIANT' ? async () => {
      await top()
      await press(page.getByRole('button', { name: /^版本类型(?: |$)/ }))
      await press(page.getByRole('menuitem', { name: '声音版本', exact: true }))
      await capture(refs, '声音独立版本表单，未保存。', true, 'voice')
    } : mode === 'HALO' ? async () => {
      await top()
      await press(page.getByRole('button', { name: /^申请认证等级(?: |$)/ }))
      await press(page.getByRole('menuitem', { name: 'L2认证审核', exact: true }))
      await capture(refs, 'L2独立审核与原收费服务选择，未提交。', true, 'l2')
    } : undefined,
  })
  await run('artist-consent-record', 'artists', 'artist', '/artists/record?personId=' + a.person_id + '&recordId=' + a.consent_id, '本人同意', ['22:656', '2004:1402'], '读取既有本人同意、实际审核结果和证据元数据；不撤回。', {
    after: async row => {
      await top()
      const material = button('下载并核对材料').first()
      const response = page.waitForResponse(r => new URL(r.url()).pathname.includes('/artists/assets/') && new URL(r.url()).pathname.endsWith('/content'))
      const download = page.waitForEvent('download')
      await press(material)
      const read = await response, received = await download
      assert(read.ok() && await received.failure() === null)
      row.checks.push({ name: '本人证据逐次核权并校验字节后交浏览器保存', status: read.status(), result: 'OBSERVED_CONTROLLED_DOWNLOAD' })
      await capture(['22:656', '2004:1402'], '受控材料下载后的实际提示；未上传、公开或提交授权。', true, 'material-read')
    },
  })
  await run('artist-halo-record', 'artists', 'artist', '/artists/record?personId=' + a.person_id + '&recordId=' + a.halo_id, '认证申请', ['2004:1951', '2004:2031'], '既有认证记录，最终状态以当前合成接口为准。')
  await run('artist-hosting-record', 'artists', 'artist', '/artists/record?personId=' + a.person_id + '&recordId=' + a.hosting_id, '创建与托管', ['2004:1567'], '原托管服务、期限、提醒与原订单分别显示。')
  await run('artist-public-catalog', 'artists', 'outsider', '/artists/catalog', '公开艺人', ['22:817'], '已审公开目录；若当前授权已撤回则保存真实空态。', {
    after: async row => {
      const detail = button('查看艺人详情').first()
      if (!(await detail.count())) { row.checks.push({ name: '当前目录没有可读条目，未造数据', result: 'DOCUMENTED_EMPTY' }); return }
      await press(detail)
      await page.getByRole('heading', { name: '艺人详情', exact: true }).waitFor()
      await capture(['22:817'], '左文右图公开详情；当前数据没有专用肖像字段。', true, 'detail')
      const preview = button('读取获准预览 1')
      if (await preview.count()) {
        const response = page.waitForResponse(r => new URL(r.url()).pathname.includes('/artists/catalog/') && new URL(r.url()).pathname.endsWith('/content'))
        await press(preview)
        row.checks.push({ name: '指定listing重新核权预览读取', status: (await response).status() })
        await capture(['22:817'], '公开受控预览；若为1像素合成样本仅证明权限和布局，不证明肖像质量。', true, 'controlled-preview')
      }
    },
  })
  await run('artist-private-denied', 'artists', 'outsider', person, null, ['2004:6502'], '无权账号不能保留本人私人资料。', { full: false })
  if (a.accounts.minor.person_id) await run('artist-child-closed', 'artists', 'minor', '/artists/form?mode=SERVICE&personId=' + a.accounts.minor.person_id, '选择创建与托管服务', ['22:656', '2004:1487'], '儿童实际素材处理与数字人服务保持关闭。')

  await run('notice-detail-feature', 'r05r12', 'notices_seller', '/notices/public?noticeId=' + r5.scenarios.notice.notice_id, '通告详情', ['23:880'], '真实已审通告详情，160:190左右构图；无封面字段不使用示例剧照。')
  await run('notice-detail-narrow', 'r05r12', 'notices_seller', '/notices/public?noticeId=' + r5.scenarios.notice.notice_id, '通告详情', ['23:880'], '320宽通告真实长标题和要求完整。', { width: 320 })
  await run('project-detail-feature', 'r05r12', 'buyer', '/projects/record?recordId=' + r5.scenarios.participation.project_id, '项目工作区', ['23:1115'], '真实项目档案、角色与参演记录；无海报字段保持明确缺图。', {
    after: async row => {
      const catalogue = await api('r05r12', 'buyer', '/projects/catalogue')
      const role = catalogue.items.find(p => p.id === r5.scenarios.participation.project_id)?.roles?.[0]
      if (!role) { row.checks.push({ name: '当前公开项目无可读角色，未构造角色', result: 'DOCUMENTED_EMPTY' }); return }
      await open('r05r12', 'buyer', '/projects/role?roleId=' + role.id, '项目与角色')
      await capture(['23:1115'], '同一公开项目角色摘要；报名、确认与费用仍单独办理，未提交角色申请。', true, 'public-role')
    },
  })

  await run('production-projects', 'delivery', 'buyer', '/production', '参与制作项目', ['2004:3816'], '只展示本身份真实参与的合成项目。')
  for (const [key, scenario] of Object.entries(d.scenarios)) {
    if (!scenario.project_id) continue
    await run('production-' + key, 'delivery', 'buyer', '/production/project?projectId=' + scenario.project_id, '制作项目', ['2004:3902'], '现有种子状态：' + key + '。无海报时保留明确缺图槽，不制造剧照或已付款事实。', {
      full: ['preview', 'final_paid', 'cancelled_refund'].includes(key),
      after: key === 'preview' ? async row => {
        await top()
        await press(button('查看完整约定条款'))
        await snap('expanded-agreement', ['2004:3902'], '展开完整原约定，查看冻结规格与条款；只读，不确认或改写。')
        await top()
        await press(page.getByRole('button', { name: /^样片 · 第 1 版/ }).first())
        await snap('expanded-version-history', ['2004:3902', '2004:4000'], '展开当前样片版本记录与实际审核/反馈历史；未确认版本。')
        row.checks.push({ name: '原约定与版本历史折叠区实际展开', result: 'OBSERVED' })
      } : key === 'cancelled_refund' ? async row => {
        await top()
        await press(button('原订单取消约定'))
        await snap('expanded-cancellation', ['2004:3477', '2004:3902'], '取消约定按原单展示；应退金额与实际退款分别读取，不办理退款。')
        row.checks.push({ name: '取消原约定实际展开', result: 'OBSERVED' })
      } : undefined,
    })
  }
  await run('production-task-narrow', 'delivery', 'buyer', '/production/project?projectId=' + d.scenarios.preview.project_id, '制作项目', ['2004:3902'], '320宽任务详情、长名称和实际金额，不隐藏办理入口。', { width: 320 })
  await run('production-task-tablet', 'delivery', 'buyer', '/production/project?projectId=' + d.scenarios.preview.project_id, '制作项目', ['2004:3902'], '768宽限宽内容列；缺图明确标注。', { width: 768, full: false })
  await run('production-frozen-story', 'delivery', 'buyer', '/production/story?projectId=' + d.scenarios.preview.project_id, '订单固定的原故事', ['2004:3737', '2004:3902'], '原订单冻结故事只读，未修改正式版本。')
  for (const key of ['preview', 'final_paid', 'pending_video']) {
    const scenario = d.scenarios[key]
    if (!scenario?.version_id) continue
    await run('production-review-' + key, 'delivery', 'buyer', '/production/version?versionId=' + scenario.version_id, null, ['2004:4000'], '顶部黑色播放器与正式版本信息；收讫、验收和付款条件互不替代。', {
      after: async row => {
        if (key === 'pending_video') {
          const before = reads.length;
          await top(); await press(button('播放预览'));
          await page.waitForLoadState('networkidle');
          const content = reads.slice(before).filter(r => r.path.endsWith('/content'));
          assert(content.some(r => r.status === 409 && r.search === '?variant=preview'), 'Unreviewed version must still be denied by the real API');
          assert(content.every(r => !r.search.includes('variant=final')), 'No formal-file read');
          assert.equal(await page.locator('video').count(), 0, 'Denied preview cannot mount a playable private video');
          row.checks.push({ name: '未审片版本实际409，不冒充可播放或已查看', result: 'EXPECTED_REAL_API_DENIAL', content });
          await capture(['2004:4000'], '未审片版本真实409；不解码、不确认收讫、不验收、不提交业务。', true, 'review-required');
          return;
        }
        await previewPlayback(row, '播放预览', ['2004:4000'])
        if (key === 'preview') {
          await top()
          await press(page.getByRole('button', { name: /^原约定 查看本单规格与修改约定/ }))
          await press(button('查看完整约定条款'))
          await snap('expanded-review-agreement', ['2004:4000'], '审片页展开嵌套原约定与完整条款；不跳过播放或验收门槛。')
          row.checks.push({ name: '审片嵌套原约定实际展开', result: 'OBSERVED' })
        }

      },
    })
  }
  await run('production-feedback', 'delivery', 'buyer', '/production/feedback?versionId=' + d.scenarios.preview.version_id, '提交本版意见', ['2004:4000', '2004:3477'], '修改类型、次数、必填说明及检查项保留；未提交任何意见。')
  await run('production-private-works', 'delivery', 'buyer', '/production/works', '我的交付作品', ['2004:4349'], '私人交付与现货购买目录分开；保留真实验收和付款状态。')
  const workPreview = expectPlayable ? async row => previewPlayback(row, '播放成片预览', ['2004:4349']) : undefined
  await run('production-private-work', 'delivery', 'buyer', '/production/work?projectId=' + d.scenarios.final_paid.project_id, '私人作品', ['2004:4349'], '显示实际下载资格；本次不点击正式文件下载。', { after: workPreview })
  await run('production-private-work-narrow', 'delivery', 'buyer', '/production/work?projectId=' + d.scenarios.final_paid.project_id, '私人作品', ['2004:4349'], '320宽私人作品与下载条件完整可读。', { width: 320, after: workPreview })
  await run('production-aftercare', 'delivery', 'buyer', '/production/aftercare?projectId=' + d.scenarios.dispute.project_id, '售后与争议', ['2004:3477'], '读取真实既有争议及问题表单，未提新申请或退款。')
  await run('production-private-denied', 'delivery', 'outsider', '/production/project?projectId=' + d.scenarios.preview.project_id, null, ['2004:6502'], '非项目成员不能读取私人制作详情。', { full: false })
} finally {
  if (context) await context.close()
  await browser.close()
  const value = { result: results.some(r => r.result === 'FAIL') || prohibited.length || pageErrors.length || layoutErrors.length ? 'FAIL' : 'CAPTURED_PENDING_VISUAL_REVIEW',
    captured_at: new Date().toISOString(), scope, synthetic_only: true, served_build: buildProof,
    fixture_sources: Object.entries(fixtures).map(([group, value]) => ({ group, access_file: files[group], api_base_url: value.base_url, synthetic_media: value.synthetic_media || null })),
    results, shots, read_requests: reads, blocked_write_requests: prohibited, page_errors: pageErrors, flutter_layout_errors: layoutErrors,
    limitations: ['真实Flutter Web Chromium截图，不声称iOS/Android真机验收。', '所有外部写请求在浏览器端被阻断；未确认收讫、验收、付款、授权或退款。', '缺图与缺乏可信媒体标识须按报告记录；合成像素/色条/不可播放字节不代表真实肖像或成片质量。', '截图只有人工对照原PNG后才可更新为验收结论。'] }
  await save('CAPTURE_' + scope.toUpperCase() + (runTag ? '_' + runTag.toUpperCase().replaceAll('-', '_') : '') + '_RESULTS.json', value)
  console.log(JSON.stringify({ result: value.result, cases: results.length, shots: shots.length, failed: results.filter(r => r.result === 'FAIL').map(r => r.case), blocked_writes: prohibited.length, page_errors: pageErrors.length, layout_errors: layoutErrors.length }))
  if (value.result === 'FAIL') process.exitCode = 1
}
