'use strict';

// Local licensing UI integration only. Real HTTP, auth, authorization, MySQL and
// content hashes; synthetic SMS and a private in-memory storage transport.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const backend = path.resolve(__dirname, '../晶晶日上工程交接包/01_源码/backend_server');
const envFile = process.env.JX_MYSQL_TEST_ENV_FILE || '/Users/yanghaoran/Code/jingjing-ux/.local/mysql/runtime/test-env.json';
const statePath = path.resolve(process.env.PR14_UI_STATE_FILE || '.local/pr14-ui-runtime.json');
const apiPort = 3242, controlPort = 3243;
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const controlToken = crypto.randomBytes(32).toString('hex');
const files = new Map(), sent = new Map();
const checks = [], licensingFixtures = [];
let mysql, db, connection, apiServer, controlServer, startupPromise, cleanupPromise;
let schemaCreated = false, phase = 'configuration', puts = 0, storageAvailable = true;

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    for (const server of [apiServer, controlServer]) {
      if (!server?.listening) continue;
      try {
        const closed = new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
        server.closeAllConnections(); await closed;
      } catch (e) { failures.push(e); }
    }
    try { if (db) await db.close(); } catch (e) { failures.push(e); }
    if (connection) {
      try { if (schemaCreated) await connection.query('DROP DATABASE ' + mysql.escapeId(schema)); }
      catch (e) { failures.push(e); }
      try { await connection.end(); } catch (e) { failures.push(e); }
    }
    files.clear(); sent.clear();
    if (!failures.length) {
      try {
        const saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
        if (saved.controlToken === controlToken) await fs.unlink(statePath);
      } catch (e) { if (e.code !== 'ENOENT') failures.push(e); }
    }
    if (failures.length) throw new AggregateError(failures, 'LOCAL_TEST_CLEANUP_FAILED');
  })();
  return cleanupPromise;
}
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
}

