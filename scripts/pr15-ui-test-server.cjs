'use strict';

// PR15 local UI integration: real HTTP, SMS login, OWNER/operator checks,
// isolated MySQL, private bytes and trade accounting. Only external SMS/storage/
// payment transports are synthetic. No external payment or Apple SDK is opened.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const backend = path.resolve(__dirname, '../晶晶日上工程交接包/01_源码/backend_server');
const envFile = process.env.JX_MYSQL_TEST_ENV_FILE || '/Users/yanghaoran/Code/jingjing-ux/.local/mysql/runtime/test-env.json';
const statePath = path.resolve(__dirname, '../.local/pr15-ui-runtime.json');
const apiPort = 3262, controlPort = 3263;
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const controlToken = crypto.randomBytes(32).toString('hex');
const files = new Map(), sent = new Map(), paymentQueries = new Map(), refundQueries = new Map();
const checks = [], records = {}, assets = {}, people = {};
const phones = { seller: '13900009301', buyer: '13900009302', reviewer: '13900009303', member: '13900009304', legacyReviewer: '13900009305' };
const apiUrl = `http://127.0.0.1:${apiPort}`, controlUrl = `http://127.0.0.1:${controlPort}`;
let mysql, db, connection, apiServer, controlServer, startupPromise, cleanupPromise, stateOwned = false;
let schemaCreated = false, phase = 'configuration', storageAvailable = true, nextCreate = 'ACCEPT';
let providers, tradeEnv, organization, ruleId, grantMaintainer, readiness;
const reviewerGrants = new Map(), readinessStates = new Map();

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
    files.clear(); sent.clear(); paymentQueries.clear(); refundQueries.clear();
    if (!failures.length && stateOwned) {
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
function summary(row) {
  return { id: row.id, kind: row.kind, status: row.current_status, objectVersion: row.object_version,
    buyerPartyId: row.buyer_party_id || null, merchantPartyId: row.merchant_party_id || null,
    ownerPartyId: row.owner_party_id || null, parentId: row.parent_id || null,
    orderId: row.order_id || null, streamRef: row.stream_ref || row.work_id || null };
}
async function recordData(id, kind) {
  assert.match(id, /^[0-9a-f-]{36}$/);
  const [[row]] = await db.execute('SELECT * FROM trade_records WHERE id=?', [id]);
  assert(row && (!kind || row.kind === kind));
  return { ...row, data: typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json };
}
async function snapshot() {
  const [trade] = await db.execute('SELECT id,kind,current_status,object_version,buyer_party_id,merchant_party_id,parent_id,order_id FROM trade_records ORDER BY id');
  const [supply] = await db.execute('SELECT id,kind,current_status,object_version,owner_party_id,stream_ref FROM supply_records ORDER BY id');
  const [license] = await db.execute('SELECT id,kind,current_status,object_version,owner_party_id,parent_id,work_id FROM license_records ORDER BY id');
  const all = new Map([...trade, ...supply, ...license].map(row => [row.id, row]));
  return { testOnly: true, syntheticOnly: true, pid: process.pid, schema, apiUrl, controlUrl,
    accounts: Object.fromEntries(Object.entries(people).map(([name, p]) => [name, {
      phone: p.phone, accountId: p.accountId, personalPartyId: p.personalPartyId,
    }])), organizationId: organization.party_id, ruleId,
    records: Object.fromEntries(Object.entries(records).map(([name, r]) => [name, summary(all.get(r.id) || r)])),
    assets: Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, {
      id: a.id, ownerPartyId: a.owner_party_id, purpose: a.purpose, byteSize: a.byte_size, contentSha256: a.content_sha256,
    }])), allRecords: [...all.values()].map(summary),
    controls: { storageAvailable, nextPaymentCreate: nextCreate,
      paymentQueries: Object.fromEntries(paymentQueries), refundQueries: Object.fromEntries(refundQueries),
      reviewerGrants: Object.fromEntries([...reviewerGrants].map(([action, r]) => [action, r.enabled])),
      providerReady: Object.fromEntries([...readinessStates].map(([code, r]) => [code, r.enabled])) },
    limitations: ['合成金额、时长和条款只用于本次隔离测试，不能成为商业默认值。',
      '支付宝RSA2使用临时合成密钥；传输只在本机，未调用支付宝网关。',
      'Apple JWS使用本次临时EC密钥与注入测试验证器；未验证Apple官方证书链或真实StoreKit。',
      '付款达到许可门槛仍需独立签署、身份、权属证据核验；本次全部为合成资料。'],
    verification: { passed: checks.length, checks },
  };
}
async function request(method, route, { person, party, body, key, version, status = 200, headers = {} } = {}) {
  const binary = Buffer.isBuffer(body);
  const response = await fetch(apiUrl + '/api/v1' + route, { method, signal: AbortSignal.timeout(10000),
    headers: { ...(person ? { Authorization: `Bearer ${person.token}` } : {}),
      ...(party ? { 'X-Acting-Party': party } : {}),
      ...(method === 'GET' || method === 'OPTIONS' ? {} : { 'Idempotency-Key': key || crypto.randomUUID() }),
      ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
      ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }), ...headers },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const json = (response.headers.get('content-type') || '').includes('application/json');
  const result = json && bytes.length ? JSON.parse(bytes.toString()) : bytes;
  assert.equal(response.status, status, `${method} ${route}: ${response.status} (${result?.error?.code || 'non-JSON'})`);
  return { body: result, headers: response.headers };
}
const call = async (method, route, options) => (await request(method, route, options)).body.data;

