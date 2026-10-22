#!/usr/bin/env node
// Expand authorized form contexts for visual review. Never submit business data.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const f = JSON.parse(await readFile(process.env.V5_ACCESS_FILE, 'utf8'));
assert(f.synthetic_only && new URL(f.base_url).hostname === '127.0.0.1');
const app = process.env.V5_APP_URL || 'http://127.0.0.1:5500';
assert(new URL(app).hostname === '127.0.0.1');
const out = resolve('output/playwright/v5-r05-r12/app');
await mkdir(out, { recursive: true });
const secrets = Object.values(f.accounts).map(a => a.bearer_token).filter(Boolean);
const redact = value => secrets.reduce((s, t) => s.replaceAll(t, '[redacted]'), String(value));
const reads = [], writes = [], errors = [], screenshots = [], results = [];
const fontNetwork = [];
const noticeNames = { DRAMA: '剧与角色', PERFORMANCE: '商演', COMMERCIAL: '商单', EVENT: '活动', RECRUITMENT: '招募' };
const { chromium } = createRequire(join(process.cwd(), '晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let context, page, current;

async function actual(path, role, acting = true) {
  const account = f.accounts[role];
  assert(account, role);
  const response = await fetch(f.base_url + path, {
    headers: { Authorization: 'Bearer ' + account.bearer_token, ...(acting ? { 'X-Acting-Party': account.party_id } : {}) },
    signal: AbortSignal.timeout(10000)
  });
  reads.push({ case: current, source: 'authorized-reference', role, method: 'GET', path, status: response.status });
  assert.equal(response.status, 200, role + ' GET ' + path);
  return (await response.json()).data;
}
async function rows(path, role, acting = true) {
  const all = [], seen = new Set();
  let cursor;
  do {
    const data = await actual(path + (path.includes('?') ? '&' : '?') + 'limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), role, acting);
    assert(Array.isArray(data.items));
    all.push(...data.items);
    cursor = data.next_cursor;
    if (cursor) { assert(!seen.has(cursor)); seen.add(cursor); }
  } while (cursor);
  return all;
}
function originalStockEarning(earnings) {
  const actual = earnings.filter(r => r.data.source_kind === 'CONSUMPTION' && r.data.category === 'STOCK' && r.data.points === 10);
  const requested = actual.find(r => r.data.order_id === f.scenarios.stock_paid.order_id);
  assert(requested || actual.length === 1, 'Choose only an unambiguous actual ten-point STOCK batch owned by this account');
  return requested || actual[0];
}
async function open(route, role) {
  if (context) await context.close();
  context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push({ case: current, message: redact(e.message) }));
  page.on('console', m => { if (/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/.test(m.text())) errors.push({ case: current, message: redact(m.text()) }); });
  page.on('request', r => {
    if (r.url().startsWith(f.base_url) && !['GET', 'OPTIONS'].includes(r.method())) {
      writes.push({ case: current, role, method: r.method(), path: new URL(r.url()).pathname });
    }
  });
  page.on('response', r => {
    if (r.url().startsWith(f.base_url) && r.request().method() === 'GET') {
      const url = new URL(r.url());
      reads.push({ case: current, source: 'browser', role, method: 'GET', path: url.pathname + url.search, status: r.status() });
    }
    if (/fonts\.(gstatic|googleapis)\.com/.test(r.url())) {
      const url = new URL(r.url());
      fontNetwork.push({ case: current, host: url.hostname, path: url.pathname, status: r.status() });
    }
  });
  page.on('requestfailed', r => {
    if (/fonts\.(gstatic|googleapis)\.com/.test(r.url())) {
      const url = new URL(r.url());
      fontNetwork.push({ case: current, host: url.hostname, path: url.pathname, failure: r.failure()?.errorText });
    }
  });
  await page.goto(app + '/?fixtureRole=' + encodeURIComponent(role) + '#' + route);
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' });
  await page.locator('flt-semantics-placeholder').evaluate(e => e.click());
  await page.getByRole('heading').first().waitFor();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(160);
}
async function reveal(target) {
  for (let n = 0; n < 70; n++) {
    const b = await target.count() ? await target.first().boundingBox() : null;
    if (b && b.y + b.height / 2 > 58 && b.y + b.height / 2 < 834) return b;
    await page.mouse.move(190, 410);
    await page.mouse.wheel(0, b?.y < 58 ? -320 : 320);
    await page.waitForTimeout(65);
  }
  throw Error('Control not visible: ' + target.toString());
}
async function press(target) {
  const b = await reveal(target);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(180);
}
async function select(label, option) {
  const field = page.getByRole('button', { name: new RegExp('^' + label + '(?: |$)') });
  await press(field);
  const item = page.getByRole('menuitem', { name: option, exact: true });
  await item.waitFor({ state: 'visible' });
  assert.equal(await item.count(), 1, 'The actual authorized dropdown value must be unambiguous');
  await press(item);
  await page.waitForLoadState('networkidle');
}
async function capture(name, source, endAction, expanded, note, references) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.mouse.move(190, 410);
  await page.mouse.wheel(0, -12000);
  await page.waitForTimeout(650);
  const files = [];
  let reachedAction = false;
  for (let n = 0; n < 10; n++) {
    if (n) { await page.mouse.wheel(0, 570); await page.waitForTimeout(350); }
    const position = n === 0 ? 'top' : 'fields-' + n;
    const file = name + '-390-' + position + '.png';
    await page.screenshot({ path: join(out, file) });
    screenshots.push({ file, case: current, source, position, width: 390, height: 844,
      sha256: createHash('sha256').update(await readFile(join(out, file))).digest('hex') });
    files.push(file);
    const action = page.getByRole('button', { name: endAction, exact: true });
    const b = await action.count() ? await action.boundingBox() : null;
    if (b && b.y >= 58 && b.y + b.height <= 844) { reachedAction = true; break; }
    if (!expanded && n === 1) break;
  }
  assert(!expanded || reachedAction, 'Expanded form coverage must reach its final action');
  // CanvasKit can request a fallback glyph when new text first enters view.
  // Revisit the first viewport after the complete form has actually rendered.
  await page.mouse.wheel(0, -12000);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, files[0]) });
  screenshots.find(s => s.file === files[0]).sha256 = createHash('sha256').update(await readFile(join(out, files[0]))).digest('hex');
  results.push({ case: current, state: expanded ? 'EXPANDED_PENDING_VISUAL_REVIEW' : 'CONTEXT_BLOCKED', route: new URL(page.url()).hash.slice(1),
    references, note, screenshots: files, final_action_visible: reachedAction, submitted: false });
}

