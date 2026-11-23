'use strict';
// Backend-only preparation for retained PM03 BATCH environments. No browser,
// Flutter, real payment or database status overrides. Credentials stay local.
const fs = require('node:fs/promises'), path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { protectPrivateState } = require('./test-fixtures/private-state.cjs');
const root = path.resolve(__dirname, '..');
require(path.join(root, '晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
const hash = value => createHash('sha256').update(value).digest('hex');
async function privateJson(file, value) {
  const handle = await fs.open(file, 'a', 0o600); await handle.close();
  await protectPrivateState(file);
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}
async function main() {
  const [mode, argument, requestId, assetId] = process.argv.slice(2);
  assert(['prepare', 'verify', 'privacy-download'].includes(mode), 'USAGE: prepare|verify|privacy-download ENV [REQUEST_ID ASSET_ID]');
  assert.equal(process.argv.length, mode === 'privacy-download' ? 6 : 4);
  const out = path.resolve(argument);
  assert.equal(path.dirname(out), path.join(root, '.local/stock-sandbox'));
  assert.match(path.basename(out), /^jx_test_stock_pm03_[a-f0-9]{24}$/);
  assert.equal(await fs.realpath(out), out, 'ENVIRONMENT_REDIRECTION_REFUSED');
  const access = JSON.parse(await fs.readFile(path.join(out, 'access.json'), 'utf8'));
  assert.equal(access.mode, 'BATCH'); assert.equal(access.synthetic_only, true);
  assert.match(access.base_url, /^http:\/\/127\.0\.0\.1:[0-9]+\/api\/v1$/);
  assert(Date.parse(access.expires_at) > Date.now(), 'EXPIRED_CREATE_NEW_ENVIRONMENT');
  assert.equal(JSON.parse(await fs.readFile(path.join(out, 'status.json'), 'utf8')).status, 'RUNNING');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(access.revision, revision, 'USE_THE_PINNED_BACKEND_WORKTREE');
  const stateFile = path.join(out, 'pm04-joint-private.json');
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!state) {
    assert.equal(mode, 'prepare', 'PREPARE_FIRST');
    state = { revision, source_sha256: access.source_sha256, people: {}, writes: {}, checks: [] };
  }
  assert.equal(state.revision, revision); assert.equal(state.source_sha256, access.source_sha256);
  const save = () => privateJson(stateFile, state);
  const roles = ['stock_buyer', 'stock_seller', 'stock_reviewer', 'stock_outsider', 'producer', 'reviewer'];
  async function call(method, route, role, body, { account = false, version, key, expected = 200, raw = false } = {}) {
    const actor = state.people[role];
    const response = await fetch(access.base_url + route, { method, signal: AbortSignal.timeout(15000), headers: {
      ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}),
      ...(actor && !account ? { 'X-Acting-Party': actor.party_id } : {}),
      ...(body === undefined ? {} : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'Idempotency-Key': key || randomUUID() }),
      ...(version === undefined ? {} : { 'If-Match': '"' + version + '"' }),
    }, ...(body === undefined ? {} : { body: raw ? Buffer.from(body) : JSON.stringify(body) }) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const json = (response.headers.get('content-type') || '').includes('json') ? JSON.parse(bytes.toString()) : null;
    assert([].concat(expected).includes(response.status), `${method} ${route}: ${response.status} ${json?.error?.code || ''}`);
    return { data: json?.data, bytes, status: response.status, error: json?.error?.code };
  }
  async function write(label, route, role, body, options = {}) {
    // Persist the original request before sending, including its version and key.
    // If interrupted, rerunning prepare replays exactly this request, never a new one.
    state.writes[label] ||= { route, role, body, options, key: randomUUID() };
    await save();
    const w = state.writes[label];
    if (w.result) return w.result;
    w.result = (await call('POST', w.route, w.role, w.body, { ...w.options, key: w.key })).data;
    await save(); return w.result;
  }
  async function once(label, fn) {
    if (state.checks.includes(label)) return;
    await fn(); state.checks.push(label); await save();
  }
  if (mode === 'prepare' && !state.prepared) {
    let cached;
    try { cached = JSON.parse(await fs.readFile(path.join(out, 'batch-smoke-private.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (cached) assert.equal(cached.source_sha256, access.source_sha256);
    for (const role of roles) {
      const actor = access.accounts[role]; assert(actor, 'ROLE_MISSING: ' + role);
      if (!state.people[role]) {
        const prior = cached?.people[role];
        if (prior?.token && prior.account_id === actor.account_id) state.people[role] = { ...actor, token: prior.token };
        else {
          const challenge = (await call('POST', '/auth/sms-challenges', null, { phone: actor.phone, purpose: 'LOGIN' })).data;
          const sms = JSON.parse(await fs.readFile(path.join(out, 'sms', challenge.challenge_id + '.json'), 'utf8'));
          const login = (await call('POST', '/auth/sessions', null, { phone: actor.phone, challenge_id: challenge.challenge_id, code: sms.code })).data;
          assert.equal(login.account.id, actor.account_id);
          state.people[role] = { ...actor, token: login.access_token };
        }
        await save();
      }
      assert.equal((await call('GET', '/me', role, undefined, { account: true })).data.id, actor.account_id);
    }
    await once('six real login sessions and independent reviewers', async () => {
      assert.notEqual(state.people.stock_buyer.account_id, state.people.stock_reviewer.account_id);
      assert.notEqual(state.people.producer.account_id, state.people.reviewer.account_id);
      for (const role of ['producer', 'reviewer']) assert(state.people[role].operator_actions.includes('PRIVACY_HANDLE'));
    });
    const listingId = access.scenarios.stock_unpaid.listing_id;
    const offer = (await call('GET', '/stock/catalog/' + listingId, 'stock_buyer', undefined, { account: true })).data;
    const order = await write('joint-order', '/stock/checkout', 'stock_buyer', { listing_id: listingId, offer_sha256: offer.offer_sha256, channel: 'ALIPAY' });
    state.order_id = order.id; state.listing_id = listingId; await save();
    await once('one reserved unpaid order; original checkout key returns same ID', async () => {
      const w = state.writes['joint-order'];
      assert.equal((await call('POST', w.route, w.role, w.body, { key: w.key })).data.id, order.id);
      const record = (await call('GET', '/trade/records/' + order.id, 'stock_buyer')).data;
      assert.equal(record.data.financial.received_minor, 0);
      await call('GET', '/stock/purchases/' + order.id + '/content', 'stock_buyer', undefined, { expected: [403,404,409] });
    });
    await once('buyer seller and independent reviewer read same order; foreign buyer denied', async () => {
      for (const role of ['stock_buyer','stock_seller','stock_reviewer']) {
        const value = (await call('GET', '/trade/records/' + order.id, role, undefined, { account: role === 'stock_reviewer' })).data;
        assert.equal(value.id, order.id);
      }
      await call('GET', '/stock/purchases/' + order.id, 'stock_outsider', undefined, { expected: [403,404] });
    });
    // A separate backend-prepared copy exercises the exact fixture shape needed
    // by the existing App test. The create fixture remains available for a fresh
    // App -> Web handling -> independent Web review -> App download joint run.
    let privacy = await write('privacy-create', '/privacy/requests', 'stock_buyer', {
      type: 'COPY', scopes: ['PROFILE','TRANSACTIONS'], details: 'Synthetic PM04 account and joint-order copy; other scopes remain pending.',
    }, { account: true });
    const privacyBase = '/privacy/operations/requests/' + privacy.id;
    privacy = await write('privacy-start', privacyBase + '/start', 'producer', {}, { account: true, version: privacy.object_version });
    const accountCopy = (await call('GET', privacyBase + '/account-data?section=ACCOUNT', 'producer', undefined, { account: true })).data;
    const orderCopy = (await call('GET', privacyBase + '/transaction-data?section=SUMMARY&order_id=' + order.id, 'producer', undefined, { account: true })).data;
    const bundle = { synthetic_only: true, request_id: privacy.id, copies: [
      { source: 'account:ACCOUNT', pages: [accountCopy] },
      { source: 'trade:SUMMARY', target_id: order.id, pages: [orderCopy] },
    ], remaining_actions: ['Other categories and original files require separate review.'] };
    const file = await write('privacy-upload', '/supply/assets?purpose=REVIEW_EVIDENCE&media_type=text%2Fplain', 'producer', JSON.stringify(bundle), { raw: true });
    privacy = await write('privacy-propose', privacyBase + '/response', 'producer', { result: {
      response: 'Synthetic account and joint-order summaries only', outcome: 'INFORMATION_PROVIDED', evidence_asset_ids: [file.id],
      retentions: [], remaining_actions: bundle.remaining_actions,
    } }, { account: true, version: privacy.object_version });
    await once('applicant cannot download unreviewed copy; actual reviewer reads exact file', async () => {
      await call('GET', '/privacy/requests/' + privacy.id + '/evidence/' + file.id + '/content', 'stock_buyer', undefined, { account: true, expected: [403,404,409] });
      const actual = await call('GET', privacyBase + '/evidence/' + file.id + '/content', 'reviewer', undefined, { account: true });
      assert.equal(hash(actual.bytes), file.content_sha256);
      assert.equal(JSON.parse(actual.bytes.toString()).request_id, privacy.id);
      const decision = { decision: 'APPROVED', reason: 'Synthetic independent review', proposal_sha256: privacy.proposal_sha256,
        evidence_verified: true, third_party_data_redacted: true, remaining_actions_checked: true };
      await call('POST', privacyBase + '/review', 'producer', decision, { account: true, version: privacy.object_version, expected: [403,409] });
    });
    privacy = await write('privacy-review', privacyBase + '/review', 'reviewer', {
      decision: 'APPROVED', reason: 'Synthetic independent account and original-order copy review', proposal_sha256: privacy.proposal_sha256,
      evidence_verified: true, third_party_data_redacted: true, remaining_actions_checked: true,
    }, { account: true, version: privacy.object_version });
    state.privacy = { request_id: privacy.id, asset_id: file.id, sha256: file.content_sha256, status: privacy.current_status };
    state.prepared = true; await save();
  }
  assert(state.prepared, 'PREPARATION_INCOMPLETE');
  const buyer = state.people.stock_buyer;
  const fixture = async (phase, extra = {}) => {
    const output = path.join(out, 'pm04-app-privacy-' + phase + '-result.json');
    try { await fs.access(output); } catch (e) { if (e.code !== 'ENOENT') throw e; await privateJson(output, { status: 'NOT_RUN' }); }
    await privateJson(path.join(out, 'pm04-app-privacy-' + phase + '.json'), {
      base: new URL(access.base_url).origin, token: buyer.token, account_id: buyer.account_id, phase, output, ...extra,
    });
  };
  if (mode === 'privacy-download') {
    for (const id of [requestId,assetId]) assert.match(id, /^[a-f0-9-]{36}$/i);
    const request = (await call('GET', '/privacy/requests/' + requestId, 'stock_buyer', undefined, { account: true })).data;
    assert.equal(request.id, requestId);
    const file = await call('GET', '/privacy/requests/' + requestId + '/evidence/' + assetId + '/content', 'stock_buyer', undefined, { account: true });
    assert.equal(JSON.parse(file.bytes.toString()).request_id, requestId);
    await fixture('download', { request_id: requestId, sha256: hash(file.bytes) });
    console.log(JSON.stringify({ status: 'READY', phase: 'download', request_id: requestId, frontend_tested: false })); return;
  }
  const verified = [];
  for (const role of roles) assert.equal((await call('GET', '/me', role, undefined, { account: true })).data.id, state.people[role].account_id);
  verified.push('six live sessions');
  const order = (await call('GET', '/trade/records/' + state.order_id, 'stock_buyer')).data;
  for (const role of ['stock_seller','stock_reviewer']) assert.equal((await call('GET', '/trade/records/' + state.order_id, role, undefined, { account: role === 'stock_reviewer' })).data.id, order.id);
  await call('GET', '/stock/purchases/' + order.id, 'stock_outsider', undefined, { expected: [403,404] });
  verified.push('same current order across buyer, seller, reviewer; outsider denied');
  const proof = state.privacy;
  const bytes = (await call('GET', '/privacy/requests/' + proof.request_id + '/evidence/' + proof.asset_id + '/content', 'stock_buyer', undefined, { account: true })).bytes;
  assert.equal(hash(bytes), proof.sha256); assert.equal(JSON.parse(bytes.toString()).request_id, proof.request_id);
  await call('GET', '/privacy/requests/' + proof.request_id + '/evidence/' + proof.asset_id + '/content', 'stock_outsider', undefined, { account: true, expected: [403,404] });
  verified.push('same approved private bytes; different account denied');
  await fixture('create');
  if (mode === 'prepare') await fixture('download', { request_id: proof.request_id, sha256: proof.sha256 });
  const receipt = { status: 'READY', synthetic_only: true, frontend_tested: false, revision,
    helper_sha256: hash(await fs.readFile(__filename)), source_sha256: access.source_sha256, versions: access.versions,
    expires_at: access.expires_at, checked_at: new Date().toISOString(), checks: state.checks, current_checks: verified,
    roles: Object.fromEntries(roles.map(role => [role, { account_id: state.people[role].account_id, party_id: state.people[role].party_id, operator_actions: state.people[role].operator_actions }])),
    order: { id: order.id, listing_id: state.listing_id, original_key: state.writes['joint-order'].key, object_version: order.object_version,
      current_status: order.current_status, financial: order.data.financial, contract: order.data.contract },
    privacy: proof, note: 'Main order is reserved for App/Web joint actions; backend copy only is pre-reviewed. No App, browser or physical-device acceptance.',
  };
  await fs.writeFile(path.join(out, 'pm04-joint-handoff.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'READY', checks: verified.length, order_id: order.id, frontend_tested: false, receipt: path.relative(root, path.join(out, 'pm04-joint-handoff.json')) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
