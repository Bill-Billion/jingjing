'use strict';

// Explicit local fixture: normal SMS/HTTP/OWNER checks and isolated MySQL.
// Only SMS, private storage and the external payment transport are synthetic.
// No production provider, external payment, real subject, default business price,
// or HTTP capability-approval route is introduced by this script.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const backend = path.resolve(__dirname, '../晶晶日上工程交接包/01_源码/backend_server');
const envFile = process.env.JX_MYSQL_TEST_ENV_FILE || '/Users/yanghaoran/Code/jingjing-ux/.local/mysql/runtime/test-env.json';
const statePath = path.resolve(__dirname, '../.local/pr17-ui-runtime.json');
const apiUrl = 'http://127.0.0.1:3302', controlUrl = 'http://127.0.0.1:3303';
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const controlToken = crypto.randomBytes(32).toString('hex');
const phones = { seller: '13900009501', buyer: '13900009502', reviewer: '13900009503', mcn: '13900009504', member: '13900009505', outsider: '13900009506', ruleAuthor: '13900009507' };
const people = {}, records = {}, assets = {}, creation = {}, checks = [], capabilityHistory = [], recoveryHistory = [];
const files = new Map(), sent = new Map(), paymentQueries = new Map(), refundQueries = new Map(), grants = new Map();
let db, mysql, connection, apiServer, controlServer, startupPromise, cleanupPromise, providers, grantMaintainer;
let schemaCreated = false, stateOwned = false, phase = 'configuration', mcnOrganizationId, governanceRuleId;
let storageAvailable = true, evidenceIntact = true, responseLoss = null;
const key = () => crypto.randomUUID();
const until = new Date(Date.now() + 60 * 86400000).toISOString();
const from = new Date(Date.now() - 86400000).toISOString();
const manualChecks = { identity_verified: true, authority_verified: true, materials_reviewed: true, content_reviewed: true, marking_reviewed: true };
const commission = { platform_bps: 2000, mcn_bps: 500 }; // Explicit synthetic scenario values only.
const ruleBody = { version: 'synthetic.pr17.v1', categories: [
  { code: 'TEST', allowed: true, required_proofs: ['AUTHORITY'] },
  { code: 'BANNED_TEST', allowed: false, required_proofs: [] },
], ranking: { window_days: 7, newcomer_days: 30, minimum_orders: 1, order_weight: 10, net_minor_weight: 0, newcomer_bonus: 2 },
terms: '仅本次随机隔离库的合成规则；费用、类别与榜单阈值均不是正式商业默认值。' };
const operationPaths = {
  rule: /^\/api\/v1\/gigs\/rules$/, request: /^\/api\/v1\/gigs\/requests$/, offer: /^\/api\/v1\/gigs\/offers$/,
  review: /^\/api\/v1\/gigs\/records\/[0-9a-f-]{36}\/reviews$/, relation: /^\/api\/v1\/gigs\/relations$/,
  decision: /^\/api\/v1\/gigs\/relations\/[0-9a-f-]{36}\/decision$/,
  acceptance: /^\/api\/v1\/gigs\/offers\/[0-9a-f-]{36}\/acceptance$/,
  commission: /^\/api\/v1\/gigs\/commissions$/, ranking: /^\/api\/v1\/gigs\/rankings$/,
  retirement: /^\/api\/v1\/gigs\/rules\/[0-9a-f-]{36}\/retirement$/,
  suspension: /^\/api\/v1\/gigs\/requests\/[0-9a-f-]{36}\/suspension$/,
};

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
}
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    for (const server of [apiServer, controlServer]) {
      if (!server?.listening) continue;
      try { const closing = new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); server.closeAllConnections(); await closing; }
      catch (e) { failures.push(e); }
    }
    try { if (db) await db.close(); } catch (e) { failures.push(e); }
    if (connection) {
      try { if (schemaCreated) await connection.query('DROP DATABASE ' + mysql.escapeId(schema)); } catch (e) { failures.push(e); }
      try { await connection.end(); } catch (e) { failures.push(e); }
    }
    files.clear(); sent.clear(); paymentQueries.clear(); refundQueries.clear();
    if (!failures.length && stateOwned) {
      try { const saved = JSON.parse(await fs.readFile(statePath, 'utf8')); if (saved.controlToken === controlToken) await fs.unlink(statePath); }
      catch (e) { if (e.code !== 'ENOENT') failures.push(e); }
    }
    if (failures.length) throw new AggregateError(failures, 'LOCAL_TEST_CLEANUP_FAILED');
  })();
  return cleanupPromise;
}
function summary(r) {
  return { id: r.id, kind: r.kind, status: r.current_status, objectVersion: r.object_version,
    ownerPartyId: r.owner_party_id || null, counterpartyId: r.counterparty_id || null,
    buyerPartyId: r.buyer_party_id || null, merchantPartyId: r.merchant_party_id || null,
    parentId: r.parent_id || null, orderId: r.order_id || null };
}
async function snapshot() {
  const [gig] = await db.execute('SELECT id,kind,current_status,object_version,owner_party_id,counterparty_id,parent_id FROM gig_records ORDER BY id');
  const [trade] = await db.execute('SELECT id,kind,current_status,object_version,buyer_party_id,merchant_party_id,parent_id,order_id FROM trade_records ORDER BY id');
  const [supply] = await db.execute('SELECT id,kind,current_status,object_version,owner_party_id FROM supply_records ORDER BY id');
  const all = new Map([...gig, ...trade, ...supply].map(r => [r.id, r]));
  const [[capability]] = await db.execute("SELECT code,current_status,object_version FROM party_capabilities WHERE party_id=? AND code='MCN'", [mcnOrganizationId]);
  const [[membership]] = await db.execute('SELECT current_status,object_version FROM party_memberships WHERE party_id=? AND account_id=?', [mcnOrganizationId, people.mcn.accountId]);
  return { testOnly: true, syntheticOnly: true, pid: process.pid, schema, apiUrl, controlUrl,
    accounts: Object.fromEntries(Object.entries(people).map(([name, p]) => [name, { phone: p.phone, accountId: p.accountId,
      personalPartyId: p.personalPartyId, actingPartyId: p.actingPartyId }])), mcnOrganizationId, governanceRuleId,
    records: Object.fromEntries(Object.entries(records).map(([name, r]) => [name, summary(all.get(r.id) || r)])),
    assets: Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, { id: a.id, ownerPartyId: a.owner_party_id,
      purpose: a.purpose, byteSize: a.byte_size, contentSha256: a.content_sha256 }])), creation,
    allRecords: [...all.values()].map(summary),
    capabilityMaintenance: { partyId: mcnOrganizationId, code: 'MCN', source: 'TRUSTED_LOCAL_FIXTURE_ONLY_AFTER_REAL_HTTP_PENDING_REQUEST',
      status: capability.current_status, objectVersion: capability.object_version, history: capabilityHistory },
    controls: { storageAvailable, evidenceIntact, responseLoss: responseLoss && { operation: responseLoss.operation, mode: '503' },
      mcnOwnerMembership: { status: membership.current_status, objectVersion: membership.object_version },
      reviewerGrants: Object.fromEntries([...grants].filter(([name]) => name.startsWith('reviewer:')).map(([name, g]) => [name.split(':')[1], g.enabled])),
      paymentQueries: Object.fromEntries(paymentQueries), refundQueries: Object.fromEntries(refundQueries) },
    recovery: recoveryHistory,
    verification: { passed: checks.length, checks },
    limitations: ['合成机构、本人同意、材料、金额与分账比例只用于本次隔离测试，不是正式商业默认值。',
      'MCN 先经真实接口申请为 PENDING_REVIEW，再由可信夹具维护独立隔离库这一行；没有提供页面自批权限。',
      '支付宝 RSA2 临时合成密钥与本机注入传输，付款事实为 SANDBOX；没有真实资金或供应商网关调用。',
      '没有改付款为 PRODUCTION，也没有回填账单日期；真实榜单必须显示 INSUFFICIENT_DATA。',
      '所有私有证据为明确标记的合成文本实际字节，不是合法授权或真人材料。'] };
}
async function saveState() {
  const state = { ...(await snapshot()), controlToken };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600, flag: stateOwned ? 'w' : 'wx' });
  stateOwned = true; await fs.chmod(statePath, 0o600);
}
async function request(method, route, { person, party, body, operationKey, version, status = 200, headers = {} } = {}) {
  const binary = Buffer.isBuffer(body);
  const response = await fetch(apiUrl + '/api/v1' + route, { method, signal: AbortSignal.timeout(15000),
    headers: { ...(person ? { Authorization: `Bearer ${person.token}` } : {}), ...(party ? { 'X-Acting-Party': party } : {}),
      ...(method === 'GET' || method === 'OPTIONS' ? {} : { 'Idempotency-Key': operationKey || key() }),
      ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
      ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }), ...headers },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const result = (response.headers.get('content-type') || '').includes('application/json') && bytes.length ? JSON.parse(bytes.toString()) : bytes;
  assert((Array.isArray(status) ? status : [status]).includes(response.status), `${method} ${route}: ${response.status} (${result?.error?.code || 'non-JSON'})`);
  return { body: result, headers: response.headers, status: response.status };
}
const call = async (method, route, options) => (await request(method, route, options)).body.data;
async function grant(name, action, enabled) {
  const mapKey = `${name}:${action}`, previous = grants.get(mapKey);
  if (previous?.enabled === enabled) return previous;
  const row = await grantMaintainer(db, { account_id: people[name].accountId, action, enabled, expires_at: null,
    expected_version: previous?.object_version || 0, authority_ref: 'synthetic:pr17-ui-fixture', reason: '仅本次随机隔离库的合成权限测试，不是正式授权' });
  grants.set(mapKey, row); return row;
}
async function maintainCapability(enabled) {
  const next = enabled ? 'ACTIVE' : 'SUSPENDED';
  const changed = await db.withTransaction(async tx => {
    const [[r]] = await tx.execute("SELECT * FROM party_capabilities WHERE party_id=? AND code='MCN' FOR UPDATE", [mcnOrganizationId]);
    assert(r && ['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED'].includes(r.current_status));
    if (r.current_status === next) return null;
    const [updated] = await tx.execute("UPDATE party_capabilities SET current_status=?,object_version=object_version+1 WHERE party_id=? AND code='MCN' AND object_version=?", [next, mcnOrganizationId, r.object_version]);
    assert.equal(updated.affectedRows, 1);
    await tx.execute('INSERT INTO party_audit_events(id,party_id,actor_account_id,event_code,object_id,object_version,request_id) VALUES (?,?,?,?,?,?,?)',
      [key(), mcnOrganizationId, people.reviewer.accountId, 'FIXTURE_MCN_CAPABILITY_MAINTAINED', 'MCN', r.object_version + 1, 'synthetic:pr17-fixture:' + key()]);
    return { from: r.current_status, to: next, objectVersion: r.object_version + 1, source: 'TRUSTED_LOCAL_FIXTURE_ONLY' };
  });
  if (changed) capabilityHistory.push(changed);
}
async function maintainMcnOwner(enabled) {
  await db.withTransaction(async tx => {
    const [[r]] = await tx.execute('SELECT * FROM party_memberships WHERE party_id=? AND account_id=? FOR UPDATE', [mcnOrganizationId, people.mcn.accountId]);
    assert(r && r.role_code === 'OWNER'); const next = enabled ? 'ACTIVE' : 'REVOKED';
    if (r.current_status === next) return;
    const [updated] = await tx.execute('UPDATE party_memberships SET current_status=?,object_version=object_version+1 WHERE id=? AND object_version=?', [next, r.id, r.object_version]);
    assert.equal(updated.affectedRows, 1);
    await tx.execute('INSERT INTO party_audit_events(id,party_id,actor_account_id,event_code,object_id,object_version,request_id) VALUES (?,?,?,?,?,?,?)',
      [key(), mcnOrganizationId, people.reviewer.accountId, 'FIXTURE_MEMBERSHIP_MAINTAINED', r.id, r.object_version + 1, 'synthetic:pr17-fixture:' + key()]);
  });
}

