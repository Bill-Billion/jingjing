'use strict';

// Local isolated PR18 fixture: real SMS HTTP identities, OWNER/independent
// review, supply, production, verified sandbox receipts and project workflows.
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
const statePath = path.resolve(__dirname, '../.local/pr18-ui-runtime.json');
const apiUrl = 'http://127.0.0.1:3322', controlUrl = 'http://127.0.0.1:3323';
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`, controlToken = crypto.randomBytes(32).toString('hex');
const phones = { sponsor: '13900009601', producer: '13900009602', reviewer: '13900009603', channelRegistrar: '13900009604', outsider: '13900009605', member: '13900009606' };
const people = {}, records = {}, assets = {}, media = {}, creation = {}, scenarios = {}, checks = [], recovery = [];
const sent = new Map(), files = new Map(), paymentQueries = new Map(), refundQueries = new Map(), grants = new Map();
let db, mysql, connection, providers, grantMaintainer, apiServer, controlServer, mediaDir, startupPromise, cleanupPromise;
let phase = 'configuration', stateOwned = false, schemaCreated = false, sponsorOrganizationId, ruleId;
let storageAvailable = true, evidenceIntact = true, responseLoss = null;
const key = () => crypto.randomUUID(), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const now = Date.now(), validFrom = new Date(now - 86400000).toISOString(), validUntil = new Date(now + 90 * 86400000).toISOString();
const targetScope = purpose => ({ purpose, territory: 'CN', language: 'zh', valid_until: new Date(now + 30 * 86400000).toISOString() });
const operations = {
  project: /^\/api\/v1\/projects\/projects$/, role: /^\/api\/v1\/projects\/projects\/[0-9a-f-]{36}\/roles$/,
  invitation: /^\/api\/v1\/projects\/roles\/[0-9a-f-]{36}\/invitations$/, application: /^\/api\/v1\/projects\/roles\/[0-9a-f-]{36}\/applications$/,
  response: /^\/api\/v1\/projects\/candidates\/[0-9a-f-]{36}\/responses$/, decision: /^\/api\/v1\/projects\/candidates\/[0-9a-f-]{36}\/decisions$/,
  plan: /^\/api\/v1\/projects\/projects\/[0-9a-f-]{36}\/plans$/, start: /^\/api\/v1\/projects\/projects\/[0-9a-f-]{36}\/start$/,
  edition: /^\/api\/v1\/projects\/projects\/[0-9a-f-]{36}\/editions$/, confirmation: /^\/api\/v1\/projects\/records\/[0-9a-f-]{36}\/confirmations$/,
  cancellation: /^\/api\/v1\/projects\/projects\/[0-9a-f-]{36}\/cancellation$/, channel: /^\/api\/v1\/projects\/channels$/,
  review: /^\/api\/v1\/projects\/records\/[0-9a-f-]{36}\/reviews$/, release: /^\/api\/v1\/projects\/projects\/[0-9a-f-]{36}\/releases$/,
  external: /^\/api\/v1\/projects\/releases\/[0-9a-f-]{36}\/external-events$/,
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
    if (failures.length) throw new AggregateError(failures, 'PR18_LOCAL_CLEANUP_FAILED');
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
const read = (r, person = people.sponsor, party = person.actingPartyId) => call('GET', `/projects/records/${r.id || r}`, { person, party });
function summary(row) {
  const d = row.data || (typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json) || {};
  return { id: row.id, kind: row.kind, status: row.current_status, objectVersion: row.object_version, contentSha256: row.content_sha256 || row.data_sha256 || null,
    projectId: row.project_id || null, ownerPartyId: row.owner_party_id || null, buyerPartyId: row.buyer_party_id || d.buyer_party_id || null,
    merchantPartyId: row.merchant_party_id || null, orderId: row.order_id || null, parentId: row.parent_id || null,
    currentPlanId: d.current_plan_id || null, currentEditionId: d.current_edition_id || null, productionProjectId: d.production_project_id || null,
    finalVersionId: d.final_version_id || null, roleId: d.role_id || null, editionId: d.edition_id || null, releaseId: d.release_id || null,
    priorReleaseId: d.prior_release_id || null, channelId: d.channel_id || null, outcome: d.outcome || null, stage: d.stage || null };
}
async function snapshot() {
  const rows = [];
  for (const table of ['project_records', 'production_records', 'trade_records', 'supply_records']) rows.push(...(await db.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
  const all = new Map(rows.map(r => [r.id, r]));
  return { testOnly: true, syntheticOnly: true, pid: process.pid, schema, apiUrl, controlUrl, sponsorOrganizationId, ruleId,
    accounts: Object.fromEntries(Object.entries(people).map(([name, p]) => [name, { phone: p.phone, accountId: p.accountId, personalPartyId: p.personalPartyId, actingPartyId: p.actingPartyId }])),
    records: Object.fromEntries(Object.entries(records).map(([name, r]) => [name, summary(all.get(r.id) || r)])), allRecords: rows.map(summary),
    assets: Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, { id: a.id, ownerPartyId: a.owner_party_id, purpose: a.purpose, byteSize: a.byte_size, contentSha256: a.content_sha256 }])),
    media: Object.fromEntries(Object.entries(media).map(([name, m]) => [name, { path: m.path, byteSize: m.bytes.length, contentSha256: sha(m.bytes), label: m.label }])),
    creation, scenarios, recovery,
    controls: { storageAvailable, evidenceIntact, nextResponseLoss: responseLoss, reviewerEnabled: grants.get('reviewer:PROJECT_REVIEW')?.enabled,
      paymentQueries: Object.fromEntries(paymentQueries), refundQueries: Object.fromEntries(refundQueries) },
    verification: { passed: checks.length, checks },
    limitations: ['机构、演员、作品、脸声同意、6层权利、金额与渠道凭据全是明确合成材料，不是真实商业授权或默认条件。',
      '原制作PRIVATE授权保持原样；公开分享/发行使用本人独立新同意，没有伪造许可或修改历史制作快照。',
      '付款只使用临时RSA2与注入本机传输，实际账单环境为SANDBOX，没有外联网关、真实费用或自动出款。',
      '内部通过只代表可送出；外部结果为合成手工凭据经独立审核的实际状态，不表示真实发行渠道启用。',
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
    authority_ref: 'synthetic:pr18-fixture', reason: '仅本次随机隔离库的合成审核授权，不是正式业务许可' }); grants.set(k, result); return result;
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
  mediaDir = await fs.mkdtemp(path.resolve(__dirname, '../.local/pr18-ui-media-')); await fs.chmod(mediaDir, 0o700);
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
  try { await fs.access(statePath); throw Object.assign(new Error('Existing local instance state'), { code: 'PR18_STATE_EXISTS' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise'); grantMaintainer = fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant;
  phase = 'isolated schema migration';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); schemaCreated = true;
  db = await fromBackend('./src/infrastructure/database').openDatabase({ ...env, MYSQL_DATABASE: schema });
  await fromBackend('./src/infrastructure/database/migrator').migrate(db);
  await makeMedia();
  const origins = [5207, 5208, 8775, 8776].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  const storageFactory = () => ({ async put({ key, body, isPrivate }) {
    if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); assert.equal(isPrivate, true); assert(Buffer.isBuffer(body));
    files.set(key, Buffer.from(body)); return { key, size: body.length, sha256: sha(body) };
  }, async getBuffer(key) { if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); const b = files.get(key); return b && (evidenceIntact ? Buffer.from(b) : Buffer.concat([b, Buffer.from('synthetic-corruption')])); } });
  const app = fromBackend('./src/http/account-api').createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'),
    sms: { async call(operation, input) { assert.equal(operation, 'send'); assert(Object.values(phones).includes(input.phone)); sent.set(input.phone, input.code); return { accepted: true, provider_request_id: 'synthetic-pr18-local-only' }; } },
    supplyStorageFactory: storageFactory, supplyEnv: { NODE_ENV: 'test' }, governanceEnvironment: 'SANDBOX',
    tradeProvidersFactory: () => ({ get(code) { assert(providers); return providers.get(code); } }),
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 }, allowedOrigins: origins });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr18-synthetic-transports');
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
  await listen(apiServer, 3322);
  phase = 'normal SMS identities and OWNER/MEMBER membership';
  for (const [name, phone] of Object.entries(phones)) {
    const c = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const s = await call('POST', '/auth/sessions', { body: { phone, challenge_id: c.challenge_id, code: sent.get(phone) } });
    const p = { phone, accountId: s.account.id, token: s.access_token };
    p.personalPartyId = (await call('GET', '/me/parties', { person: p })).items.find(r => r.party.kind === 'PERSON').party.id;
    p.actingPartyId = p.personalPartyId; people[name] = p;
  }
  const { sponsor, producer, reviewer, channelRegistrar, outsider, member } = people;
  sponsorOrganizationId = (await call('POST', '/organizations', { person: sponsor, body: { display_name: '清风合成项目发起机构（PR18隔离）' } })).party_id;
  sponsor.actingPartyId = member.actingPartyId = sponsorOrganizationId;
  const invitation = await call('POST', `/parties/${sponsorOrganizationId}/invitations`, { person: sponsor, party: sponsorOrganizationId, body: { invitee_account_id: member.accountId, expires_at: new Date(now + 86400000).toISOString() } });
  await call('POST', `/parties/${sponsorOrganizationId}/invitations/${invitation.invitation_id}/responses`, { person: member, party: sponsorOrganizationId, version: invitation.object_version, body: { decision: 'ACCEPT' } });
  for (const action of ['PROJECT_REVIEW', 'TRADE_REVIEW', 'TRADE_REFUND', 'PRODUCTION_REVIEW', 'SUPPLY_REVIEW_PROFILE', 'SUPPLY_REVIEW_RIGHTS', 'SUPPLY_REVIEW_CONTENT', 'SUPPLY_REVIEW_CONSENT']) await grant('reviewer', action, true);
  await grant('channelRegistrar', 'PROJECT_REVIEW', true);
  checks.push('Six normal SMS/account identities; sponsor organization OWNER and invitation-accepted MEMBER; independent reviewer and channel registrar grants with actual audit history');

  phase = 'sandbox payment provider transport';
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tradeEnv = { NODE_ENV: 'test', TRADE_ALIPAY_ENABLED: 'true', TRADE_ALIPAY_APP_ID: 'synthetic.pr18.app', TRADE_ALIPAY_MERCHANT_ID: 'synthetic.pr18.merchant',
    TRADE_ALIPAY_MERCHANT_PARTY_ID: producer.personalPartyId, TRADE_ALIPAY_PRIVATE_KEY: rsa.privateKey, TRADE_ALIPAY_PUBLIC_KEY: rsa.publicKey,
    TRADE_ALIPAY_NOTIFY_URL: 'https://example.invalid/pr18-never-called', TRADE_ALIPAY_CONFIG_REVISION: 'synthetic.pr18' };
  const alipay = new (fromBackend('alipay-sdk').AlipaySdk)({ appId: tradeEnv.TRADE_ALIPAY_APP_ID, privateKey: rsa.privateKey, alipayPublicKey: rsa.publicKey, signType: 'RSA2', keyType: 'PKCS8', gateway: 'https://example.invalid/never-called' });
  const yuan = n => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  alipay.exec = async (method, input, options) => {
    assert.equal(options.validateSign, true); const b = input.bizContent;
    const [[p]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='PAYMENT'", [b.outTradeNo]); assert(p);
    const d = typeof p.data_json === 'string' ? JSON.parse(p.data_json) : p.data_json;
    if (method === 'alipay.trade.query') { const q = paymentQueries.get(p.id) || 'PENDING'; if (q === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT'); return { code: '10000', outTradeNo: p.id, tradeNo: `synthetic.pr18.${p.id}`, totalAmount: yuan(d.amount_minor), tradeStatus: q === 'SUCCEEDED' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY' }; }
    const [[r]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='REFUND'", [b.outRequestNo]); assert(r);
    const rd = typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json;
    if (method === 'alipay.trade.refund') return { code: '10000', outTradeNo: p.id, tradeNo: rd.transaction_id };
    assert.equal(method, 'alipay.trade.fastpay.refund.query'); const q = refundQueries.get(r.id) || 'PENDING'; if (q === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    return { code: '10000', outTradeNo: p.id, tradeNo: rd.transaction_id, outRequestNo: r.id, refundAmount: yuan(rd.amount_minor), refundStatus: q === 'SUCCEEDED' ? 'REFUND_SUCCESS' : 'REFUND_PROCESSING' };
  };
  providers = fromBackend('./src/modules/trade/providers').createTradeProviders(db, tradeEnv, { alipay });
  const readiness = fromBackend('./src/modules/providers/readiness').createReadinessRepository(db, { authorizeChange: async a => a === 'synthetic.pr18.fixture', verifyEvidence: async i => i.evidence_ref === 'synthetic.pr18.local-transport' });
  await readiness.record({ provider_kind: 'PaymentProvider', provider_code: 'alipay', capability_code: 'order_payment', environment: 'SANDBOX', current_status: 'SANDBOX_VERIFIED',
    config_revision: providers.configuration('ALIPAY').config_revision, expected_version: 0, evidence_ref: 'synthetic.pr18.local-transport', reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr18.fixture' });
  ruleId = key(); const rule = fromBackend('./src/modules/governance/content').createRuleContent({ id: ruleId, rule_key: 'projects.pr18.synthetic', version: '1', terms: { explicit: '仅PR18合成测试规则；金额、渠道和同意不是真实商业默认。' } });
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)', [ruleId, 'projects.pr18.synthetic', '1', JSON.stringify(rule), '2020-01-01 00:00:00', sponsor.accountId, 'EFFECTIVE']);
  const upload = (p, purpose, text) => call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, { person: p, party: p.actingPartyId, body: Buffer.from(text) });
  const sr = (route, row, extra = {}) => call('POST', `/supply/${route}/${row.id}/reviews`, { person: reviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '独立核对合成材料，不证明真人身份或真实权利', ...extra } });
  const tr = row => call('POST', `/trade/records/${row.id}/reviews`, { person: reviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '合成交易明确条件的独立审核' } });
  const productionRead = r => call('GET', `/production/records/${r.id || r}`, { person: sponsor, party: sponsorOrganizationId });
  const checklist = stage => stage === 'SCRIPT' ? { script_reviewed: true } : { script_reviewed: true, specification_reviewed: true, audio_reviewed: true, branding_reviewed: true };
  const pr = r => call('POST', `/production/records/${r.id}/reviews`, { person: reviewer, version: r.object_version, body: { decision: 'APPROVED', reason: '合成制作合同与版本的独立核对', verification: r.kind === 'PROJECT' ? { contract_sha256: r.data.contract_sha256, identity_verified: true, signatures_verified: true, rights_verified: true } : checklist(r.data.stage) } });
  phase = 'real supply and self consent';
  assets.producerProof = await upload(producer, 'RIGHTS_EVIDENCE', '仅PR18合成演员、原作与制作依据，没有真实人脸声纹或商业授权。');
  assets.sponsorProof = await upload(sponsor, 'RIGHTS_EVIDENCE', '仅PR18合成项目6层权利、送审材料与外部凭据；不是实际出版授权。');
  assets.channelProof = await upload(channelRegistrar, 'RIGHTS_EVIDENCE', '仅PR18合成渠道登记依据；没有启用外部发行渠道。');
  assets.originalContent = await upload(producer, 'WORK_CONTENT', '《清风短笺》合成原创文字；只供本地隔离测试。');
  assets.avatarMaterial = await upload(producer, 'AVATAR_MATERIAL', 'Synthetic actor placeholder, no real face or voice.');
  assets.consentEvidence = await upload(producer, 'CONSENT_EVIDENCE', '合成个人账号本人主动提交的测试同意；不证明实名。');
  records.producerProfile = await sr('profiles', await call('POST', '/supply/profiles', { person: producer, party: producer.personalPartyId, body: { display_name: '清风合成演员与原制作方', description: '仅隔离测试供给身份', evidence_asset_ids: [assets.producerProof.id], previous_profile_id: null } }));
  let work = await call('POST', '/supply/work-versions', { person: producer, party: producer.personalPartyId, body: { work_id: null, previous_version_id: null, title: '清风短笺 · 合成原创', kind: 'ORIGINAL', source_version_id: null, project_id: null, content_asset_id: assets.originalContent.id, evidence_ids: [assets.producerProof.id], credits: [{ party_id: producer.personalPartyId, role: 'RIGHTS_HOLDER', evidence_asset_ids: [assets.producerProof.id] }] } });
  work = await call('POST', `/supply/work-versions/${work.id}/actions`, { person: producer, party: producer.personalPartyId, version: work.object_version, body: { action: 'SUBMIT', reason: null } });
  for (const channel of ['RIGHTS', 'CONTENT']) work = await sr('work-versions', work, { channel }); records.originalWork = work;
  records.avatar = await call('POST', '/supply/avatars', { person: producer, party: producer.personalPartyId, body: { display_name: 'PR18合成人物资料（无真人）', material_asset_ids: [assets.avatarMaterial.id] } });
  async function consent(name, purposes) { return records[name] = await sr('consents', await call('POST', '/supply/consents', { person: producer, party: producer.personalPartyId, body: { consent: { avatar_id: records.avatar.id, subject_party_id: producer.personalPartyId, features: ['FACE', 'VOICE'], purposes, territories: ['CN'], valid_from: validFrom, valid_until: validUntil, terms: '本人合成测试同意；范围明确，不是真人授权或正式商业默认。', evidence_asset_ids: [assets.consentEvidence.id] } } })); }
  for (const side of ['web', 'app', 'refund', 'withdrawal']) { await consent(side + 'PrivateConsent', ['PRIVATE']); await consent(side + 'PublicConsent', ['PUBLIC_SHARE', 'RELEASE']); }
  async function spec(name, kind, amount) { return records[name] = await tr(await call('POST', '/trade/specifications', { person: producer, party: producer.personalPartyId, body: { previous_spec_id: null, title: name + ' · PR18合成明确条件', provider_party_id: producer.personalPartyId, line_kind: kind, unit_minor: amount, currency: 'CNY', specification: { version: 'synthetic.v1', service_tier: '仅合成测试档位', sample_seconds: 20, final_seconds: 90, revision_limit: 2, deliverables: ['合成文字', '可播放合成预览', '不同字节的合成最终文件'], terms: '所有金额、时长、条件只用于隔离样本，不作默认商品。' } } })); }
  await spec('productionSpec', 'PRODUCTION', 10000); await spec('castSpec', 'OTHER', 1001);
  async function order(name, cast = false) {
    const q = await tr(await call('POST', '/trade/quotes', { person: producer, party: producer.personalPartyId, body: { buyer_party_id: sponsorOrganizationId,
      lines: [{ line_id: cast ? 'cast' : 'film', spec_id: records[cast ? 'castSpec' : 'productionSpec'].id, quantity: 1 }],
      installments: cast ? [{ key: 'fee', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'cast', amount_minor: 1001 }], apple_product_id: null }] : [{ key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'film', amount_minor: 4000 }], apple_product_id: null }, { key: 'last', trigger: 'FINAL_ACCEPTED', allocations: [{ line_id: 'film', amount_minor: 6000 }], apple_product_id: null }],
      channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: ruleId, expires_at: new Date(now + 7 * 86400000).toISOString(), payment_window_minutes: 10080, license_reservation_id: null } }));
    records[name + 'Quote'] = q; return records[name + 'Order'] = await call('POST', `/trade/quotes/${q.id}/acceptance`, { person: sponsor, party: sponsorOrganizationId, version: q.object_version, body: { quote_sha256: q.content_sha256 } });
  }
  async function pay(o, installment, name) { let p = await call('POST', '/trade/payments', { person: sponsor, party: sponsorOrganizationId, body: { order_id: o.id, installment_key: installment } }); paymentQueries.set(p.id, 'SUCCEEDED'); p = await call('POST', `/trade/payments/${p.id}/reconciliation`, { person: sponsor, party: sponsorOrganizationId, body: { transaction_id: null } }); assert.equal(p.current_status, 'SUCCEEDED'); assert.equal(p.data.environment, 'SANDBOX'); assert.equal(p.data.proof.amount_minor, p.data.amount_minor); return records[name] = p; }
  async function source(side) {
    const o = await order(side + 'Production'); await pay(o, 'first', side + 'FirstPayment');
    let p = await pr(await call('POST', '/production/projects', { person: producer, party: producer.personalPartyId, body: { order_id: o.id, line_id: 'film', script_version_id: work.id, license_project_id: null, assignee_account_id: producer.accountId, purpose: 'PRIVATE', territory: 'CN', consent_ids: [records[side + 'PrivateConsent'].id], evidence_asset_id: assets.producerProof.id } }));
    records[side + 'ProductionProject'] = p;
    for (const stage of ['SCRIPT', 'SAMPLE', 'ROUGH_CUT', 'FINAL']) {
      const b = stage === 'SCRIPT' ? Buffer.concat([media.script.bytes, Buffer.from('\n' + side + key())]) : media[stage === 'FINAL' ? 'final' : 'preview'].bytes;
      const f = await call('POST', `/production/projects/${p.id}/files?media_type=${stage === 'SCRIPT' ? 'text%2Fplain' : 'video%2Fmp4'}`, { person: producer, party: producer.personalPartyId, body: b });
      const preview = stage === 'FINAL' ? await call('POST', `/production/projects/${p.id}/files?media_type=video%2Fmp4`, { person: producer, party: producer.personalPartyId, body: media.preview.bytes }) : f;
      p = await productionRead(p);
      const v = await pr(await call('POST', `/production/projects/${p.id}/versions`, { person: producer, party: producer.personalPartyId, version: p.object_version, body: { stage, file_id: f.id, preview_file_id: preview.id, note: '仅PR18可播放合成材料；没有真实生产生成' } }));
      records[side + stage + 'Version'] = v;
      await call('POST', `/production/versions/${v.id}/feedback`, { person: sponsor, party: sponsorOrganizationId, version: v.object_version, body: { decision: 'ACCEPT', note: '合成客户按实际当前版本逐项验收', checklist: checklist(stage) } });
    }
    await pay(o, 'last', side + 'LastPayment');
    p = await productionRead(p); assert.equal(p.current_status, 'ACCEPTED'); records[side + 'ProductionProject'] = p;
    assert.equal((await call('GET', `/trade/records/${o.id}`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'PAID');
    for (const variant of ['preview', 'final']) assert((await request('GET', `/production/versions/${records[side + 'FINALVersion'].id}/content?variant=${variant}`, { person: sponsor, party: sponsorOrganizationId })).body.equals(media[variant].bytes));
    return p;
  }
  phase = 'actual accepted paid original productions';
  for (const side of ['web', 'app', 'refund', 'withdrawal']) await source(side);
  checks.push('Real approved ORIGINAL work and FACE/VOICE self-consent; four separate PRIVATE productions traverse SCRIPT/SAMPLE/ROUGH_CUT/FINAL review and buyer acceptance; actual sandbox receipts make orders PAID; preview/final private bytes differ and download exactly');

  const approvalFields = fromBackend('./src/modules/projects/release').APPROVAL_CHECKS;
  const reviewBody = (row, decision = 'APPROVED') => ({ decision, reason: '独立核对合成身份、权利、版本与外部凭据；没有实际发行', verification: Object.fromEntries(approvalFields[row.kind].map(k => [k, true])) });
  const review = async (row, decision = 'APPROVED') => call('POST', `/projects/records/${row.id}/reviews`, { person: reviewer, version: row.object_version, body: reviewBody(row, decision) });
  const post = async (route, row, body, person = sponsor, status = 200, operationKey) => request('POST', '/projects' + route, { person, party: person.actingPartyId, body, version: row?.object_version, status, operationKey });
  const take = async promise => (await promise).body.data;
  const decideBody = (c, decision) => ({ decision, content_sha256: decision === 'CONFIRM' ? c.content_sha256 : null, reason: '本人/发起方按合成范围明确决定' });
  async function decide(c, decision, person = sponsor) { return take(post(`/candidates/${c.id}/decisions`, c, decideBody(c, decision), person)); }
  const confirmerBody = row => ({ content_sha256: row.content_sha256, decision: 'APPROVED', reason: '本人核对当前准确hash和明确职责的合成版本' });
  const confirm = (row, person) => take(post(`/records/${row.id}/confirmations`, row, confirmerBody(row), person));
  async function newChannel(name, approved) { let c = await take(post('/channels', null, { name: name + ' · 合成渠道', channel_reference: 'synthetic:pr18:' + name, submission_requirements: '仅合成材料，没有实际外部API', evidence_asset_id: assets.channelProof.id }, channelRegistrar)); if (approved) c = await review(c); return records[name] = c; }
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
    if (state === 'INVITED') c = await take(post(`/roles/${r.id}/invitations`, r, { invitee_party_id: producer.personalPartyId }));
    else {
      c = await take(post(`/roles/${r.id}/applications`, r, { avatar_id: records.avatar.id, consent_id: records[side + 'PublicConsent'].id, amount_minor: free ? 0 : 1001, note: '本人基于明确公开/发行新同意的合成报名' }, producer));
      if (state !== 'APPLIED') c = await decide(c, 'SELECT');
      if (state === 'CONFIRMED') c = await decide(c, 'CONFIRM', producer);
    }
    records[name + 'Candidate'] = c; p = await read(p); records[name + 'Project'] = p; return { p, r, c };
  }
  async function planInput(name, side, c, purpose = 'RELEASE') {
    let funding = [];
    if (c.data.agreed_amount_minor > 0 || c.data.amount_minor > 0) { const o = await order(name + 'Cast', true); await pay(o, 'fee', name + 'CastPayment'); funding = [{ candidate_id: c.id, order_id: o.id, line_id: 'cast' }]; }
    return { production_project_id: records[side + 'ProductionProject'].id, rights: ['FACE_VOICE', 'ORIGINAL', 'SCRIPT', 'MUSIC', 'ADAPTATION', 'FINAL'].map(layer => ({ layer, holder_party_id: producer.personalPartyId, evidence_asset_id: assets.sponsorProof.id, purpose, territory: 'CN', valid_until: validUntil, terms: '明确合成' + layer + '权利说明；仅隔离测试，无真实商业授权' })),
      confirmers: [{ party_id: producer.personalPartyId, responsibility: '本人演员/原制作方/合成权利人核对明确范围与当前hash', after_party_ids: [] }, { party_id: sponsorOrganizationId, responsibility: '发起方在本人确认后核对合成项目职责', after_party_ids: [producer.personalPartyId] }], funding, terms: '六层合成权利独立列明；原PRIVATE制作同意不变；公开/发行使用本人新同意；费用不是默认价格。' };
  }
  async function planSet(name, side, stage = 'APPROVED', confirmations = false, started = false) {
    const set = await castProject(name, side); const input = await planInput(name, side, set.c); creation[name] = { ...input, projectId: set.p.id, roleId: set.r.id, candidateId: set.c.id, scope: set.p.data.scope };
    let pl = await take(post(`/projects/${set.p.id}/plans`, await read(set.p), input)); if (stage === 'APPROVED') pl = await review(pl); records[name + 'Plan'] = pl;
    if (confirmations) { await confirm(pl, producer); await confirm(pl, sponsor); }
    if (started) records[name + 'Project'] = await take(post(`/projects/${set.p.id}/start`, await read(set.p), {}));
    scenarios[name] = { projectId: set.p.id, roleId: set.r.id, candidateId: set.c.id, planId: pl.id, publicConsentId: records[side + 'PublicConsent'].id, productionProjectId: records[side + 'ProductionProject'].id, finalVersionId: records[side + 'FINALVersion'].id, castOrderId: records[name + 'CastOrder']?.id || null };
    return { ...set, pl };
  }
  async function editionSet(name, side, approved = true, confirmations = false) {
    const set = await planSet(name, side, 'APPROVED', true, true);
    let e = await take(post(`/projects/${set.p.id}/editions`, await read(set.p), { final_version_id: records[side + 'FINALVersion'].id, material_asset_ids: [assets.sponsorProof.id], note: '准确已验收付清FINAL的独立合成发行版本' })); if (approved) e = await review(e);
    records[name + 'Edition'] = e; scenarios[name].editionId = e.id;
    if (confirmations) { await confirm(e, producer); await confirm(e, sponsor); } return { ...set, e };
  }
  const releaseBody = prior => ({ channel_id: records.approvedChannel.id, prior_release_id: prior?.id || null, material_asset_ids: [assets.sponsorProof.id], note: '合成送审材料；内部通过只是可送出，不是实际发行' });
  async function releaseSet(name, side, approved = true) {
    const set = await editionSet(name, side, true, true); let r = await take(post(`/projects/${set.p.id}/releases`, await read(set.p), releaseBody())); if (approved) r = await review(r); records[name + 'Release'] = r; scenarios[name].releaseId = r.id; return { ...set, release: r };
  }
  async function external(r, outcome, verified = true) { const current = await read(r); let e = await take(post(`/releases/${r.id}/external-events`, current, { outcome, external_reference: 'synthetic:pr18:' + key(), occurred_at: new Date(now - 1000).toISOString(), evidence_asset_id: assets.sponsorProof.id, note: '合成手工外部依据，必须独立核实；没有实际外部渠道请求' })); if (verified) e = await review(e); return e; }
  phase = 'independent app/web unconsumed mutable scenarios';
  for (const side of ['web', 'app']) {
    await castProject(side + 'Catalogue', side, 'OPEN', false, 'PUBLIC_SHARE');
    await castProject(side + 'Invitation', side, 'INVITED', true);
    await castProject(side + 'Applied', side, 'APPLIED'); await castProject(side + 'Selected', side, 'SELECTED');
    await planSet(side + 'PlanPending', side, 'IN_REVIEW'); await planSet(side + 'Confirm', side);
    await planSet(side + 'Ready', side, 'APPROVED', true);
    await editionSet(side + 'EditionPending', side, false); await editionSet(side + 'EditionConfirm', side);
    await releaseSet(side + 'ReleasePending', side, false); await releaseSet(side + 'ReleaseReady', side);
    const pending = await releaseSet(side + 'ExternalPending', side); records[side + 'SubmittedEvent'] = await external(pending.release, 'SUBMITTED');
    records[side + 'PublishedEventPending'] = await external(pending.release, 'PUBLISHED', false);
    const changes = await releaseSet(side + 'Changes', side, false); records[side + 'ChangesRelease'] = await review(changes.release, 'CHANGES_REQUESTED'); records[side + 'ChangesReleasePrior'] = records[side + 'ChangesRelease'];
  }
  checks.push('App/Web have separate untouched catalogue, invitation, APPLIED, SELECTED, plan-review, ordered confirmation, AVAILABLE, edition-review/confirmation, internal submission, ready-to-submit, pending external proof and linked correction scenarios; positive role fees use unique PAID OTHER lines');
  const share = await castProject('publicShareReady', 'web', 'CONFIRMED', false, 'PUBLIC_SHARE');
  const shareInput = await planInput('publicShareReady', 'web', share.c, 'PUBLIC_SHARE');
  records.publicShareReadyPlan = await review(await take(post(`/projects/${share.p.id}/plans`, await read(share.p), shareInput)));
  await confirm(records.publicShareReadyPlan, producer); await confirm(records.publicShareReadyPlan, sponsor);
  creation.publicShareReady = { ...shareInput, projectId: share.p.id, candidateId: share.c.id, roleId: share.r.id };
  assert.equal((await call('GET', `/projects/projects/${share.p.id}/readiness`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'AVAILABLE');
  for (const side of ['web', 'app']) { const fee = await order(side + 'CreationCast', true); await pay(fee, 'fee', side + 'CreationCastPayment'); creation[side] = { productionProjectId: records[side + 'ProductionProject'].id, finalVersionId: records[side + 'FINALVersion'].id, avatarId: records.avatar.id, publicConsentId: records[side + 'PublicConsent'].id, roleAmountMinor: 1001, unusedFundingOrderId: fee.id, fundingLineId: 'cast', fundingUsage: 'ONLY_FOR_ONE_NEW_CONFIRMED_CANDIDATE_NOT_YET_ASSIGNED' }; }

  phase = 'real invitation, permissions and version-bound confirmations';
  const vi = await castProject('verificationInvitation', 'web', 'INVITED', true);
  assert.equal((await read(vi.c)).current_status, 'INVITED');
  const response = { decision: 'ACCEPT', avatar_id: records.avatar.id, consent_id: records.webPublicConsent.id, amount_minor: 0, note: '本人接受邀请仍只是报名，尚未入组' };
  await post(`/candidates/${vi.c.id}/responses`, vi.c, response, outsider, 403);
  let vc = await take(post(`/candidates/${vi.c.id}/responses`, vi.c, response, producer)); assert.equal(vc.current_status, 'APPLIED');
  vc = await decide(vc, 'SELECT'); assert.equal(vc.current_status, 'SELECTED');
  await post(`/candidates/${vc.id}/decisions`, vc, decideBody(vc, 'CONFIRM'), sponsor, 403);
  vc = await decide(vc, 'CONFIRM', producer); records.verificationInvitationCandidate = vc; assert.equal(vc.data.final_confirmed_by, producer.accountId);
  const v = await planSet('verification', 'web', 'IN_REVIEW');
  await grant('sponsor', 'PROJECT_REVIEW', true); await grant('producer', 'PROJECT_REVIEW', true);
  for (const person of [sponsor, producer]) assert.equal((await request('POST', `/projects/records/${v.pl.id}/reviews`, { person, version: v.pl.object_version, body: reviewBody(v.pl), status: 403 })).body.error.code, 'SELF_REVIEW_FORBIDDEN');
  await grant('sponsor', 'PROJECT_REVIEW', false); await grant('producer', 'PROJECT_REVIEW', false);
  await request('GET', `/projects/records/${v.p.id}`, { person: outsider, party: outsider.personalPartyId, status: 404 });
  await request('GET', `/projects/records/${v.c.id}`, { person: outsider, party: outsider.personalPartyId, status: 404 });
  await request('GET', `/projects/records/${v.p.id}`, { person: member, party: sponsorOrganizationId, status: 403 });
  await post('/projects', null, { title: '非OWNER不得创建', scope: targetScope('RELEASE') }, member, 403);
  const catalogue = await call('GET', '/projects/catalogue', { person: outsider }); assert(catalogue.items.length > 0);
  const privateOnly = await post(`/roles/${records.webCatalogueRole.id}/applications`, records.webCatalogueRole, { avatar_id: records.avatar.id, consent_id: records.webPrivateConsent.id, amount_minor: 1001, note: 'PRIVATE不得扩成PUBLIC_SHARE' }, producer, 409);
  assert.equal(privateOnly.body.error.code, 'CAST_CONSENT_NOT_AVAILABLE');
  let vp = await review(v.pl); records.verificationPlan = vp;
  const beforeConfirm = await post(`/records/${vp.id}/confirmations`, vp, confirmerBody(vp), sponsor, 409); assert.equal(beforeConfirm.body.error.code, 'CONFIRMATION_PREDECESSOR_REQUIRED');
  const badHash = await post(`/records/${vp.id}/confirmations`, vp, { ...confirmerBody(vp), content_sha256: '0'.repeat(64) }, producer, 409); assert.equal(badHash.body.error.code, 'CONFIRMATION_VERSION_MISMATCH');
  await confirm(vp, producer); await confirm(vp, sponsor);
  assert.equal((await call('GET', `/projects/records/${vp.id}/confirmations`, { person: sponsor, party: sponsorOrganizationId })).items.length, 2);
  assert.equal((await call('GET', `/projects/projects/${v.p.id}/readiness`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'AVAILABLE');
  records.verificationProject = await take(post(`/projects/${v.p.id}/start`, await read(v.p), {}));
  const row = (await db.execute('SELECT candidate_id FROM project_funding WHERE order_id=? AND line_id=?', [records.verificationCastOrder.id, 'cast']))[0][0]; assert.equal(row.candidate_id, v.c.id);
  const funded = creation.verification;
  const rawPlan = Object.fromEntries(['production_project_id', 'rights', 'confirmers', 'funding', 'terms'].map(k => [k, funded[k]]));
  const fundTest = await castProject('verificationFunding', 'web');
  const testBody = { ...rawPlan, funding: [] };
  assert.equal((await post(`/projects/${fundTest.p.id}/plans`, await read(fundTest.p), testBody, sponsor, 409)).body.error.code, 'CAST_FUNDING_REQUIRED');
  assert.equal((await post(`/projects/${fundTest.p.id}/plans`, await read(fundTest.p), { ...testBody, funding: [{ candidate_id: fundTest.c.id, order_id: records.webProductionOrder.id, line_id: 'film' }] }, sponsor, 409)).body.error.code, 'CAST_FUNDING_NOT_VERIFIED');
  for (const patch of [{ rights: rawPlan.rights.slice(1) }, { confirmers: rawPlan.confirmers.slice(1) }, { confirmers: [...rawPlan.confirmers, { party_id: outsider.personalPartyId, responsibility: '无关主体不得形成否决权', after_party_ids: [] }] }]) await post(`/projects/${fundTest.p.id}/plans`, await read(fundTest.p), { ...testBody, ...patch }, sponsor, [400, 409]);
  checks.push('Actual INVITED→APPLIED→SELECTED→self CONFIRMED with final account identity; outsiders/other actor and same-party non-OWNER rejected; PRIVATE-only consent blocks public casting; even granted sponsor/actor cannot self-review; six rights and exact required signers enforced; predecessor/hash and unique paid OTHER funding checked');

  phase = 'edition history and real external verification';
  let e = await take(post(`/projects/${v.p.id}/editions`, await read(v.p), { final_version_id: records.webFINALVersion.id, material_asset_ids: [assets.sponsorProof.id], note: '验证历史版' })); e = await review(e); await confirm(e, producer); await confirm(e, sponsor); records.verificationOldEdition = e;
  const newer = await review(await take(post(`/projects/${v.p.id}/editions`, await read(v.p), { final_version_id: records.webFINALVersion.id, material_asset_ids: [assets.sponsorProof.id], note: '新发行版不继承旧确认' }))); records.verificationEdition = newer;
  await post(`/records/${e.id}/confirmations`, e, confirmerBody(e), producer, 409);
  assert.equal((await call('GET', `/projects/records/${newer.id}/confirmations`, { person: sponsor, party: sponsorOrganizationId })).items.length, 0);
  await post(`/projects/${v.p.id}/releases`, await read(v.p), releaseBody(), sponsor, 409); await confirm(newer, producer); await confirm(newer, sponsor);
  const history = await releaseSet('history', 'web', false); let hr = await review(history.release, 'CHANGES_REQUESTED'); records.historyInternalChanges = hr;
  hr = await take(post(`/projects/${history.p.id}/releases`, await read(history.p), releaseBody(hr))); hr = await review(hr, 'REJECTED'); records.historyInternalRejected = hr;
  hr = await review(await take(post(`/projects/${history.p.id}/releases`, await read(history.p), releaseBody(hr))));
  const invalid = await external(hr, 'PUBLISHED', false); await request('POST', `/projects/records/${invalid.id}/reviews`, { person: reviewer, version: invalid.object_version, body: reviewBody(invalid), status: 409 });
  assert.equal((await read(hr)).current_status, 'READY_TO_SUBMIT'); records.historyInvalidPublicationClaim = invalid;
  records.historySubmitted = await external(hr, 'SUBMITTED'); hr = await read(hr); assert.equal(hr.current_status, 'EXTERNAL_SUBMITTED');
  records.historyExternalChanges = await external(hr, 'CHANGES_REQUESTED'); hr = await read(hr); assert.equal(hr.current_status, 'EXTERNAL_CHANGES_REQUESTED'); records.historyExternalChangesRelease = hr;
  hr = await review(await take(post(`/projects/${history.p.id}/releases`, await read(history.p), releaseBody(hr))));
  records.historyResubmitted = await external(hr, 'SUBMITTED'); hr = await read(hr); records.historyPublishedEvent = await external(hr, 'PUBLISHED'); hr = await read(hr); assert.equal(hr.current_status, 'EXTERNAL_PUBLISHED'); records.historyPublishedRelease = hr;
  records.historyRelease = hr; scenarios.history.releaseId = hr.id;
  assert((await call('GET', `/projects/projects/${history.p.id}/records?kind=RELEASE&limit=100`, { person: sponsor, party: sponsorOrganizationId })).items.length >= 4);
  const pages = await call('GET', '/projects/projects?limit=1', { person: sponsor, party: sponsorOrganizationId }); assert.equal(pages.items.length, 1); assert(pages.next_cursor); await call('GET', `/projects/projects?limit=1&cursor=${pages.next_cursor}`, { person: sponsor, party: sponsorOrganizationId });
  checks.push('New EDITION retains old record and starts with zero agreements; old hash cannot confirm current version; internal changes/rejection and external corrections retain linked attempts; claimed PUBLISHED stays pending and invalid transition cannot verify; real SUBMITTED then PUBLISHED independent reviews advance actual statuses; private cursor history reads exercised');

  phase = 'refund and self-withdrawal blockers without rewriting history';
  const blocked = await releaseSet('withdrawalBlocked', 'withdrawal'); await external(blocked.release, 'SUBMITTED'); let br = await read(blocked.release); await external(br, 'PUBLISHED'); br = await read(br);
  records.withdrawalPublicConsent = await call('POST', `/supply/consents/${records.withdrawalPublicConsent.id}/withdrawals`, { person: producer, version: records.withdrawalPublicConsent.object_version, body: { reason: '合成本人撤回公开/发行新同意；原PRIVATE制作不变' } });
  assert.equal((await call('GET', `/projects/projects/${blocked.p.id}/readiness`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'BLOCKED');
  records.withdrawalEvent = await external(br, 'WITHDRAWN'); records.withdrawalBlockedRelease = await read(br); assert.equal(records.withdrawalBlockedRelease.current_status, 'EXTERNAL_WITHDRAWN');
  const refunded = await planSet('refundBlocked', 'refund', 'APPROVED', true);
  let refund = await call('POST', '/trade/refunds', { person: sponsor, party: sponsorOrganizationId, body: { payment_id: records.refundFirstPayment.id, allocations: [{ line_id: 'film', amount_minor: 1 }], reason: '明确合成一分部分退款，验证原制作来源与后续发行阻止' } });
  refund = await tr(refund); refund = await call('POST', `/trade/refunds/${refund.id}/execution`, { person: reviewer, body: {} }); refundQueries.set(refund.id, 'SUCCEEDED');
  records.refundBlockedRefund = await call('POST', `/trade/refunds/${refund.id}/reconciliation`, { person: sponsor, party: sponsorOrganizationId, body: {} });
  assert.equal((await call('GET', `/trade/records/${records.refundProductionOrder.id}`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'PARTIALLY_REFUNDED');
  assert.equal((await call('GET', `/projects/projects/${refunded.p.id}/readiness`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'BLOCKED');
  records.webBlockedProject = records.withdrawalBlockedProject; records.webBlockedPlan = records.withdrawalBlockedPlan;
  records.appBlockedProject = records.refundBlockedProject; records.appBlockedPlan = records.refundBlockedPlan;
  scenarios.webBlocked = { ...scenarios.withdrawalBlocked, reason: 'ACTUAL_PUBLIC_CONSENT_WITHDRAWN' };
  scenarios.appBlocked = { ...scenarios.refundBlocked, reason: 'ACTUAL_PRODUCTION_PARTIAL_REFUND' };
  await request('GET', `/production/versions/${records.refundFINALVersion.id}/content?variant=final`, { person: sponsor, party: sponsorOrganizationId, status: 409 });
  const cancelled = await planSet('verificationCancellation', 'web', 'APPROVED', true);
  records.verificationCancellationCandidate = await decide(cancelled.c, 'WITHDRAW', producer);
  assert.equal((await call('GET', `/projects/projects/${cancelled.p.id}/readiness`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'BLOCKED');
  records.verificationCancellationProject = await take(post(`/projects/${cancelled.p.id}/cancellation`, await read(cancelled.p), { reason: '合成取消保留同意与交易历史，不伪造退款' }));
  assert.equal((await call('GET', `/trade/records/${records.verificationCancellationCastOrder.id}`, { person: sponsor, party: sponsorOrganizationId })).current_status, 'PAID');
  checks.push('Self public-consent withdrawal genuinely blocks readiness while original PRIVATE production remains unchanged; verified withdrawal evidence remains allowed; actual one-cent partial refund blocks source/final content and preserves accepted final; candidate withdrawal/cancellation retains history and does not invent refunds');
  const generationReadiness = await call('GET', `/production/projects/${records.webProductionProject.id}/generation-readiness`, { person: producer, party: producer.personalPartyId }); assert.equal(generationReadiness.current_status, 'NOT_ENABLED');
  const [[beforeJobs]] = await db.execute('SELECT COUNT(*) n FROM platform_jobs');
  await request('POST', `/production/projects/${records.webProductionProject.id}/generation`, { person: producer, party: producer.personalPartyId, version: records.webProductionProject.object_version, body: { operation: 'CREATE_LONG_LIVED', avatar_id: records.avatar.id, asset_id: null, consent_id: records.webPrivateConsent.id }, status: 503 });
  const [[afterJobs]] = await db.execute('SELECT COUNT(*) n FROM platform_jobs'), [[generationRecords]] = await db.execute("SELECT COUNT(*) n FROM production_records WHERE kind='GENERATION'"); assert.equal(Number(beforeJobs.n), Number(afterJobs.n)); assert.equal(Number(generationRecords.n), 0);
  checks.push('Separate PUBLIC_SHARE plan is genuinely AVAILABLE with exact six-layer scope and fresh personal consent; unassigned paid OTHER orders support new UI project forms; real default NOT_ENABLED generation returns 503 without creating any job or generation record');

  phase = 'private controls and failure recovery';
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) { res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return; }
    try {
      const u = new URL(req.url, controlUrl), get = k => u.searchParams.get(k); let out;
      if (req.method === 'GET' && u.pathname === '/code') { assert(Object.values(phones).includes(get('phone'))); const code = sent.get(get('phone')); res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return; }
      else if (req.method === 'GET' && u.pathname === '/state') out = await snapshot();
      else if (req.method === 'POST' && ['/storage', '/evidence'].includes(u.pathname)) { assert(['true', 'false'].includes(get('enabled'))); if (u.pathname === '/storage') storageAvailable = get('enabled') === 'true'; else evidenceIntact = get('enabled') === 'true'; out = { storageAvailable, evidenceIntact }; }
      else if (req.method === 'POST' && u.pathname === '/reviewer-permission') { assert.equal(get('action'), 'PROJECT_REVIEW'); assert(['true', 'false'].includes(get('enabled'))); await grant('reviewer', 'PROJECT_REVIEW', get('enabled') === 'true'); out = { action: 'PROJECT_REVIEW', enabled: grants.get('reviewer:PROJECT_REVIEW').enabled }; }
      else if (req.method === 'POST' && u.pathname === '/response-loss') { if (get('operation') === 'NONE') responseLoss = null; else { assert(Object.hasOwn(operations, get('operation'))); assert.equal(get('mode'), '503'); responseLoss = { operation: get('operation'), mode: '503' }; } out = { nextResponseLoss: responseLoss }; }
      else if (req.method === 'POST' && ['/payment-query', '/refund-query'].includes(u.pathname)) { assert(['PENDING', 'SUCCEEDED', 'TIMEOUT'].includes(get('result'))); const kind = u.pathname === '/payment-query' ? 'PAYMENT' : 'REFUND', id = get(kind === 'PAYMENT' ? 'payment_id' : 'refund_id'); const [[r]] = await db.execute('SELECT id FROM trade_records WHERE id=? AND kind=?', [id, kind]); assert(r); (kind === 'PAYMENT' ? paymentQueries : refundQueries).set(id, get('result')); out = { id, result: get('result') }; }
      else { res.writeHead(404); res.end('{"error":"NOT_FOUND"}'); return; }
      if (stateOwned && req.method === 'POST') await saveState(); res.end(JSON.stringify(out));
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, 3323);
  const control = async route => { const r = await fetch(controlUrl + route, { method: 'POST', headers: { Authorization: `Bearer ${controlToken}` } }); assert.equal(r.status, 200); return r.json(); };
  assert.equal((await fetch(controlUrl + '/state')).status, 403); assert.equal((await fetch(controlUrl + '/state', { headers: { Authorization: `Bearer ${controlToken}`, Origin: origins[0] } })).status, 403);
  await control('/reviewer-permission?action=PROJECT_REVIEW&enabled=false'); await request('GET', `/projects/records/${vp.id}`, { person: reviewer, status: 403 });
  await control('/reviewer-permission?action=PROJECT_REVIEW&enabled=true'); await call('GET', `/projects/records/${vp.id}`, { person: reviewer });
  const evidenceRoute = `/projects/records/${vp.id}/evidence/${assets.sponsorProof.id}`;
  for (const person of [producer, outsider]) await request('GET', evidenceRoute, { person, party: person.actingPartyId, status: 403 });
  const proof = await request('GET', evidenceRoute, { person: reviewer }); assert.equal(proof.body.length, assets.sponsorProof.byte_size); assert.equal(sha(proof.body), assets.sponsorProof.content_sha256); assert.equal(proof.headers.get('cache-control'), 'no-store'); assert.equal(proof.headers.get('x-content-type-options'), 'nosniff');
  await control('/evidence?enabled=false'); assert.equal((await request('GET', evidenceRoute, { person: sponsor, party: sponsorOrganizationId, status: 503 })).body.error.code, 'SERVICE_UNAVAILABLE'); await control('/evidence?enabled=true');
  await control('/storage?enabled=false'); await request('GET', evidenceRoute, { person: sponsor, party: sponsorOrganizationId, status: 503 }); await control('/storage?enabled=true'); assert((await request('GET', evidenceRoute, { person: sponsor, party: sponsorOrganizationId })).body.equals(proof.body));
  checks.push('Private controls deny anonymous/every Origin and only alter own fixture grants/transports; reviewer revoke causes actual 403 and restore permits read; other signers cannot download sponsor evidence; exact private size/hash/no-store/nosniff validated; corrupt or missing storage returns 503 then original bytes recover');
  const lost = await castProject('verificationResponseLoss', 'web', 'APPLIED'); const op = key(), original = lost.c, body = decideBody(original, 'SELECT');
  await control('/response-loss?operation=decision&mode=503'); await post(`/candidates/${original.id}/decisions`, original, body, sponsor, 503, op);
  const committed = await read(original); assert.equal(committed.current_status, 'SELECTED'); assert.equal(committed.object_version, original.object_version + 1);
  const replay = await take(post(`/candidates/${original.id}/decisions`, original, body, sponsor, 200, op)); assert.equal(replay.id, committed.id); assert.equal(replay.object_version, committed.object_version); recovery.at(-1).recordId = replay.id;
  await post(`/candidates/${original.id}/decisions`, original, { ...body, reason: '不同内容不可复用原key' }, sponsor, 409, op); await post(`/candidates/${original.id}/decisions`, original, body, sponsor, 412);
  records.verificationResponseLossCandidate = committed;
  const race = await castProject('verificationRace', 'web', 'APPLIED'); const rs = await Promise.all([1, 2].map(() => post(`/candidates/${race.c.id}/decisions`, race.c, decideBody(race.c, 'SELECT'), sponsor, [200, 412]))); assert.deepEqual(rs.map(x => x.status).sort(), [200, 412]); records.verificationRaceCandidate = await read(race.c);
  await castProject('webDecisionRaceReady', 'web', 'APPLIED'); await castProject('appDecisionRaceReady', 'app', 'APPLIED');
  for (const port of [5207, 5208, 8775, 8776]) { const origin = `http://127.0.0.1:${port}`; const r = await request('OPTIONS', '/projects/projects', { status: 204, headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }); assert.equal(r.headers.get('access-control-allow-origin'), origin); }
  await request('OPTIONS', '/projects/projects', { status: 403, headers: { Origin: 'https://example.invalid' } });
  checks.push('Actual successful candidate decision loses one reply as 503 after commit; same original key/body/version replays same record without duplicate or resubmit; changed key content rejects and stale version is 412; independent simultaneous decisions yield one 200/one 412; fresh App/Web race seeds remain APPLIED; configured loopback CORS accepted and foreign rejected');
  creation.common = { producerPartyId: producer.personalPartyId, assigneeAccountId: producer.accountId, avatarId: records.avatar.id, sponsorPartyId: sponsorOrganizationId, evidenceAssetId: assets.sponsorProof.id, channelId: records.approvedChannel.id,
    rightsLayers: ['FACE_VOICE', 'ORIGINAL', 'SCRIPT', 'MUSIC', 'ADAPTATION', 'FINAL'], sourceKind: 'ORIGINAL', licensingRequired: false, reason: '真实原创来源不需要伪造改编许可；原PRIVATE制作与公开同意分别保留' };
  phase = 'private runtime state'; await saveState(); assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  const sanitized = await snapshot(); assert.equal(JSON.stringify(sanitized).includes(controlToken), false); for (const p of Object.values(people)) assert.equal(JSON.stringify(sanitized).includes(p.token), false);
  console.log(`Isolated PR18 API ready: ${apiUrl}; control ${controlUrl}; PID ${process.pid}; schema ${schema}; ${checks.length} actual check groups; private runtime ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { Promise.resolve(startupPromise).catch(() => {}).then(cleanup).then(() => process.exit(0), () => { console.error(`PR18 cleanup failed for own schema ${schema}`); process.exit(1); }); });
startupPromise = main();
startupPromise.catch(async e => { console.error(`PR18 launcher failed during ${phase}: ${e.code || e.name}${e.name === 'AssertionError' ? ' ' + e.message : ''}`); await cleanup().catch(() => console.error(`PR18 cleanup failed for own schema ${schema}`)); process.exit(1); });