async function main() {
  assert(process.argv.includes('--test-only'), 'Explicit --test-only is required.');
  // Only this existing local configuration is read. Never accept production overrides.
  const env = JSON.parse(await fs.readFile(envFile, 'utf8'));
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.DB_CLIENT, 'mysql');
  assert.equal(env.MYSQL_HOST, '127.0.0.1'); assert.equal(String(env.MYSQL_PORT), '33316');
  assert.equal(env.MYSQL_USER, 'jx_local'); assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise');
  const { openDatabase } = fromBackend('./src/infrastructure/database');
  const { migrate } = fromBackend('./src/infrastructure/database/migrator');
  const { createAccountApi } = fromBackend('./src/http/account-api');
  const { maintainOperatorGrant } = fromBackend('./src/modules/governance/operator-access');
  phase = 'isolated database';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT),
    user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  schemaCreated = true;
  db = await openDatabase({ ...env, MYSQL_DATABASE: schema }); await migrate(db);

  const phones = { owner: '13900009201', otherOwner: '13900009202', reviewer: '13900009203', member: '13900009204' };
  const sms = { async call(operation, input) {
    if (operation !== 'send' || !Object.values(phones).includes(input.phone)) {
      throw Object.assign(new Error('Synthetic phones only'), { code: 'SMS_NOT_READY', status: 503 });
    }
    sent.set(input.phone, input.code);
    return { accepted: true, provider_request_id: 'synthetic-pr14-local-only' };
  }};
  const storageFactory = () => ({ async put({ key, body, isPrivate }) {
    if (!storageAvailable) throw Object.assign(new Error('Synthetic storage unavailable'), { code: 'SYNTHETIC_STORAGE_UNAVAILABLE' });
    assert.equal(isPrivate, true); assert(Buffer.isBuffer(body));
    puts++; files.set(key, Buffer.from(body));
    return { key, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
  }, async getBuffer(key) {
    if (!storageAvailable) throw Object.assign(new Error('Synthetic storage unavailable'), { code: 'SYNTHETIC_STORAGE_UNAVAILABLE' });
    const bytes = files.get(key); return bytes && Buffer.from(bytes);
  } });
  const app = createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'), sms,
    supplyStorageFactory: storageFactory, governanceEnvironment: 'SANDBOX',
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000,
      totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 },
    allowedOrigins: [5199, 5200, 5201, 5202, 8769, 8770, 8771].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]),
  });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr14-synthetic-sms-private-memory-storage'); app(req, res);
  });
  await listen(apiServer, apiPort);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  async function request(method, route, { person, party, body, key, version, status = 200 } = {}) {
    const binary = Buffer.isBuffer(body);
    const response = await fetch(apiUrl + '/api/v1' + route, { method, signal: AbortSignal.timeout(10000),
      headers: { ...(person ? { Authorization: `Bearer ${person.token}` } : {}),
        ...(party ? { 'X-Acting-Party': party } : {}),
        ...(method === 'GET' ? {} : { 'Idempotency-Key': key || crypto.randomUUID() }),
        ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
        ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }) },
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    });
    assert.equal(response.status, status, `${method} ${route}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (status === 200 && route.startsWith('/licensing/') && (response.headers.get('content-type') || '').includes('application/json')) {
      const fixture = JSON.parse(bytes.toString());
      const fixtureSchema = Array.isArray(fixture.data?.items) ? 'LicenseListResponse' : typeof fixture.data?.watermarked_text === 'string' ? 'LicenseReadingResponse' : 'LicenseRecordResponse';
      licensingFixtures.push({schema: fixtureSchema, value: fixture});
    }
    return { body: (response.headers.get('content-type') || '').includes('application/json') ? JSON.parse(bytes.toString()) : bytes,
      headers: response.headers };
  }
  const call = async (method, route, options) => (await request(method, route, options)).body.data;
  async function seed(phone) {
    const challenge = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const session = await call('POST', '/auth/sessions', { body: { phone, challenge_id: challenge.challenge_id, code: sent.get(phone) } });
    const person = { phone, accountId: session.account.id, token: session.access_token };
    const parties = await call('GET', '/me/parties', { person });
    person.personalPartyId = parties.items.find(row => row.party.kind === 'PERSON')?.party.id;
    assert(person.personalPartyId); return person;
  }
  phase = 'real synthetic SMS login and memberships';
  const people = {};
  for (const [name, phone] of Object.entries(phones)) people[name] = await seed(phone);
  const { owner, otherOwner, reviewer, member } = people;
  const organization = await call('POST', '/organizations', { person: owner, body: { display_name: '青禾作者工作室（隔离测试）' } });
  const invitation = await call('POST', `/parties/${organization.party_id}/invitations`, {
    person: owner, party: organization.party_id,
    body: { invitee_account_id: member.accountId, expires_at: new Date(Date.now() + 86400000).toISOString() },
  });
  await call('POST', `/parties/${organization.party_id}/invitations/${invitation.invitation_id}/responses`, {
    person: member, party: organization.party_id, version: invitation.object_version, body: { decision: 'ACCEPT' },
  });
  checks.push('Four real SMS logins; organization invite accepted through HTTP');
  const reviewerGrants = new Map();
  for (const action of ['SUPPLY_REVIEW_PROFILE', 'SUPPLY_REVIEW_RIGHTS', 'SUPPLY_REVIEW_CONTENT', 'LICENSE_REVIEW']) {
    await maintainOperatorGrant(db, { account_id: reviewer.accountId, action, enabled: true,
      expires_at: null, expected_version: 0, authority_ref: 'synthetic:pr14-ui', reason: '仅随机隔离库的独立审核测试账号，无正式授权' });
    reviewerGrants.set(action, { version: 1, enabled: true });
  }

  async function upload(person, party, purpose, text, key) {
    return call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, {
      person, party, body: Buffer.from(text), key,
    });
  }
  async function profile(person, party, name, proof, previous = null) {
    return call('POST', '/supply/profiles', { person, party, body: {
      display_name: name, description: '仅本地隔离页面验收；这些材料不代表真实作者身份或权利。',
      evidence_asset_ids: [proof.id], previous_profile_id: previous?.id || null,
    }});
  }
  const approveProfile = row => call('POST', `/supply/profiles/${row.id}/reviews`, {
    person: reviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '合成供给样本核对，仅用于本地测试' },
  });
  async function createWork(person, title, content, proof, previous = null) {
    return call('POST', '/supply/work-versions', { person, party: person.personalPartyId, body: {
      work_id: previous?.stream_ref || null, previous_version_id: previous?.id || null,
      title, kind: 'ORIGINAL', source_version_id: null, project_id: null,
      content_asset_id: content.id, evidence_ids: [proof.id], credits: [
        { party_id: person.personalPartyId, role: 'AUTHOR', evidence_asset_ids: [proof.id] },
        { party_id: person.personalPartyId, role: 'RIGHTS_HOLDER', evidence_asset_ids: [proof.id] },
      ],
    }});
  }
  const submit = (person, row) => call('POST', `/supply/work-versions/${row.id}/actions`, {
    person, party: person.personalPartyId, version: row.object_version, body: { action: 'SUBMIT', reason: null },
  });
  const review = (row, channel) => call('POST', `/supply/work-versions/${row.id}/reviews`, {
    person: reviewer, version: row.object_version, body: { channel, decision: 'APPROVED', reason: `合成${channel}审核，仅用于本地测试` },
  });
  phase = 'private uploads and idempotency';
  const proofKey = crypto.randomUUID(), proofBytes = '测试权利说明：仅私有合成文件，不证明真实版权。';
  const ownerProof = await upload(owner, owner.personalPartyId, 'RIGHTS_EVIDENCE', proofBytes, proofKey);
  const beforeReplay = puts;
  assert.deepEqual(await upload(owner, owner.personalPartyId, 'RIGHTS_EVIDENCE', proofBytes, proofKey), ownerProof);
  assert.equal(puts, beforeReplay);
  assert.equal(ownerProof.content_sha256, crypto.createHash('sha256').update(proofBytes).digest('hex'));
  assert.equal(ownerProof.object_key, undefined);
  const otherProof = await upload(otherOwner, otherOwner.personalPartyId, 'RIGHTS_EVIDENCE', '另一作者合成私有权利材料');
  const organizationProof = await upload(owner, organization.party_id, 'RIGHTS_EVIDENCE', '合成机构供给材料');
  const historyBytes = '《窗前来信》第一稿\n仅隔离测试，不是正式剧本。\n<b>此文本不可执行</b>';
  const historyContent = await upload(owner, owner.personalPartyId, 'WORK_CONTENT', historyBytes);
  const pendingContent = await upload(owner, owner.personalPartyId, 'WORK_CONTENT', '《窗前来信》第二稿\n仅隔离测试，等待双审。');
  const draftContent = await upload(owner, owner.personalPartyId, 'WORK_CONTENT', '未提交的私有草稿，仅OWNER可读。');
  const otherContent = await upload(otherOwner, otherOwner.personalPartyId, 'WORK_CONTENT', '另一作者的合成私有作品');
  checks.push('Actual private bytes/hash; exact upload replay performs no second put');

  phase = 'profiles and immutable work versions';
  const ownerProfile = await approveProfile(await profile(owner, owner.personalPartyId, '林小禾（测试作者）', ownerProof));
  const otherOwnerProfile = await approveProfile(await profile(otherOwner, otherOwner.personalPartyId, '顾远（测试作者）', otherProof));
  const organizationProfile = await profile(owner, organization.party_id, '青禾作者工作室（测试供给申请）', organizationProof);
  let history = await submit(owner, await createWork(owner, '窗前来信 · 第一稿（隔离测试）', historyContent, ownerProof));
  history = await review(history, 'RIGHTS');
  assert.equal(history.current_status, 'AWAITING_REVIEW');
  history = await review(history, 'CONTENT');
  assert.equal(history.current_status, 'REVIEWS_COMPLETE');
  assert.equal(history.data.version.current_status, 'SUBMITTED');
  const pending = await submit(owner, await createWork(owner, '窗前来信 · 第二稿（隔离测试）', pendingContent, ownerProof, history));
  assert.equal(pending.revision, 2); assert.deepEqual(pending.data.version.reviews, []);
  const draft = await createWork(owner, '待整理草稿（隔离测试）', draftContent, ownerProof);
  const otherPending = await submit(otherOwner, await createWork(otherOwner, '另一份来信（隔离测试）', otherContent, otherProof));
  checks.push('Two approved personal profiles; pending organization profile; approved history, fresh pending revision and private draft');

  phase = 'license products, contracts, evidence and project binding';
  const { createRuleContent } = fromBackend('./src/modules/governance/content');
  const ruleId = crypto.randomUUID();
  const rule = createRuleContent({ id: ruleId, rule_key: 'license.pr14.ui.synthetic', version: '1',
    terms: { explicit: '仅本地界面联调的合成规则，不是正式商业条件。' } });
  await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)",
    [ruleId, 'license.pr14.ui.synthetic', '1', JSON.stringify(rule), '2020-01-01 00:00:00', owner.accountId, 'EFFECTIVE']);
  const now = Date.now();
  const licenseTerms = { exclusive: false, rights: ['ADAPT','PRODUCE'], purposes: ['PRIVATE'], territories: ['CN'], languages: ['zh'],
    valid_from: new Date(now - 86400000).toISOString(), development_until: new Date(now + 365 * 86400000).toISOString(),
    valid_until: new Date(now + 730 * 86400000).toISOString(), project_limit: 2, episode_limit: 2,
    terms_text: '隔离测试条款：仅私人改稿与制作；不包括发行、商业公开分享或AI训练。金额及期限只为合成样本，不是产品默认规则。' };
  const makeProduct = (title, previous = null, price = 12345) => call('POST','/licensing/products', { person: owner, party: owner.personalPartyId, body: {
    work_version_id: history.id, previous_product_id: previous, title, preview_text: '窗前来信：多年未见的朋友，在雨后的窗前重新读到一封信。（人工核验短试读，隔离测试）',
    terms: licenseTerms, price: {currency:'CNY',amount_minor:price}, payment_due_minor:price, reservation_minutes:60, rule_id:ruleId } });
  const licenseReview = (row, verification) => call('POST',`/licensing/records/${row.id}/reviews`, { person:reviewer,
    version:row.object_version, body:{decision:'APPROVED',reason:'合成记录独立核对；仅用于随机隔离库测试，不代表真实签约收款。',...(verification ? {verification}: {})} });
  const product = await licenseReview(await makeProduct('窗前来信 · 私人改编制作许可（隔离测试）'));
  const pendingProduct = await makeProduct('窗前来信 · 新价格版本待核验（隔离测试）', product.id, 23456);
  const reservation = await call('POST','/licensing/reservations',{person:otherOwner,party:otherOwner.personalPartyId,body:{product_id:product.id}});
  const evidence = await call('POST','/licensing/evidence',{person:otherOwner,party:otherOwner.personalPartyId,body:{
    reservation_id:reservation.id,contract_sha256:reservation.data.contract.content_sha256,seller_signature_asset_id:ownerProof.id,
    buyer_signature_asset_id:otherProof.id,identity_asset_id:otherProof.id,payment_asset_id:otherProof.id,external_reference:'synthetic.pr14.test.signature-and-receipt' }});
  const approvedEvidence = await licenseReview(evidence, {signed_contract_sha256:evidence.data.contract_sha256,
    identity_verified:true,seller_signature_verified:true,buyer_signature_verified:true,currency:'CNY',received_minor:12345,
    payee_party_id:owner.personalPartyId,receipt_ref:'synthetic.pr14.receipt.'+evidence.id});
  const grant = await call('POST',`/licensing/reservations/${reservation.id}/activation`,{person:reviewer,version:reservation.object_version,
    body:{evidence_id:approvedEvidence.id,reason:'仅合成样本的外部人工核验通过，不声称自动付款或签署。'}});
  assert.equal(grant.kind,'GRANT'); assert.equal(grant.current_status,'ACTIVE');
  assert.equal(approvedEvidence.data.payment_channel_result,'NOT_REPORTED');
  const held = await call('POST','/licensing/reservations',{person:otherOwner,party:otherOwner.personalPartyId,body:{product_id:product.id}});
  const pendingEvidence = await call('POST','/licensing/evidence',{person:otherOwner,party:otherOwner.personalPartyId,body:{
    reservation_id:held.id,contract_sha256:held.data.contract.content_sha256,seller_signature_asset_id:ownerProof.id,
    buyer_signature_asset_id:otherProof.id,identity_asset_id:otherProof.id,payment_asset_id:otherProof.id,external_reference:'synthetic.pr14.pending.signature-and-receipt' }});
  const project = await call('POST','/licensing/projects',{person:otherOwner,party:otherOwner.personalPartyId,
    body:{project:{title:'窗前来信 · 私人项目（隔离测试）',purpose:'PRIVATE',territory:'CN',language:'zh',episodes:1}}});
  const binding = await call('POST',`/licensing/grants/${grant.id}/bindings`,{person:otherOwner,party:otherOwner.personalPartyId,
    version:grant.object_version,body:{project_id:project.id}});
  checks.push('Real listed/pending products, immutable held contract, manually verified external evidence, active grant and one project binding');
  phase = 'named reader approval, plaintext watermark and private license boundaries';
  const readingInput = { work_version_id:history.id, reader_account_id:otherOwner.accountId, reader_party_id:otherOwner.personalPartyId,
    valid_until:new Date(now+86400000).toISOString(),basis_type:'NDA',basis_asset_id:ownerProof.id };
  const reading = await licenseReview(await call('POST','/licensing/readings',{person:owner,party:owner.personalPartyId,body:readingInput}));
  const pendingReading = await call('POST','/licensing/readings',{person:owner,party:owner.personalPartyId,body:readingInput});
  const catalog = await call('GET','/licensing/records?kind=PRODUCT&catalog=true&limit=20',{person:otherOwner,party:otherOwner.personalPartyId});
  assert(catalog.items.some(r=>r.id===product.id)); assert(!catalog.items.some(r=>r.id===pendingProduct.id));
  assert(!JSON.stringify(catalog).includes(historyBytes));
  const read = await request('GET',`/licensing/readings/${reading.id}/content`,{person:otherOwner,party:otherOwner.personalPartyId});
  assert.equal(read.headers.get('cache-control'),'no-store'); assert.equal(read.body.data.allows_generation,false);
  assert(read.body.data.watermarked_text.includes(historyBytes)); assert(read.body.data.watermarked_text.includes(otherOwner.accountId));
  await request('GET',`/licensing/readings/${reading.id}/content`,{person:member,party:organization.party_id,status:403});
  await request('GET',`/licensing/readings/${pendingReading.id}/content`,{person:otherOwner,party:otherOwner.personalPartyId,status:403});
  const proofContent = await request('GET',`/licensing/evidence/${pendingEvidence.id}/assets/${otherProof.id}/content`,{person:reviewer});
  assert(Buffer.isBuffer(proofContent.body)); assert.equal(proofContent.headers.get('cache-control'),'no-store');
  await request('GET','/licensing/records?kind=EVIDENCE',{person:reviewer,party:reviewer.personalPartyId});
  await request('GET','/licensing/records?kind=EVIDENCE',{person:member,party:organization.party_id,status:403});
  await request('POST',`/licensing/records/${pendingProduct.id}/reviews`,{person:owner,version:pendingProduct.object_version,
    body:{decision:'APPROVED',reason:'不得自审'},status:403});
  checks.push('Catalog excludes unlisted/private body; actual watermarked plaintext uses no-store; wrong reader, MEMBER, unapproved reading and self-review denied');

  phase = 'HTTP permission and version checks';
  assert.deepEqual(await call('GET', `/supply/records/${history.id}`, { person: owner, party: owner.personalPartyId }), history);
  const queue = await call('GET', '/supply/records?kind=WORK_VERSION&limit=100', { person: reviewer });
  assert(queue.items.some(row => row.id === pending.id));
  assert(!queue.items.some(row => row.id === draft.id));
  assert.equal((await request('GET', `/supply/records/${draft.id}`, { person: reviewer, status: 404 })).body.error.code, 'SUPPLY_NOT_FOUND');
  assert.equal((await request('GET', `/supply/records/${otherPending.id}`, { person: owner, party: owner.personalPartyId, status: 404 })).body.error.code, 'SUPPLY_NOT_FOUND');
  assert.equal((await request('GET', '/supply/records?kind=PROFILE', { person: member, party: organization.party_id, status: 403 })).body.error.code, 'SUPPLY_PARTY_FORBIDDEN');
  assert.equal((await request('GET', '/supply/records?kind=PROFILE', { person: owner, status: 403 })).body.error.code, 'SUPPLY_REVIEW_FORBIDDEN');
  const missingVersion = await request('POST', `/supply/work-versions/${pending.id}/actions`, {
    person: owner, party: owner.personalPartyId, body: { action: 'WITHDRAW', reason: '只验证缺版本，不应写入' }, status: 428,
  });
  assert.equal(missingVersion.body.error.code, 'EXPECTED_VERSION_REQUIRED');
  const staleReview = await request('POST', `/supply/work-versions/${pending.id}/reviews`, {
    person: reviewer, version: 1, body: { channel: 'RIGHTS', decision: 'APPROVED', reason: '只验证旧版本，不应写入' }, status: 412,
  });
  assert.equal(staleReview.body.error.code, 'VERSION_CONFLICT');
  checks.push('Reviewer queue excludes draft; cross-owner and MEMBER reads denied; missing/stale If-Match refused without writes');

  phase = 'authenticated private downloads';
  const downloaded = await request('GET', `/supply/assets/${historyContent.id}/content`, { person: reviewer });
  assert(downloaded.body.equals(Buffer.from(historyBytes)));
  assert.equal(downloaded.headers.get('cache-control'), 'no-store');
  assert.match(downloaded.headers.get('content-disposition'), /^attachment/);
  assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  await request('GET', `/supply/assets/${draftContent.id}/content`, { person: reviewer, status: 404 });
  await request('GET', `/supply/assets/${ownerProof.id}`, { person: otherOwner, party: otherOwner.personalPartyId, status: 404 });
  await request('GET', `/supply/assets/${organizationProof.id}`, { person: member, party: organization.party_id, status: 403 });
  checks.push('Authorized binary download matches exact bytes; no-store/attachment/nosniff; draft and foreign/private material denied');

  phase = 'private local control';
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) {
      res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return;
    }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/code') {
        const phone = url.searchParams.get('phone'); assert(Object.values(phones).includes(phone));
        const code = sent.get(phone); res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return;
      }
      if (req.method === 'POST' && url.pathname === '/storage') {
        const enabled = url.searchParams.get('enabled'); assert(['true', 'false'].includes(enabled));
        storageAvailable = enabled === 'true'; res.end(JSON.stringify({ enabled: storageAvailable })); return;
      }
      if (req.method === 'POST' && url.pathname === '/reviewer-permission') {
        const action = url.searchParams.get('action'), enabled = url.searchParams.get('enabled');
        assert(reviewerGrants.has(action)); assert(['true', 'false'].includes(enabled));
        const previous = reviewerGrants.get(action), desired = enabled === 'true';
        if (previous.enabled !== desired) {
          const result = await maintainOperatorGrant(db, { account_id: reviewer.accountId, action, enabled: desired,
            expires_at: null, expected_version: previous.version, authority_ref: 'synthetic:pr14-ui-control',
            reason: '本次独立审核测试账号原授权的撤销或恢复，无任意账号提权入口' });
          reviewerGrants.set(action, { version: result.object_version, enabled: desired });
        }
        res.end(JSON.stringify({ action, enabled: desired })); return;
      }
      res.writeHead(404); res.end('{"error":"NOT_FOUND"}');
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, controlPort);
  const controlUrl = `http://127.0.0.1:${controlPort}`;
  assert.equal((await fetch(controlUrl + '/code?phone=' + owner.phone)).status, 403);
  assert.equal((await fetch(controlUrl + '/code?phone=' + owner.phone, {
    headers: { Authorization: `Bearer ${controlToken}`, Origin: 'http://127.0.0.1:5199' },
  })).status, 403);
  const control = async route => {
    const response = await fetch(controlUrl + route, { method: 'POST', headers: { Authorization: `Bearer ${controlToken}` } });
    assert.equal(response.status, 200); return response.json();
  };
  await control('/storage?enabled=false');
  assert.equal((await request('GET', `/supply/assets/${historyContent.id}/content`, { person: owner,
    party: owner.personalPartyId, status: 503 })).body.error.code, 'SERVICE_UNAVAILABLE');
  await control('/storage?enabled=true');
  await control('/reviewer-permission?action=SUPPLY_REVIEW_PROFILE&enabled=false');
  assert.equal((await request('GET', '/supply/records?kind=PROFILE', { person: reviewer,
    status: 403 })).body.error.code, 'SUPPLY_REVIEW_FORBIDDEN');
  await control('/reviewer-permission?action=SUPPLY_REVIEW_PROFILE&enabled=true');
  assert((await call('GET', '/supply/records?kind=PROFILE', { person: reviewer })).items.some(row => row.id === organizationProfile.id));
  checks.push('Private controls deny anonymous/Origin; storage failure returns real 503; scoped reviewer revocation returns real 403 and restores');

  const records = { ownerProfile, otherOwnerProfile, organizationProfile, history, pending, draft, otherPending, product, pendingProduct, reservation, evidence:approvedEvidence, grant, held, pendingEvidence, project, binding, reading, pendingReading };
  const assets = { ownerProof, otherProof, organizationProof, historyContent, pendingContent, draftContent, otherContent };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify({ testOnly: true, pid: process.pid, schema, apiUrl, controlUrl, controlToken,
    accounts: Object.fromEntries(Object.entries(people).map(([name, p]) => [name, {
      phone: p.phone, accountId: p.accountId, personalPartyId: p.personalPartyId,
    }])), organizationId: organization.party_id, ruleId,
    records: Object.fromEntries(Object.entries(records).map(([name, r]) => [name, {
      id: r.id, kind: r.kind, ownerPartyId: r.owner_party_id, streamRef: r.stream_ref,
      revision: r.revision || null, objectVersion: r.object_version, status: r.current_status,
    }])), assets: Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, {
      id: a.id, ownerPartyId: a.owner_party_id, purpose: a.purpose,
    }])), verification: { passed: checks.length, checks },
  }, null, 2), { mode: 0o600, flag: 'wx' });
  assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  await fs.writeFile(path.resolve('.local/pr14-licensing-ui-http.json'), JSON.stringify({synthetic_only:true,cases:licensingFixtures},null,2),{mode:0o600});
  console.log(`Isolated PR #14 API ready: ${apiUrl}; ${checks.length} targeted checks passed. Private state: ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  Promise.resolve(startupPromise).catch(() => {}).then(cleanup).then(() => process.exit(0), () => {
    console.error(`PR #14 cleanup failed; inspect local schema ${schema}.`); process.exit(1);
  });
});
startupPromise = main();
startupPromise.catch(async e => {
  console.error(`PR #14 test launcher failed during ${phase}: ${e.code || e.name}`);
  await cleanup().catch(() => console.error(`PR #14 cleanup failed; inspect local schema ${schema}.`));
  process.exit(1);
});
