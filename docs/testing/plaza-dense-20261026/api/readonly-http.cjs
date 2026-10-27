'use strict';
// Focused GET-only checks against a freshly created local synthetic sandbox.
// Tokens and response bodies are never written to the evidence files.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
require(path.join(root, '晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
const modes = ['artists', 'stock', 'notices', 'auditions'];

async function main() {
  const [mode, input] = process.argv.slice(2);
  assert.ok(modes.includes(mode) && input, 'Usage: readonly-http.cjs <artists|stock|notices|auditions> <sandbox directory>');
  const sourceCommit = process.env.JX_REVIEW_SOURCE_COMMIT;
  assert.match(sourceCommit || '', /^[0-9a-f]{40}$/, 'Set JX_REVIEW_SOURCE_COMMIT to the verified source commit');
  const dir = path.resolve(root, input), parent = path.join(root, '.local', mode + '-sandbox');
  assert.equal(path.dirname(dir), parent);
  assert.match(path.basename(dir), new RegExp('^jx_test_' + mode + '_[0-9]+_[a-f0-9]{12}$'));
  const a = JSON.parse(await fs.readFile(path.join(dir, 'access.json'), 'utf8'));
  const state = JSON.parse(await fs.readFile(path.join(dir, 'status.json'), 'utf8'));
  const url = new URL(a.base_url);
  assert.equal(a.synthetic_only, true); assert.equal(state.synthetic_only, true); assert.equal(state.status, 'RUNNING');
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/api/v1');
  const results = [], observations = [], requests = [];
  const defaultRole = mode === 'artists' ? 'outsider' : 'buyer';
  async function get(route, { role = defaultRole, party = false, anonymous = false } = {}) {
    const account = a.accounts[role];
    const res = await fetch(a.base_url + route, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
      ...anonymous ? {} : { Authorization: 'Bearer ' + account.bearer_token },
      ...party ? { 'X-Acting-Party': account.party_id } : {}
    } });
    const bytes = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    const json = type.includes('application/json') ? JSON.parse(bytes.toString()) : null;
    const item = { route: route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '{id}'), method: 'GET', role: anonymous ? 'anonymous' : role,
      acting_party: party, status: res.status, content_type: type, byte_length: bytes.length, cache_control: res.headers.get('cache-control'), error_code: json?.error?.code || null };
    requests.push(item);
    return { status: res.status, data: json?.data, error: json?.error?.code, type, bytes, cache: item.cache_control };
  }
  function check(name, ok) { results.push({ name, status: ok ? 'PASS' : 'FAIL' }); }
  const query = (route, values) => route + '?' + new URLSearchParams(values);
  const catPath = '/' + mode + '/catalog';
  let r = await get(catPath, { anonymous: true });
  check('公开目录目前要求登录，匿名返回401', r.status === 401 && r.error === 'AUTHENTICATION_REQUIRED');
  r = await get(catPath);
  check('已登录可读取当前公开目录', r.status === 200 && Array.isArray(r.data?.items) && r.data.items.length > 0);
  const catalog = r.data?.items || [], first = catalog[0];
  if (!first) throw Error('Expected synthetic catalog item');
  const city = mode === 'notices' ? first.notice.city : first.city;
  observations.push({ name: 'public_catalog_fields', fields: Object.keys(first).sort() });
  r = await get(query(catPath, { city }));
  check('城市参数真实过滤且保留对应记录', r.status === 200 && r.data?.items.length > 0 && r.data.items.every(v => (mode === 'notices' ? v.notice.city : v.city) === city));
  r = await get(query(catPath, { city: '无资料隔离城市' }));
  check('无资料城市返回空目录，不返回其他城市记录', r.status === 200 && r.data?.items.length === 0);
  r = await get(query(catPath, { q: 'synthetic' }));
  check('未定义的关键字搜索参数被拒绝', r.status === 400);

  if (mode === 'artists') {
    check('公开资料不带私有授权证据或联系信息', !['consent_id', 'evidence_asset_ids', 'phone', 'contacts'].some(k => k in first));
    r = await get(query(catPath, { city: city + '市' }));
    check('城市别名目前不会自动归一（郑州/郑州市）', city === '郑州' && r.status === 200 && r.data?.items.length === 0);
    r = await get(query(catPath, { tag: first.tags[0] }));
    check('已有艺人标签过滤可调用', r.status === 200 && r.data?.items.some(v => v.listing_id === first.listing_id));
    r = await get(query(catPath, { audition: 'true' }));
    check('未开放试镜展示的艺人不进入可约筛选', r.status === 200 && r.data?.items.length === 0 && first.audition_public === false);
    for (const params of [{ star: 'true' }, { sort: 'star' }]) {
      r = await get(query(catPath, params)); check('未定义的明星/排序参数被拒绝：' + Object.keys(params)[0], r.status === 400);
    }
    r = await get('/artists/catalog/' + first.listing_id);
    check('不存在独立公开艺人详情GET，不能误用私有详情', r.status === 404);
    r = await get('/artists/people/' + a.person_id, { party: true });
    check('无关用户不能读取艺人私有档案', r.status === 404 || r.status === 403);
    r = await get('/artists/catalog/' + first.listing_id + '/assets/' + first.preview_asset_ids[0] + '/content');
    check('已批准PNG预览字节可按公开预览接口读取', r.status === 200 && r.bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
    check('公开艺人预览禁止长期HTTP缓存', r.cache === 'no-store');
    observations.push({ name: 'artist_preview_fixture', value: '1-pixel synthetic PNG; verifies transport and permissions, not portrait quality' });
    observations.push({ name: 'artist_preview_content_type', value: r.type, consequence: 'The API sends octet-stream; the UI must decode bounded preview bytes and handle non-image/error content, not require an image MIME header.' });
    r = await get('/artists/catalog/' + first.listing_id + '/assets/' + a.evidence_id + '/content');
    check('目录不可用预览接口读取未公开证据文件', r.status === 404 || r.status === 403);
    observations.push({ name: 'star_fields', present: ['star', 'is_star', 'star_rank', 'featured', 'recommendation'].filter(k => k in first) });
  }
  if (mode === 'stock') {
    const s = a.scenarios;
    r = await get('/stock/catalog/' + s.paid.listing_id);
    check('作品详情含价格和具体个人非商用许可', r.status === 200 && Number.isInteger(r.data?.unit_minor) && r.data.license.scope === 'PERSONAL_NONCOMMERCIAL' && r.data.license.exclusive === false);
    check('个人许可明确排除商业广告和二次生成', r.data?.license.excluded?.includes('COMMERCIAL_ADVERTISING') && r.data.license.excluded.includes('AI_REGENERATION'));
    observations.push({ name: 'stock_media_metadata', present: ['cover_url', 'cover_asset_id', 'duration', 'duration_seconds', 'play_count'].filter(k => k in first) });
    r = await get('/stock/catalog/' + s.paid.listing_id + '/preview');
    check('作品预览接口可取得预览文件', r.status === 200 && r.bytes.length > 0);
    check('作品预览禁止长期HTTP缓存', r.cache === 'no-store');
    observations.push({ name: 'stock_preview_fixture', value: 'Synthetic non-playable bytes; no real playback/watermark acceptance claim' });
    r = await get('/stock/catalog/' + s.pending_review.listing_id);
    check('未审核作品不能作为可售详情读取', r.status === 409);
    r = await get('/stock/catalog/' + s.unlisted.listing_id);
    check('普通下架作品从公开详情退出', r.status === 409);
    const expected = { unpaid: 'AWAITING_PAYMENT', paid: 'ACTIVE', refunded: 'REVOKED' };
    for (const [name, status] of Object.entries(expected)) {
      r = await get('/stock/purchases/' + s[name].order_id, { party: true });
      check('已购详情状态可读：' + name, r.status === 200 && r.data?.data.status === status);
    }
    r = await get('/stock/purchases/' + s.paid.order_id, { role: 'outsider', party: true });
    check('无关用户不能读他人已购许可', r.status === 404);
    for (const name of ['unpaid', 'refunded', 'dispute']) {
      r = await get('/stock/purchases/' + s[name].order_id + '/content', { party: true });
      check('下载限制正确：' + name, r.status === 409);
    }
    r = await get(query(catPath, { genre: '剧情' })); check('未定义的作品题材参数被拒绝', r.status === 400);
  }
  if (mode === 'notices') {
    const s = a.scenarios;
    r = await get('/notices/catalog/' + s.published.notice_id);
    check('通告详情有类型、城市、有效期、投稿开关', r.status === 200 && r.data?.notice.type === 'RECRUITMENT' && r.data.notice.accept_submissions === true && !!r.data.notice.valid_until);
    check('通告详情保持单向投稿，无自由聊天入口', r.data?.chat_enabled === false);
    for (const type of ['DRAMA', 'PERFORMANCE', 'COMMERCIAL', 'EVENT', 'RECRUITMENT', 'OFFICIAL']) {
      r = await get(query(catPath, { type }));
      check('六类通告筛选参数可调用：' + type, r.status === 200 && r.data?.items.every(v => v.notice.type === type));
    }
    r = await get('/notices/catalog?type=UNKNOWN'); check('未知通告类别被拒绝', r.status === 400);
    const stages = { pending_review: 'WAIT_REVIEW', sent: 'WAIT_RECIPIENT', declined: 'CLOSED', withdrawn: 'CLOSED', expired: 'EXPIRED' };
    for (const [name, next] of Object.entries(stages)) {
      r = await get('/notices/records/' + s[name].submission_id, { role: 'seller', party: true });
      check('投稿人可读真实状态：' + name, r.status === 200 && r.data?.next_action === next && r.data.chat_enabled === false);
    }
    r = await get('/notices/records/' + s.pending_review.submission_id, { party: true });
    check('收件方不能提前看到未审投稿', r.status === 404);
    r = await get('/notices/records/' + s.sent.submission_id, { role: 'outsider', party: true });
    check('无关用户不能读取投稿', r.status === 404);
    r = await get('/notices/records/' + s.interested.case_id, { party: true });
    check('感兴趣进入客服处理，不自动生成订单', r.status === 200 && r.data?.next_action === 'WAIT_SUPPORT' && r.data.order_id === null);
    r = await get('/notices/records/' + s.quoted.case_id, { party: true });
    check('关联报价仍需买家确认', r.status === 200 && r.data?.next_action === 'CONFIRM_QUOTE' && r.data.order_id === null);
  }
  if (mode === 'auditions') {
    const s = a.scenarios;
    check('公开试镜有模式、时段和报价版本', ['mode', 'slots', 'offer_sha256', 'public_price', 'unit_minor'].every(k => k in first) && first.slots.length > 0);
    check('公开试镜目录不暴露联系卡', !['contacts', 'phone'].some(k => k in first));
    for (const [name, scenario] of Object.entries(s)) {
      r = await get('/auditions/records/' + scenario.booking_id, { party: true });
      check('试镜预约状态可读：' + name, r.status === 200 && r.data?.current_status === scenario.status);
      check('预约普通详情不泄露联系卡：' + name, !Object.hasOwn(r.data?.data || {}, 'contacts'));
    }
    r = await get('/auditions/records/' + s.accepted.booking_id, { role: 'outsider', party: true });
    check('无关用户不能读取试镜预约', r.status === 403 || r.status === 404);
    for (const name of ['awaiting_acceptance', 'disputed']) {
      r = await get('/auditions/bookings/' + s[name].booking_id + '/contacts', { party: true });
      check('联系卡按订单状态限制：' + name, r.status === 409);
    }
  }
  const failed = results.filter(v => v.status === 'FAIL');
  const report = { status: failed.length ? 'FAIL' : 'PASS', mode, checked_at: new Date().toISOString(), synthetic_only: true,
    source_commit: sourceCommit,
    http: 'Real Node routes and MySQL; GET-only client; no paid providers or production traffic',
    checks: results.length, passed: results.length - failed.length, results, observations, requests,
    not_tested: ['production services', 'real identity or likeness consent', 'real payments/refunds', 'UI screenshots', 'device/IP geolocation', 'portrait/video quality'] };
  const dest = path.join(__dirname, mode + '-http.json');
  await fs.writeFile(dest, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ mode, status: report.status, checks: report.checks, failed: failed.map(v => v.name), evidence: path.relative(root, dest) }));
  if (failed.length) process.exitCode = 1;
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
