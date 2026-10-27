'use strict';
// Does not repeat the withdrawal. Verifies the saved real browser sequence and
// its captured result, then reads current consent/catalogue/asset permissions.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
async function main() {
  assert(process.env.PLAZA_ACCESS_FILE);
  const f = JSON.parse(await fs.readFile(path.resolve(root, process.env.PLAZA_ACCESS_FILE), 'utf8'));
  const u = new URL(f.base_url);
  assert(f.synthetic_only && u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.pathname === '/api/v1');
  const out = path.join(root, 'output/playwright/plaza-dense-20261026');
  const report = JSON.parse(await fs.readFile(path.join(out, 'browser-results-writes2.json'), 'utf8'));
  const name = 'artist-revocation-390', a = f.scenarios.artists.at(-1);
  const row = report.results.find(r => r.case === name);
  assert.equal(row.result, 'FAIL');
  assert(row.error.includes("name: '这份公开资料当前不可用', exact: true"), 'Only the exact semantic-heading waiter failed');
  assert.equal(report.errors.length, 0);
  assert.equal(report.blocked_requests.length, 0);
  const trace = report.requests.filter(r => r.case === name);
  const previewPath = '/api/v1/artists/catalog/' + a.listing_id + '/assets/' + a.preview_asset_id + '/content';
  const before = trace.findIndex(r => r.path === previewPath && r.status === 200);
  const withdraw = trace.findIndex(r => r.method === 'POST' && r.path.endsWith('/withdrawals') && r.status === 200);
  const after = trace.findIndex(r => r.path === previewPath && r.status === 409 && r.error_code === 'ARTIST_CONSENT_REQUIRED');
  assert(before >= 0 && withdraw > before && after > withdraw);
  const ariaName = name + '-failure.aria.txt', screenshot = name + '-failure.png';
  const aria = await fs.readFile(path.join(out, ariaName), 'utf8');
  assert(/heading "公开授权 \/ 当前核对结果 这份公开资料当前不可用"/.test(aria));
  assert(aria.includes('button "返回目录重新读取"'));
  assert(!aria.includes('读取获准预览') && !aria.includes('重新核权并保存预览'));
  const checks = [], requests = [];
  async function get(route, role, acting, expected) {
    const user = f.accounts[role];
    const response = await fetch(f.base_url + route, { redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + user.bearer_token, ...(acting ? { 'X-Acting-Party': user.party_id } : {}) } });
    const data = await response.json();
    requests.push({ source: 'fresh-real-http', method: 'GET', path: '/api/v1' + route, role, status: response.status, error_code: data.error?.code || null });
    assert.equal(response.status, expected);
    return data;
  }
  const consent = (await get('/artists/people/' + a.person_id + '/records/' + a.consent_id, a.role, true, 200)).data;
  assert.equal(consent.current_status, 'WITHDRAWN');
  const catalog = (await get('/artists/catalog?city=' + encodeURIComponent(f.scenarios.city) + '&limit=20', 'stock_buyer', false, 200)).data;
  assert.equal(catalog.items.length, 7);
  assert(!catalog.items.some(item => item.listing_id === a.listing_id));
  const asset = await get(previewPath.slice('/api/v1'.length), 'stock_buyer', false, 409);
  assert.equal(asset.error.code, 'ARTIST_CONSENT_REQUIRED');
  checks.push('Prior browser 200 → actual withdrawal 200 → browser 409 sequence',
    'Saved browser result contains the unavailable heading and return action',
    'Saved browser result no longer contains preview/save actions; screenshot reviewed',
    'Fresh reads confirm WITHDRAWN, 7 catalogue records, and denied public asset');
  const result = { status: 'PASS_REVIEWED_CAPTURE_AND_FRESH_HTTP', checked_at: new Date().toISOString(), synthetic_only: true,
    case: name, original_run: 'browser-results-writes2.json', original_automation_result: 'FAIL',
    reason: 'The original exact-name waiter excluded the eyebrow text merged into the Flutter heading. Its failure screenshot already shows the correct revoked state.',
    method: 'Saved actual browser capture and request trace reviewed, followed by fresh read-only HTTP. The withdrawal was not repeated.',
    build: report.build, screenshot, screenshot_sha256: createHash('sha256').update(await fs.readFile(path.join(out, screenshot))).digest('hex'),
    aria: ariaName, checks, original_requests: trace, current_requests: requests,
    final_catalogue_count: 7, additional_writes: 0,
    limitations: ['Proves the rendered preview/actions were removed after an actual failed permission read; does not claim byte erasure from browser/GPU memory.'] };
  const body = JSON.stringify(result, null, 2) + '\n';
  for (const account of Object.values(f.accounts)) assert(!body.includes(account.bearer_token));
  await fs.writeFile(path.join(__dirname, 'artist-revocation-verification.json'), body);
  console.log(JSON.stringify({ status: result.status, checks: checks.length, fresh_http: requests.length, catalogue_count: 7, additional_writes: 0 }));
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
