'use strict';

// Local isolated PR19 fixture: real SMS HTTP identities, OWNER/independent
// review, immutable settlement balances, verified sandbox receipts and manual
// evidence workflows. Customer payment, income, receipt and partner payment
// are different real records; explicit synthetic terms are never defaults.
// Only external SMS/storage/payment transports are synthetic. No paid gateway,
// public private-content fallback, real identity or business default is introduced.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const backend = path.resolve(__dirname, '../晶晶日上工程交接包/01_源码/backend_server');
const envFile = process.env.JX_MYSQL_TEST_ENV_FILE || '/Users/yanghaoran/Code/jingjing-ux/.local/mysql/runtime/test-env.json';
const statePath = path.resolve(__dirname, '../.local/pr19-ui-runtime.json');
const apiUrl = 'http://127.0.0.1:3342', controlUrl = 'http://127.0.0.1:3343';
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`, controlToken = crypto.randomBytes(32).toString('hex');
const phones = { payer: '13900009701', recipient: '13900009702', independentReviewer: '13900009703', outsider: '13900009704', member: '13900009705', channelRegistrar: '13900009706', customer: '13900009707' };
const people = {}, records = {}, assets = {}, media = {}, creation = {}, scenarios = {}, checks = [], recovery = [];
const sent = new Map(), files = new Map(), paymentQueries = new Map(), refundQueries = new Map(), grants = new Map();
let db, mysql, connection, providers, grantMaintainer, apiServer, controlServer, mediaDir, startupPromise, cleanupPromise;
let phase = 'configuration', stateOwned = false, schemaCreated = false, payerOrganizationId, ruleId;
let storageAvailable = true, evidenceIntact = true, responseLoss = null, recipientMembershipEnabled = true;
const key = () => crypto.randomUUID(), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const now = Date.now(), validFrom = new Date(now - 86400000).toISOString(), validUntil = new Date(now + 90 * 86400000).toISOString();
const targetScope = purpose => ({ purpose, territory: 'CN', language: 'zh', valid_until: new Date(now + 30 * 86400000).toISOString() });
const operations = {
  agreement: /^\/api\/v1\/finance\/agreements$/, confirmation: /^\/api\/v1\/finance\/records\/[0-9a-f-]{36}\/confirmations$/,
  settlement: /^\/api\/v1\/finance\/agreements\/[0-9a-f-]{36}\/settlements$/, statement: /^\/api\/v1\/finance\/agreements\/[0-9a-f-]{36}\/statements$/,
  receipt: /^\/api\/v1\/finance\/statements\/[0-9a-f-]{36}\/receipts$/, adjustment: /^\/api\/v1\/finance\/agreements\/[0-9a-f-]{36}\/adjustments$/,
  payout: /^\/api\/v1\/finance\/agreements\/[0-9a-f-]{36}\/payouts$/, payoutEvidence: /^\/api\/v1\/finance\/payouts\/[0-9a-f-]{36}\/evidence$/,
  cancellation: /^\/api\/v1\/finance\/payouts\/[0-9a-f-]{36}\/cancellation$/, dispute: /^\/api\/v1\/finance\/records\/[0-9a-f-]{36}\/disputes$/,
  response: /^\/api\/v1\/finance\/disputes\/[0-9a-f-]{36}\/responses$/, decision: /^\/api\/v1\/finance\/disputes\/[0-9a-f-]{36}\/decisions$/,
  review: /^\/api\/v1\/finance\/records\/[0-9a-f-]{36}\/reviews$/, reconciliation: /^\/api\/v1\/finance\/agreements\/[0-9a-f-]{36}\/reconciliations$/,
};
function listen(server, port) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); }); }
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    for (const server of [apiServer, controlServer]) if (server?.listening) {
      try { const close = new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); server.closeAllConnections(); await close; } catch (e) { failures.push(e); }
    }
    try { if (db) await db.close(); } catch (e) { failures.push(e); }
    if (connection) {
      try { if (schemaCreated) await connection.query('DROP DATABASE ' + mysql.escapeId(schema)); } catch (e) { failures.push(e); }
      try { await connection.end(); } catch (e) { failures.push(e); }
    }
    files.clear(); sent.clear(); paymentQueries.clear(); refundQueries.clear();
    try { if (mediaDir) await fs.rm(mediaDir, { recursive: true, force: true }); } catch (e) { failures.push(e); }
    if (!failures.length && stateOwned) try { const saved = JSON.parse(await fs.readFile(statePath, 'utf8')); if (saved.controlToken === controlToken) await fs.unlink(statePath); }
    catch (e) { if (e.code !== 'ENOENT') failures.push(e); }
    if (failures.length) throw new AggregateError(failures, 'PR19_LOCAL_CLEANUP_FAILED');
  })(); return cleanupPromise;
}
async function request(method, route, { person, party, body, operationKey, version, status = 200, headers = {} } = {}) {
  const binary = Buffer.isBuffer(body);
  const response = await fetch(apiUrl + '/api/v1' + route, { method, signal: AbortSignal.timeout(15000), headers: {
    ...(person ? { Authorization: `Bearer ${person.token}` } : {}), ...(party ? { 'X-Acting-Party': party } : {}),
    ...(method === 'GET' || method === 'OPTIONS' ? {} : { 'Idempotency-Key': operationKey || key() }),
    ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
    ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }), ...headers,
  }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const result = (response.headers.get('content-type') || '').includes('application/json') && bytes.length ? JSON.parse(bytes.toString()) : bytes;
  assert((Array.isArray(status) ? status : [status]).includes(response.status), `${method} ${route}: ${response.status} (${result?.error?.code || 'bytes'})`);
  return { body: result, headers: response.headers, status: response.status };
}
const call = async (method, route, options) => (await request(method, route, options)).body.data;
const projectRead = (r, person = people.payer, party = person.actingPartyId) => call('GET', `/projects/records/${r.id || r}`, { person, party });
function summary(row) {
  const d = row.data || (typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json) || {};
  return { id: row.id, kind: row.kind, status: row.current_status, objectVersion: row.object_version, contentSha256: row.content_sha256 || row.data_sha256 || null,
    agreementId: row.agreement_id || null, sourceType: d.source_type || null, sourceId: d.source_id || null, environment: d.environment || null, recipientPartyId: d.recipient_party_id || null, amountMinor: d.amount_minor ?? null, factsSha256: d.facts_sha256 || null, projectId: row.project_id || null, ownerPartyId: row.owner_party_id || null, buyerPartyId: row.buyer_party_id || d.buyer_party_id || null,
    merchantPartyId: row.merchant_party_id || null, orderId: row.order_id || null, parentId: row.parent_id || null,
    currentPlanId: d.current_plan_id || null, currentEditionId: d.current_edition_id || null, productionProjectId: d.production_project_id || null,
    finalVersionId: d.final_version_id || null, roleId: d.role_id || null, editionId: d.edition_id || null, releaseId: d.release_id || null,
    priorReleaseId: d.prior_release_id || null, channelId: d.channel_id || null, outcome: d.outcome || null, stage: d.stage || null };
}
async function snapshot() {
  const rows = [];
  for (const table of ['finance_records', 'project_records', 'production_records', 'trade_records', 'supply_records']) rows.push(...(await db.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
  const all = new Map(rows.map(r => [r.id, r]));
  return { testOnly: true, syntheticOnly: true, pid: process.pid, schema, apiUrl, controlUrl, payerOrganizationId, ruleId,
    accounts: Object.fromEntries(Object.entries(people).map(([name, p]) => [name, { phone: p.phone, accountId: p.accountId, personalPartyId: p.personalPartyId, actingPartyId: p.actingPartyId }])),
    records: Object.fromEntries(Object.entries(records).map(([name, r]) => [name, summary(all.get(r.id) || r)])), allRecords: rows.map(summary),
    assets: Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, { id: a.id, ownerPartyId: a.owner_party_id, purpose: a.purpose, byteSize: a.byte_size, contentSha256: a.content_sha256 }])),
    media: Object.fromEntries(Object.entries(media).map(([name, m]) => [name, { path: m.path, byteSize: m.bytes.length, contentSha256: sha(m.bytes), label: m.label }])),
    creation, scenarios, recovery,
    controls: { storageAvailable, evidenceIntact, recipientMembershipEnabled, nextResponseLoss: responseLoss, reviewerEnabled: grants.get('independentReviewer:FINANCE_REVIEW')?.enabled,
      paymentQueries: Object.fromEntries(paymentQueries), refundQueries: Object.fromEntries(refundQueries) },
    verification: { passed: checks.length, checks },
    limitations: ['机构、演员、作品、脸声同意、6层权利、金额与渠道凭据全是明确合成材料，不是真实商业授权或默认条件。',
      '原制作PRIVATE授权保持原样；公开分享/发行使用本人独立新同意，没有伪造许可或修改历史制作快照。',
      '付款只使用临时RSA2与注入本机传输，实际账单环境为SANDBOX，没有外联网关、真实费用或自动出款。',
      '内部通过只代表可送出；外部结果为合成手工凭据经独立审核的实际状态，不表示真实发行渠道启用。',
      '客户到账、结算应付、渠道收入、银行实收与合作方实付分别通过真实路由记录；全部凭据仅合成测试，不是自动或真实转账。',
      '合作方SETTLEMENT各入口只读本人balances；保留原始content_sha256用于准确版本确认，不把投影JSON冒充原快照文件hash。',
      '本人OWNER撤销/恢复控制仅维护本隔离库合成个人membership，并追加明确fixture审计；UI不能自授OWNER或审核权限。',
      '私有字节与视频仅隔离测试；真实请求成功后一次回复丢失，不改变业务权限或伪造业务状态。'] };
}
async function saveState() {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify({ ...(await snapshot()), controlToken }, null, 2), { flag: stateOwned ? 'w' : 'wx', mode: 0o600 });
  stateOwned = true; await fs.chmod(statePath, 0o600);
}
async function grant(name, action, enabled) {
  const k = `${name}:${action}`, prior = grants.get(k); if (prior?.enabled === enabled) return prior;
  const result = await grantMaintainer(db, { account_id: people[name].accountId, action, enabled, expires_at: null, expected_version: prior?.object_version || 0,
    authority_ref: 'synthetic:pr19-fixture', reason: '仅本次随机隔离库的合成审核授权，不是正式业务许可' }); grants.set(k, result); return result;
}

// A tiny built-in bitmap alphabet keeps the synthetic clips reproducible without
// adding fonts, image packages or a media download. Each sign is burnt into pixels.
async function makeMedia() {
  const alphabet = {
    A:['01110','10001','10001','11111','10001','10001','10001'], C:['01111','10000','10000','10000','10000','10000','01111'],
    D:['11110','10001','10001','10001','10001','10001','11110'], E:['11111','10000','10000','11110','10000','10000','11111'],
    F:['11111','10000','10000','11110','10000','10000','10000'], H:['10001','10001','10001','11111','10001','10001','10001'],
    I:['11111','00100','00100','00100','00100','00100','11111'], L:['10000','10000','10000','10000','10000','10000','11111'],
    N:['10001','11001','10101','10011','10001','10001','10001'], O:['01110','10001','10001','10001','10001','10001','01110'],
    P:['11110','10001','10001','11110','10000','10000','10000'], R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
    V:['10001','10001','10001','10001','10001','01010','00100'], W:['10001','10001','10001','10101','10101','11011','10001'],
    Y:['10001','10001','01010','00100','00100','00100','00100'],
  };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  mediaDir = await fs.mkdtemp(path.resolve(__dirname, '../.local/pr19-ui-media-')); await fs.chmod(mediaDir, 0o700);
  const ffmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']; let executable;
  for (const file of ffmpeg) { try { await fs.access(file); executable = file; break; } catch {} }
  assert(executable, 'Existing ffmpeg is required; no dependency is installed by this fixture.');
  for (const [name, rgb, label] of [['preview', [31, 77, 64], 'PREVIEW'], ['final', [125, 58, 31], 'FINAL FILE']]) {
    const width = 640, height = 360, pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i += 3) { pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2]; }
    for (const [text, y, scale] of [['ISOLATED TEST', 65, 6], ['SYNTHETIC ONLY', 155, 5], [label, 250, 6]]) {
      const start = Math.floor((width - (text.length * 6 - 1) * scale) / 2);
      for (let n = 0; n < text.length; n++) {
        if (text[n] === ' ') continue; assert(alphabet[text[n]]);
        for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if (alphabet[text[n]][row][col] === '1') {
          for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const index = ((y + row * scale + dy) * width + start + n * 6 * scale + col * scale + dx) * 3;
            pixels[index] = 248; pixels[index + 1] = 240; pixels[index + 2] = 220;
          }
        }
      }
    }
    const frame = path.join(mediaDir, name + '.ppm'), clip = path.join(mediaDir, name + '.mp4');
    await fs.writeFile(frame, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]), { mode: 0o600 });
    await promisify(execFile)(executable, ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '15', '-i', frame,
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k', '-shortest', '-movflags', '+faststart', clip], { timeout: 30000, maxBuffer: 10000 });
    await fs.chmod(clip, 0o600); const bytes = await fs.readFile(clip); assert(bytes.length < 256000); assert(bytes.subarray(4, 8).equals(Buffer.from('ftyp')));
    media[name] = { path: clip, bytes, label: `ISOLATED TEST / SYNTHETIC ONLY / ${label}` };
  }
  assert(!media.preview.bytes.equals(media.final.bytes));
  const scriptPath = path.join(mediaDir, 'script.txt'), scriptBytes = Buffer.from('隔离测试剧本：窗前短笺。\n这些文字只验证私有制作版本与客户反馈，不是真实作品。');
  await fs.writeFile(scriptPath, scriptBytes, { mode: 0o600 }); media.script = { path: scriptPath, bytes: scriptBytes, label: '仅隔离测试剧本文字' };
  checks.push('Existing ffmpeg encodes two playable 2-second H264/AAC clips under 256KB; burnt-in isolated/synthetic labels and distinct preview/final bytes; no dependency installation or real person');
}

async function main() {
  assert(process.argv.includes('--test-only'), 'Explicit --test-only required');
  const env = JSON.parse(await fs.readFile(envFile, 'utf8'));
  for (const [field, value] of Object.entries({ NODE_ENV: 'test', DB_CLIENT: 'mysql', MYSQL_HOST: '127.0.0.1', MYSQL_DATABASE: 'jx_dev', MYSQL_USER: 'jx_local' })) assert.equal(env[field], value);
  assert.equal(String(env.MYSQL_PORT), '33316');
  try { await fs.access(statePath); throw Object.assign(new Error('Existing local instance state'), { code: 'PR19_STATE_EXISTS' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise'); grantMaintainer = fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant;
  phase = 'isolated schema migration';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); schemaCreated = true;
  db = await fromBackend('./src/infrastructure/database').openDatabase({ ...env, MYSQL_DATABASE: schema });
  await fromBackend('./src/infrastructure/database/migrator').migrate(db);
  await makeMedia();
  const origins = [5209, 5210, 8777, 8778].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  const storageFactory = () => ({ async put({ key, body, isPrivate }) {
    if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); assert.equal(isPrivate, true); assert(Buffer.isBuffer(body));
    files.set(key, Buffer.from(body)); return { key, size: body.length, sha256: sha(body) };
  }, async getBuffer(key) { if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); const b = files.get(key); return b && (evidenceIntact ? Buffer.from(b) : Buffer.concat([b, Buffer.from('synthetic-corruption')])); } });
  const app = fromBackend('./src/http/account-api').createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'),
    sms: { async call(operation, input) { assert.equal(operation, 'send'); assert(Object.values(phones).includes(input.phone)); sent.set(input.phone, input.code); return { accepted: true, provider_request_id: 'synthetic-pr19-local-only' }; } },
    supplyStorageFactory: storageFactory, supplyEnv: { NODE_ENV: 'test' }, governanceEnvironment: 'SANDBOX',
    tradeProvidersFactory: () => ({ get(code) { assert(providers); return providers.get(code); } }),
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 }, allowedOrigins: origins });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr19-synthetic-transports');
    const selected = responseLoss, route = new URL(req.url, apiUrl).pathname;
    if (selected && req.method === 'POST' && operations[selected.operation].test(route)) {
      const end = res.end.bind(res); let intercepted = false;
      res.end = function (...args) {
        if (!intercepted && res.statusCode === 200 && responseLoss === selected) {
          intercepted = true; responseLoss = null;
          recovery.push({ operation: selected.operation, route, operationKey: req.headers['idempotency-key'], committed: true });
          res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.removeHeader('Content-Length');
          return end(JSON.stringify({ meta: { request_id: req.requestId, actor: null, acting_party: null }, error: { code: 'SERVICE_UNAVAILABLE', message: '隔离测试：原操作已执行但本次回复丢失，请核对原请求', retryable: false, details: [] } }));
        }
        return end(...args);
      };
    }
    app(req, res);
  });
  await listen(apiServer, 3342);
  phase = 'normal SMS identities and OWNER/MEMBER membership';
  for (const [name, phone] of Object.entries(phones)) {
    const c = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const s = await call('POST', '/auth/sessions', { body: { phone, challenge_id: c.challenge_id, code: sent.get(phone) } });
    const p = { phone, accountId: s.account.id, token: s.access_token };
    p.personalPartyId = (await call('GET', '/me/parties', { person: p })).items.find(r => r.party.kind === 'PERSON').party.id;
    p.actingPartyId = p.personalPartyId; people[name] = p;
  }
  const { payer, recipient, independentReviewer, channelRegistrar, outsider, member } = people;
  payerOrganizationId = (await call('POST', '/organizations', { person: payer, body: { display_name: '清风合成项目发起机构（PR19隔离）' } })).party_id;
  payer.actingPartyId = member.actingPartyId = payerOrganizationId;
  const invitation = await call('POST', `/parties/${payerOrganizationId}/invitations`, { person: payer, party: payerOrganizationId, body: { invitee_account_id: member.accountId, expires_at: new Date(now + 86400000).toISOString() } });
  await call('POST', `/parties/${payerOrganizationId}/invitations/${invitation.invitation_id}/responses`, { person: member, party: payerOrganizationId, version: invitation.object_version, body: { decision: 'ACCEPT' } });
  for (const action of ['FINANCE_REVIEW', 'PROJECT_REVIEW', 'TRADE_REVIEW', 'TRADE_REFUND', 'PRODUCTION_REVIEW', 'SUPPLY_REVIEW_PROFILE', 'SUPPLY_REVIEW_RIGHTS', 'SUPPLY_REVIEW_CONTENT', 'SUPPLY_REVIEW_CONSENT']) await grant('independentReviewer', action, true);
  await grant('channelRegistrar', 'PROJECT_REVIEW', true);
  checks.push('Seven normal SMS/account identities; payer organization OWNER and invitation-accepted MEMBER; independent independentReviewer and channel registrar grants with actual audit history');

  phase = 'sandbox payment provider transport';
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tradeEnv = { NODE_ENV: 'test', TRADE_ALIPAY_ENABLED: 'true', TRADE_ALIPAY_APP_ID: 'synthetic.pr19.app', TRADE_ALIPAY_MERCHANT_ID: 'synthetic.pr19.merchant',
    TRADE_ALIPAY_MERCHANT_PARTY_ID: recipient.personalPartyId, TRADE_ALIPAY_PRIVATE_KEY: rsa.privateKey, TRADE_ALIPAY_PUBLIC_KEY: rsa.publicKey,
    TRADE_ALIPAY_NOTIFY_URL: 'https://example.invalid/pr19-never-called', TRADE_ALIPAY_CONFIG_REVISION: 'synthetic.pr19' };
  const alipay = new (fromBackend('alipay-sdk').AlipaySdk)({ appId: tradeEnv.TRADE_ALIPAY_APP_ID, privateKey: rsa.privateKey, alipayPublicKey: rsa.publicKey, signType: 'RSA2', keyType: 'PKCS8', gateway: 'https://example.invalid/never-called' });
  const yuan = n => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  alipay.exec = async (method, input, options) => {
    assert.equal(options.validateSign, true); const b = input.bizContent;
    const [[p]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='PAYMENT'", [b.outTradeNo]); assert(p);
    const d = typeof p.data_json === 'string' ? JSON.parse(p.data_json) : p.data_json;
    if (method === 'alipay.trade.query') { const q = paymentQueries.get(p.id) || 'PENDING'; if (q === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT'); return { code: '10000', outTradeNo: p.id, tradeNo: `synthetic.pr19.${p.id}`, totalAmount: yuan(d.amount_minor), tradeStatus: q === 'SUCCEEDED' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY' }; }
    const [[r]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='REFUND'", [b.outRequestNo]); assert(r);
    const rd = typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json;
    if (method === 'alipay.trade.refund') return { code: '10000', outTradeNo: p.id, tradeNo: rd.transaction_id };
    assert.equal(method, 'alipay.trade.fastpay.refund.query'); const q = refundQueries.get(r.id) || 'PENDING'; if (q === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    return { code: '10000', outTradeNo: p.id, tradeNo: rd.transaction_id, outRequestNo: r.id, refundAmount: yuan(rd.amount_minor), refundStatus: q === 'SUCCEEDED' ? 'REFUND_SUCCESS' : 'REFUND_PROCESSING' };
  };
  providers = fromBackend('./src/modules/trade/providers').createTradeProviders(db, tradeEnv, { alipay });
  const readiness = fromBackend('./src/modules/providers/readiness').createReadinessRepository(db, { authorizeChange: async a => a === 'synthetic.pr19.fixture', verifyEvidence: async i => i.evidence_ref === 'synthetic.pr19.local-transport' });
  await readiness.record({ provider_kind: 'PaymentProvider', provider_code: 'alipay', capability_code: 'order_payment', environment: 'SANDBOX', current_status: 'SANDBOX_VERIFIED',
    config_revision: providers.configuration('ALIPAY').config_revision, expected_version: 0, evidence_ref: 'synthetic.pr19.local-transport', reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr19.fixture' });
  ruleId = key(); const rule = fromBackend('./src/modules/governance/content').createRuleContent({ id: ruleId, rule_key: 'projects.pr19.synthetic', version: '1', terms: { explicit: '仅PR19合成测试规则；金额、渠道和同意不是真实商业默认。' } });
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)', [ruleId, 'projects.pr19.synthetic', '1', JSON.stringify(rule), '2020-01-01 00:00:00', payer.accountId, 'EFFECTIVE']);
  const upload = (p, purpose, text) => call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, { person: p, party: p.actingPartyId, body: Buffer.from(text) });
  const sr = (route, row, extra = {}) => call('POST', `/supply/${route}/${row.id}/reviews`, { person: independentReviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '独立核对合成材料，不证明真人身份或真实权利', ...extra } });
  const tr = row => call('POST', `/trade/records/${row.id}/reviews`, { person: independentReviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '合成交易明确条件的独立审核' } });
  const productionRead = r => call('GET', `/production/records/${r.id || r}`, { person: payer, party: payerOrganizationId });
  const checklist = stage => stage === 'SCRIPT' ? { script_reviewed: true } : { script_reviewed: true, specification_reviewed: true, audio_reviewed: true, branding_reviewed: true };
  const pr = r => call('POST', `/production/records/${r.id}/reviews`, { person: independentReviewer, version: r.object_version, body: { decision: 'APPROVED', reason: '合成制作合同与版本的独立核对', verification: r.kind === 'PROJECT' ? { contract_sha256: r.data.contract_sha256, identity_verified: true, signatures_verified: true, rights_verified: true } : checklist(r.data.stage) } });
  phase = 'real supply and self consent';
  assets.producerProof = await upload(recipient, 'RIGHTS_EVIDENCE', '仅PR19合成演员、原作与制作依据，没有真实人脸声纹或商业授权。');
  assets.sponsorProof = await upload(payer, 'RIGHTS_EVIDENCE', '仅PR19合成项目6层权利、送审材料与外部凭据；不是实际出版授权。');
  assets.channelProof = await upload(channelRegistrar, 'RIGHTS_EVIDENCE', '仅PR19合成渠道登记依据；没有启用外部发行渠道。');
  assets.originalContent = await upload(recipient, 'WORK_CONTENT', '《清风短笺》合成原创文字；只供本地隔离测试。');
  assets.avatarMaterial = await upload(recipient, 'AVATAR_MATERIAL', 'Synthetic actor placeholder, no real face or voice.');
  assets.consentEvidence = await upload(recipient, 'CONSENT_EVIDENCE', '合成个人账号本人主动提交的测试同意；不证明实名。');
  records.producerProfile = await sr('profiles', await call('POST', '/supply/profiles', { person: recipient, party: recipient.personalPartyId, body: { display_name: '清风合成演员与原制作方', description: '仅隔离测试供给身份', evidence_asset_ids: [assets.producerProof.id], previous_profile_id: null } }));
  let work = await call('POST', '/supply/work-versions', { person: recipient, party: recipient.personalPartyId, body: { work_id: null, previous_version_id: null, title: '清风短笺 · 合成原创', kind: 'ORIGINAL', source_version_id: null, project_id: null, content_asset_id: assets.originalContent.id, evidence_ids: [assets.producerProof.id], credits: [{ party_id: recipient.personalPartyId, role: 'RIGHTS_HOLDER', evidence_asset_ids: [assets.producerProof.id] }] } });
  work = await call('POST', `/supply/work-versions/${work.id}/actions`, { person: recipient, party: recipient.personalPartyId, version: work.object_version, body: { action: 'SUBMIT', reason: null } });
  for (const channel of ['RIGHTS', 'CONTENT']) work = await sr('work-versions', work, { channel }); records.originalWork = work;
  records.avatar = await call('POST', '/supply/avatars', { person: recipient, party: recipient.personalPartyId, body: { display_name: 'PR19合成人物资料（无真人）', material_asset_ids: [assets.avatarMaterial.id] } });
  async function consent(name, purposes) { return records[name] = await sr('consents', await call('POST', '/supply/consents', { person: recipient, party: recipient.personalPartyId, body: { consent: { avatar_id: records.avatar.id, subject_party_id: recipient.personalPartyId, features: ['FACE', 'VOICE'], purposes, territories: ['CN'], valid_from: validFrom, valid_until: validUntil, terms: '本人合成测试同意；范围明确，不是真人授权或正式商业默认。', evidence_asset_ids: [assets.consentEvidence.id] } } })); }
  for (const side of ['web', 'app']) { await consent(side + 'PrivateConsent', ['PRIVATE']); await consent(side + 'PublicConsent', ['PUBLIC_SHARE', 'RELEASE']); }
  async function spec(name, kind, amount) { return records[name] = await tr(await call('POST', '/trade/specifications', { person: recipient, party: recipient.personalPartyId, body: { previous_spec_id: null, title: name + ' · PR19合成明确条件', provider_party_id: recipient.personalPartyId, line_kind: kind, unit_minor: amount, currency: 'CNY', specification: { version: 'synthetic.v1', service_tier: '仅合成测试档位', sample_seconds: 20, final_seconds: 90, revision_limit: 2, deliverables: ['合成文字', '可播放合成预览', '不同字节的合成最终文件'], terms: '所有金额、时长、条件只用于隔离样本，不作默认商品。' } } })); }
  await spec('productionSpec', 'PRODUCTION', 10000); await spec('castSpec', 'OTHER', 1001);
  async function order(name, cast = false) {
    const q = await tr(await call('POST', '/trade/quotes', { person: recipient, party: recipient.personalPartyId, body: { buyer_party_id: payerOrganizationId,
      lines: [{ line_id: cast ? 'cast' : 'film', spec_id: records[cast ? 'castSpec' : 'productionSpec'].id, quantity: 1 }],
      installments: cast ? [{ key: 'fee', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'cast', amount_minor: 1001 }], apple_product_id: null }] : [{ key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'film', amount_minor: 4000 }], apple_product_id: null }, { key: 'last', trigger: 'FINAL_ACCEPTED', allocations: [{ line_id: 'film', amount_minor: 6000 }], apple_product_id: null }],
      channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: ruleId, expires_at: new Date(now + 7 * 86400000).toISOString(), payment_window_minutes: 10080, license_reservation_id: null } }));
    records[name + 'Quote'] = q; return records[name + 'Order'] = await call('POST', `/trade/quotes/${q.id}/acceptance`, { person: payer, party: payerOrganizationId, version: q.object_version, body: { quote_sha256: q.content_sha256 } });
  }
  async function pay(o, installment, name) { let p = await call('POST', '/trade/payments', { person: payer, party: payerOrganizationId, body: { order_id: o.id, installment_key: installment } }); paymentQueries.set(p.id, 'SUCCEEDED'); p = await call('POST', `/trade/payments/${p.id}/reconciliation`, { person: payer, party: payerOrganizationId, body: { transaction_id: null } }); assert.equal(p.current_status, 'SUCCEEDED'); assert.equal(p.data.environment, 'SANDBOX'); assert.equal(p.data.proof.amount_minor, p.data.amount_minor); return records[name] = p; }
  async function source(side) {
    const o = await order(side + 'Production'); await pay(o, 'first', side + 'FirstPayment');
    let p = await pr(await call('POST', '/production/projects', { person: recipient, party: recipient.personalPartyId, body: { order_id: o.id, line_id: 'film', script_version_id: work.id, license_project_id: null, assignee_account_id: recipient.accountId, purpose: 'PRIVATE', territory: 'CN', consent_ids: [records[side + 'PrivateConsent'].id], evidence_asset_id: assets.producerProof.id } }));
    records[side + 'ProductionProject'] = p;
    for (const stage of ['SCRIPT', 'SAMPLE', 'ROUGH_CUT', 'FINAL']) {
      const b = stage === 'SCRIPT' ? Buffer.concat([media.script.bytes, Buffer.from('\n' + side + key())]) : media[stage === 'FINAL' ? 'final' : 'preview'].bytes;
      const f = await call('POST', `/production/projects/${p.id}/files?media_type=${stage === 'SCRIPT' ? 'text%2Fplain' : 'video%2Fmp4'}`, { person: recipient, party: recipient.personalPartyId, body: b });
      const preview = stage === 'FINAL' ? await call('POST', `/production/projects/${p.id}/files?media_type=video%2Fmp4`, { person: recipient, party: recipient.personalPartyId, body: media.preview.bytes }) : f;
      p = await productionRead(p);
      const v = await pr(await call('POST', `/production/projects/${p.id}/versions`, { person: recipient, party: recipient.personalPartyId, version: p.object_version, body: { stage, file_id: f.id, preview_file_id: preview.id, note: '仅PR19可播放合成材料；没有真实生产生成' } }));
      records[side + stage + 'Version'] = v;
      await call('POST', `/production/versions/${v.id}/feedback`, { person: payer, party: payerOrganizationId, version: v.object_version, body: { decision: 'ACCEPT', note: '合成客户按实际当前版本逐项验收', checklist: checklist(stage) } });
    }
    await pay(o, 'last', side + 'LastPayment');
    p = await productionRead(p); assert.equal(p.current_status, 'ACCEPTED'); records[side + 'ProductionProject'] = p;
    assert.equal((await call('GET', `/trade/records/${o.id}`, { person: payer, party: payerOrganizationId })).current_status, 'PAID');
    for (const variant of ['preview', 'final']) assert((await request('GET', `/production/versions/${records[side + 'FINALVersion'].id}/content?variant=${variant}`, { person: payer, party: payerOrganizationId })).body.equals(media[variant].bytes));
    return p;
  }
  phase = 'actual accepted paid original productions';
  for (const side of ['web', 'app']) await source(side);
  checks.push('Real approved ORIGINAL work and FACE/VOICE self-consent; two separate PRIVATE productions traverse SCRIPT/SAMPLE/ROUGH_CUT/FINAL review and buyer acceptance; actual sandbox receipts make orders PAID; preview/final private bytes differ and download exactly');

  const approvalFields = fromBackend('./src/modules/projects/release').APPROVAL_CHECKS;
  const reviewBody = (row, decision = 'APPROVED') => ({ decision, reason: '独立核对合成身份、权利、版本与外部凭据；没有实际发行', verification: Object.fromEntries(approvalFields[row.kind].map(k => [k, true])) });
  const review = async (row, decision = 'APPROVED') => call('POST', `/projects/records/${row.id}/reviews`, { person: independentReviewer, version: row.object_version, body: reviewBody(row, decision) });
  const post = async (route, row, body, person = payer, status = 200, operationKey) => request('POST', '/projects' + route, { person, party: person.actingPartyId, body, version: row?.object_version, status, operationKey });
  const take = async promise => (await promise).body.data;
  const decideBody = (c, decision) => ({ decision, content_sha256: decision === 'CONFIRM' ? c.content_sha256 : null, reason: '本人/发起方按合成范围明确决定' });
  async function decide(c, decision, person = payer) { return take(post(`/candidates/${c.id}/decisions`, c, decideBody(c, decision), person)); }
  const confirmerBody = row => ({ content_sha256: row.content_sha256, decision: 'APPROVED', reason: '本人核对当前准确hash和明确职责的合成版本' });
  const confirm = (row, person) => take(post(`/records/${row.id}/confirmations`, row, confirmerBody(row), person));
  async function newChannel(name, approved) { let c = await take(post('/channels', null, { name: name + ' · 合成渠道', channel_reference: 'synthetic:pr19:' + name, submission_requirements: '仅合成材料，没有实际外部API', evidence_asset_id: assets.channelProof.id }, channelRegistrar)); if (approved) c = await review(c); return records[name] = c; }
  phase = 'independent channel review';
  const pendingChannel = await newChannel('verificationChannel', false);
  await request('POST', `/projects/records/${pendingChannel.id}/reviews`, { person: channelRegistrar, version: pendingChannel.object_version, body: reviewBody(pendingChannel), status: 403 });
  records.verificationChannel = await review(pendingChannel); await newChannel('approvedChannel', true);
  for (const side of ['web', 'app']) await newChannel(side + 'ChannelPending', false);

  async function castProject(name, side, state = 'CONFIRMED', free = false, purpose = 'RELEASE') {
    let p = await take(post('/projects', null, { title: name + ' · 合成项目（隔离测试）', scope: targetScope(purpose) })); records[name + 'Project'] = p;
    const r = await take(post(`/projects/${p.id}/roles`, p, { title: free ? '明确零费的合成邀请角色' : '合成出演角色费1001分（非商业默认）', capacity: 1, pricing: 'FIXED', amount_minor: free ? 0 : 1001, terms: free ? '只用于零费邀请演示，不作商业默认' : '合成角色费1001分；独立OTHER订单，不重复计算制作费' })); records[name + 'Role'] = r;
    let c;
    if (state === 'OPEN') return { p, r };
    if (state === 'INVITED') c = await take(post(`/roles/${r.id}/invitations`, r, { invitee_party_id: recipient.personalPartyId }));
    else {
      c = await take(post(`/roles/${r.id}/applications`, r, { avatar_id: records.avatar.id, consent_id: records[side + 'PublicConsent'].id, amount_minor: free ? 0 : 1001, note: '本人基于明确公开/发行新同意的合成报名' }, recipient));
      if (state !== 'APPLIED') c = await decide(c, 'SELECT');
      if (state === 'CONFIRMED') c = await decide(c, 'CONFIRM', recipient);
    }
    records[name + 'Candidate'] = c; p = await projectRead(p); records[name + 'Project'] = p; return { p, r, c };
  }
  async function planInput(name, side, c, purpose = 'RELEASE') {
    let funding = [];
    if (c.data.agreed_amount_minor > 0 || c.data.amount_minor > 0) { const o = await order(name + 'Cast', true); await pay(o, 'fee', name + 'CastPayment'); funding = [{ candidate_id: c.id, order_id: o.id, line_id: 'cast' }]; }
    return { production_project_id: records[side + 'ProductionProject'].id, rights: ['FACE_VOICE', 'ORIGINAL', 'SCRIPT', 'MUSIC', 'ADAPTATION', 'FINAL'].map(layer => ({ layer, holder_party_id: recipient.personalPartyId, evidence_asset_id: assets.sponsorProof.id, purpose, territory: 'CN', valid_until: validUntil, terms: '明确合成' + layer + '权利说明；仅隔离测试，无真实商业授权' })),
      confirmers: [{ party_id: recipient.personalPartyId, responsibility: '本人演员/原制作方/合成权利人核对明确范围与当前hash', after_party_ids: [] }, { party_id: payerOrganizationId, responsibility: '发起方在本人确认后核对合成项目职责', after_party_ids: [recipient.personalPartyId] }], funding, terms: '六层合成权利独立列明；原PRIVATE制作同意不变；公开/发行使用本人新同意；费用不是默认价格。' };
  }
  async function planSet(name, side, stage = 'APPROVED', confirmations = false, started = false) {
    const set = await castProject(name, side); const input = await planInput(name, side, set.c); creation[name] = { ...input, projectId: set.p.id, roleId: set.r.id, candidateId: set.c.id, scope: set.p.data.scope };
    let pl = await take(post(`/projects/${set.p.id}/plans`, await projectRead(set.p), input)); if (stage === 'APPROVED') pl = await review(pl); records[name + 'Plan'] = pl;
    if (confirmations) { await confirm(pl, recipient); await confirm(pl, payer); }
    if (started) records[name + 'Project'] = await take(post(`/projects/${set.p.id}/start`, await projectRead(set.p), {}));
    scenarios[name] = { projectId: set.p.id, roleId: set.r.id, candidateId: set.c.id, planId: pl.id, publicConsentId: records[side + 'PublicConsent'].id, productionProjectId: records[side + 'ProductionProject'].id, finalVersionId: records[side + 'FINALVersion'].id, castOrderId: records[name + 'CastOrder']?.id || null };
    return { ...set, pl };
  }
  async function editionSet(name, side, approved = true, confirmations = false) {
    const set = await planSet(name, side, 'APPROVED', true, true);
    let e = await take(post(`/projects/${set.p.id}/editions`, await projectRead(set.p), { final_version_id: records[side + 'FINALVersion'].id, material_asset_ids: [assets.sponsorProof.id], note: '准确已验收付清FINAL的独立合成发行版本' })); if (approved) e = await review(e);
    records[name + 'Edition'] = e; scenarios[name].editionId = e.id;
    if (confirmations) { await confirm(e, recipient); await confirm(e, payer); } return { ...set, e };
  }
  const releaseBody = prior => ({ channel_id: records.approvedChannel.id, prior_release_id: prior?.id || null, material_asset_ids: [assets.sponsorProof.id], note: '合成送审材料；内部通过只是可送出，不是实际发行' });
  async function releaseSet(name, side, approved = true) {
    const set = await editionSet(name, side, true, true); let r = await take(post(`/projects/${set.p.id}/releases`, await projectRead(set.p), releaseBody())); if (approved) r = await review(r); records[name + 'Release'] = r; scenarios[name].releaseId = r.id; return { ...set, release: r };
  }
  async function external(r, outcome, verified = true) { const current = await projectRead(r); let e = await take(post(`/releases/${r.id}/external-events`, current, { outcome, external_reference: 'synthetic:pr19:' + key(), occurred_at: new Date(now - 1000).toISOString(), evidence_asset_id: assets.sponsorProof.id, note: '合成手工外部依据，必须独立核实；没有实际外部渠道请求' })); if (verified) e = await review(e); return e; }
  phase = 'actual verified release sources';
  for (const side of ['web', 'app']) for (const state of ['Unreceived', 'Partial', 'Paid', 'Corrected', 'StatementPending', 'ReceiptPending', 'Creation']) {
    const name = side + 'Revenue' + state + 'Source', set = await releaseSet(name, side);
    records[name + 'SubmittedEvent'] = await external(set.release, 'SUBMITTED');
    records[name + 'PublishedEvent'] = await external(set.release, 'PUBLISHED'); records[name + 'Release'] = await projectRead(set.release);
    assert.equal(records[name + 'Release'].current_status, 'EXTERNAL_PUBLISHED');
  }
  checks.push('Separate App/Web RELEASE sources genuinely traverse paid accepted original FINAL, six-layer plan, ordered self/owner agreement, fresh edition confirmation, independent internal and external proof reviews; public rights never inferred from original PRIVATE consent');
  // Both seed merchant identities are explicit synthetic accounts. Historical
  // production receipts retain their original merchant party; the UI payment
  // transport is then scoped to the payer organization ORDER sources only.
  tradeEnv.TRADE_ALIPAY_MERCHANT_PARTY_ID = payerOrganizationId;
  providers = fromBackend('./src/modules/trade/providers').createTradeProviders(db, tradeEnv, { alipay });
  await readiness.record({ provider_kind: 'PaymentProvider', provider_code: 'alipay', capability_code: 'order_payment', environment: 'SANDBOX', current_status: 'SANDBOX_VERIFIED', config_revision: providers.configuration('ALIPAY').config_revision,
    expected_version: 1, evidence_ref: 'synthetic.pr19.local-transport', reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr19.fixture' });
  assets.payerProof = assets.sponsorProof; assets.recipientProof = assets.producerProof;
  records.financeSpec = await tr(await call('POST', '/trade/specifications', { person: payer, party: payerOrganizationId, body: { previous_spec_id: null, title: 'PR19合成服务10000分 · 非默认条件', provider_party_id: payerOrganizationId, line_kind: 'OTHER', unit_minor: 10000, currency: 'CNY', specification: { version: 'synthetic.pr19.v1', service_tier: '仅合成财务测试', sample_seconds: 20, final_seconds: 90, revision_limit: 2, deliverables: ['仅合成服务依据'], terms: '明确合成10000分，仅本隔离测试，不是商业默认收费。' } } }));
  const customer = people.customer;
  async function financeOrder(name) {
    const q = await tr(await call('POST', '/trade/quotes', { person: payer, party: payerOrganizationId, body: { buyer_party_id: customer.personalPartyId, lines: [{ line_id: 'service', spec_id: records.financeSpec.id, quantity: 1 }], installments: [{ key: 'full', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'service', amount_minor: 10000 }], apple_product_id: null }], channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: ruleId, expires_at: new Date(now + 7 * 86400000).toISOString(), payment_window_minutes: 10080, license_reservation_id: null, commercial_offer_id: null } }));
    records[name + 'Quote'] = q; const o = await call('POST', `/trade/quotes/${q.id}/acceptance`, { person: customer, party: customer.personalPartyId, version: q.object_version, body: { quote_sha256: q.content_sha256 } }); records[name + 'Order'] = o;
    let p = await call('POST', '/trade/payments', { person: customer, party: customer.personalPartyId, body: { order_id: o.id, installment_key: 'full' } }); paymentQueries.set(p.id, 'SUCCEEDED');
    p = await call('POST', `/trade/payments/${p.id}/reconciliation`, { person: customer, party: customer.personalPartyId, body: { transaction_id: null } }); assert.equal(p.current_status, 'SUCCEEDED'); assert.equal(p.data.environment, 'SANDBOX'); records[name + 'Payment'] = p; return o;
  }
  const read = (r, person = payer, party = person.actingPartyId) => call('GET', `/finance/records/${r.id || r}`, { person, party });
  const fp = (route, row, body, person = payer, status = 200, operationKey) => request('POST', '/finance' + route, { person, party: person.actingPartyId, body, version: row?.object_version, status, operationKey });
  const verification = { parties_verified: true, contract_verified: true, amount_verified: true, evidence_verified: true };
  const freviewBody = (decision = 'APPROVED') => ({ decision, reason: '仅独立核对本隔离合成合同、金额与凭据；不证明实际银行付款', verification });
  const freview = (r, decision = 'APPROVED') => call('POST', `/finance/records/${r.id}/reviews`, { person: independentReviewer, version: r.object_version, body: freviewBody(decision) });
  const fconfirmBody = r => ({ content_sha256: r.content_sha256, decision: 'APPROVED', reason: '本人核对本方份额及原约定；准确原始记录hash，不声称看过他方余额' });
  const fconfirm = (r, p) => take(fp(`/records/${r.id}/confirmations`, r, fconfirmBody(r), p));
  const allConfirm = async r => { for (const party of (r.kind === 'AGREEMENT' ? r.data.parties : (await read(r.agreement_id)).data.parties)) { const p = Object.values(people).find(p => p.actingPartyId === party && p !== member); assert(p); await fconfirm(r, p); } return r; };
  const balances = (g, p = payer) => call('GET', `/finance/agreements/${g.id}/balances`, { person: p, party: p.actingPartyId });
  const rulesFor = revenue => ({ version: 'synthetic.pr19.v1', settlement_at: validFrom, release_condition: 'RECEIVED', terms: revenue ? '仅合成收入分配60%发起方留存、40%本人权利人；账单与实收分开，不是默认比例。' : '仅合成服务分配70%商户留存、30%指定合作方；没有佣金默认、自动转账或默认税率。', lines: [{ line_id: revenue ? 'revenue' : 'service', shares: [{ party_id: payerOrganizationId, bps: revenue ? 6000 : 7000, role: revenue ? 'PRODUCER' : 'SUPPLIER' }, { party_id: recipient.personalPartyId, bps: revenue ? 4000 : 3000, role: revenue ? 'RIGHTSHOLDER' : 'PARTICIPANT' }], deductions: [] }] });
  async function agreement(name, source, revenue = false, stage = 'LIVE') {
    const body = { source_type: revenue ? 'RELEASE' : 'ORDER', source_id: source.id, previous_agreement_id: null, environment: 'SANDBOX', rule_id: ruleId, rules: rulesFor(revenue), evidence_asset_id: assets.payerProof.id }; creation[name] = body;
    let g = await take(fp('/agreements', null, body)); if (stage !== 'IN_REVIEW') g = await freview(g);
    if (stage === 'LIVE') await allConfirm(g); else if (stage === 'CONFIRM') for (const p of revenue ? [payer] : [payer, customer]) await fconfirm(g, p);
    records[name + 'Agreement'] = g; scenarios[name] = { agreementId: g.id, sourceType: revenue ? 'RELEASE' : 'ORDER', sourceId: source.id, payerPartyId: payerOrganizationId, recipientPartyId: recipient.personalPartyId, customerPartyId: revenue ? null : customer.personalPartyId }; return g;
  }
  async function settlement(name, g, stage = 'LIVE') { let s = await take(fp(`/agreements/${g.id}/settlements`, g, { period_reference: 'synthetic.pr19.' + name, note: '合成期间，不预设正式结算周期；保存当期实际来源与余额' })); if (stage !== 'IN_REVIEW') s = await freview(s); if (stage === 'LIVE') await allConfirm(s); else if (stage === 'CONFIRM') for (const p of g.data.source_type === 'RELEASE' ? [payer] : [payer, customer]) await fconfirm(s, p); records[name + 'Settlement'] = s; return s; }
  async function base(name, stage = 'LIVE') { const o = await financeOrder(name), g = await agreement(name, o); const s = await settlement(name, g, stage); return { o, g, s }; }
  const payoutBody = (amount = 1000, proof = assets.recipientProof.id) => ({ recipient_party_id: recipient.personalPartyId, amount_minor: amount, destination_asset_id: proof, note: '明确合成申请金额；获准不代表已付款，不涉及实际账号或银行' });
  async function payout(name, g, stage = 'REQUESTED', amount = 1000) { let p = await take(fp(`/agreements/${g.id}/payouts`, g, payoutBody(amount), recipient)); if (stage !== 'REQUESTED') p = await freview(p); records[name + 'Payout'] = p; return p; }
  const evidenceBody = (p, outcome, ref = 'synthetic.pr19.bank.' + key()) => ({ outcome, amount_minor: p.data.amount_minor, external_reference: ref, occurred_at: new Date(now - 1000).toISOString(), evidence_asset_id: assets.payerProof.id, note: '只有合成银行结果材料；须独立核实后追加账，不声称自动或真实转账' });
  async function outcome(name, p, status, approved = true, ref) { let e = await take(fp(`/payouts/${p.id}/evidence`, await read(p), evidenceBody(p, status, ref))); if (approved) e = await freview(e); records[name + 'PayoutEvidence'] = e; records[name + 'Payout'] = await read(p); return e; }
  const adjustmentBody = (amount = 200) => ({ entries: [{ party_id: payerOrganizationId, amount_minor: -amount }, { party_id: recipient.personalPartyId, amount_minor: amount }], reason: '明确合成零和差额，独立审核后追加，不覆盖旧约定与付款', evidence_asset_id: assets.payerProof.id });
  async function adjustment(name, g, approved = false) { let a = await take(fp(`/agreements/${g.id}/adjustments`, g, adjustmentBody())); if (approved) a = await freview(a); records[name + 'Adjustment'] = a; return a; }
  async function dispute(name, g, state = 'OPEN') { let d = await take(fp(`/records/${g.id}/disputes`, g, { category: 'SETTLEMENT', reason: '合成结算异议，用于独立处理与冻结验证', evidence_asset_ids: [assets.recipientProof.id] }, recipient));
    records[name + 'Response'] = await take(fp(`/disputes/${d.id}/responses`, d, { message: '付款方提交合成补充说明；不自行裁定或假报退款', evidence_asset_ids: [assets.payerProof.id] }));
    if (state !== 'OPEN') d = await call('POST', `/finance/disputes/${d.id}/decisions`, { person: independentReviewer, version: d.object_version, body: { decision: state === 'RESOLVED' ? 'RESUME' : 'ACTION_REQUIRED', reason: '独立核对合成异议处理方向', action_record_id: null } }); records[name + 'Dispute'] = d; return d; }
  phase = 'separate unused app/web finance workflows';
  for (const side of ['web', 'app']) {
    const newOrder = await financeOrder(side + 'Creation'); creation[side] = { orderSourceId: newOrder.id, releaseSourceId: records[side + 'RevenueCreationSourceRelease'].id, ruleId, payerPartyId: payerOrganizationId, recipientPartyId: recipient.personalPartyId, customerPartyId: customer.personalPartyId, payerEvidenceId: assets.payerProof.id, recipientDestinationId: assets.recipientProof.id, orderRules: rulesFor(false), revenueRules: rulesFor(true) };
    for (const [suffix, stage] of [['AgreementPending', 'IN_REVIEW'], ['AgreementConfirm', 'CONFIRM']]) await agreement(side + suffix, await financeOrder(side + suffix), false, stage);
    await base(side + 'SettlementPending', 'IN_REVIEW'); await base(side + 'SettlementConfirm', 'CONFIRM'); await base(side + 'Available');
    for (const [suffix, state] of [['PayoutRequested', 'REQUESTED'], ['PayoutApproved', 'APPROVED'], ['PayoutEvidencePending', 'APPROVED'], ['PayoutPaid', 'PAID'], ['PayoutFailed', 'FAILED'], ['PayoutReturned', 'RETURNED']]) {
      const name = side + suffix, { g } = await base(name), p = await payout(name, g, state === 'REQUESTED' ? 'REQUESTED' : 'APPROVED');
      if (state === 'PAID' || state === 'FAILED' || state === 'RETURNED') await outcome(name, p, state === 'RETURNED' ? 'PAID' : state);
      if (state === 'RETURNED') { records[name + 'OriginalPaidEvidence'] = records[name + 'PayoutEvidence']; await outcome(name, await read(p), 'RETURNED'); }
      if (suffix === 'PayoutEvidencePending') await outcome(name, p, 'PAID', false);
    }
    const { g: ag } = await base(side + 'AdjustmentPending'); await adjustment(side + 'AdjustmentPending', ag);
    for (const state of ['OPEN', 'ACTION_REQUIRED', 'RESOLVED']) { const name = side + (state === 'OPEN' ? 'DisputeOpen' : state === 'RESOLVED' ? 'DisputeResolved' : 'DisputeActionRequired'), { g } = await base(name); await dispute(name, g, state); if (state === 'ACTION_REQUIRED') await adjustment(name, g, true); }
    await base(side + 'RefundReady');
  }
  checks.push('Independent App/Web ORDER agreements, pending agreement/settlement review, recipient-only confirmation, available application, REQUESTED/APPROVED-not-paid, pending PAID proof, genuine PAID/FAILED/RETURNED append-only history, adjustment review and OPEN/ACTION_REQUIRED/RESOLVED disputes; every order source is separately verified SANDBOX customer receipt, every mutable scenario isolated');

  const statementBody = (net = 80000, direction = 'CREDIT', prior = null) => ({ external_reference: 'synthetic.pr19.channel.' + key(), period_start: new Date(now - 31 * 86400000).toISOString(), period_end: validFrom, gross_minor: direction === 'CREDIT' ? net + 20000 : net, refund_minor: direction === 'CREDIT' ? 10000 : 0, channel_fee_minor: direction === 'CREDIT' ? 5000 : 0, tax_minor: direction === 'CREDIT' ? 5000 : 0, direction, original_statement_id: prior?.id || null, evidence_asset_id: assets.payerProof.id, note: '合成渠道账单，明确列出退款/费/税；核实账单不代表银行收款或自动转账' });
  async function statement(name, g, approved = true, body = statementBody()) { let s = await take(fp(`/agreements/${g.id}/statements`, g, body)); if (approved) s = await freview(s); records[name + 'Statement'] = s; return s; }
  const receiptBody = (amount, ref = 'synthetic.pr19.receipt.' + key()) => ({ amount_minor: amount, external_reference: ref, occurred_at: new Date(now - 1000).toISOString(), evidence_asset_id: assets.payerProof.id, note: '独立的合成实际收款依据；登记后仍待复核，不是渠道毛收入' });
  async function receipt(name, s, amount, approved = true, ref) { let r = await take(fp(`/statements/${s.id}/receipts`, s, receiptBody(amount, ref))); if (approved) r = await freview(r); records[name + 'Receipt'] = r; return r; }
  phase = 'release income, separate cash and correction histories';
  for (const side of ['web', 'app']) for (const state of ['Unreceived', 'Partial', 'Paid', 'Corrected', 'StatementPending', 'ReceiptPending']) {
    const name = side + 'Revenue' + state, g = await agreement(name, records[name + 'SourceRelease'], true), s = await statement(name, g, state !== 'StatementPending');
    if (state === 'StatementPending') continue;
    await settlement(name, g);
    if (state === 'ReceiptPending') { await receipt(name, s, 1000, false); assert.equal(records[name + 'Receipt'].current_status, 'IN_REVIEW'); assert.equal((await balances(g)).received_minor, 0); }
    if (state === 'Partial' || state === 'Paid' || state === 'Corrected') { await receipt(name, s, state === 'Partial' ? 30000 : 80000); records[name + 'OriginalSettlement'] = records[name + 'Settlement']; await settlement(name, g); }
    if (state === 'Corrected') { const p = await payout(name, g, 'APPROVED', 29000); await outcome(name, p, 'PAID'); records[name + 'OriginalStatement'] = s; records[name + 'OriginalSettlement'] = records[name + 'Settlement']; await statement(name, g, true, statementBody(10000, 'DEBIT', s)); await settlement(name, g); }
    if (state === 'Unreceived') { const b = await balances(g, recipient); assert.equal(b.receivable_minor, 80000); assert.equal(b.received_minor, 0); assert.equal(b.items[0].accrued_minor, 32000); assert.equal(b.items[0].available_minor, 0); assert.equal(b.items[0].reason_code, 'REVENUE_NOT_RECEIVED'); }
    if (state === 'Partial') { const b = await balances(g); assert.equal(b.receivable_minor, 50000); assert.equal(b.received_minor, 30000); }
    if (state === 'Paid') assert.equal((await balances(g, recipient)).items[0].available_minor, 32000);
    if (state === 'Corrected') { const b = await balances(g, recipient); assert.equal(b.receivable_minor, -10000); assert.equal(b.received_minor, 80000); assert.equal(b.items[0].recovery_due_minor, 1000); }
  }
  checks.push('Real approved RELEASE statement net80000 is accrued income while received0/receivable80000 blocks payout; actual reviewed partial receipt30000 leaves50000; full receipt enables32000 partner amount after new settlement; DEBIT10000 retains original statement/cash and yields negative channel receivable plus actual1000 recovery due after historical29000 payout; no automatic refund or transfer');

  phase = 'own settlement projection and independent review boundaries';
  const projection = await base('verificationProjection', 'CONFIRM'), originalSnapshot = JSON.stringify((await read(projection.s)).data), originalHash = projection.s.content_sha256;
  const recipientRead = await read(projection.s, recipient); assert.equal(recipientRead.data.balances.length, 1); assert.equal(recipientRead.data.balances[0].party_id, recipient.personalPartyId); assert.equal(recipientRead.content_sha256, originalHash);
  const ownList = await call('GET', `/finance/agreements/${projection.g.id}/records?kind=SETTLEMENT&limit=100`, { person: recipient, party: recipient.personalPartyId }); assert.equal(ownList.items[0].data.balances.length, 1);
  const confirmKey = key(), confirmPayload = fconfirmBody(projection.s);
  for (let i = 0; i < 2; i++) { const reply = await take(fp(`/records/${projection.s.id}/confirmations`, projection.s, confirmPayload, recipient, 200, confirmKey)); assert.equal(reply.data.balances.length, 1); assert.equal(reply.content_sha256, originalHash); assert.equal(reply.id, projection.s.id); }
  assert.equal(JSON.stringify((await read(projection.s)).data), originalSnapshot); assert.equal((await read(projection.s, independentReviewer, null)).data.balances.length, 3);
  assert.equal((await balances(projection.g, recipient)).items.length, 1);
  const ownEntries = await call('GET', `/finance/agreements/${projection.g.id}/entries`, { person: recipient, party: recipient.personalPartyId }); assert(ownEntries.items.every(e => e.party_id === recipient.personalPartyId));
  assert.equal((await call('GET', `/finance/records/${projection.s.id}/confirmations`, { person: recipient, party: recipient.personalPartyId })).items.length, 3);
  await request('GET', `/finance/records/${projection.g.id}`, { person: outsider, party: outsider.personalPartyId, status: 404 });
  await request('GET', `/finance/records/${projection.g.id}`, { person: member, party: payerOrganizationId, status: 403 });
  await request('GET', `/finance/records/${records.webPayoutPaidPayout.id}`, { person: customer, party: customer.personalPartyId, status: 404 });
  const hiddenPage = await call('GET', '/finance/agreements?limit=1', { person: outsider, party: outsider.personalPartyId }); assert.equal(hiddenPage.items.length, 0); assert(hiddenPage.next_cursor);
  await grant('payer', 'FINANCE_REVIEW', true); assert.equal((await request('POST', `/finance/records/${records.webAgreementPendingAgreement.id}/reviews`, { person: payer, version: records.webAgreementPendingAgreement.object_version, body: freviewBody(), status: 403 })).body.error.code, 'SELF_REVIEW_FORBIDDEN'); await grant('payer', 'FINANCE_REVIEW', false);
  assert.equal((await balances(records.webPayoutApprovedAgreement, recipient)).items[0].paid_minor, 0); assert.equal((await balances(records.webPayoutPaidAgreement, recipient)).items[0].paid_minor, 1000); assert.equal((await balances(records.webPayoutFailedAgreement, recipient)).items[0].paid_minor, 0); assert.equal((await balances(records.webPayoutReturnedAgreement, recipient)).items[0].paid_minor, 0);
  assert.equal((await balances(projection.g)).items.find(r => r.party_id === payerOrganizationId).meaning, 'MERCHANT_RETAINED_NOT_TRANSFER');
  await fp(`/agreements/${projection.g.id}/payouts`, projection.g, { ...payoutBody(), recipient_party_id: payerOrganizationId, destination_asset_id: assets.payerProof.id }, payer, 409);
  await fp(`/payouts/${records.webPayoutApprovedPayout.id}/evidence`, records.webPayoutApprovedPayout, evidenceBody(records.webPayoutApprovedPayout, 'PAID'), recipient, 403);
  await fp(`/payouts/${records.webPayoutApprovedPayout.id}/cancellation`, records.webPayoutApprovedPayout, { reason: '已批准不得假取消' }, payer, 409);
  checks.push('SETTLEMENT detail/list/confirmation/exact-key replay each projects only recipient balance while preserving immutable original hash/data; payer and independent reviewer retain all3 parties; balances/entries own-only, other payout/customer/outsider/non-OWNER denied; empty filtered cursor preserved; granted payer cannot self-review; approved is paid0, PAID1000, FAILED/RETURNED paid0, merchant income retained and recipient cannot invent payout evidence');

  phase = 'refund, adjustments, comparison and disputes preserve facts';
  const rf = await base('verificationRefund'), oldSettlementJSON = JSON.stringify((await read(rf.s)).data); const rp = await payout('verificationRefund', rf.g, 'APPROVED'); await outcome('verificationRefund', rp, 'PAID');
  let refund = await call('POST', '/trade/refunds', { person: customer, party: customer.personalPartyId, body: { payment_id: records.verificationRefundPayment.id, allocations: [{ line_id: 'service', amount_minor: 9500 }], reason: '明确合成9500分退款；合作方实付不假扣回' } }); refund = await tr(refund); refund = await call('POST', `/trade/refunds/${refund.id}/execution`, { person: independentReviewer, body: {} }); refundQueries.set(refund.id, 'SUCCEEDED');
  records.verificationRefundRefund = await call('POST', `/trade/refunds/${refund.id}/reconciliation`, { person: customer, party: customer.personalPartyId, body: {} });
  assert.equal((await fp(`/agreements/${rf.g.id}/payouts`, rf.g, payoutBody(1), recipient, 409)).body.error.code, 'CURRENT_SETTLEMENT_CONFIRMATION_REQUIRED');
  const updatedRefundSettlement = await settlement('verificationRefundUpdated', rf.g); const rb = (await balances(rf.g, recipient)).items[0]; assert.equal(rb.accrued_minor, 150); assert.equal(rb.paid_minor, 1000); assert.equal(rb.recovery_due_minor, 850); assert.equal(JSON.stringify((await read(rf.s)).data), oldSettlementJSON);
  const adj = await base('verificationAdjustment', 'CONFIRM'), originalAdjustmentJSON = JSON.stringify((await read(adj.s)).data); const a = await adjustment('verificationAdjustment', adj.g, true);
  await fp(`/records/${adj.s.id}/confirmations`, adj.s, fconfirmBody(adj.s), recipient, 409); await settlement('verificationAdjustmentUpdated', adj.g);
  assert.equal((await balances(adj.g, recipient)).items[0].available_minor, 3200); assert.equal(JSON.stringify((await read(adj.s)).data), originalAdjustmentJSON);
  await fp(`/agreements/${adj.g.id}/adjustments`, adj.g, { ...adjustmentBody(), entries: [{ party_id: payerOrganizationId, amount_minor: -201 }, { party_id: recipient.personalPartyId, amount_minor: 200 }] }, payer, 409);
  const disputed = await base('verificationDispute'), dp = await payout('verificationDispute', disputed.g, 'APPROVED'); let d = await dispute('verificationDispute', disputed.g);
  assert.equal((await fp(`/agreements/${disputed.g.id}/payouts`, disputed.g, payoutBody(1), recipient, 409)).body.error.code, 'FINANCE_DISPUTED');
  await outcome('verificationDispute', dp, 'PAID'); assert.equal((await balances(disputed.g, recipient)).items[0].paid_minor, 1000);
  await request('POST', `/finance/disputes/${d.id}/decisions`, { person: recipient, version: d.object_version, body: { decision: 'RESUME', reason: '参与方不得自行裁定', action_record_id: null }, status: 403 });
  await request('POST', `/finance/disputes/${d.id}/decisions`, { person: independentReviewer, version: d.object_version, body: { decision: 'REMEDIED', reason: '无实际依据不能假报补救', action_record_id: null }, status: 409 });
  records.verificationDisputeDispute = await call('POST', `/finance/disputes/${d.id}/decisions`, { person: independentReviewer, version: d.object_version, body: { decision: 'RESUME', reason: '合成争议核验后恢复，保留已实际登记付款', action_record_id: null } });
  await fp(`/disputes/${d.id}/responses`, records.verificationDisputeDispute, { message: '已关闭回复拒绝', evidence_asset_ids: [] }, recipient, 409);
  let remedy = await dispute('verificationRemedy', rf.g); remedy = await call('POST', `/finance/disputes/${remedy.id}/decisions`, { person: independentReviewer, version: remedy.object_version, body: { decision: 'ACTION_REQUIRED', reason: '核对实际退款补救', action_record_id: null } });
  records.verificationRemedyDispute = await call('POST', `/finance/disputes/${remedy.id}/decisions`, { person: independentReviewer, version: remedy.object_version, body: { decision: 'REMEDIED', reason: '引用本订单已成功核实的合成退款，不能冒称自动追回', action_record_id: records.verificationRefundRefund.id } }); assert.equal(records.verificationRemedyDispute.data.decision_history.length, 2);
  const comparison = updatedRefundSettlement.data.source_references.map(r => ({ record_id: r.record_id, direction: r.direction, external_reference: r.external_reference, amount_minor: r.amount_minor }));
  const recBody = { provider: 'ALIPAY', environment: 'SANDBOX', external_reference: 'synthetic.pr19.statement.' + key(), items: comparison, evidence_asset_id: assets.payerProof.id };
  records.verificationReconciliationMatched = await take(fp(`/agreements/${rf.g.id}/reconciliations`, rf.g, recBody)); assert.equal(records.verificationReconciliationMatched.current_status, 'MATCHED');
  records.verificationReconciliationDifferences = await take(fp(`/agreements/${rf.g.id}/reconciliations`, rf.g, { ...recBody, external_reference: key(), items: [] })); assert.equal(records.verificationReconciliationDifferences.current_status, 'DIFFERENCES');
  await fp(`/agreements/${rf.g.id}/reconciliations`, rf.g, { ...recBody, environment: 'PRODUCTION' }, payer, 409); assert.equal((await balances(rf.g, recipient)).items[0].paid_minor, 1000);
  for (const side of ['web', 'app']) { const g = records[side + 'AvailableAgreement'], p = records[side + 'AvailablePayment']; creation[side + 'Reconciliation'] = { provider: 'ALIPAY', environment: 'SANDBOX', external_reference: 'synthetic.pr19.ui.' + side, items: [{ record_id: p.id, direction: 'RECEIPT', external_reference: p.data.transaction_id, amount_minor: p.data.amount_minor }], evidence_asset_id: assets.payerProof.id }; }
  const cancelled = await base('verificationCancellation'), cp = await payout('verificationCancellation', cancelled.g); records.verificationCancellationPayout = await take(fp(`/payouts/${cp.id}/cancellation`, cp, { reason: '合成待审申请真实取消，不虚构银行结果' }, recipient)); assert.equal((await balances(cancelled.g, recipient)).items[0].available_minor, 3000);
  checks.push('Actual9500 customer refund creates new source facts/settlement and recovery850 after historical paid1000; stale settlement cannot confirm or pay and old snapshot unchanged; zero-sum approved adjustment forces new confirmation and yields3200; dispute freezes future payouts but admits already-observed manual payment facts, participant cannot decide, remedy must cite actual same-order SUCCEEDED refund; exact verified payment/refund comparison MATCHED or DIFFERENCES does not add money; REQUESTED cancellation releases reserve');

  phase = 'duplicate receipts and own notification cursors';
  const paidRevenue = records.webRevenuePaidAgreement, paidStatement = records.webRevenuePaidStatement, beforeReceipt = await balances(paidRevenue);
  const duplicateRef = records.webRevenuePaidReceipt.data.external_reference;
  const duplicate = await receipt('verificationDuplicateReceipt', paidStatement, 1, false, duplicateRef);
  assert.equal((await request('POST', `/finance/records/${duplicate.id}/reviews`, { person: independentReviewer, version: duplicate.object_version, body: freviewBody(), status: 409 })).body.error.code, 'RECEIPT_EXCEEDS_STATEMENT');
  assert.equal((await balances(paidRevenue)).received_minor, beforeReceipt.received_minor);
  const partialStatement = records.webRevenuePartialStatement, dupBank = await receipt('verificationDuplicateBankReference', partialStatement, 1, false, records.webRevenuePartialReceipt.data.external_reference);
  assert.equal((await request('POST', `/finance/records/${dupBank.id}/reviews`, { person: independentReviewer, version: dupBank.object_version, body: freviewBody(), status: 409 })).body.error.code, 'EXTERNAL_REFERENCE_ALREADY_USED');
  const empty = await call('GET', '/finance/notifications?limit=100', { person: outsider, party: outsider.personalPartyId }); assert.equal(empty.items.length, 0);
  let notifications = await call('GET', '/finance/notifications?limit=100', { person: recipient, party: recipient.personalPartyId }), cursor = '0';
  do { if (notifications.items.length) cursor = notifications.items.at(-1).id; if (!notifications.next_cursor) break; notifications = await call('GET', `/finance/notifications?limit=100&cursor=${notifications.next_cursor}`, { person: recipient, party: recipient.personalPartyId }); } while (true);
  const nd = await dispute('verificationNotification', projection.g); const delta = await call('GET', `/finance/notifications?limit=100&cursor=${cursor}`, { person: recipient, party: recipient.personalPartyId }); assert(delta.items.some(n => n.record_id === nd.id && n.event_code === 'DISPUTE_CREATED')); assert(delta.items.every(n => Number(n.id) > Number(cursor)));
  records.verificationNotificationDispute = await call('POST', `/finance/disputes/${nd.id}/decisions`, { person: independentReviewer, version: nd.object_version, body: { decision: 'RESUME', reason: '合成通知测试关闭不影响权限验证', action_record_id: null } });
  const auto = await call('GET', `/finance/agreements/${projection.g.id}/readiness`, { person: recipient, party: recipient.personalPartyId }); assert.equal(auto.automatic_payout.current_status, 'NOT_IMPLEMENTED'); assert.equal(auto.manual_payment.current_status, 'IMPLEMENTED');
  checks.push('Receipt overstatement and duplicate bank reference reject independent approval without increasing cash; each party uses its own incremental notification cursor, outsider feed empty; per-agreement automatic payout is genuinely NOT_IMPLEMENTED while manual evidence registration is separately IMPLEMENTED');

  phase = 'private controls, revocation and original request recovery';
  async function recipientMembership(enabled) {
    if (recipientMembershipEnabled === enabled) return;
    await db.withTransaction(async tx => {
      const [[m]] = await tx.execute("SELECT * FROM party_memberships WHERE account_id=? AND party_id=? AND role_code='OWNER' FOR UPDATE", [recipient.accountId, recipient.personalPartyId]); assert(m);
      await tx.execute("UPDATE party_memberships SET current_status=?,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?", [enabled ? 'ACTIVE' : 'REVOKED', m.id]);
      await tx.execute('INSERT INTO party_audit_events(id,party_id,actor_account_id,event_code,object_id,object_version,request_id) VALUES (?,?,?,?,?,?,?)', [key(), recipient.personalPartyId, independentReviewer.accountId, enabled ? 'PR19_FIXTURE_OWNER_RESTORED' : 'PR19_FIXTURE_OWNER_REVOKED', m.id, m.object_version + 1, key()]);
    }); recipientMembershipEnabled = enabled;
  }
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) { res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return; }
    try {
      const u = new URL(req.url, controlUrl), get = k => u.searchParams.get(k); let out;
      if (req.method === 'GET' && u.pathname === '/code') { assert(Object.values(phones).includes(get('phone'))); const code = sent.get(get('phone')); res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return; }
      else if (req.method === 'GET' && u.pathname === '/state') out = await snapshot();
      else if (req.method === 'POST' && ['/storage', '/evidence'].includes(u.pathname)) { assert(['true', 'false'].includes(get('enabled'))); if (u.pathname === '/storage') storageAvailable = get('enabled') === 'true'; else evidenceIntact = get('enabled') === 'true'; out = { storageAvailable, evidenceIntact }; }
      else if (req.method === 'POST' && u.pathname === '/reviewer-permission') { assert(['FINANCE_REVIEW', 'TRADE_REVIEW', 'TRADE_REFUND'].includes(get('action'))); assert(['true', 'false'].includes(get('enabled'))); const g = await grant('independentReviewer', get('action'), get('enabled') === 'true'); out = { action: g.action, enabled: g.enabled }; }
      else if (req.method === 'POST' && u.pathname === '/recipient-permission') { assert(['true', 'false'].includes(get('enabled'))); await recipientMembership(get('enabled') === 'true'); out = { recipientMembershipEnabled }; }
      else if (req.method === 'POST' && u.pathname === '/response-loss') { if (get('operation') === 'NONE') responseLoss = null; else { assert(Object.hasOwn(operations, get('operation'))); assert.equal(get('mode'), '503'); responseLoss = { operation: get('operation'), mode: '503' }; } out = { nextResponseLoss: responseLoss }; }
      else if (req.method === 'POST' && ['/payment-query', '/refund-query'].includes(u.pathname)) { assert(['PENDING', 'SUCCEEDED', 'TIMEOUT'].includes(get('result'))); const kind = u.pathname === '/payment-query' ? 'PAYMENT' : 'REFUND', id = get(kind === 'PAYMENT' ? 'payment_id' : 'refund_id'); const [[r]] = await db.execute('SELECT id FROM trade_records WHERE id=? AND kind=?', [id, kind]); assert(r); (kind === 'PAYMENT' ? paymentQueries : refundQueries).set(id, get('result')); out = { id, result: get('result') }; }
      else { res.writeHead(404); res.end('{"error":"NOT_FOUND"}'); return; }
      if (stateOwned && req.method === 'POST') await saveState(); res.end(JSON.stringify(out));
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, 3343);
  const control = async route => { const r = await fetch(controlUrl + route, { method: 'POST', headers: { Authorization: `Bearer ${controlToken}` } }); assert.equal(r.status, 200); return r.json(); };
  assert.equal((await fetch(controlUrl + '/state')).status, 403); assert.equal((await fetch(controlUrl + '/state', { headers: { Authorization: `Bearer ${controlToken}`, Origin: origins[0] } })).status, 403);
  await control('/reviewer-permission?action=FINANCE_REVIEW&enabled=false'); await request('GET', `/finance/records/${projection.g.id}`, { person: independentReviewer, status: 403 }); await control('/reviewer-permission?action=FINANCE_REVIEW&enabled=true'); await read(projection.g, independentReviewer, null);
  await control('/recipient-permission?enabled=false');
  await request('GET', `/finance/records/${projection.s.id}`, { person: recipient, party: recipient.personalPartyId, status: 403 });
  await request('GET', `/finance/agreements/${projection.g.id}/records?kind=SETTLEMENT`, { person: recipient, party: recipient.personalPartyId, status: 403 });
  await fp(`/records/${projection.s.id}/confirmations`, projection.s, confirmPayload, recipient, 403, confirmKey);
  await control('/recipient-permission?enabled=true'); assert.equal((await take(fp(`/records/${projection.s.id}/confirmations`, projection.s, confirmPayload, recipient, 200, confirmKey))).data.balances.length, 1);
  const proofRoute = `/finance/records/${projection.g.id}/evidence/${assets.payerProof.id}`;
  await request('GET', proofRoute, { person: recipient, party: recipient.personalPartyId, status: 403 }); await request('GET', proofRoute, { person: outsider, party: outsider.personalPartyId, status: 404 });
  const proof = await request('GET', proofRoute, { person: independentReviewer }); assert.equal(proof.body.length, assets.payerProof.byte_size); assert.equal(sha(proof.body), assets.payerProof.content_sha256); assert.equal(proof.headers.get('cache-control'), 'no-store'); assert.equal(proof.headers.get('x-content-type-options'), 'nosniff');
  await control('/evidence?enabled=false'); await request('GET', proofRoute, { person: payer, party: payerOrganizationId, status: 503 }); await control('/evidence?enabled=true');
  await control('/storage?enabled=false'); await request('GET', proofRoute, { person: payer, party: payerOrganizationId, status: 503 }); await control('/storage?enabled=true'); assert((await request('GET', proofRoute, { person: payer, party: payerOrganizationId })).body.equals(proof.body));
  checks.push('Controls deny anonymous/every Origin, scope to own fixture accounts/schema and append grant/membership audit; independent FINANCE_REVIEW revoke returns403 and restores; actual recipient OWNER revocation blocks detail/list/original-key confirmation replay even with old login token, restore returns own-only projection; private proof permissions, exact size/hash/no-store/nosniff and corrupt/missing503/recovery verified');

  const lost = await base('verificationResponseLoss', 'CONFIRM'), originalKey = key(), originalPayload = fconfirmBody(lost.s);
  await control('/response-loss?operation=confirmation&mode=503'); await fp(`/records/${lost.s.id}/confirmations`, lost.s, originalPayload, recipient, 503, originalKey);
  const recovered = await take(fp(`/records/${lost.s.id}/confirmations`, lost.s, originalPayload, recipient, 200, originalKey)); assert.equal(recovered.id, lost.s.id); assert.equal(recovered.content_sha256, lost.s.content_sha256); assert.equal(recovered.data.balances.length, 1); recovery.at(-1).recordId = recovered.id;
  const [[confirmedOnce]] = await db.execute('SELECT COUNT(*) n FROM finance_confirmations WHERE record_id=? AND party_id=?', [lost.s.id, recipient.personalPartyId]); assert.equal(Number(confirmedOnce.n), 1);
  await fp(`/records/${lost.s.id}/confirmations`, lost.s, { ...originalPayload, reason: '新内容不能占用原编号' }, recipient, 409, originalKey);
  const lp = await payout('verificationResponseLoss', lost.g, 'APPROVED'), le = await outcome('verificationResponseLoss', lp, 'PAID', false), reviewKey = key(), reviewPayload = freviewBody();
  await control('/response-loss?operation=review&mode=503'); await request('POST', `/finance/records/${le.id}/reviews`, { person: independentReviewer, version: le.object_version, body: reviewPayload, operationKey: reviewKey, status: 503 });
  const replayReview = await call('POST', `/finance/records/${le.id}/reviews`, { person: independentReviewer, version: le.object_version, body: reviewPayload, operationKey: reviewKey }); assert.equal(replayReview.id, le.id); assert.equal(replayReview.object_version, le.object_version + 1); assert.equal((await read(lp)).current_status, 'PAID'); recovery.at(-1).recordId = replayReview.id;
  const [[paidOnce]] = await db.execute("SELECT COUNT(*) n FROM finance_entries WHERE source_id=? AND category='PAYOUT'", [le.id]); assert.equal(Number(paidOnce.n), 1);
  await request('POST', `/finance/records/${le.id}/reviews`, { person: independentReviewer, version: le.object_version, body: reviewPayload, status: 412 });
  const concurrent = await base('verificationConcurrentReservations');
  const requests = await Promise.all([1, 2].map(() => fp(`/agreements/${concurrent.g.id}/payouts`, concurrent.g, payoutBody(2000), recipient, [200, 409]))); assert.deepEqual(requests.map(r => r.status).sort(), [200, 409]); records.verificationConcurrentReservationsPayout = requests.find(r => r.status === 200).body.data; assert.equal((await balances(concurrent.g, recipient)).items[0].available_minor, 1000);
  const race = await base('verificationReviewRace'), rpay = await payout('verificationReviewRace', race.g);
  const reviews = await Promise.all([1, 2].map(() => request('POST', `/finance/records/${rpay.id}/reviews`, { person: independentReviewer, version: rpay.object_version, body: freviewBody(), status: [200, 412] }))); assert.deepEqual(reviews.map(r => r.status).sort(), [200, 412]); records.verificationReviewRacePayout = await read(rpay);
  for (const side of ['web', 'app']) { const { g } = await base(side + 'ReviewRaceReady'); await payout(side + 'ReviewRaceReady', g); }
  for (const port of [5209, 5210, 8777, 8778]) { const origin = `http://127.0.0.1:${port}`, r = await request('OPTIONS', '/finance/agreements', { status: 204, headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }); assert.equal(r.headers.get('access-control-allow-origin'), origin); }
  await request('OPTIONS', '/finance/agreements', { status: 403, headers: { Origin: 'https://example.invalid' } });
  checks.push('Actual confirmation and PAID-evidence review each commit then lose one503 reply; original key/body/version exact replay creates only one confirmation/payment journal and keeps recipient projection; changed payload409/stale review412; concurrent2000 requests reserve only one against3000, and simultaneous reviews return200/412; untouched App/Web REQUESTED review races ready; UI loopback CORS only');
  creation.common = { payerPartyId: payerOrganizationId, recipientPartyId: recipient.personalPartyId, customerPartyId: customer.personalPartyId, payerEvidenceId: assets.payerProof.id, recipientDestinationId: assets.recipientProof.id, ruleId,
    statement: statementBody(), receipt: receiptBody(1000), adjustment: adjustmentBody(), reviewVerification: verification, paymentEnvironment: 'SANDBOX', automaticPayout: 'NOT_IMPLEMENTED', originalHashMeaning: 'IMMUTABLE_SOURCE_SNAPSHOT_NOT_PROJECTED_JSON_HASH' };
  phase = 'private runtime state'; await saveState(); assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  const safe = JSON.stringify(await snapshot()); assert.equal(safe.includes(controlToken), false); for (const p of Object.values(people)) assert.equal(safe.includes(p.token), false);
  console.log(`Isolated PR19 API ready: ${apiUrl}; control ${controlUrl}; PID ${process.pid}; schema ${schema}; ${checks.length} actual check groups; private runtime ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { Promise.resolve(startupPromise).catch(() => {}).then(cleanup).then(() => process.exit(0), () => { console.error(`PR19 cleanup failed for own schema ${schema}`); process.exit(1); }); });
startupPromise = main();
startupPromise.catch(async e => { console.error(`PR19 launcher failed during ${phase}: ${e.code || e.name}${e.name === 'AssertionError' ? ' ' + e.message : ''}`); await cleanup().catch(() => console.error(`PR19 cleanup failed for own schema ${schema}`)); process.exit(1); });