async function main() {
  assert(process.argv.includes('--test-only'), 'Explicit --test-only is required.');
  const env = JSON.parse(await fs.readFile(envFile, 'utf8'));
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.DB_CLIENT, 'mysql'); assert.equal(env.MYSQL_HOST, '127.0.0.1');
  assert.equal(String(env.MYSQL_PORT), '33316'); assert.equal(env.MYSQL_USER, 'jx_local'); assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  try { await fs.access(statePath); throw Object.assign(new Error('PR17 private state exists'), { code: 'PR17_STATE_EXISTS' }); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise');
  const { openDatabase } = fromBackend('./src/infrastructure/database');
  const { migrate } = fromBackend('./src/infrastructure/database/migrator');
  const { createAccountApi } = fromBackend('./src/http/account-api');
  const { createTradeProviders } = fromBackend('./src/modules/trade/providers');
  const { createReadinessRepository } = fromBackend('./src/modules/providers/readiness');
  grantMaintainer = fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant;
  fromBackend.resolve('@apple/app-store-server-library');
  const { AlipaySdk } = fromBackend('alipay-sdk');
  phase = 'isolated database';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); schemaCreated = true;
  db = await openDatabase({ ...env, MYSQL_DATABASE: schema }); await migrate(db);
  const sms = { async call(operation, input) {
    if (operation !== 'send' || !Object.values(phones).includes(input.phone)) throw Object.assign(new Error('Synthetic phones only'), { code: 'SMS_NOT_READY', status: 503 });
    sent.set(input.phone, input.code); return { accepted: true, provider_request_id: 'synthetic-pr17-local-only' };
  } };
  const storageFactory = () => ({ async put({ key: objectKey, body, isPrivate }) {
    if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); assert.equal(isPrivate, true); assert(Buffer.isBuffer(body));
    files.set(objectKey, Buffer.from(body)); return { key: objectKey, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
  }, async getBuffer(objectKey) {
    if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); const bytes = files.get(objectKey);
    return bytes && (evidenceIntact ? Buffer.from(bytes) : Buffer.concat([bytes, Buffer.from('synthetic integrity failure')]));
  } });
  const allowedOrigins = [5203, 5204, 5205, 5206, 8772, 8773, 8774, 8775, 8776].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  const app = createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'), sms, supplyEnv: { NODE_ENV: 'test' },
    supplyStorageFactory: storageFactory, governanceEnvironment: 'SANDBOX',
    tradeProvidersFactory: () => ({ get(code) { assert(providers, 'Fixture transport not initialized'); return providers.get(code); } }), allowedOrigins,
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 } });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr17-synthetic-sms-private-storage-sandbox-payment-transport');
    const end = res.end;
    res.end = function (...args) {
      const pending = responseLoss;
      const originalRoute = req.originalUrl || req.url;
      if (req.method === 'POST' && pending && res.statusCode === 200 && operationPaths[pending.operation].test(originalRoute.split('?')[0])) {
        responseLoss = null; res.end = end;
        recoveryHistory.push({ operation: pending.operation, route: originalRoute, operationKey: req.headers['idempotency-key'], committed: true, responseLost: true });
        res.statusCode = 503; res.removeHeader('Content-Length'); res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        return end.call(res, JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Synthetic committed response loss; recover original operation key.' } }));
      }
      return end.apply(res, args);
    };
    app(req, res);
  });
  await listen(apiServer, 3302);
  phase = 'normal SMS accounts and MCN organization';
  for (const [name, phone] of Object.entries(phones)) {
    const challenge = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const session = await call('POST', '/auth/sessions', { body: { phone, challenge_id: challenge.challenge_id, code: sent.get(phone) } });
    const p = { phone, accountId: session.account.id, token: session.access_token };
    const parties = await call('GET', '/me/parties', { person: p }); p.personalPartyId = parties.items.find(r => r.party.kind === 'PERSON')?.party.id;
    assert(p.personalPartyId); p.actingPartyId = p.personalPartyId; people[name] = p;
  }
  const { seller, buyer, reviewer, mcn, member, outsider, ruleAuthor } = people;
  const organization = await call('POST', '/organizations', { person: mcn, body: { display_name: '青岚直签 MCN（合成隔离测试）' } });
  mcnOrganizationId = organization.party_id; mcn.actingPartyId = member.actingPartyId = mcnOrganizationId;
  const invitation = await call('POST', `/parties/${mcnOrganizationId}/invitations`, { person: mcn, party: mcnOrganizationId,
    body: { invitee_account_id: member.accountId, expires_at: new Date(Date.now() + 86400000).toISOString() } });
  await call('POST', `/parties/${mcnOrganizationId}/invitations/${invitation.invitation_id}/responses`, { person: member, party: mcnOrganizationId,
    version: invitation.object_version, body: { decision: 'ACCEPT' } });
  for (const action of ['GIG_REVIEW', 'TRADE_REVIEW', 'TRADE_REFUND', 'SUPPLY_REVIEW_CONSENT']) await grant('reviewer', action, true);
  await grant('ruleAuthor', 'GIG_REVIEW', true);
  const requested = await call('POST', `/parties/${mcnOrganizationId}/capabilities`, { person: mcn, party: mcnOrganizationId, body: { code: 'MCN' } });
  assert.equal(requested.current_status, 'PENDING_REVIEW'); await maintainCapability(true);
  checks.push('Seven real synthetic SMS/account logins; organization OWNER and accepted MEMBER; actual HTTP MCN PENDING_REVIEW followed by audited fixture-only ACTIVE maintenance');

  phase = 'sandbox signed payment transport';
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tradeEnv = { NODE_ENV: 'test', TRADE_ALIPAY_ENABLED: 'true', TRADE_ALIPAY_APP_ID: 'synthetic.pr17.app',
    TRADE_ALIPAY_MERCHANT_ID: 'synthetic.pr17.merchant', TRADE_ALIPAY_MERCHANT_PARTY_ID: seller.personalPartyId,
    TRADE_ALIPAY_PRIVATE_KEY: rsa.privateKey, TRADE_ALIPAY_PUBLIC_KEY: rsa.publicKey,
    TRADE_ALIPAY_NOTIFY_URL: 'https://example.invalid/pr17-never-called', TRADE_ALIPAY_CONFIG_REVISION: 'pr17-local-synthetic', TRADE_APPLE_ENABLED: 'false' };
  const alipay = new AlipaySdk({ appId: tradeEnv.TRADE_ALIPAY_APP_ID, privateKey: rsa.privateKey, alipayPublicKey: rsa.publicKey, keyType: 'PKCS8', signType: 'RSA2', gateway: 'https://example.invalid/never-called' });
  const yuan = n => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  const syntheticProof = body => { const canonical = Object.keys(body).sort().map(k => `${k}=${body[k]}`).join('&');
    const signature = crypto.sign('RSA-SHA256', Buffer.from(canonical), rsa.privateKey); assert(crypto.verify('RSA-SHA256', Buffer.from(canonical), rsa.publicKey, signature)); return body; };
  const tradeData = async id => { const [[row]] = await db.execute('SELECT * FROM trade_records WHERE id=?', [id]); assert(row); return { ...row, data: typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json }; };
  alipay.exec = async (method, input, options) => {
    assert.equal(options.validateSign, true); const biz = input.bizContent, p = await tradeData(biz.outTradeNo); assert.equal(p.kind, 'PAYMENT');
    if (method === 'alipay.trade.query') {
      const result = paymentQueries.get(p.id) || 'PENDING'; if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
      return syntheticProof({ code: '10000', outTradeNo: p.id, tradeNo: result === 'SUCCEEDED' ? `synthetic.pr17.${p.id}` : undefined,
        tradeStatus: result === 'SUCCEEDED' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY', totalAmount: yuan(p.data.amount_minor) });
    }
    const r = await tradeData(biz.outRequestNo); assert.equal(r.kind, 'REFUND'); assert.equal(r.data.payment_id, p.id); assert.equal(r.data.transaction_id, biz.tradeNo);
    if (method === 'alipay.trade.refund') return syntheticProof({ code: '10000', outTradeNo: p.id, tradeNo: r.data.transaction_id });
    assert.equal(method, 'alipay.trade.fastpay.refund.query'); const result = refundQueries.get(r.id) || 'PENDING'; if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    return syntheticProof({ code: '10000', outTradeNo: p.id, tradeNo: r.data.transaction_id, outRequestNo: r.id,
      refundAmount: yuan(r.data.amount_minor), refundStatus: result === 'SUCCEEDED' ? 'REFUND_SUCCESS' : 'REFUND_PROCESSING' });
  };
  providers = createTradeProviders(db, tradeEnv, { alipay });
  const readiness = createReadinessRepository(db, { authorizeChange: async actor => actor === 'synthetic.pr17.fixture', verifyEvidence: async i => i.evidence_ref === 'synthetic.pr17.signed-local-transport' });
  await readiness.record({ provider_kind: 'PaymentProvider', provider_code: 'alipay', capability_code: 'order_payment', environment: 'SANDBOX', current_status: 'SANDBOX_VERIFIED',
    config_revision: providers.configuration('ALIPAY').config_revision, expected_version: 0, evidence_ref: 'synthetic.pr17.signed-local-transport', reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr17.fixture' });
  checks.push('Actual SANDBOX provider readiness; real temporary RSA2 checkout signing; existing provider transport injection verifies local synthetic proof and never calls a gateway');

  phase = 'private supply evidence, recorded avatar and actual person commercial consent';
  async function upload(name, p, purpose) {
    const bytes = Buffer.from(`PR17 隔离测试合成文本：${name}；不是真人材料、不构成正式授权。\n${key()}\n`, 'utf8');
    const asset = await call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, { person: p, party: p.actingPartyId, body: bytes });
    assert.equal(asset.byte_size, bytes.length); assert.equal(asset.content_sha256, crypto.createHash('sha256').update(bytes).digest('hex')); assets[name] = asset; return asset;
  }
  await upload('sellerEvidence', seller, 'RIGHTS_EVIDENCE'); await upload('buyerEvidence', buyer, 'RIGHTS_EVIDENCE'); await upload('mcnEvidence', mcn, 'RIGHTS_EVIDENCE');
  await upload('avatarMaterial', seller, 'AVATAR_MATERIAL'); await upload('consentEvidence', seller, 'CONSENT_EVIDENCE');
  records.avatar = await call('POST', '/supply/avatars', { person: seller, party: seller.personalPartyId, body: { display_name: '合成商用形象（未调用头像供应商）', material_asset_ids: [assets.avatarMaterial.id] } });
  async function consent(purposes) {
    let r = await call('POST', '/supply/consents', { person: seller, party: seller.personalPartyId, body: { consent: {
      avatar_id: records.avatar.id, subject_party_id: seller.personalPartyId, features: ['FACE', 'VOICE'], purposes, territories: ['CN'],
      valid_from: from, valid_until: new Date(Date.now() + 90 * 86400000).toISOString(), terms: '本人合成 FACE/VOICE 同意，仅隔离测试材料，不是法律授权。', evidence_asset_ids: [assets.consentEvidence.id] } } });
    return call('POST', `/supply/consents/${r.id}/reviews`, { person: reviewer, version: r.object_version, body: { decision: 'APPROVED', reason: '独立审核合成本人同意与证据，非正式授权' } });
  }
  for (const name of ['webConsent', 'appConsent', 'ledgerConsent', 'withdrawnConsent']) records[name] = await consent(['COMMERCIAL']);
  records.privateConsent = await consent(['PRIVATE']);
  checks.push('Private actual bytes with byte size/hash; recorded avatar; separate Web/App/ledger PERSON FACE+VOICE COMMERCIAL consents and PRIVATE-only consent through normal API and independent review');

  const { createRuleContent } = fromBackend('./src/modules/governance/content');
  governanceRuleId = key(); const governance = createRuleContent({ id: governanceRuleId, rule_key: 'gigs.pr17.synthetic', version: '1', terms: { synthetic: '仅隔离测试规则；不是商业默认条件' } });
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',
    [governanceRuleId, 'gigs.pr17.synthetic', '1', JSON.stringify(governance), '2020-01-01 00:00:00', ruleAuthor.accountId, 'EFFECTIVE']);
  const reviewTrade = r => call('POST', `/trade/records/${r.id}/reviews`, { person: reviewer, version: r.object_version, body: { decision: 'APPROVED', reason: '独立审核本次合成商业材料' } });
  records.publishedSpec = await reviewTrade(await call('POST', '/trade/specifications', { person: seller, party: seller.personalPartyId, body: {
    previous_spec_id: null, title: '商用合成材料规格（隔离测试）', provider_party_id: seller.personalPartyId, line_kind: 'OTHER', unit_minor: 10001, currency: 'CNY',
    specification: { version: 'synthetic.v1', service_tier: '合成测试', sample_seconds: 0, final_seconds: 0, revision_limit: 1, deliverables: ['明确标记的合成商用文本'], terms: '金额 10001 分仅为舍入测试，不是商业默认价格。' } } }));
  const gigsReview = (r, p = reviewer, options = {}) => call('POST', `/gigs/records/${r.id}/reviews`, { person: p, version: r.object_version,
    body: { decision: 'APPROVED', reason: '独立逐项核对合成身份、授权、材料、内容与标识，仅隔离测试', checks: r.kind === 'RULE' ? null : manualChecks }, ...options });
  const makeRule = label => call('POST', '/gigs/rules', { person: ruleAuthor, body: { rule: { ...ruleBody, terms: `${label}；${ruleBody.terms}` } } });
  phase = 'independent rules and directly accepted MCN relations';
  records.webRulePending = await makeRule('网页待审核规则'); records.appRulePending = await makeRule('App 待审核规则');
  await request('POST', `/gigs/records/${records.webRulePending.id}/reviews`, { person: ruleAuthor, version: 1, body: { decision: 'APPROVED', reason: '禁止自己审核', checks: null }, status: 403 });
  for (const side of ['web', 'app', 'ledger']) records[`${side}Rule`] = await gigsReview(await makeRule(`${side} 已生效独立规则`));
  records.retiredRule = await gigsReview(await makeRule('历史已退役规则'));
  records.retiredRule = await call('POST', `/gigs/rules/${records.retiredRule.id}/retirement`, { person: reviewer, version: records.retiredRule.object_version, body: { reason: '合成规则退役示例，历史事实保留' } });
  const relationBody = (artist = seller.personalPartyId, exclusive = false) => ({ artist_party_id: artist, scope: 'COMMERCIAL', valid_from: from, valid_until: until,
    exclusive, terms: '合成直签商业关系，MCN 分成从平台费用中计提；非商业默认', commission, evidence_asset_ids: [assets.mcnEvidence.id] });
  const makeRelation = (artist, exclusive) => call('POST', '/gigs/relations', { person: mcn, party: mcnOrganizationId, body: relationBody(artist, exclusive) });
  const decide = (r, decision, p = seller) => call('POST', `/gigs/relations/${r.id}/decision`, { person: p, party: p.actingPartyId, version: r.object_version, body: { decision, reason: `合成直签关系 ${decision}，仅隔离测试` } });
  records.webRelationInvited = await makeRelation(); records.appRelationInvited = await makeRelation();
  await request('POST', `/gigs/relations/${records.webRelationInvited.id}/decision`, { person: mcn, party: mcnOrganizationId, version: 1, body: { decision: 'ACCEPT', reason: 'MCN不能代艺人接受' }, status: 409 });
  for (const side of ['web', 'app', 'ledger']) records[`${side}Relation`] = await decide(await makeRelation(), 'ACCEPT');
  records.endedRelation = await decide(await decide(await makeRelation(), 'ACCEPT'), 'END');
  records.exclusiveRelation = await decide(await makeRelation(outsider.personalPartyId, true), 'ACCEPT', outsider);
  records.exclusiveConflictInvitation = await makeRelation(outsider.personalPartyId, true);
  await request('POST', `/gigs/relations/${records.exclusiveConflictInvitation.id}/decision`, { person: outsider, party: outsider.personalPartyId, version: 1, body: { decision: 'ACCEPT', reason: '合成独家冲突' }, status: 409 });
  checks.push('Independent rule author cannot self-review; separate effective Web/App/ledger rules and retired history; MCN cannot accept for artist; real artist decisions, ended relation and overlapping exclusive rejection');

  phase = 'actual proof checks, commercial requests and reviewed offers';
  const requestBody = (title, ruleId) => ({ title, brief: '合成商用培育任务：身份、授权、材料、内容与标识需分别人工核对。', category: 'TEST',
    scope: { purpose: 'COMMERCIAL', territory: 'CN', valid_until: new Date(Date.now() + 30 * 86400000).toISOString() }, rule_id: ruleId, proofs: [{ code: 'AUTHORITY', asset_id: assets.buyerEvidence.id }] });
  const makeGig = (label, ruleId) => call('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: requestBody(label, ruleId) });
  await request('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: { ...requestBody('缺证据拒绝', records.webRule.id), proofs: [] }, status: 409 });
  await request('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: { ...requestBody('禁止类别拒绝', records.webRule.id), category: 'BANNED_TEST' }, status: 409 });
  await request('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: requestBody('退役规则拒绝', records.retiredRule.id), status: 409 });
  for (const side of ['web', 'app']) {
    records[`${side}GigPending`] = await makeGig(`${side} 待审核培育任务（合成）`, records[`${side}Rule`].id);
    records[`${side}GigPublished`] = await gigsReview(await makeGig(`${side} 已发布培育任务（合成）`, records[`${side}Rule`].id));
  }
  records.ledgerGig = await gigsReview(await makeGig('历史账单任务（沙箱合成）', records.ledgerRule.id));
  const offerBody = (gig, rel, consentRow, ranking = true) => ({ gig_id: gig.id, spec_id: records.publishedSpec.id, avatar_id: records.avatar.id,
    consent_id: consentRow.id, relation_id: rel?.id || null, commission: rel ? commission : { platform_bps: 2000, mcn_bps: 0 },
    terms: '本次合成报价承诺：计提不是到账；是否入榜需本人明确选择；金额和比例不是默认值。', ranking_opt_in: ranking, evidence_asset_ids: [assets.sellerEvidence.id] });
  const makeOffer = (gig, rel, consentRow, ranking) => call('POST', '/gigs/offers', { person: seller, party: seller.personalPartyId, body: offerBody(gig, rel, consentRow, ranking) });
  await request('POST', '/gigs/offers', { person: seller, party: seller.personalPartyId, body: offerBody(records.webGigPublished, records.webRelation, records.privateConsent), status: 409 });
  await request('POST', '/gigs/offers', { person: seller, party: seller.personalPartyId, body: { ...offerBody(records.webGigPublished, null, records.webConsent), commission }, status: 400 });
  await request('POST', '/gigs/offers', { person: seller, party: seller.personalPartyId, body: offerBody(records.webGigPending, records.webRelation, records.webConsent), status: 409 });
  for (const side of ['web', 'app']) {
    records[`${side}OfferPending`] = await makeOffer(records[`${side}GigPublished`], records[`${side}Relation`], records[`${side}Consent`]);
    records[`${side}OfferApproved`] = await gigsReview(await makeOffer(records[`${side}GigPublished`], records[`${side}Relation`], records[`${side}Consent`]));
  }
  await grant('seller', 'GIG_REVIEW', true); await grant('mcn', 'GIG_REVIEW', true);
  for (const p of [seller, mcn]) await request('POST', `/gigs/records/${records.webOfferPending.id}/reviews`, { person: p, version: 1,
    body: { decision: 'APPROVED', reason: '利益相关方禁止自审', checks: manualChecks }, status: 403 });
  await grant('seller', 'GIG_REVIEW', false); await grant('mcn', 'GIG_REVIEW', false);
  const acceptOffer = r => call('POST', `/gigs/offers/${r.id}/acceptance`, { person: buyer, party: buyer.personalPartyId, version: r.object_version, body: { offer_sha256: r.content_sha256 } });
  for (const side of ['web', 'app']) records[`${side}OfferAccepted`] = await acceptOffer(await gigsReview(await makeOffer(records[`${side}GigPublished`], records[`${side}Relation`], records[`${side}Consent`])));
  records.directOfferApproved = await gigsReview(await makeOffer(records.appGigPublished, null, records.appConsent, false));
  records.ledgerOffer = await acceptOffer(await gigsReview(await makeOffer(records.ledgerGig, records.ledgerRelation, records.ledgerConsent)));
  const race = await gigsReview(await makeOffer(records.ledgerGig, null, records.ledgerConsent, false));
  const acceptance = { person: buyer, party: buyer.personalPartyId, version: race.object_version, body: { offer_sha256: race.content_sha256 }, status: [200, 412] };
  const raceReplies = await Promise.all([request('POST', `/gigs/offers/${race.id}/acceptance`, acceptance), request('POST', `/gigs/offers/${race.id}/acceptance`, acceptance)]);
  assert.deepEqual(raceReplies.map(r => r.status).sort(), [200, 412]); records.acceptanceRace = raceReplies.find(r => r.status === 200).body.data;
  // Leave a different exact reviewed version untouched for the browser's second-session race.
  records.acceptanceRaceReady = await gigsReview(await makeOffer(records.ledgerGig, null, records.ledgerConsent, false));
  assert.equal(records.acceptanceRaceReady.current_status, 'APPROVED');
  assert.equal(records.acceptanceRaceReady.object_version, 2);
  checks.push('Required proof, forbidden category, retired rule, pending gig, PRIVATE-only consent and relation-less MCN fee rejected; independent five-check review; exact offer acceptance; concurrent version race returns 200/412');

  phase = 'real commercial quote, sandbox receipt and partial refund commission';
  const quoteBody = o => ({ buyer_party_id: buyer.personalPartyId, lines: [{ line_id: 'commercial', spec_id: records.publishedSpec.id, quantity: 1 }],
    installments: [{ key: 'full', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'commercial', amount_minor: 10001 }], apple_product_id: null }],
    channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: governanceRuleId, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    payment_window_minutes: 10080, license_reservation_id: null, commercial_offer_id: o.id });
  const makeQuote = o => call('POST', '/trade/quotes', { person: seller, party: seller.personalPartyId, body: quoteBody(o) }).then(reviewTrade);
  const acceptQuote = q => call('POST', `/trade/quotes/${q.id}/acceptance`, { person: buyer, party: buyer.personalPartyId, version: q.object_version, body: { quote_sha256: q.content_sha256 } });
  for (const side of ['web', 'app', 'ledger']) {
    records[`${side}Quote`] = await makeQuote(records[`${side}OfferAccepted`] || records.ledgerOffer);
    records[`${side}Order`] = await acceptQuote(records[`${side}Quote`]);
    assert.equal(records[`${side}Order`].data.quote.commercial.offer_id, (records[`${side}OfferAccepted`] || records.ledgerOffer).id);
  }
  const duplicateQuote = await makeQuote(records.ledgerOffer);
  await request('POST', `/trade/quotes/${duplicateQuote.id}/acceptance`, { person: buyer, party: buyer.personalPartyId, version: duplicateQuote.object_version, body: { quote_sha256: duplicateQuote.content_sha256 }, status: 409 });
  const calculate = (order, p = mcn, operationKey) => call('POST', '/gigs/commissions', { person: p, party: p.actingPartyId, body: { order_id: order.id }, operationKey });
  records.webCommission = await calculate(records.webOrder); records.appCommission = await calculate(records.appOrder);
  records.ledgerCommission = await calculate(records.ledgerOrder); assert.equal(records.ledgerCommission.data.amounts.net_minor, 0);
  records.ledgerPayment = await call('POST', '/trade/payments', { person: buyer, party: buyer.personalPartyId, body: { order_id: records.ledgerOrder.id, installment_key: 'full' } });
  assert.match(records.ledgerPayment.data.checkout.order_string, /sign=/); assert.equal(records.ledgerPayment.data.environment, 'SANDBOX'); paymentQueries.set(records.ledgerPayment.id, 'SUCCEEDED');
  records.ledgerPayment = await call('POST', `/trade/payments/${records.ledgerPayment.id}/reconciliation`, { person: buyer, party: buyer.personalPartyId, body: { transaction_id: null } });
  records.ledgerCommission = await calculate(records.ledgerOrder);
  assert.deepEqual(records.ledgerCommission.data.amounts, { net_minor: 10001, supplier_minor: 8001, platform_minor: 1500, mcn_minor: 500 }); assert.equal(records.ledgerCommission.data.paid_out_minor, 0);
  records.ledgerRefund = await call('POST', '/trade/refunds', { person: buyer, party: buyer.personalPartyId, body: { payment_id: records.ledgerPayment.id, allocations: [{ line_id: 'commercial', amount_minor: 5000 }], reason: '合成部分退款，不发生资金转移' } });
  records.ledgerRefund = await reviewTrade(records.ledgerRefund);
  records.ledgerRefund = await call('POST', `/trade/refunds/${records.ledgerRefund.id}/execution`, { person: reviewer, body: {} }); refundQueries.set(records.ledgerRefund.id, 'SUCCEEDED');
  records.ledgerRefund = await call('POST', `/trade/refunds/${records.ledgerRefund.id}/reconciliation`, { person: buyer, party: buyer.personalPartyId, body: {} });
  records.ledgerCommission = await calculate(records.ledgerOrder);
  assert.deepEqual(records.ledgerCommission.data.amounts, { net_minor: 5001, supplier_minor: 4001, platform_minor: 750, mcn_minor: 250 });
  const entries = await call('GET', `/gigs/commissions/${records.ledgerCommission.id}/entries`, { person: mcn, party: mcnOrganizationId });
  assert.equal(entries.items.length, 3); assert.equal(entries.items.at(-1).data.delta.mcn_minor, -250);
  const idem = key(); const replayA = await calculate(records.ledgerOrder, seller, idem), replayB = await calculate(records.ledgerOrder, seller, idem);
  assert.equal(replayA.object_version, replayB.object_version); assert.equal((await call('GET', `/gigs/commissions/${records.ledgerCommission.id}/entries`, { person: mcn, party: mcnOrganizationId })).items.length, 3);
  checks.push('Commercial offer hash and commission snapshots sealed in actual quote/order; second order rejected; real HTTP SANDBOX receipt and partial refund yield conserved integer 10001→5001 commission with MCN -250 delta; replay creates no duplicate entry; paid_out remains zero');

  phase = 'historical withdrawal, own notifications and truthful insufficient rankings';
  records.withdrawalGig = await gigsReview(await makeGig('未来同意撤回示例（合成）', records.ledgerRule.id));
  records.withdrawalOffer = await acceptOffer(await gigsReview(await makeOffer(records.withdrawalGig, null, records.withdrawnConsent, false)));
  records.withdrawnConsent = await call('POST', `/supply/consents/${records.withdrawnConsent.id}/withdrawals`, { person: seller, version: records.withdrawnConsent.object_version, body: { reason: '合成本人撤回未来商用同意' } });
  await request('POST', '/trade/quotes', { person: seller, party: seller.personalPartyId, body: quoteBody(records.withdrawalOffer), status: 409 });
  records.ledgerRelation = await decide(records.ledgerRelation, 'END');
  await request('POST', '/gigs/offers', { person: seller, party: seller.personalPartyId, body: offerBody(records.ledgerGig, records.ledgerRelation, records.ledgerConsent), status: 409 });
  records.ledgerCommission = await calculate(records.ledgerOrder); assert.equal(records.ledgerCommission.data.relation.version, 2);
  records.suspendedGig = await gigsReview(await makeGig('暂停通知示例（合成）', records.ledgerRule.id));
  records.suspendedOffer = await makeOffer(records.suspendedGig, null, records.ledgerConsent, false);
  records.suspendedGig = await call('POST', `/gigs/requests/${records.suspendedGig.id}/suspension`, { person: reviewer, version: records.suspendedGig.object_version, body: { reason: '合成规则暂停示例，通知仅属自己机构' } });
  const catalogue = await call('GET', '/gigs/catalogue', { person: outsider });
  assert(!catalogue.items.some(r => [records.suspendedGig.id, records.webGigPending.id, records.appGigPending.id].includes(r.id)));
  assert(!JSON.stringify(catalogue).includes(assets.buyerEvidence.id));
  for (const p of [seller, buyer]) assert((await call('GET', '/gigs/notifications', { person: p, party: p.personalPartyId })).items.some(r => r.record_id === records.suspendedGig.id));
  const outsideNotifications = await call('GET', '/gigs/notifications', { person: outsider, party: outsider.personalPartyId }); assert(!outsideNotifications.items.some(r => r.record_id === records.suspendedGig.id));
  const asOf = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
  records.insufficientRanking = await call('POST', '/gigs/rankings', { person: reviewer, body: { rule_id: records.ledgerRule.id, as_of: asOf } });
  assert.equal(records.insufficientRanking.id, (await call('POST', '/gigs/rankings', { person: ruleAuthor, body: { rule_id: records.ledgerRule.id, as_of: asOf } })).id);
  const publicRank = await call('GET', `/gigs/rankings/${records.insufficientRanking.id}`, { person: outsider });
  assert.equal(publicRank.data_status, 'INSUFFICIENT_DATA'); assert.deepEqual(publicRank.boards, { hot: [], emerging: [], regional: [] }); assert(!JSON.stringify(publicRank).includes(records.ledgerOrder.id));
  const [[productionFacts]] = await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='PAYMENT' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.environment'))='PRODUCTION'"); assert.equal(Number(productionFacts.n), 0);
  checks.push('Real future consent withdrawal and ended relation block new commitments while existing commission snapshot remains; suspended gig leaves discovery and sends only own notifications; immutable real ranking is INSUFFICIENT_DATA with no PRODUCTION payment or private financial fields');

  phase = 'permission restoration, evidence integrity, CORS and committed-response recovery';
  await request('GET', `/gigs/records/${records.ledgerCommission.id}`, { person: member, party: mcnOrganizationId, status: 403 });
  await request('GET', `/gigs/records/${records.ledgerCommission.id}`, { person: outsider, party: outsider.personalPartyId, status: 404 });
  const list = await call('GET', '/gigs/records?kind=OFFER&limit=1', { person: seller, party: seller.personalPartyId });
  assert.equal(list.items.length, 1); assert(list.next_cursor);
  const nextPage = await call('GET', `/gigs/records?kind=OFFER&limit=1&cursor=${list.next_cursor}`, { person: seller, party: seller.personalPartyId });
  assert.equal(nextPage.items.length, 1); assert.notEqual(nextPage.items[0].id, list.items[0].id);
  await maintainMcnOwner(false); await request('GET', `/gigs/records/${records.ledgerCommission.id}`, { person: mcn, party: mcnOrganizationId, status: 403 }); await maintainMcnOwner(true);
  await call('GET', `/gigs/records/${records.ledgerCommission.id}`, { person: mcn, party: mcnOrganizationId });
  await grant('reviewer', 'GIG_REVIEW', false); await request('GET', `/gigs/records/${records.webGigPending.id}`, { person: reviewer, status: 403 }); await grant('reviewer', 'GIG_REVIEW', true);
  await maintainCapability(false); await request('POST', '/gigs/relations', { person: mcn, party: mcnOrganizationId, body: relationBody(), status: 409 }); await maintainCapability(true);
  const proofRoute = `/gigs/records/${records.webGigPending.id}/evidence/${assets.buyerEvidence.id}`;
  const downloaded = await request('GET', proofRoute, { person: reviewer }); assert.equal(downloaded.body.length, assets.buyerEvidence.byte_size);
  assert.equal(crypto.createHash('sha256').update(downloaded.body).digest('hex'), assets.buyerEvidence.content_sha256);
  assert.equal(downloaded.headers.get('cache-control'), 'no-store'); assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  await request('GET', proofRoute, { person: outsider, party: outsider.personalPartyId, status: 404 });
  await request('GET', `/gigs/records/${records.webGigPending.id}/evidence/${assets.sellerEvidence.id}`, { person: reviewer, status: 404 });
  storageAvailable = false; await request('GET', proofRoute, { person: reviewer, status: 503 }); storageAvailable = true;
  evidenceIntact = false; await request('GET', proofRoute, { person: reviewer, status: 503 }); evidenceIntact = true; await request('GET', proofRoute, { person: reviewer });
  const [[beforeLoss]] = await db.execute("SELECT COUNT(*) n FROM gig_records WHERE kind='GIG'"); const recoveryKey = key(), recoveryBody = requestBody('已提交但回复丢失恢复示例（合成）', records.webRule.id);
  responseLoss = { operation: 'request' };
  await request('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: recoveryBody, operationKey: recoveryKey, status: 503 });
  records.recoveryRequest = await call('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: recoveryBody, operationKey: recoveryKey });
  const [[afterLoss]] = await db.execute("SELECT COUNT(*) n FROM gig_records WHERE kind='GIG'"); assert.equal(Number(afterLoss.n), Number(beforeLoss.n) + 1);
  await request('POST', '/gigs/requests', { person: buyer, party: buyer.personalPartyId, body: { ...recoveryBody, title: '原key改body必须冲突' }, operationKey: recoveryKey, status: 409 });
  const cors = await request('OPTIONS', '/gigs/offers', { headers: { Origin: 'http://127.0.0.1:5205', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-acting-party,if-match,idempotency-key' }, status: 204 });
  assert.equal(cors.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5205');
  checks.push('MEMBER versus OWNER and outsider checks; audited scoped membership, reviewer and capability revoke/restore; private exact-record byte hash/download and 503 storage/integrity recovery; one real commit after lost503 replays original key exactly once; changed body conflicts; local CORS preflight');

  for (const side of ['web', 'app']) creation[side] = { buyerPartyId: buyer.personalPartyId, sellerPartyId: seller.personalPartyId, mcnPartyId: mcnOrganizationId,
    ruleId: records[`${side}Rule`].id, specId: records.publishedSpec.id, avatarId: records.avatar.id, consentId: records[`${side}Consent`].id,
    gigId: records[`${side}GigPublished`].id, relationId: records[`${side}Relation`].id,
    buyerEvidenceId: assets.buyerEvidence.id, sellerEvidenceId: assets.sellerEvidence.id, mcnEvidenceId: assets.mcnEvidence.id,
    commission, category: 'TEST', scope: requestBody('合成表单', records[`${side}Rule`].id).scope,
    relation: relationBody(), rule: ruleBody, offer: offerBody(records[`${side}GigPublished`], records[`${side}Relation`], records[`${side}Consent`]),
    quote: quoteBody(records[`${side}OfferAccepted`]) };

  controlServer = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) return reply(403, { error: 'LOCAL_CONTROL_FORBIDDEN' });
    try {
      const url = new URL(req.url, controlUrl), enabled = url.searchParams.get('enabled');
      const boolean = () => { assert(['true', 'false'].includes(enabled)); return enabled === 'true'; };
      if (req.method === 'GET' && url.pathname === '/code') {
        const phone = url.searchParams.get('phone'); assert(Object.values(phones).includes(phone)); return reply(200, { syntheticOnly: true, code: sent.get(phone) || null });
      }
      if (req.method === 'GET' && url.pathname === '/state') return reply(200, await snapshot());
      if (req.method !== 'POST') return reply(404, { error: 'LOCAL_CONTROL_NOT_FOUND' });
      if (url.pathname === '/reviewer-permission') { const action = url.searchParams.get('action') || 'GIG_REVIEW'; assert(['GIG_REVIEW', 'TRADE_REVIEW', 'TRADE_REFUND', 'SUPPLY_REVIEW_CONSENT'].includes(action)); await grant('reviewer', action, boolean()); }
      else if (url.pathname === '/mcn-capability') await maintainCapability(boolean());
      else if (url.pathname === '/mcn-owner-membership') await maintainMcnOwner(boolean());
      else if (url.pathname === '/storage') storageAvailable = boolean();
      else if (url.pathname === '/evidence') evidenceIntact = boolean();
      else if (url.pathname === '/response-loss') { const operation = url.searchParams.get('operation'); assert(Object.hasOwn(operationPaths, operation)); assert(!url.searchParams.has('mode') || url.searchParams.get('mode') === '503'); responseLoss = { operation }; }
      else if (url.pathname === '/payment-query' || url.pathname === '/refund-query') {
        const payment = url.pathname === '/payment-query', id = url.searchParams.get(payment ? 'payment_id' : 'refund_id'), result = url.searchParams.get('result');
        assert(['PENDING', 'SUCCEEDED', 'TIMEOUT'].includes(result)); const r = await tradeData(id); assert.equal(r.kind, payment ? 'PAYMENT' : 'REFUND');
        assert.equal(r.data.environment || (await tradeData(r.data.payment_id)).data.environment, 'SANDBOX'); (payment ? paymentQueries : refundQueries).set(id, result);
      } else return reply(404, { error: 'LOCAL_CONTROL_NOT_FOUND' });
      await saveState(); return reply(200, { syntheticOnly: true, applied: true });
    } catch (_) { return reply(400, { error: 'INVALID_LOCAL_CONTROL' }); }
  });
  await listen(controlServer, 3303);
  const denied = await fetch(controlUrl + '/state'); assert.equal(denied.status, 403);
  const deniedOrigin = await fetch(controlUrl + '/state', { headers: { Authorization: `Bearer ${controlToken}`, Origin: 'http://127.0.0.1:5205' } }); assert.equal(deniedOrigin.status, 403);
  const safeState = await fetch(controlUrl + '/state', { headers: { Authorization: `Bearer ${controlToken}` } }); const safe = await safeState.json();
  assert(!JSON.stringify(safe).includes(controlToken)); assert(!Object.values(people).some(p => JSON.stringify(safe).includes(p.token)));
  checks.push('Private control denies missing token and every Origin; sanitized live state contains no Bearer/control token; all 18 gigs HTTP operations exercised against MySQL');
  await saveState(); assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  console.log(`PR17_READY api=3302 control=3303 pid=${process.pid} checks=${checks.length} records=${(await snapshot()).allRecords.length} synthetic_only=true`);
}
startupPromise = main();
startupPromise.catch(async e => {
  console.error(`PR17_STARTUP_FAILED phase=${phase} code=${e.code || e.name} detail=${String(e.message).replace(/Bearer\s+\S+/g, '[redacted]').slice(0, 220)}`);
  try { await cleanup(); } catch (_) { console.error('PR17_CLEANUP_FAILED'); }
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  try { await startupPromise.catch(() => {}); await cleanup(); console.log('PR17_CLEANED own_schema_state_ports_private_bytes=true'); process.exit(0); }
  catch (_) { console.error('PR17_CLEANUP_FAILED'); process.exit(1); }
});