async function main() {
  assert(process.argv.includes('--test-only'), 'Explicit --test-only is required.');
  const env = JSON.parse(await fs.readFile(envFile, 'utf8'));
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.DB_CLIENT, 'mysql');
  assert.equal(env.MYSQL_HOST, '127.0.0.1'); assert.equal(String(env.MYSQL_PORT), '33316');
  assert.equal(env.MYSQL_USER, 'jx_local'); assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  // Refuse to overwrite another preview's private state, including a live PR15 instance.
  try { await fs.access(statePath); throw Object.assign(new Error('PR15 state already exists'), { code: 'PR15_STATE_EXISTS' }); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise');
  const { openDatabase } = fromBackend('./src/infrastructure/database');
  const { migrate } = fromBackend('./src/infrastructure/database/migrator');
  const { createAccountApi } = fromBackend('./src/http/account-api');
  const { createTradeProviders } = fromBackend('./src/modules/trade/providers');
  const { createReadinessRepository } = fromBackend('./src/modules/providers/readiness');
  grantMaintainer = fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant;
  // Do not replace a missing lockfile dependency with a second payment implementation.
  fromBackend.resolve('@apple/app-store-server-library');
  const { AlipaySdk } = fromBackend('alipay-sdk');

  phase = 'isolated database';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT),
    user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  schemaCreated = true;
  db = await openDatabase({ ...env, MYSQL_DATABASE: schema }); await migrate(db);

  const sms = { async call(operation, input) {
    if (operation !== 'send' || !Object.values(phones).includes(input.phone)) {
      throw Object.assign(new Error('Synthetic phones only'), { code: 'SMS_NOT_READY', status: 503 });
    }
    sent.set(input.phone, input.code); return { accepted: true, provider_request_id: 'synthetic-pr15-local-only' };
  }};
  const storageFactory = () => ({ async put({ key, body, isPrivate }) {
    if (!storageAvailable) throw Object.assign(new Error('Synthetic storage unavailable'), { code: 'SYNTHETIC_STORAGE_UNAVAILABLE' });
    assert.equal(isPrivate, true); assert(Buffer.isBuffer(body)); files.set(key, Buffer.from(body));
    return { key, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
  }, async getBuffer(key) {
    if (!storageAvailable) throw Object.assign(new Error('Synthetic storage unavailable'), { code: 'SYNTHETIC_STORAGE_UNAVAILABLE' });
    const bytes = files.get(key); return bytes && Buffer.from(bytes);
  }});
  const allowedOrigins = [5199, 5200, 5201, 5202, 5203, 5204, 8769, 8770, 8771, 8772, 8773].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  const app = createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'), sms,
    supplyStorageFactory: storageFactory, governanceEnvironment: 'SANDBOX',
    tradeProvidersFactory: () => ({ get(code) { assert(providers, 'Fixture providers not initialized'); return providers.get(code); } }),
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 }, allowedOrigins,
  });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr15-synthetic-sms-private-storage-payment-transport'); app(req, res);
  });
  await listen(apiServer, apiPort);
  phase = 'real synthetic SMS login and memberships';
  for (const [name, phone] of Object.entries(phones)) {
    const challenge = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const session = await call('POST', '/auth/sessions', { body: { phone, challenge_id: challenge.challenge_id, code: sent.get(phone) } });
    const person = { phone, accountId: session.account.id, token: session.access_token };
    const parties = await call('GET', '/me/parties', { person });
    person.personalPartyId = parties.items.find(row => row.party.kind === 'PERSON')?.party.id;
    assert(person.personalPartyId); people[name] = person;
  }
  const { seller, buyer, reviewer, member, legacyReviewer } = people;
  organization = await call('POST', '/organizations', { person: seller, body: { display_name: '晴川制作工作室（隔离测试）' } });
  const invitation = await call('POST', `/parties/${organization.party_id}/invitations`, { person: seller, party: organization.party_id,
    body: { invitee_account_id: member.accountId, expires_at: new Date(Date.now() + 86400000).toISOString() } });
  await call('POST', `/parties/${organization.party_id}/invitations/${invitation.invitation_id}/responses`, {
    person: member, party: organization.party_id, version: invitation.object_version, body: { decision: 'ACCEPT' } });
  for (const action of ['TRADE_REVIEW', 'TRADE_REFUND', 'SUPPLY_REVIEW_PROFILE', 'SUPPLY_REVIEW_RIGHTS', 'SUPPLY_REVIEW_CONTENT', 'LICENSE_REVIEW']) {
    const grant = await grantMaintainer(db, { account_id: reviewer.accountId, action, enabled: true,
      expires_at: null, expected_version: 0, authority_ref: 'synthetic:pr15-ui', reason: '仅本次随机隔离库的独立审核测试，不是正式授权' });
    if (['TRADE_REVIEW', 'TRADE_REFUND'].includes(action)) reviewerGrants.set(action, { version: grant.object_version, enabled: true });
  }
  await grantMaintainer(db, { account_id: legacyReviewer.accountId, action: 'TRADE_REVIEW', enabled: true,
    expires_at: null, expected_version: 0, authority_ref: 'synthetic:pr15-ui', reason: '仅独立核对合成旧单；不具备退款权限' });
  checks.push('Five actual synthetic SMS/account logins; organization invitation accepted; OWNER and MEMBER remain distinct; independent review/refund grants');

  phase = 'synthetic signed payment transports and actual readiness records';
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  tradeEnv = { NODE_ENV: 'test', TRADE_ALIPAY_ENABLED: 'true', TRADE_ALIPAY_APP_ID: 'synthetic.pr15.app',
    TRADE_ALIPAY_MERCHANT_ID: 'synthetic.pr15.merchant', TRADE_ALIPAY_MERCHANT_PARTY_ID: seller.personalPartyId,
    TRADE_ALIPAY_PRIVATE_KEY: rsa.privateKey, TRADE_ALIPAY_PUBLIC_KEY: rsa.publicKey,
    TRADE_ALIPAY_NOTIFY_URL: 'https://example.invalid/pr15-local-only', TRADE_ALIPAY_CONFIG_REVISION: 'pr15-local-synthetic',
    TRADE_APPLE_ENABLED: 'true', TRADE_APPLE_BUNDLE_ID: 'synthetic.pr15.bundle', TRADE_APPLE_APP_APPLE_ID: '9315',
    TRADE_APPLE_MERCHANT_PARTY_ID: seller.personalPartyId, TRADE_APPLE_PRIVATE_KEY: ec.privateKey,
    TRADE_APPLE_KEY_ID: 'SYNTHPR15', TRADE_APPLE_ISSUER_ID: crypto.randomUUID(), TRADE_APPLE_ROOT_CERT_PATHS: '[]',
    TRADE_APPLE_CONFIG_REVISION: 'pr15-local-synthetic' };
  const alipay = new AlipaySdk({ appId: tradeEnv.TRADE_ALIPAY_APP_ID, privateKey: rsa.privateKey, alipayPublicKey: rsa.publicKey,
    keyType: 'PKCS8', signType: 'RSA2', gateway: 'https://example.invalid/never-called' });
  const sdkExecute = alipay.sdkExecute.bind(alipay);
  alipay.sdkExecute = (method, input) => {
    assert.equal(method, 'alipay.trade.app.pay');
    if (nextCreate === 'TIMEOUT') { nextCreate = 'ACCEPT'; throw new Error('SYNTHETIC_CREATE_OUTCOME_UNKNOWN'); }
    return sdkExecute(method, input);
  };
  const yuan = n => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  const alipaySign = body => {
    const canonical = Object.keys(body).filter(k => k !== 'sign_type' && k !== 'sign').sort().map(k => `${k}=${body[k]}`).join('&');
    return { ...body, sign: crypto.sign('RSA-SHA256', Buffer.from(canonical), rsa.privateKey).toString('base64') };
  };
  function verifySyntheticResponse(body) {
    const canonical = Object.keys(body).filter(k => k !== 'sign').sort().map(k => `${k}=${body[k]}`).join('&');
    const sign = crypto.sign('RSA-SHA256', Buffer.from(canonical), rsa.privateKey);
    assert(crypto.verify('RSA-SHA256', Buffer.from(canonical), rsa.publicKey, sign)); return body;
  }
  alipay.exec = async (method, input, options) => {
    assert.equal(options.validateSign, true);
    const biz = input.bizContent, p = await recordData(biz.outTradeNo, 'PAYMENT');
    if (method === 'alipay.trade.query') {
      const result = paymentQueries.get(p.id) || 'PENDING';
      if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
      return verifySyntheticResponse({ code: '10000', outTradeNo: p.id,
        tradeNo: result === 'PENDING' || result === 'CLOSED' ? undefined : `synthetic.pr15.${p.id}`,
        tradeStatus: { PENDING: 'WAIT_BUYER_PAY', SUCCEEDED: 'TRADE_SUCCESS', CLOSED: 'TRADE_CLOSED', MISMATCH_AMOUNT: 'TRADE_SUCCESS' }[result],
        totalAmount: yuan(p.data.amount_minor + (result === 'MISMATCH_AMOUNT' ? 1 : 0)) });
    }
    const [[raw]] = await db.execute('SELECT * FROM trade_records WHERE id=? AND kind=?', [biz.outRequestNo, 'REFUND']);
    assert(raw); const refund = typeof raw.data_json === 'string' ? JSON.parse(raw.data_json) : raw.data_json;
    assert.equal(refund.payment_id, p.id); assert.equal(refund.transaction_id, biz.tradeNo);
    if (method === 'alipay.trade.refund') return verifySyntheticResponse({ code: '10000', outTradeNo: p.id, tradeNo: refund.transaction_id });
    assert.equal(method, 'alipay.trade.fastpay.refund.query');
    const result = refundQueries.get(raw.id) || 'PENDING'; if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    return verifySyntheticResponse({ code: '10000', outTradeNo: p.id, tradeNo: refund.transaction_id, outRequestNo: raw.id,
      refundAmount: yuan(refund.amount_minor), refundStatus: result === 'SUCCEEDED' ? 'REFUND_SUCCESS' : 'REFUND_PROCESSING' });
  };
  function signJws(payload) {
    const data = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'synthetic-pr15-only', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    return data + '.' + crypto.sign('sha256', Buffer.from(data), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  }
  function verifyJws(signed) {
    assert.equal(typeof signed, 'string'); const parts = signed.split('.'); assert.equal(parts.length, 3);
    const header = JSON.parse(Buffer.from(parts[0], 'base64url')); assert.equal(header.alg, 'ES256'); assert.equal(header.kid, 'synthetic-pr15-only');
    assert(crypto.verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')));
    return JSON.parse(Buffer.from(parts[1], 'base64url'));
  }
  const appleTransaction = (p, result = 'SUCCEEDED') => ({ transactionId: `synthetic.pr15.${p.id}`, bundleId: tradeEnv.TRADE_APPLE_BUNDLE_ID,
    environment: 'Sandbox', type: 'Consumable', inAppOwnershipType: 'PURCHASED', quantity: 1, currency: 'CNY',
    price: p.data.amount_minor * 10, appAccountToken: p.id, productId: p.data.apple_product_id,
    ...(result === 'REFUNDED' ? { revocationDate: Date.now(), revocationType: 'REFUND_FULL' } : {}) });
  const appleClient = { async getTransactionInfo(transactionId) {
    const match = /^synthetic\.pr15\.([0-9a-f-]{36})$/.exec(transactionId); assert(match);
    const p = await recordData(match[1], 'PAYMENT'), result = paymentQueries.get(p.id) || 'SUCCEEDED';
    if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    assert(['SUCCEEDED', 'REFUNDED'].includes(result)); return { signedTransactionInfo: signJws(appleTransaction(p, result)) };
  }};
  readiness = createReadinessRepository(db, { authorizeChange: async actor => actor === 'synthetic.pr15.fixture',
    verifyEvidence: async input => input.evidence_ref === 'synthetic.pr15.signed-local-transport' });
  providers = createTradeProviders(db, tradeEnv, { alipay, appleClient,
    appleVerifier: { async verifyAndDecodeTransaction(signed) { return verifyJws(signed); }, async verifyAndDecodeNotification(signed) { return verifyJws(signed); } } });
  async function providerReady(code, enabled) {
    const previous = readinessStates.get(code); if (previous?.enabled === enabled) return;
    const config = providers.configuration(code);
    const row = await readiness.record({ provider_kind: 'PaymentProvider', provider_code: code.toLowerCase(), capability_code: 'order_payment',
      environment: 'SANDBOX', current_status: enabled ? 'SANDBOX_VERIFIED' : 'CONFIGURED', config_revision: config.config_revision,
      expected_version: previous?.version || 0, evidence_ref: enabled ? 'synthetic.pr15.signed-local-transport' : null, reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr15.fixture' });
    readinessStates.set(code, { version: row.object_version, enabled });
  }
  await providerReady('ALIPAY', true); await providerReady('APPLE', true);
  checks.push('Actual provider readiness/history in isolated MySQL; real Alipay RSA2 signing/checker; locally signed and verified EC JWS through existing provider injection');

  const { createRuleContent } = fromBackend('./src/modules/governance/content');
  ruleId = crypto.randomUUID(); const rule = createRuleContent({ id: ruleId, rule_key: 'trade.pr15.ui.synthetic', version: '1',
    terms: { explicit: '仅本地界面联调的合成规则，不是正式商业默认条件。' } });
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',
    [ruleId, 'trade.pr15.ui.synthetic', '1', JSON.stringify(rule), '2020-01-01 00:00:00', seller.accountId, 'EFFECTIVE']);
  const tradeReview = (row, person = reviewer) => call('POST', `/trade/records/${row.id}/reviews`, {
    person, version: row.object_version, body: { decision: 'APPROVED', reason: '独立核对合成材料，仅本次随机隔离库测试' } });
  const specBody = { version: 'synthetic.v1', service_tier: '合成样本档位（不是商业默认）', sample_seconds: 23, final_seconds: 119,
    revision_limit: 2, deliverables: ['合成样片文件', '合成成片文件'], terms: '仅随机隔离库验收使用；价格、时长和修改次数不可用于正式商品。' };
  async function makeSpec(title, unit = 500000, previous = null, kind = 'PRODUCTION') {
    return call('POST', '/trade/specifications', { person: seller, party: seller.personalPartyId, body: {
      previous_spec_id: previous?.id || null, title, provider_party_id: seller.personalPartyId, line_kind: kind,
      unit_minor: unit, currency: 'CNY', specification: { ...specBody, version: previous ? 'synthetic.v2' : 'synthetic.v1' } } });
  }
  async function makeQuote({ channel = 'ALIPAY', spec = records.publishedSpec, installments, reservationId = null, review = true } = {}) {
    let row = await call('POST', '/trade/quotes', { person: seller, party: seller.personalPartyId, body: {
      buyer_party_id: buyer.personalPartyId, lines: [{ line_id: spec.data.line_kind === 'LICENSE' ? 'license' : 'production', spec_id: spec.id, quantity: 1 }],
      installments: installments || [{ key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'production', amount_minor: spec.data.unit_minor }], apple_product_id: channel === 'APPLE' ? 'synthetic.pr15.product' : null }],
      channel, transaction_model: 'DIRECT_SUPPLIER', rule_id: ruleId, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      payment_window_minutes: 10080, license_reservation_id: reservationId } });
    if (review) row = await tradeReview(row); return row;
  }
  async function accept(quote) { return call('POST', `/trade/quotes/${quote.id}/acceptance`, { person: buyer, party: buyer.personalPartyId,
    version: quote.object_version, body: { quote_sha256: quote.content_sha256 } }); }
  async function newOrder(options) { return accept(await makeQuote(options)); }
  async function pay(order, key, status = 200, installment = 'first') { return request('POST', '/trade/payments', { person: buyer, party: buyer.personalPartyId,
    body: { order_id: order.id, installment_key: installment }, key, status }); }
  async function reconcile(payment, status = 200) { return request('POST', `/trade/payments/${payment.id}/reconciliation`, {
    person: buyer, party: buyer.personalPartyId, body: { transaction_id: payment.data.provider === 'APPLE' ? `synthetic.pr15.${payment.id}` : null }, status }); }
  async function successful(order) { const p = (await pay(order)).body.data; paymentQueries.set(p.id, 'SUCCEEDED'); return (await reconcile(p)).body.data; }
  const refund = (payment, amount, line = 'production') => call('POST', '/trade/refunds', { person: buyer, party: buyer.personalPartyId,
    body: { payment_id: payment.id, allocations: [{ line_id: line, amount_minor: amount }], reason: '合成退款理由，仅隔离测试' } });

  phase = 'real specifications, quotes, orders and payment states';
  records.publishedSpec = await tradeReview(await makeSpec('私人制作 · 已发布规格（隔离测试）'));
  records.pendingSpec = await makeSpec('私人制作 · 新版本待审核（隔离测试）', 510000, records.publishedSpec);
  records.quoteInReview = await makeQuote({ review: false });
  records.quoteApproved = await makeQuote();
  records.openOrder = await newOrder();
  records.pendingOrder = await newOrder(); records.pendingPayment = (await pay(records.pendingOrder)).body.data;
  assert.match(records.pendingPayment.data.checkout.order_string, /sign=/);
  records.unknownOrder = await newOrder(); const unknownKey = crypto.randomUUID(); nextCreate = 'TIMEOUT';
  assert.equal((await pay(records.unknownOrder, unknownKey, 503)).body.error.code, 'SERVICE_UNAVAILABLE');
  records.unknownPayment = (await pay(records.unknownOrder, unknownKey)).body.data;
  assert.equal(records.unknownPayment.current_status, 'UNKNOWN');
  await request('POST', `/trade/orders/${records.unknownOrder.id}/cancellation`, { person: buyer, party: buyer.personalPartyId,
    version: records.unknownOrder.object_version, body: { reason: '有未知付款不可取消' }, status: 409 });
  records.paidOrder = await newOrder(); records.succeededPayment = await successful(records.paidOrder);
  records.requestedRefund = await refund(records.succeededPayment, 9900);
  records.approvedRefund = await tradeReview(await refund(records.succeededPayment, 10000));
  records.partialRefundOrder = await newOrder(); records.partialRefundPayment = await successful(records.partialRefundOrder);
  let finishedRefund = await tradeReview(await refund(records.partialRefundPayment, 9900));
  finishedRefund = await call('POST', `/trade/refunds/${finishedRefund.id}/execution`, { person: reviewer, body: {} });
  refundQueries.set(finishedRefund.id, 'SUCCEEDED');
  records.succeededRefund = await call('POST', `/trade/refunds/${finishedRefund.id}/reconciliation`, { person: buyer, party: buyer.personalPartyId, body: {} });
  assert.equal(records.succeededRefund.current_status, 'SUCCEEDED');
  records.appleOrder = await newOrder({ channel: 'APPLE' }); records.applePayment = await successful(records.appleOrder);
  records.appleRefund = await tradeReview(await refund(records.applePayment, records.applePayment.data.amount_minor));
  records.appleRefund = await call('POST', `/trade/refunds/${records.appleRefund.id}/execution`, { person: reviewer, body: {} });
  assert.equal(records.appleRefund.current_status, 'AWAITING_APPLE_REQUEST');
  // Preparation failures create no payment. The API deliberately has no public readiness GET.
  records.unconfiguredOrder = await newOrder(); await providerReady('ALIPAY', false);
  const unavailableKey = crypto.randomUUID(); assert.equal((await pay(records.unconfiguredOrder, unavailableKey, 503)).body.error.code, 'SERVICE_UNAVAILABLE');
  const [[unavailableCount]] = await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='PAYMENT' AND order_id=?", [records.unconfiguredOrder.id]);
  assert.equal(Number(unavailableCount.n), 0); await providerReady('ALIPAY', true);
  records.blockedMilestoneOrder = await newOrder({ installments: [{ key: 'first', trigger: 'FINAL_ACCEPTED', allocations: [{ line_id: 'production', amount_minor: 500000 }], apple_product_id: null }] });
  assert.equal((await pay(records.blockedMilestoneOrder, undefined, 409)).body.error.code, 'PAYMENT_MILESTONE_NOT_MET');
  checks.push('Published/awaiting-review versioned specs and approved/pending quotes; OPEN/PAID/partial-refund orders; PENDING/UNKNOWN/SUCCEEDED payments; REQUESTED/APPROVED/completed refunds; Apple awaiting-user-request remains unrefunded');
  checks.push('Unknown dispatch replay returns original payment; cancellation refused; not-ready preparation creates no record; final-acceptance milestone cannot be asserted by UI');

  phase = 'actual private historical bytes and independent legacy review';
  async function upload(person, purpose, text) { return call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, {
    person, party: person.personalPartyId, body: Buffer.from(text) }); }
  const historicalBytes = Buffer.from('旧单合成原始材料：样片人民币99.00元，成片人民币4901.00元。\nREPORTED_PAID只表示旧系统记载，不能追认为渠道入账。\n仅本地私有测试文件。');
  assets.legacyEvidence = await upload(seller, 'RIGHTS_EVIDENCE', historicalBytes.toString());
  const legacyBody = suffix => ({ buyer_party_id: buyer.personalPartyId, merchant_party_id: seller.personalPartyId,
    source_system: 'synthetic.old.sqlite', source_order_id: `synthetic.99.4901.${suffix}`,
    original_lines: [{ line_id: 'sample', amount_minor: 9900, reported_status: 'REPORTED_PAID' }, { line_id: 'final', amount_minor: 490100, reported_status: 'REPORTED_UNPAID' }],
    original_terms: '合成旧单原承诺：仅按原材料保存与核对，不追认为新系统真实收款。', evidence_asset_id: assets.legacyEvidence.id });
  records.legacyReference = await tradeReview(await call('POST', '/trade/legacy-orders', { person: reviewer, body: legacyBody('verified') }), legacyReviewer);
  records.legacyPending = await call('POST', '/trade/legacy-orders', { person: reviewer, body: legacyBody('pending') });
  await request('POST', `/trade/records/${records.legacyPending.id}/reviews`, { person: reviewer, version: records.legacyPending.object_version,
    body: { decision: 'APPROVED', reason: '创建人不能审核自己的旧单' }, status: 403 });
  const legacyRoute = `/trade/legacy-orders/${records.legacyReference.id}/evidence/${assets.legacyEvidence.id}/content`;
  const downloaded = await request('GET', legacyRoute, { person: reviewer });
  assert(downloaded.body.equals(historicalBytes)); assert.equal(downloaded.headers.get('cache-control'), 'no-store');
  assert.match(downloaded.headers.get('content-disposition'), /^attachment/); assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(assets.legacyEvidence.byte_size, historicalBytes.length);
  assert.equal(assets.legacyEvidence.content_sha256, crypto.createHash('sha256').update(historicalBytes).digest('hex'));
  await request('GET', legacyRoute, { person: member, status: 403 });
  assert.equal(records.legacyReference.data.payment_verified, false);
  checks.push('Original legacy 99/4901 amounts retained; creator cannot self-review; independent approval is reference-only; private attachment byte size/hash/download match and MEMBER receives 403');

  phase = 'actual work, reservation and license payment threshold';
  assets.sellerProof = await upload(seller, 'RIGHTS_EVIDENCE', '合成卖方权利、签署说明；不代表真实实名或签约。');
  assets.buyerProof = await upload(buyer, 'RIGHTS_EVIDENCE', '合成买方身份、签署及付款证据；仅外部人工核验样本。');
  assets.workContent = await upload(seller, 'WORK_CONTENT', '《窗边短笺》合成剧本正文。仅随机隔离库验收。');
  records.profile = await call('POST', '/supply/profiles', { person: seller, party: seller.personalPartyId, body: {
    display_name: '晴川作者（隔离测试）', description: '合成作者身份，不代表真实资料。', evidence_asset_ids: [assets.sellerProof.id], previous_profile_id: null } });
  records.profile = await call('POST', `/supply/profiles/${records.profile.id}/reviews`, { person: reviewer, version: records.profile.object_version,
    body: { decision: 'APPROVED', reason: '合成供给资料独立核对' } });
  let work = await call('POST', '/supply/work-versions', { person: seller, party: seller.personalPartyId, body: {
    work_id: null, previous_version_id: null, title: '窗边短笺（隔离测试）', kind: 'ORIGINAL', source_version_id: null, project_id: null,
    content_asset_id: assets.workContent.id, evidence_ids: [assets.sellerProof.id], credits: [
      { party_id: seller.personalPartyId, role: 'AUTHOR', evidence_asset_ids: [assets.sellerProof.id] },
      { party_id: seller.personalPartyId, role: 'RIGHTS_HOLDER', evidence_asset_ids: [assets.sellerProof.id] } ] } });
  work = await call('POST', `/supply/work-versions/${work.id}/actions`, { person: seller, party: seller.personalPartyId,
    version: work.object_version, body: { action: 'SUBMIT', reason: null } });
  for (const channel of ['RIGHTS', 'CONTENT']) work = await call('POST', `/supply/work-versions/${work.id}/reviews`, {
    person: reviewer, version: work.object_version, body: { channel, decision: 'APPROVED', reason: '合成作品独立双审' } });
  records.work = work;
  const now = Date.now(), terms = { exclusive: false, rights: ['ADAPT', 'PRODUCE'], purposes: ['PRIVATE'], territories: ['CN'], languages: ['zh'],
    valid_from: new Date(now - 86400000).toISOString(), development_until: new Date(now + 365 * 86400000).toISOString(),
    valid_until: new Date(now + 730 * 86400000).toISOString(), project_limit: 2, episode_limit: 2,
    terms_text: '合成许可：仅私人改稿与制作；250.00元总额、100.00元生效门槛仅本次样本，不能用于正式默认条件。' };
  const licenseReview = (row, verification) => call('POST', `/licensing/records/${row.id}/reviews`, { person: reviewer,
    version: row.object_version, body: { decision: 'APPROVED', reason: '仅合成资料独立核验，不声称真实签约收款。', ...(verification ? { verification } : {}) } });
  records.licenseProduct = await licenseReview(await call('POST', '/licensing/products', { person: seller, party: seller.personalPartyId,
    body: { work_version_id: work.id, previous_product_id: null, title: '窗边短笺 · 私人许可（隔离测试）', preview_text: '合成短试读：窗边留着一张未寄出的短笺。',
      terms, price: { currency: 'CNY', amount_minor: 25000 }, payment_due_minor: 10000, reservation_minutes: 10080, rule_id: ruleId } }));
  records.reservation = await call('POST', '/licensing/reservations', { person: buyer, party: buyer.personalPartyId, body: { product_id: records.licenseProduct.id } });
  records.licenseSpec = await tradeReview(await makeSpec('窗边短笺 · 许可费规格（隔离测试）', 25000, null, 'LICENSE'));
  records.licenseOrder = await newOrder({ spec: records.licenseSpec, reservationId: records.reservation.id, installments: [
    { key: 'license_threshold', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'license', amount_minor: 10000 }], apple_product_id: null },
    { key: 'license_balance', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'license', amount_minor: 15000 }], apple_product_id: null } ] });
  records.licenseEvidence = await call('POST', '/licensing/evidence', { person: buyer, party: buyer.personalPartyId, body: {
    reservation_id: records.reservation.id, contract_sha256: records.reservation.data.contract.content_sha256,
    seller_signature_asset_id: assets.sellerProof.id, buyer_signature_asset_id: assets.buyerProof.id, identity_asset_id: assets.buyerProof.id,
    payment_asset_id: assets.buyerProof.id, external_reference: 'synthetic.pr15.manual-proof' } });
  records.licenseEvidence = await licenseReview(records.licenseEvidence, { signed_contract_sha256: records.reservation.data.contract.content_sha256,
    identity_verified: true, seller_signature_verified: true, buyer_signature_verified: true, currency: 'CNY', received_minor: 10000,
    payee_party_id: seller.personalPartyId, receipt_ref: 'synthetic.pr15.manual.receipt.' + records.reservation.id });
  const activate = status => request('POST', `/licensing/reservations/${records.reservation.id}/activation`, { person: reviewer,
    version: records.reservation.object_version, body: { evidence_id: records.licenseEvidence.id, reason: '仅合成样本，付款与签署证据分别核对' }, status });
  assert.equal((await activate(409)).body.error.code, 'LICENSE_PAYMENT_NOT_READY');
  records.licensePayment = (await pay(records.licenseOrder, undefined, 200, 'license_threshold')).body.data;
  paymentQueries.set(records.licensePayment.id, 'SUCCEEDED'); records.licensePayment = (await reconcile(records.licensePayment)).body.data;
  records.licenseGrant = (await activate(200)).body.data;
  assert.equal(records.licenseGrant.current_status, 'ACTIVE');
  records.licenseProject = await call('POST', '/licensing/projects', { person: buyer, party: buyer.personalPartyId,
    body: { project: { title: '窗边短笺 · 合成私人项目', purpose: 'PRIVATE', territory: 'CN', language: 'zh', episodes: 1 } } });
  records.licenseBinding = await call('POST', `/licensing/grants/${records.licenseGrant.id}/bindings`, { person: buyer, party: buyer.personalPartyId,
    version: records.licenseGrant.object_version, body: { project_id: records.licenseProject.id } });
  assert.equal((await call('GET', `/trade/records/${records.licenseOrder.id}`, { person: buyer, party: buyer.personalPartyId })).current_status, 'PARTIALLY_PAID');
  checks.push('True private work and dual review → listed license → held reservation → linked trade quote/order; activation blocked before payment, opens at original 10000/25000 threshold with separate approved synthetic evidence; project binding succeeds while order remains partially paid');

  phase = 'permission, CORS, conflicts, wrong proofs and notifications';
  await request('GET', '/trade/records?kind=ORDER', { person: member, party: organization.party_id, status: 403 });
  await request('GET', '/trade/records?kind=ORDER', { person: member, status: 403 });
  await request('GET', `/trade/records/${records.succeededPayment.id}`, { person: member, party: member.personalPartyId, status: 404 });
  await request('POST', `/trade/records/${records.pendingSpec.id}/reviews`, { person: seller, version: records.pendingSpec.object_version,
    body: { decision: 'APPROVED', reason: '普通商家不得自审' }, status: 403 });
  await request('POST', `/trade/quotes/${records.quoteApproved.id}/acceptance`, { person: buyer, party: buyer.personalPartyId,
    version: 1, body: { quote_sha256: records.quoteApproved.content_sha256 }, status: 412 });
  await request('POST', `/trade/refunds/${records.approvedRefund.id}/execution`, { person: member, body: {}, status: 403 });
  await request('GET', `/trade/records/${records.requestedRefund.id}`, { person: legacyReviewer, status: 403 });
  assert((await call('GET', '/trade/records?kind=REFUND', { person: legacyReviewer })).items.some(r => r.id === records.requestedRefund.id));
  paymentQueries.set(records.pendingPayment.id, 'MISMATCH_AMOUNT');
  assert.equal((await reconcile(records.pendingPayment, 409)).body.error.code, 'PAYMENT_PROOF_MISMATCH');
  paymentQueries.set(records.pendingPayment.id, 'PENDING');
  const preflight = await request('OPTIONS', '/trade/records?kind=ORDER', { status: 204,
    headers: { Origin: allowedOrigins[0], 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization,X-Acting-Party,Idempotency-Key,If-Match' } });
  assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigins[0]);
  await request('OPTIONS', '/trade/records?kind=ORDER', { status: 403, headers: { Origin: 'https://example.invalid' } });
  const notification = async (p, status, corrupt = false) => {
    const form = alipaySign({ app_id: tradeEnv.TRADE_ALIPAY_APP_ID, seller_id: tradeEnv.TRADE_ALIPAY_MERCHANT_ID,
      out_trade_no: p.id, trade_no: `synthetic.pr15.${p.id}`, trade_status: status === 'SUCCEEDED' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY', total_amount: yuan(p.data.amount_minor), sign_type: 'RSA2' });
    if (corrupt) form.total_amount = yuan(p.data.amount_minor + 1);
    const r = await fetch(apiUrl + '/api/v1/trade/notifications/alipay', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
    assert.equal(r.status, corrupt ? 400 : 200); if (!corrupt) assert.equal(await r.text(), 'success');
    return { accepted: !corrupt };
  };
  await notification(records.succeededPayment, 'SUCCEEDED'); await notification(records.pendingPayment, 'SUCCEEDED', true);
  const badApple = await fetch(apiUrl + '/api/v1/trade/notifications/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signedPayload: 'not.valid.jws' }) });
  assert.equal(badApple.status, 400);
  checks.push('OWNER versus MEMBER and backend review/refund permissions enforced; refund list/detail independently require TRADE_REVIEW/TRADE_REFUND; stale version and mismatched amount refused; allowed CORS preflight succeeds, foreign origin denied; real notification routes reject altered RSA2 and invalid JWS');

  phase = 'private test control and failure recovery';
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) {
      res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return;
    }
    try {
      const url = new URL(req.url, controlUrl), get = name => url.searchParams.get(name);
      let out;
      if (req.method === 'GET' && url.pathname === '/code') {
        assert(Object.values(phones).includes(get('phone'))); const code = sent.get(get('phone'));
        res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return;
      } else if (req.method === 'GET' && url.pathname === '/state') out = await snapshot();
      else if (req.method === 'POST' && url.pathname === '/storage') {
        assert(['true', 'false'].includes(get('enabled'))); storageAvailable = get('enabled') === 'true'; out = { enabled: storageAvailable };
      } else if (req.method === 'POST' && url.pathname === '/reviewer-permission') {
        const action = get('action'), enabled = get('enabled'); assert(reviewerGrants.has(action)); assert(['true', 'false'].includes(enabled));
        const previous = reviewerGrants.get(action), desired = enabled === 'true';
        if (previous.enabled !== desired) {
          const grant = await grantMaintainer(db, { account_id: reviewer.accountId, action, enabled: desired,
            expires_at: null, expected_version: previous.version, authority_ref: 'synthetic:pr15-ui-control', reason: '仅本次fixture审核人原授权的撤销或恢复' });
          reviewerGrants.set(action, { version: grant.object_version, enabled: desired });
        }
        out = { action, enabled: desired };
      } else if (req.method === 'POST' && url.pathname === '/payment-query') {
        const p = await recordData(get('payment_id'), 'PAYMENT'), result = get('result');
        assert((p.data.provider === 'APPLE' ? ['SUCCEEDED', 'REFUNDED', 'TIMEOUT'] : ['PENDING', 'SUCCEEDED', 'CLOSED', 'TIMEOUT', 'MISMATCH_AMOUNT']).includes(result));
        paymentQueries.set(p.id, result); out = { paymentId: p.id, result };
      } else if (req.method === 'POST' && url.pathname === '/refund-query') {
        const r = await recordData(get('refund_id'), 'REFUND'), result = get('result'); assert(['PENDING', 'SUCCEEDED', 'TIMEOUT'].includes(result));
        if (r.data.provider === 'APPLE') paymentQueries.set(r.data.payment_id, result === 'SUCCEEDED' ? 'REFUNDED' : result === 'TIMEOUT' ? 'TIMEOUT' : 'SUCCEEDED');
        else refundQueries.set(r.id, result); out = { refundId: r.id, result };
      } else if (req.method === 'POST' && url.pathname === '/payment-create') {
        assert(['ACCEPT', 'TIMEOUT'].includes(get('result'))); nextCreate = get('result'); out = { nextPaymentCreate: nextCreate };
      } else if (req.method === 'POST' && url.pathname === '/provider-ready') {
        const channel = get('channel'), enabled = get('enabled'); assert(['ALIPAY', 'APPLE'].includes(channel)); assert(['true', 'false'].includes(enabled));
        await providerReady(channel, enabled === 'true'); out = { channel, enabled: enabled === 'true' };
      } else if (req.method === 'POST' && url.pathname === '/notification/alipay') {
        const p = await recordData(get('payment_id'), 'PAYMENT'); assert.equal(p.data.provider, 'ALIPAY'); assert(['PENDING', 'SUCCEEDED'].includes(get('status')));
        out = await notification(p, get('status'));
      } else if (req.method === 'POST' && url.pathname === '/notification/apple') {
        const p = await recordData(get('payment_id'), 'PAYMENT'); assert.equal(p.data.provider, 'APPLE'); assert(['SUCCEEDED', 'REFUNDED'].includes(get('status')));
        const signedPayload = signJws({ notificationType: get('status') === 'REFUNDED' ? 'REFUND' : 'ONE_TIME_CHARGE',
          data: { signedTransactionInfo: signJws(appleTransaction(p, get('status'))) } });
        const response = await fetch(apiUrl + '/api/v1/trade/notifications/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signedPayload }) });
        assert.equal(response.status, 200); out = await response.json();
      } else { res.writeHead(404); res.end('{"error":"NOT_FOUND"}'); return; }
      res.end(JSON.stringify(out));
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, controlPort);
  assert.equal((await fetch(controlUrl + '/code?phone=' + seller.phone)).status, 403);
  assert.equal((await fetch(controlUrl + '/state', { headers: { Authorization: `Bearer ${controlToken}`, Origin: allowedOrigins[0] } })).status, 403);
  const control = async route => {
    const response = await fetch(controlUrl + route, { method: 'POST', headers: { Authorization: `Bearer ${controlToken}` } });
    assert.equal(response.status, 200); return response.json();
  };
  await control('/storage?enabled=false'); await request('GET', legacyRoute, { person: reviewer, status: 503 }); await control('/storage?enabled=true');
  assert((await request('GET', legacyRoute, { person: reviewer })).body.equals(historicalBytes));
  await control('/reviewer-permission?action=TRADE_REFUND&enabled=false');
  await request('GET', `/trade/records/${records.requestedRefund.id}`, { person: reviewer, status: 403 });
  assert((await call('GET', '/trade/records?kind=REFUND', { person: reviewer })).items.length > 0);
  await control('/reviewer-permission?action=TRADE_REFUND&enabled=true');
  await control('/reviewer-permission?action=TRADE_REVIEW&enabled=false');
  await request('GET', '/trade/records?kind=ORDER', { person: reviewer, status: 403 });
  assert.equal((await call('GET', `/trade/records/${records.requestedRefund.id}`, { person: reviewer })).kind, 'REFUND');
  await control('/reviewer-permission?action=TRADE_REVIEW&enabled=true');
  await control(`/payment-query?payment_id=${records.pendingPayment.id}&result=TIMEOUT`); await reconcile(records.pendingPayment, 503);
  await control(`/payment-query?payment_id=${records.pendingPayment.id}&result=PENDING`); await reconcile(records.pendingPayment);
  checks.push('Private control rejects anonymous and any Origin; storage 503 recovers with unchanged private bytes; independent review/refund revocations return actual 403; provider query timeout returns actual 503 then original payment reconciles');

  phase = 'private runtime state';
  const state = await snapshot(); state.controlToken = controlToken;
  state.recovery = { unknownPayment: { id: records.unknownPayment.id, operationKey: unknownKey, orderId: records.unknownOrder.id, installmentKey: 'first' },
    unavailablePayment: { operationKey: unavailableKey, orderId: records.unconfiguredOrder.id, installmentKey: 'first', recordCreated: false } };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' }); stateOwned = true;
  assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  console.log(`Isolated PR #15 API ready: ${apiUrl}; control: ${controlUrl}; ${checks.length} targeted checks passed. Private state: ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  Promise.resolve(startupPromise).catch(() => {}).then(cleanup).then(() => process.exit(0), () => {
    console.error(`PR #15 cleanup failed; inspect local schema ${schema}.`); process.exit(1);
  });
});
startupPromise = main();
startupPromise.catch(async e => {
  console.error(`PR #15 test launcher failed during ${phase}: ${e.code || e.name}${e.name === 'AssertionError' ? ' ' + e.message : ''}`);
  await cleanup().catch(() => console.error(`PR #15 cleanup failed; inspect local schema ${schema}.`));
  process.exit(1);
});
