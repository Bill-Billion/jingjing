#!/usr/bin/env node
// Current Flutter business pages + runtime-only synthetic identity + real HTTP.
// No mocked successful response, provider call, or real payment. The explicitly
// selected S06 case can intercept one checkout attempt with a labelled 412.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
assert(process.env.PLAZA_ACCESS_FILE, 'Set current PLAZA_ACCESS_FILE');
const accessFile = resolve(root, process.env.PLAZA_ACCESS_FILE);
const f = JSON.parse(await readFile(accessFile, 'utf8'));
const apiOrigin = new URL(f.base_url);
assert(f.synthetic_only && apiOrigin.protocol === 'http:' && apiOrigin.hostname === '127.0.0.1' && apiOrigin.pathname === '/api/v1');
assert.equal(JSON.parse(await readFile(join(dirname(accessFile), 'status.json'), 'utf8')).status, 'RUNNING');
const app = 'http://127.0.0.1:5500';
const out = resolve(root, process.env.PLAZA_BROWSER_OUTPUT || 'output/playwright/plaza-dense-20261026');
const build = resolve(root, process.env.PLAZA_APP_BUILD_DIR || '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/plaza-browser-final');
const allowWrites = process.env.PLAZA_ALLOW_SYNTHETIC_WRITES === '1';
const selected = new Set((process.env.PLAZA_BROWSER_CASES || '').split(',').filter(Boolean));
const expectedArtists = Number(process.env.PLAZA_EXPECT_ARTISTS || 8);
assert([7, 8].includes(expectedArtists));
if (expectedArtists === 7) assert(!allowWrites && selected.size && [...selected].every(n =>
  /^(channels|city|search-directory|artist-detail|artist-filters|artist-unavailable|stock-detail|stock-quote-change|notice-forms|notice-types-results|submission-no-consent|missing-record|network-recovery)(-(320|390|768))?$/.test(n)),
  'Post-withdrawal rechecks must be explicitly selected and read-only');