for (const name of ['05-new-selected', '06-publish-selected', '06-qualification-owner', '07-new-selected', '08-earning-batches', '08-sync-selected']) {
  current = name;
  try {
    if (name === '05-new-selected') {
      const listing = await actual('/stock/listings/' + f.scenarios.stock_paid.listing_id, 'stock_seller');
      const person = await actual('/artists/people/' + listing.data.seller_person_id, 'stock_seller');
      assert.equal(person.person.id, listing.data.seller_person_id);
      const count = listing.data.participants.length;
      assert(Number.isInteger(count) && count >= 0 && count <= 20);
      await open('/stock/new', 'stock_seller');
      await select('卖方具体真人', person.person.display_name);
      await select('本作品可识别出镜人数', count === 0 ? '无可识别人物' : count + ' 位（逐人选择已审授权）');
      await reveal(page.getByRole('textbox', { name: '城市', exact: true }));
      await capture(name, '12-artist-stock-producer.png', '提交内容与权利双审核', true,
        '仅选择本人已授权真人及原作品人数；未填价格、期限或技术编号，未提交。规则缺目录时保留真实阻断。',
        { person_id: person.person.id, participants: count });
    }
    if (name === '06-publish-selected') {
      const rules = await rows('/notices/rules', 'notices_buyer', false);
      let selected, eligibility;
      for (const rule of rules) {
        const e = await actual('/notices/eligibility?rule_id=' + encodeURIComponent(rule.id), 'notices_buyer');
        if (e.active && e.types.some(t => noticeNames[t])) { selected = rule; eligibility = e; break; }
      }
      await open('/notices/new', 'notices_buyer');
      if (selected) {
        await select('选择已生效发布规则', selected.rule.version + ' · 投稿' + selected.rule.submission_days + '天');
        const type = eligibility.types.find(t => noticeNames[t]);
        await select('本次可发布类型', noticeNames[type]);
        await reveal(page.getByRole('textbox', { name: '通告标题', exact: true }));
        await capture(name, '23-notice-top.png', '提交正式通告审核', true,
          '仅按本人实时资格选择已生效规则与实际允许的通告品类；业务日期和价格未预填，未提交。',
          { rule_id: selected.id, type, eligibility_active: eligibility.active });
      } else {
        await capture(name, '23-notice-top.png', '提交正式通告审核', false,
          '未找到实际可发布资格，保留真实门禁；本图仅覆盖初态，不能宣称完整发布表单已验收。', { eligible_rule: false });
      }
    }
    if (name === '06-qualification-owner') {
      const membership = (await rows('/me/parties', 'mcn_owner', false)).find(r => r.party.id === f.accounts.mcn_owner.party_id);
      assert(membership?.party.kind === 'ORGANIZATION' && membership.membership.roles.includes('OWNER'));
      assert(!['CLOSED', 'SUSPENDED'].includes(membership.party.current_status));
      await open('/notices/qualification', 'mcn_owner');
      await reveal(page.getByRole('textbox', { name: '资质生效时间', exact: true }));
      await capture(name, '23-notice-top.png', '提交机构独立资质审核', true,
        '实际机构 OWNER 资格表单；只读，不上传资质、不设置虚构日期、不提交。',
        { party_kind: membership.party.kind, roles: membership.membership.roles });
    }
    if (name === '07-new-selected') {
      const offer = await actual('/auditions/records/' + f.scenarios.audition_offer.offer_id, 'auditions_seller');
      const person = await actual('/artists/people/' + offer.data.offer.person_id, 'auditions_seller');
      assert.equal(person.person.id, offer.data.offer.person_id);
      await open('/auditions/new', 'auditions_seller');
      await select('选择具体真人', person.person.display_name);
      await reveal(page.getByRole('textbox', { name: '方案名称', exact: true }));
      // Adding an empty local row shows the date controls without inventing a booking period.
      await press(page.getByRole('button', { name: '添加可预约时段', exact: true }));
      await capture(name, '21-audition-top.png', '提交本版试镜方案独立审核', true,
        '只选择本人已授权真人并展开一个空白本地时段；无预约时间、金额默认值，无业务提交。',
        { person_id: person.person.id, existing_offer_id: offer.id });
    }
    if (name === '08-earning-batches') {
      const earnings = await rows('/wallet/records?kind=EARNING', 'stock_buyer');
      const original = originalStockEarning(earnings);
      await open('/wallet/records?kind=EARNING', 'stock_buyer');
      await capture(name, '32-wallet-top.png', '重新核对本页', true,
        '只读实际晶钻来源、到期、使用和冲回批次；原现货消费批次为服务器已记录的 10 晶钻。',
        { order_id: original.data.order_id, earning_id: original.id, points: original.data.points,
          requested_stock_paid_order_id: f.scenarios.stock_paid.order_id, matches_requested_stock_paid: original.data.order_id === f.scenarios.stock_paid.order_id });
    }
    if (name === '08-sync-selected') {
      const earnings = await rows('/wallet/records?kind=EARNING', 'stock_buyer');
      const original = originalStockEarning(earnings);
      const categories = { STOCK: '现货', CUSTOMIZATION: '定制', AUDITION: '试镜', COMMERCIAL: '商单' };
      const states = { PENDING: '等待履约与售后条件', ISSUED: '晶钻已记入原批次', REVERSAL_PENDING: '退款晶钻待由未来奖励抵扣' };
      assert(categories[original.data.category] && states[original.current_status]);
      await open('/wallet/sync', 'stock_buyer');
      await select('本人已有承诺的原订单', categories[original.data.category] + ' · ' + states[original.current_status] + ' · ' + original.data.points + ' 晶钻');
      await capture(name, '32-wallet-top.png', '按原订单核对晶钻条件', true,
        '仅选择账本本人真实的现货 10 晶钻原订单；实际批次与 stock_paid 场景编号是否一致另列，未点击核对/同步动作，未提交 POST。',
        { order_id: original.data.order_id, earning_id: original.id, points: original.data.points,
          requested_stock_paid_order_id: f.scenarios.stock_paid.order_id, matches_requested_stock_paid: original.data.order_id === f.scenarios.stock_paid.order_id });
    }
  } catch (error) {
    results.push({ case: name, state: 'FAIL', failure: redact(error.stack || error.message), submitted: false });
    process.exitCode = 1;
  }
}
if (context) await context.close();
await browser.close();
if (writes.length || errors.length) process.exitCode = 1;
const report = { result: process.exitCode ? 'FAIL' : 'CAPTURED_PENDING_VISUAL_REVIEW', synthetic_only: true,
  scope: 'Four authorized form contexts plus actual earning batches and selected original order; UI selections and local row expansion only; never click a submit action',
  base_url: f.base_url, results, screenshots, reads, writes, errors, font_network: fontNetwork, no_business_writes: writes.length === 0 };
const json = JSON.stringify(report, null, 2);
for (const secret of secrets) assert(!json.includes(secret));
await writeFile(join(out, 'APP_FORMS_RESULTS.json'), json + '\n');
console.log(JSON.stringify({ result: report.result, forms: results.length, screenshots: screenshots.length, writes: writes.length, errors: errors.length }));