const widths = (process.env.PLAZA_BROWSER_WIDTHS || '320,390,768').split(',').map(Number);
assert(widths.every(w => [320, 390, 768].includes(w)));
const runTag = process.env.PLAZA_BROWSER_RUN_TAG || '';
assert(/^[a-z0-9-]*$/.test(runTag));
const secrets = Object.values(f.accounts).map(a => a.bearer_token).filter(Boolean);
const redact = value => secrets.reduce((s, t) => s.replaceAll(t, '[redacted]'), String(value));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pathOnly = value => { const u = new URL(value); return u.pathname + u.search; };
const kinds = { PROFILE: '投递形象与模卡', ROLE: '投递想演角色', CREATE_DRAMA: '提交自己做剧的意向' };
const noticeTypes = { DRAMA: '剧与角色', PERFORMANCE: '商演', COMMERCIAL: '商单', EVENT: '活动', RECRUITMENT: '招募', OFFICIAL: '平台官方' };
const city = f.scenarios.city;
const cityQuery = encodeURIComponent(city);
const missingCity = '合成无结果';
const requests = [], writes = [], shots = [], results = [], errors = [], blocked = [], network = [], controlledFaults = [], controlledResponses = [];
let context, page, current, role, row, writePaths = new Set(), seq = 0, buildProof, abortNextPath, quote412Armed = false, artist409Path;
const pending = new Set();
await mkdir(out, { recursive: true });
const { chromium } = createRequire(join(root, '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const button = name => page.getByRole('button', { name, exact: true });
const text = name => page.getByText(name, { exact: true });
const entry = name => page.getByRole('button', { name: new RegExp('(?:^| )' + name + '(?: |$)') });
const check = (name, facts = {}) => row.checks.push({ name, status: 'PASS', ...facts });
const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(180); };
async function save(name, value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  for (const s of secrets) assert(!body.includes(s), 'Credential never saved');
  await writeFile(join(out, name), body);
}
async function actual(path, who = 'stock_buyer', { acting = false, method = 'GET', body, version, expected = 200 } = {}) {
  assert(method === 'GET' || allowWrites && /^\/artists\/people\/[^/]+\/records\/[^/]+\/withdrawals$/.test(path), 'Only the explicit isolated withdrawal is allowed outside the UI');
  const a = f.accounts[who]; assert(a);
  const response = await fetch(f.base_url + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + a.bearer_token, ...(acting ? { 'X-Acting-Party': a.party_id } : {}),
      ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'If-Match': '"' + version + '"' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const json = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes) : null;
  const entry = { case: current || 'preflight', source: 'real-http-control', role: who, method, path: '/api/v1' + path,
    status: response.status, bytes: bytes.length, error_code: json?.error?.code || null };
  requests.push(entry); if (method !== 'GET') writes.push({ ...entry, purpose: 'Withdraw this synthetic artist consent for browser recovery acceptance' });
  assert.equal(response.status, expected, method + ' ' + path);
  return { data: json?.data, bytes, json, status: response.status };
}
async function catalog(domain) {
  const items = []; let cursor; const seen = new Set();
  do {
    const r = await actual('/' + domain + '/catalog?limit=20&city=' + cityQuery + (cursor ? '&cursor=' + cursor : ''));
    items.push(...r.data.items); cursor = r.data.next_cursor;
    if (cursor) { assert(!seen.has(cursor)); seen.add(cursor); }
  } while (cursor);
  return items;
}
async function open(route, who = 'stock_buyer', width = 390, heading) {
  if (context) await context.close();
  role = who;
  context = await browser.newContext({ viewport: { width, height: width >= 768 ? 1024 : 844 }, locale: 'zh-CN', acceptDownloads: false });
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== apiOrigin.origin) {
      blocked.push({ case: current, reason: 'Non-fixture API origin', method: request.method(), path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (quote412Armed && current.startsWith('stock-quote-change-') && request.method() === 'POST' && url.pathname === '/api/v1/stock/checkout') {
      quote412Armed = false;
      return route.fulfill({ status: 412, contentType: 'application/json', headers: { 'x-plaza-controlled-test': 'quote-412', 'access-control-allow-origin': app },
        body: JSON.stringify({ error: { code: 'EXPECTED_VERSION_MISMATCH' } }) });
    }
    if (artist409Path === url.pathname && request.method() === 'GET' && current.startsWith('artist-unavailable-')) {
      artist409Path = undefined;
      return route.fulfill({ status: 409, contentType: 'application/json', headers: { 'x-plaza-controlled-test': 'artist-409', 'access-control-allow-origin': app },
        body: JSON.stringify({ error: { code: 'ARTIST_CONSENT_REQUIRED' } }) });
    }
    if (request.method() === 'GET' && url.pathname === abortNextPath) {
      abortNextPath = undefined;
      controlledFaults.push({ case: current, source: 'CONTROLLED_BROWSER_TRANSPORT_ABORT', method: 'GET', path: url.pathname,
        note: 'No HTTP response was received; this is not evidence of a backend error.' });
      return route.abort('failed');
    }
    if (!['GET', 'OPTIONS'].includes(request.method()) && (!allowWrites || !writePaths.has(request.method() + ' ' + url.pathname))) {
      blocked.push({ case: current, reason: 'Write outside this case allowance', method: request.method(), path: url.pathname }); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(18000);
  page.on('pageerror', e => errors.push({ case: current, type: 'pageerror', message: redact(e.message) }));
  page.on('console', m => {
    if (/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/i.test(m.text())) errors.push({ case: current, type: 'layout', message: redact(m.text()) });
  });
  page.on('requestfailed', r => network.push({ case: current, method: r.method(), path: pathOnly(r.url()), origin: new URL(r.url()).origin, failure: r.failure()?.errorText }));
  page.on('response', r => {
    const u = new URL(r.url()); if (u.origin !== apiOrigin.origin) return;
    const request = r.request(), caseName = current, caseRole = who;
    if (['quote-412', 'artist-409'].includes(r.headers()['x-plaza-controlled-test'])) {
      controlledResponses.push({ case: caseName, source: 'CONTROLLED_BROWSER_RESPONSE_' + r.status(), method: request.method(),
        path: u.pathname, status: r.status(), reached_backend: false, note: r.status() === 412
          ? 'One intercepted checkout attempt; UI state verification, not an actual backend repricing event.'
          : 'One intercepted preview read; UI state verification, not another actual permission withdrawal.' });
      return;
    }
    const task = (async () => {
      const entry = { case: caseName, source: 'browser-real-http', role: caseRole, method: request.method(), path: u.pathname + u.search,
        status: r.status(), content_type: r.headers()['content-type'] || '', error_code: null };
      if (r.status() >= 400 && r.headers()['content-type']?.includes('application/json')) {
        try { entry.error_code = (await r.json())?.error?.code || null; } catch {}
      }
      requests.push(entry);
      if (!['GET', 'OPTIONS'].includes(request.method())) {
        let payload; try { payload = request.postDataJSON(); } catch {}
        writes.push({ ...entry, payload_keys: Object.keys(payload || {}), purpose: 'Explicit synthetic UI test',
          ...(u.pathname === '/api/v1/stock/checkout' ? { listing_id: payload?.listing_id, offer_sha256: payload?.offer_sha256, channel: payload?.channel } : {}),
          ...(u.pathname === '/api/v1/notices/submissions' ? { kind: payload?.submission?.kind, notice_id: payload?.submission?.notice_id,
            has_expected_person_and_consent: payload?.submission?.person_id === f.scenarios.submission_form.person_id && payload?.submission?.consent_id === f.scenarios.submission_form.consent_id,
            target_matches_explicit_notice: payload?.submission?.target_party_id === f.scenarios.submission_form.target_party_id } : {}) });
      }
    })(); pending.add(task); task.finally(() => pending.delete(task));
  });
  await page.goto(app + '/?fixtureGroup=r05r12&fixtureRole=' + encodeURIComponent(who) + '#' + route);
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' });
  await page.locator('flt-semantics-placeholder').evaluate(e => e.click());
  if (heading) await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
  else await page.getByRole('button', { name: '账号与身份', exact: true }).first().waitFor();
  await settle();
}
async function reveal(target, header = false) {
  for (let n = 0; n < 65; n++) {
    const b = await target.count() ? await target.first().boundingBox() : null;
    if (b && b.y + b.height / 2 > (header ? 3 : 57) && b.y + b.height / 2 < page.viewportSize().height - 12) return b;
    await page.mouse.move(Math.max(6, (page.viewportSize().width - Math.min(page.viewportSize().width, 560)) / 2 + 6), 410);
    await page.mouse.wheel(0, b?.y < 58 ? -280 : 280); await page.waitForTimeout(85);
  }
  throw Error('Control not in Flutter viewport: ' + target);
}
async function press(target, header = false) {
  const b = await reveal(target, header); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(180);
}
async function fill(label, value) {
  const target = page.getByRole('textbox', { name: new RegExp('^' + label + '(?: |$)') });
  // Flutter must receive the pointer focus before Playwright edits the semantic
  // input; DOM-only focus can leave the visible editor/controller unchanged.
  let focus;
  for (let attempt = 0; attempt < 3; attempt++) {
    await press(target);
    focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') }));
    if (['INPUT', 'TEXTAREA'].includes(focus.tag) && focus.label?.startsWith(label)) break;
    await page.waitForTimeout(250); // Let Flutter's focus-driven scroll finish before locating the control again.
  }
  assert(['INPUT', 'TEXTAREA'].includes(focus.tag) && focus.label?.startsWith(label), 'Pointer focused the intended editor: ' + label);
  await page.keyboard.press('Meta+A'); await page.keyboard.insertText(value);
  await page.waitForTimeout(180);
  const observed = await target.inputValue();
  (row.input_checks ||= []).push({ label, intended_characters: value.length, observed_characters: observed.length, focus });
  assert.equal(observed, value, 'Actual focused Flutter input: ' + label);
  await page.keyboard.press('Tab'); await page.waitForTimeout(300);
}
async function select(label, option) {
  await press(page.getByRole('button', { name: new RegExp('^' + label + '(?: |$)') }));
  const item = page.getByRole('menuitem', { name: new RegExp('^' + option.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&') + '(?: |$)') });
  await item.waitFor({ state: 'visible' }); assert.equal(await item.count(), 1);
  await press(item); await settle();
}
async function top() {
  await page.mouse.move(Math.max(6, (page.viewportSize().width - Math.min(page.viewportSize().width, 560)) / 2 + 6), 410);
  await page.mouse.wheel(0, -40000); await page.waitForTimeout(220);
}
async function back(heading) {
  await top();
  const target = page.getByRole('button', { name: /^(返回|Back)$/ }).first();
  if (await target.count()) await press(target, true);
  else await page.goBack();
  if (heading) await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
  await settle();
}
async function capture(phase, full = false) {
  await top(); const allAria = []; let previous;
  for (let n = 0; n < (full ? 14 : 1); n++) {
    if (n) {
      await page.mouse.move(Math.max(6, (page.viewportSize().width - Math.min(page.viewportSize().width, 560)) / 2 + 6), 410);
      await page.mouse.wheel(0, page.viewportSize().height - 180); await page.waitForTimeout(220);
    }
    await page.mouse.move(0, 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal document overflow');
    const aria = redact(await page.locator('body').ariaSnapshot()); allAria.push(aria);
    const file = current + (runTag ? '-' + runTag : '') + '-' + phase + '-' + String(n).padStart(2, '0') + '.png';
    const bytes = await page.screenshot({ path: join(out, file) }), digest = sha(bytes);
    if (previous === digest) { await rm(join(out, file)); break; }
    await save(file.replace('.png', '.aria.txt'), aria + '\n');
    shots.push({ case: current, phase, file, route: new URL(page.url()).hash.slice(1), viewport: page.viewportSize(), sha256: digest,
      status: 'CAPTURED_PENDING_VISUAL_REVIEW', synthetic_media: true });
    assert(!aria.includes('页面不存在'), 'A screenshot of a missing route is not an accepted destination');
    if (!phase.includes('controlled-transport-failure') && !current.startsWith('missing-record-')) {
      assert(!/本页读取未完成|接口返回未通过核对/.test(aria), 'A generic failure is not a completed page');
    }
    previous = digest;
    if (n === 13) row.scroll_limit_reached = true;
  }
  return allAria.join('\n');
}
async function waitPath(path) {
  await page.waitForURL(url => url.hash.slice(1).startsWith(path));
  await settle();
}
async function desktopButton(target, label) {
  if (page.viewportSize().width < 768) return;
  const b = await reveal(target);
  assert(b.height >= 43.5, 'Desktop button must have actual height >=44: ' + label + ' was ' + b.height);
  check('Desktop tap height ' + label, { actual_height: b.height, minimum: 44 });
}
async function run(name, width, action, options = {}) {
  if (selected.size && !selected.has(name) && !selected.has(name + '-' + width)) return;
  current = name + '-' + width;
  row = { case: current, sequence: ++seq, width, result: 'RUNNING', checks: [], limitations: options.limitations || [] };
  results.push(row); writePaths = new Set(options.writes || []);
  if (writePaths.size && !allowWrites) { row.result = 'NOT_RUN_SYNTHETIC_WRITE_DISABLED'; return; }
  if (writePaths.size && results.some(r => r.result === 'FAIL')) { row.result = 'NOT_RUN_PRIOR_FAILURE'; return; }
  const before = requests.length, errBefore = errors.length, blockedBefore = blocked.length;
  try {
    await action(row);
    await Promise.allSettled([...pending]);
    assert.equal(errors.length, errBefore, 'No Flutter/page exception in this case');
    assert.equal(blocked.length, blockedBefore, 'No unexpected API write/origin was hidden by the test guard');
    row.result = 'PASS_PENDING_VISUAL_REVIEW';
    console.log('PASS ' + current);
  } catch (e) {
    row.result = 'FAIL'; row.error = redact(e.stack || e.message);
    console.error('FAIL ' + current + ': ' + redact(e.message));
    if (page) {
      await save(current + '-failure.aria.txt', redact(await page.locator('body').ariaSnapshot().catch(() => '')) + '\n');
      await page.screenshot({ path: join(out, current + '-failure.png') }).catch(() => {});
    }
  } finally {
    row.actual_request_count = requests.slice(before).filter(r => r.source === 'browser-real-http' && r.method !== 'OPTIONS').length;
    row.final_route = page ? new URL(page.url()).hash.slice(1) : null;
    writePaths.clear(); abortNextPath = undefined; quote412Armed = false; artist409Path = undefined;
  }
}
async function chooseCity(value, captureName) {
  await top();
  const label = await button('全部城市').count() ? '全部城市' : await button(city).count() ? city : missingCity;
  await press(button(label), true); await page.getByRole('heading', { name: '选择城市', exact: true }).waitFor();
  if (captureName) await capture(captureName, true);
  await fill('搜索或手动输入城市', value); await press(button('使用输入城市'));
  await page.getByRole('heading', { name: '选择城市', exact: true }).waitFor({ state: 'hidden' });
  await settle();
}
async function expandedSubmission(kind, width) {
  const form = f.scenarios.submission_form;
  await open('/notices/submit?noticeId=' + form.notice_id + '&kind=' + kind, 'notices_seller', width, kinds[kind]);
  await select('选择本次具体真人', submissionPerson.person.display_name);
  const avatar = submissionPerson.avatars.find(a => a.id === form.avatar_id);
  assert(avatar);
  await select('选择本人对明确接收方的已审授权', avatar.data.display_name + ' · ' + submissionConsent.data.terms);
  await fill('本次投稿用途', '本地合成浏览器验收，不用于真实合作');
  await fill('给接收方的投稿内容', '合成资料：检验本人授权、单向投稿与原记录返回。');
  if (kind === 'ROLE') await fill('想演的明确角色', '合成测试角色');
  await page.keyboard.press('Tab');
}
let artists, stock, notices, submissionPerson, submissionConsent, auditionOffer;
async function verifyAuditionDestination(start, phase) {
  await waitPath('/auditions/catalog');
  const destination = new URL('http://fixture' + new URL(page.url()).hash.slice(1));
  assert.equal(destination.pathname, '/auditions/catalog');
  assert.equal(destination.searchParams.get('city'), city, 'Preserve the selected exact city in navigation');
  await page.getByRole('heading', { name: '可约艺人', exact: true }).first().waitFor();
  await settle();
  const aria = await capture(phase, true);
  assert(!/页面不存在|本页读取未完成|接口返回未通过核对|当前无法读取/.test(aria), 'Never accept a missing/generic failure destination');
  assert(aria.includes(auditionOffer.title), 'The real public audition offer must render');
  const filter = page.getByRole('textbox', { name: '城市筛选', exact: true });
  // A prefilled CanvasKit editor exposes its current value to the native input
  // only after focus. Reading the unfocused semantic proxy can return "".
  await press(filter); await page.waitForTimeout(120);
  assert.equal(await filter.inputValue(), city);
  await Promise.allSettled([...pending]);
  assert(requests.slice(start).some(r => {
    const u = new URL('http://fixture' + r.path);
    return r.source === 'browser-real-http' && r.method === 'GET' && r.status === 200 &&
      u.pathname === '/api/v1/auditions/catalog' && u.searchParams.get('city') === city;
  }), 'Real destination request must carry the same exact city');
  check('Public audition destination, city and actual offer verified', {
    canonical_route: destination.pathname, city, confirmed_public_offer_id: auditionOffer.id, generic_failure_absent: true
  });
}
try {
  const served = await fetch(app + '/main.dart.js', { signal: AbortSignal.timeout(20000) });
  assert(served.ok);
  const bytes = Buffer.from(await served.arrayBuffer()), localBytes = await readFile(join(build, 'main.dart.js'));
  assert.equal(sha(bytes), sha(localBytes), 'The browser serves the frozen separate test build');
  buildProof = { bundle: 'main.dart.js', bytes: bytes.length, sha256: sha(bytes), identity_entry: 'test/support/figma_restore_browser_main.dart',
    identity_only_fixture: true, integration_base_commit: process.env.JX_REVIEW_SOURCE_COMMIT || 'not supplied; see parent source/build evidence',
    working_tree_changes: true };
  [artists, stock, notices] = await Promise.all([catalog('artists'), catalog('stock'), catalog('notices')]);
  const auditionRows = (await actual('/auditions/catalog?city=' + cityQuery + '&limit=20')).data.items;
  auditionOffer = auditionRows.find(r => r.id === f.scenarios.audition_offer.offer_id);
  assert(auditionOffer && auditionOffer.city === city, 'Existing exact-city public audition fixture');
  assert.equal(artists.length, expectedArtists); assert.equal(stock.length, 6); assert.equal(notices.length, 6);
  if (expectedArtists === 7) {
    const a = f.scenarios.artists.at(-1);
    const consent = (await actual('/artists/people/' + a.person_id + '/records/' + a.consent_id, a.role, { acting: true })).data;
    assert.equal(consent.current_status, 'WITHDRAWN');
    assert(!artists.some(item => item.listing_id === a.listing_id), 'The withdrawn eighth listing stays absent');
  }
  submissionPerson = (await actual('/artists/people/' + f.scenarios.submission_form.person_id, 'notices_seller', { acting: true })).data;
  submissionConsent = (await actual('/artists/people/' + f.scenarios.submission_form.person_id + '/records/' + f.scenarios.submission_form.consent_id, 'notices_seller', { acting: true })).data;
  assert.equal(submissionConsent.data.grantee_party_id, f.scenarios.submission_form.target_party_id);
  assert(submissionConsent.data.purposes.includes('COOPERATION_SUBMISSION'));

  for (const width of widths) {
    await run('channels', width, async () => {
      await open('/square', 'stock_buyer', width);
      await chooseCity(city);
      await capture('selected', true);
      for (const [label, phase, expected] of [['艺人', 'artists', artists.map(a => a.display_name)], ['视频', 'works', stock.map(a => a.title)], ['同城', 'local', notices.map(a => a.notice.title)]]) {
        await top(); await press(button(label)); await settle();
        const aria = await capture(phase, true);
        for (const title of expected) assert(aria.includes(title), 'Rendered source item: ' + title);
        check(label + ' renders real catalogue data', { count: expected.length });
      }
      assert(requests.some(r => r.case === current && r.path.includes('/artists/catalog?') && decodeURIComponent(r.path).includes('city=' + city)));
      check('精选与四频道按实际目录呈现；明星缺名单保留空态', { artists: artists.length, stock: stock.length, notices: notices.length });
    });
    await run('city', width, async () => {
      await open('/square', 'stock_buyer', width);
      await chooseCity(city, 'selector');
      check('Manual city uses exact API value', { value: city });
      await chooseCity(missingCity);
      const aria = await capture('empty-city', true);
      assert(aria.includes('当前城市暂无公开艺人')); assert(aria.includes('当前城市暂无'));
      assert(stock.some(s => aria.includes(s.title)), 'Nationwide works remain visible after empty-city selection');
      const scoped = requests.filter(r => r.case === current && r.method === 'GET' && /\/(artists|notices)\/catalog/.test(r.path));
      assert(scoped.some(r => decodeURIComponent(r.path).includes('city=' + missingCity)));
      check('No-result city is honest; nationwide works remain independent', { exact_query: missingCity });
      await page.reload(); await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' });
      await page.locator('flt-semantics-placeholder').evaluate(e => e.click()); await button(missingCity).waitFor(); await settle();
      check('Manual city persists on reload');
      await chooseCity(city); await capture('restored', false);
    });
    await run('search-directory', width, async () => {
      await open('/square', 'stock_buyer', width); await chooseCity(city); await top();
      await press(button('搜索'), true); await page.getByRole('heading', { name: '查找公开内容', exact: true }).waitFor();
      const aria = await capture('search', true);
      for (const label of ['找艺人', '找作品', '找通告']) assert(aria.includes(label), 'Search retains the actual catalogue choices');
      for (const [label, route, heading] of [['找艺人', '/artists/catalog', '公开艺人'], ['找作品', '/stock/catalog', '全部作品'], ['找通告', '/notices/catalog', '通告现场']]) {
        await top(); await desktopButton(entry(label), label); await press(entry(label)); await waitPath(route); await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
        await capture(label === '找艺人' ? 'search-artists' : label === '找作品' ? 'search-works' : 'search-notices');
        await back('查找公开内容'); check(label + ' enters catalogue and returns');
      }
      await back(); await top(); await press(button('全部')); await page.getByRole('heading', { name: '全部功能', exact: true }).waitFor();
      const all = await capture('all-functions', true);
      for (const name of ['艺人目录', '现成作品', '艺人榜单与月度评选', '找出品人与机构', '搜索与匹配', '试镜预约', '通告与投稿', '写下故事', '平台制作服务', '我的故事与草稿', '订单与报价', '制作与交付', '合同与原约定', '我已购买的作品', '系统与业务通知', '账号与身份']) assert(all.includes(name), 'All entry visible: ' + name);
      for (const [label, route, heading] of [['艺人目录', '/artists/catalog', '公开艺人'], ['现成作品', '/stock/catalog', '全部作品'], ['通告与投稿', '/notices/catalog', '通告现场'], ['试镜预约', '/auditions/catalog', '试镜预约'], ['我已购买的作品', '/stock/purchases', '已购视频']]) {
        await top(); const start = requests.length; await desktopButton(entry(label), label); await press(entry(label)); await waitPath(route);
        if (heading === '试镜预约') await verifyAuditionDestination(start, 'directory-auditions-catalog');
        else { await page.getByRole('heading', { name: heading, exact: true }).first().waitFor(); await capture('directory-' + route.slice(1).replaceAll('/', '-')); }
        await back('全部功能'); check(label + ' enters and returns');
      }
      row.limitations.push('全部功能其余业务只核对入口保留：本联合沙箱未开放 engagement/customization/production/supply/payment；不得视作那些业务已通过。');
    });
    await run('artist-detail', width, async () => {
      await open('/artists/catalog?city=' + cityQuery, 'stock_buyer', width, '公开艺人');
      await press(page.getByRole('button', { name: new RegExp('^查看艺人详情，' + artists[0].display_name + '，' + city) }));
      await page.getByRole('heading', { name: '艺人详情', exact: true }).waitFor(); await capture('initial', true);
      const start = requests.length;
      await press(button('读取获准预览 1')); await settle();
      assert(requests.slice(start).some(r => r.status === 200 && r.path.includes('/artists/catalog/') && r.path.endsWith('/content')));
      const aria = await capture('authorized-preview', true); assert(!aria.includes('此预览不是可显示的图片'));
      check('Explicit approved PNG read uses current public asset HTTP permission');
      const trialStart = requests.length;
      await press(button('查看公开试镜方案'));
      await verifyAuditionDestination(trialStart, 'auditions');
      await back('艺人详情');
      check('Return from public audition catalogue to original artist detail; no realtime availability inferred from artist flag');
    });
    await run('artist-filters', width, async () => {
      const candidate = artists.find(a => a.audition_public && a.tags.length);
      assert(candidate, 'Existing synthetic record with a real tag and audition-public flag');
      const tag = candidate.tags[0];
      await open('/artists/catalog?city=' + cityQuery, 'stock_buyer', width, '公开艺人');
      await press(button('筛选')); await page.getByRole('heading', { name: '艺人筛选', exact: true }).waitFor();
      await capture('filter-initial', true);
      await fill('城市', city); await fill('标签', tag);
      const audition = page.getByRole('checkbox', { name: '只看已开放试镜展示的艺人', exact: true });
      if (!await audition.isChecked()) await press(audition);
      await desktopButton(button('按条件查看艺人'), '按条件查看艺人');
      await capture('filter-selected', true);
      const begin = requests.length; await press(button('按条件查看艺人')); await settle();
      const aria = await capture('filter-results', true);
      assert(aria.includes(candidate.display_name));
      assert(requests.slice(begin).some(r => { const u = new URL('http://fixture' + r.path); return r.status === 200 &&
        u.pathname === '/api/v1/artists/catalog' && u.searchParams.get('city') === city &&
        u.searchParams.get('tag') === tag && u.searchParams.get('audition') === 'true'; }));
      check('P08 filters preserve exact city, real tag and audition flag', { city, tag, audition: true });
      await top(); await press(button('筛选')); await page.getByRole('heading', { name: '艺人筛选', exact: true }).waitFor();
      await press(button('重置筛选条件'));
      assert.equal(await page.getByRole('textbox', { name: '城市', exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('textbox', { name: '标签', exact: true }).inputValue(), '');
      assert(!await audition.isChecked());
      await capture('filter-reset', true);
      await press(button('按条件查看艺人')); await settle();
      check('P08 reset returns to public catalogue without writing');
    });
    await run('artist-unavailable', width, async () => {
      const item = artists[0], path = '/api/v1/artists/catalog/' + item.listing_id + '/assets/' + item.preview_asset_ids[0] + '/content';
      await open('/artists/catalog?city=' + cityQuery, 'stock_buyer', width, '公开艺人');
      await press(page.getByRole('button', { name: new RegExp('^查看艺人详情，' + item.display_name + '，' + city) }));
      await page.getByRole('heading', { name: '艺人详情', exact: true }).waitFor();
      const start = requests.length; await press(button('读取获准预览 1')); await settle();
      assert(requests.slice(start).some(r => r.path === path && r.status === 200), 'Load a real approved preview first');
      const controlledBefore = controlledResponses.length; artist409Path = path;
      await press(button('读取获准预览 1')); await settle();
      await page.getByRole('heading', { name: /这份公开资料当前不可用$/ }).waitFor();
      const aria = await capture('s05-controlled-409', true);
      assert(!aria.includes('读取获准预览') && !aria.includes('重新核权并保存预览'));
      assert.equal(controlledResponses.length - controlledBefore, 1);
      const unchanged = await actual(path.slice('/api/v1'.length));
      assert(unchanged.bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
      check('S05 current unavailable layout removes old preview/actions after one controlled409', { controlled_status: 409, actual_asset_afterward: 200, backend_permission_unchanged: true });
      row.limitations.push('Current S05 layout only: one intercepted GET409, no withdrawal. The earlier actual 200→withdrawal200→409 chain remains separate evidence.');
    });
    await run('stock-detail', width, async () => {
      const item = f.scenarios.stock.find(s => s.status === 'PUBLIC');
      await open('/stock/video?listingId=' + item.listing_id, 'stock_buyer', width, '作品详情');
      const aria = await capture('license', true); assert(aria.includes('个人')); assert(aria.includes('我已阅读本版价格、个人许可与售后约定'));
      assert(await button('确认本版购买并查看原订单').isDisabled(), 'Unchecked license cannot purchase');
      await desktopButton(button('读取已审预览'), '读取已审预览');
      await press(button('读取已审预览'));
      const observed = await page.waitForFunction(() => {
        const values = [...document.querySelectorAll('video')].map(v => ({ ready_state: v.readyState, duration: Number.isFinite(v.duration) ? v.duration : null,
          current_time: v.currentTime, width: v.videoWidth, height: v.videoHeight, paused: v.paused, ended: v.ended, error: v.error?.code || null }));
        return values.some(v => v.ready_state >= 2 && !v.paused && v.current_time > 0 && v.width > 0 && !v.error) ? values : false;
      }, null, { timeout: 15000, polling: 50 });
      const media = await observed.jsonValue(); await observed.dispose();
      if (await button('暂停预览').count()) await press(button('暂停预览'));
      await capture('preview', false);
      check('Actual synthetic MP4 decoded and advanced in browser', { media });
      await press(page.getByRole('checkbox', { name: '我已阅读本版价格、个人许可与售后约定', exact: true }));
      await reveal(button('确认本版购买并查看原订单'));
      assert(await button('确认本版购买并查看原订单').isEnabled(), 'Acknowledged license enables review action');
      await desktopButton(button('确认本版购买并查看原订单'), '确认本版购买并查看原订单');
      await capture('license-acknowledged', true);
      await press(button('确认本版购买并查看原订单'));
      await page.getByRole('alertdialog').waitFor();
      await capture('purchase-review-no-submit', true);
      await desktopButton(button('确认办理'), '确认办理');
      await press(button('返回核对'));
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
      check('Purchase review dialog opens and cancels without checkout POST');
    });
    await run('stock-quote-change', width, async () => {
      const item = f.scenarios.stock.find(s => s.status === 'PUBLIC');
      await open('/stock/video?listingId=' + item.listing_id, 'stock_buyer', width, '作品详情');
      await press(page.getByRole('checkbox', { name: '我已阅读本版价格、个人许可与售后约定', exact: true }));
      await press(button('确认本版购买并查看原订单')); await page.getByRole('alertdialog').waitFor();
      const begin = controlledResponses.length;
      quote412Armed = true;
      await press(button('确认办理')); await settle();
      await page.getByRole('heading', { name: /重新确认本版许可$/ }).waitFor();
      const aria = await capture('s06-controlled-412', true);
      const checkbox = page.getByRole('checkbox', { name: '我已阅读本版价格、个人许可与售后约定', exact: true });
      await reveal(checkbox); assert(!await checkbox.isChecked()); assert(await checkbox.isDisabled());
      await reveal(button('重新核对后才能确认购买')); assert(await button('重新核对后才能确认购买').isDisabled());
      assert.equal(controlledResponses.length - begin, 1); assert(!quote412Armed);
      assert(aria.includes('原来的已读勾选已清除'));
      assert.equal(writes.filter(w => w.case === current).length, 0);
      await press(button('重新读取本页')); await settle();
      await reveal(checkbox); assert(!await checkbox.isChecked()); assert(await checkbox.isEnabled());
      await reveal(button('确认本版购买并查看原订单')); assert(await button('确认本版购买并查看原订单').isDisabled());
      await capture('s06-real-reread', true);
      check('S06 one controlled 412 clears previous quote/acknowledgement; real reread still requires consent', { controlled_status: 412, reached_backend_for_checkout: false });
      row.limitations.push('The 412 is deliberately intercepted in the browser. It proves UI recovery only, not a true server price change. No checkout reaches the backend.');
    });
    await run('notice-forms', width, async () => {
      const n = f.scenarios.notices.find(n => n.type === 'RECRUITMENT');
      await open('/notices/public?noticeId=' + n.notice_id, 'notices_seller', width, '通告详情');
      const aria = await capture('notice-detail', true);
      for (const name of Object.values(kinds)) assert(aria.includes(name));
      for (const kind of Object.keys(kinds)) {
        await expandedSubmission(kind, width);
        const aria = await capture('form-' + kind.toLowerCase(), true);
        assert(aria.includes('提交本次单向投稿审核'));
        await desktopButton(button('提交本次单向投稿审核'), '提交本次单向投稿审核');
        check('Own scoped consent selected: ' + kind, { consent_status: submissionConsent.current_status, target_matches_notice: true });
      }
      row.limitations.push('附件上传未测试；联合沙箱未开放 supply 上传。');
    });
  }
  await run('notice-types-results', 390, async () => {
    for (const n of f.scenarios.notices) {
      await open('/notices/public?noticeId=' + n.notice_id, 'notices_seller', 390, '通告详情');
      const aria = await capture('type-' + n.type.toLowerCase(), true);
      assert(aria.includes(noticeTypes[n.type]));
      assert.equal(aria.includes(kinds.PROFILE), ['DRAMA', 'RECRUITMENT'].includes(n.type));
      check(n.type + ' keeps actual submission boundary');
    }
    for (const record of f.scenarios.submissions) {
      await open('/notices/record?recordId=' + record.submission_id, 'notices_seller', 390, '投稿与客服进度');
      await capture('original-' + record.stage.toLowerCase(), true);
      const result = (await actual('/notices/records/' + record.submission_id, 'notices_seller', { acting: true })).data;
      assert.equal(result.next_action, { PENDING: 'WAIT_REVIEW', SENT: 'WAIT_RECIPIENT', INTERESTED: 'WAIT_SUPPORT' }[record.stage]);
      check('Read original submission ' + record.stage, { next_action: result.next_action });
    }
  });
  await run('submission-no-consent', 390, async () => {
    const a = f.scenarios.artists[0];
    const person = (await actual('/artists/people/' + a.person_id, a.role, { acting: true })).data;
    await open('/notices/submit?noticeId=' + f.scenarios.submission_form.notice_id + '&kind=PROFILE', a.role, 390, kinds.PROFILE);
    await select('选择本次具体真人', person.person.display_name);
    const aria = await capture('missing-recipient-consent', true);
    assert(aria.includes('还没有覆盖本次接收方的已审合作投稿同意'));
    assert.equal(await button('提交本次单向投稿审核').count(), 0);
    check('Existing personal identity without scoped cooperation consent cannot submit');
  });
  await run('missing-record', 390, async () => {
    await open('/stock/video?listingId=' + randomUUID(), 'stock_buyer', 390, '作品详情');
    await capture('actual-404', true);
    assert(requests.some(r => r.case === current && r.status === 404 && /\/stock\/catalog\//.test(r.path)));
    assert.equal(await button('确认本版购买并查看原订单').count(), 0);
    check('Real nonexistent public record returns 404 and no purchase action');
  });
  await run('network-recovery', 390, async () => {
    for (const [domain, heading] of [['artists', '公开艺人'], ['stock', '全部作品'], ['notices', '通告现场']]) {
      abortNextPath = '/api/v1/' + domain + '/catalog';
      await open('/' + domain + '/catalog', 'stock_buyer', 390, heading);
      const aria = await capture(domain + '-controlled-transport-failure', true);
      assert(aria.includes('本页读取未完成'));
      await press(button('重新加载')); await settle();
      await capture(domain + '-actual-http-recovery', true);
      assert(requests.some(r => r.case === current && r.source === 'browser-real-http' && r.status === 200 && r.path.startsWith('/api/v1/' + domain + '/catalog')));
      check(domain + ': controlled network failure then actual HTTP recovery');
    }
    row.limitations.push('Initial failures deliberately abort one browser GET, not a real backend failure; successful retry responses are real HTTP.');
  });
  await run('checkout', 390, async () => {
    const item = f.scenarios.stock.find(s => s.status === 'PUBLIC');
    await open('/stock/video?listingId=' + item.listing_id, 'stock_buyer', 390, '作品详情');
    await reveal(button('确认本版购买并查看原订单'));
    assert(await button('确认本版购买并查看原订单').isDisabled());
    await press(page.getByRole('checkbox', { name: '我已阅读本版价格、个人许可与售后约定', exact: true }));
    await reveal(button('确认本版购买并查看原订单'));
    assert(await button('确认本版购买并查看原订单').isEnabled());
    await press(button('确认本版购买并查看原订单'));
    await page.getByRole('alertdialog').waitFor(); await capture('confirmation', true);
    const begin = requests.length;
    await press(button('确认办理')); await waitPath('/trade/record?recordId=');
    await capture('original-order', true); await Promise.allSettled([...pending]);
    const own = requests.slice(begin);
    const reread = own.findIndex(r => r.method === 'GET' && r.path === '/api/v1/stock/catalog/' + item.listing_id && r.status === 200);
    const post = own.findIndex(r => r.method === 'POST' && r.path === '/api/v1/stock/checkout' && r.status === 200);
    assert(reread >= 0 && post > reread, 'Quote is re-read before checkout POST');
    const id = new URL('http://local' + new URL(page.url()).hash.slice(1)).searchParams.get('recordId');
    const order = (await actual('/trade/records/' + id, 'stock_buyer', { acting: true })).data;
    assert.equal(order.kind, 'ORDER'); assert.notEqual(order.current_status, 'PAID');
    check('License consent + current quote reread + one original unpaid order', { status: order.current_status, record_id: id });
  }, { writes: ['POST /api/v1/stock/checkout'], limitations: ['Only creates a synthetic unpaid order; no payment, receipt, acceptance or license activation.'] });
  for (const kind of Object.keys(kinds)) await run('submit-' + kind.toLowerCase(), 390, async () => {
    await expandedSubmission(kind, 390);
    await press(button('提交本次单向投稿审核')); await page.getByRole('alertdialog').waitFor();
    await capture('confirmation', true); const start = writes.length;
    await press(button('确认办理')); await waitPath('/notices/record?recordId=');
    await capture('original-submission', true); await Promise.allSettled([...pending]);
    const id = new URL('http://local' + new URL(page.url()).hash.slice(1)).searchParams.get('recordId');
    const original = (await actual('/notices/records/' + id, 'notices_seller', { acting: true })).data;
    assert.equal(original.data.submission.kind, kind); assert.equal(original.next_action, 'WAIT_REVIEW');
    const sent = writes.slice(start).filter(r => r.path === '/api/v1/notices/submissions');
    assert.equal(sent.length, 1); assert(sent[0].has_expected_person_and_consent && sent[0].target_matches_explicit_notice);
    const before = writes.length;
    await open('/notices/record?recordId=' + id, 'notices_seller', 390, '投稿与客服进度');
    await capture('reread-original', true); assert.equal(writes.length, before);
    check('One explicit ' + kind + ' submission preserves scoped consent and original record', { record_id: id, next_action: original.next_action });
  }, { writes: ['POST /api/v1/notices/submissions'], limitations: ['Synthetic single-direction submission only; no recipient interest, contract, payment, role allocation or free chat.'] });
  await run('artist-revocation', 390, async () => {
    const a = f.scenarios.artists.at(-1), item = artists.find(v => v.listing_id === a.listing_id);
    await open('/artists/catalog?city=' + cityQuery, 'stock_buyer', 390, '公开艺人');
    await press(page.getByRole('button', { name: new RegExp('^查看艺人详情，' + item.display_name + '，' + city) }));
    await page.getByRole('heading', { name: '艺人详情', exact: true }).waitFor();
    await press(button('读取获准预览 1')); await settle(); await capture('before-revocation', false);
    const consentPath = '/artists/people/' + a.person_id + '/records/' + a.consent_id;
    const consent = (await actual(consentPath, a.role, { acting: true })).data;
    await actual(consentPath + '/withdrawals', a.role, { acting: true, method: 'POST', version: consent.object_version,
      body: { reason: '合成本机浏览器撤权验收；仅撤回本轮随机数据库资料' } });
    await press(button('读取获准预览 1')); await settle();
    await page.getByRole('heading', { name: /这份公开资料当前不可用$/ }).waitFor();
    const aria = await capture('after-revocation', true);
    assert(!aria.includes('读取获准预览 1')); assert(!aria.includes('重新核权并保存预览 1'));
    assert(requests.some(r => r.case === current && r.source === 'browser-real-http' && [403, 404, 409].includes(r.status) && r.path.endsWith('/content')));
    check('Actual withdrawal removes old preview/action on next permission check', { affected_fixture_role: a.role });
    row.limitations.push('This final case withdraws the eighth synthetic artist; subsequent catalogs contain 7, so repeat from a fresh sandbox.');
  }, { writes: ['CONTROL /synthetic-artist-withdrawal'], limitations: ['Last test deliberately mutates only this sandbox; no automatic restoration of withdrawn consent.'] });
} catch (e) {
  errors.push({ case: current || 'preflight', type: 'fatal', message: redact(e.stack || e.message) });
  console.error(redact(e.message));
} finally {
  await Promise.allSettled([...pending]); if (context) await context.close(); await browser.close();
  const failed = results.filter(r => r.result === 'FAIL'), skipped = results.filter(r => r.result.startsWith('NOT_RUN'));
  const report = { status: failed.length || errors.length || blocked.length ? 'FAIL' : skipped.length ? 'PARTIAL_WRITES_NOT_RUN' : 'PASS_PENDING_VISUAL_REVIEW',
    checked_at: new Date().toISOString(), synthetic_only: true, true_http_business_responses: true, mocked_success_responses: 0,
    visual_review: 'Screenshots require human/model comparison; browser execution does not assert pixel fidelity.',
    build: buildProof, widths, fixture_counts: { artists: artists?.length, stock: stock?.length, notices: notices?.length },
    cases: results.length, failed_cases: failed.map(r => r.case), write_enabled: allowWrites,
    actual_request_count: requests.filter(r => r.method !== 'OPTIONS').length, browser_request_count: requests.filter(r => r.source === 'browser-real-http' && r.method !== 'OPTIONS').length,
    synthetic_write_count: writes.length, screenshot_count: shots.length, results, screenshots: shots, requests, writes, blocked_requests: blocked, errors, network,
    controlled_transport_faults: controlledFaults,
    controlled_http_responses: controlledResponses,
    limitations: ['Synthetic identity bootstrap intercepts one login inside the dedicated test entry; all business reads/writes use real isolated HTTP.',
      'No production, true provider, payment, SMS, private real-person media, final-file download or colleague review.',
      'Stars, IP location, city normalization and stock covers remain separately documented backend/product gaps.',
      'The sandbox does not open engagement/customization/production/supply upload/payment. Unavailable fixture routes are not production defects.',
      'Ordinary main.dart build and design comparison are separate evidence.'] };
  await save('browser-results' + (runTag ? '-' + runTag : '') + '.json', report);
  await save('index' + (runTag ? '-' + runTag : '') + '.html', '<!doctype html><meta charset="utf-8"><title>广场真实 HTTP 浏览器验收</title><style>body{font:16px system-ui;background:#f3f0e6;padding:24px;color:#171613}article{display:inline-block;vertical-align:top;max-width:390px;margin:12px}img{width:100%;border:1px solid #bbb}p{font-size:12px}</style><h1>广场真实 HTTP 浏览器验收</h1><p>合成资料；实际业务 HTTP；图片为待逐页视觉审阅证据。</p><p>' + report.status + ' · ' + report.cases + ' cases · ' + report.actual_request_count + ' requests · ' + report.synthetic_write_count + ' synthetic writes</p>' + shots.map(s => '<article><p>' + s.case + ' / ' + s.phase + ' / ' + s.viewport.width + '</p><a href="' + s.file + '"><img loading="lazy" src="' + s.file + '"></a></article>').join(''));
  console.log(JSON.stringify({ status: report.status, cases: report.cases, failed: report.failed_cases, actual_requests: report.actual_request_count, writes: report.synthetic_write_count, screenshots: report.screenshot_count }));
  if (report.status !== 'PASS_PENDING_VISUAL_REVIEW') process.exitCode = 1;
}
