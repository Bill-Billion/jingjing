'use strict';

// Local PR16 integration only: real HTTP/account/OWNER/member/operator checks,
// real isolated MySQL, private bytes, licensing and production/payment gates.
// SMS, private storage and Alipay transport are synthetic. Public generation stays
// disabled; one trusted synthetic recovery scenario uses the actual durable worker.
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
const statePath = path.resolve(__dirname, '../.local/pr16-ui-runtime.json');
const apiUrl = 'http://127.0.0.1:3282', controlUrl = 'http://127.0.0.1:3283';
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const controlToken = crypto.randomBytes(32).toString('hex');
const phones = { seller: '13900009401', buyer: '13900009402', reviewer: '13900009403', producerMember: '13900009404', outsider: '13900009405' };
const sent = new Map(), files = new Map(), paymentQueries = new Map(), refundQueries = new Map();
const people = {}, records = {}, assets = {}, checks = [], scenarios = {}, media = {}, recovery = [];
let creation;
let mysql, connection, db, apiServer, controlServer, startupPromise, cleanupPromise, schemaCreated = false, stateOwned = false;
let mediaDir, organization, ruleId, providers, grantMaintainer, reviewerGrant, storageAvailable = true;
let phase = 'configuration', responseLoss = null, puts = 0;
let recoveryTask, recoveryWorker, recoveryJobs, recoveryApiEnabled = false, recoveryQueryResult = 'TIMEOUT';
const recoveryTransport = { submits: 0, queries: 0 };

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    recoveryWorker?.stop();
    for (const server of [apiServer, controlServer]) {
      if (!server?.listening) continue;
      try { const close = new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); server.closeAllConnections(); await close; }
      catch (e) { failures.push(e); }
    }
    try { if (db) await db.close(); } catch (e) { failures.push(e); }
    if (connection) {
      try { if (schemaCreated) await connection.query('DROP DATABASE ' + mysql.escapeId(schema)); } catch (e) { failures.push(e); }
      try { await connection.end(); } catch (e) { failures.push(e); }
    }
    files.clear(); sent.clear(); paymentQueries.clear(); refundQueries.clear();
    try { if (mediaDir) await fs.rm(mediaDir, { recursive: true, force: true }); } catch (e) { failures.push(e); }
    if (!failures.length && stateOwned) {
      try { await fs.unlink(statePath); } catch (e) { if (e.code !== 'ENOENT') failures.push(e); }
    }
    if (failures.length) throw new AggregateError(failures, 'PR16_LOCAL_CLEANUP_FAILED');
  })();
  return cleanupPromise;
}
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
}
const checklist = stage => stage === 'SCRIPT' ? { script_reviewed: true } : {
  script_reviewed: true, specification_reviewed: true, audio_reviewed: true, branding_reviewed: true,
};
async function request(method, route, { person, party, body, key, version, status = 200, headers = {} } = {}) {
  const binary = Buffer.isBuffer(body);
  const response = await fetch(apiUrl + '/api/v1' + route, { method, signal: AbortSignal.timeout(10000), headers: {
    ...(person ? { Authorization: `Bearer ${person.token}` } : {}), ...(party ? { 'X-Acting-Party': party } : {}),
    ...(method === 'GET' || method === 'OPTIONS' ? {} : { 'Idempotency-Key': key || crypto.randomUUID() }),
    ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
    ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }), ...headers,
  }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const result = (response.headers.get('content-type') || '').includes('application/json') && bytes.length ? JSON.parse(bytes.toString()) : bytes;
  assert.equal(response.status, status, `${method} ${route}: ${response.status} (${result?.error?.code || 'bytes'})`);
  return { body: result, headers: response.headers };
}
const call = async (method, route, options) => (await request(method, route, options)).body.data;
const read = id => call('GET', `/production/records/${id}`, { person: people.seller, party: organization.party_id });
function summary(row) {
  const data = row.data || (typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json) || {};
  return { id: row.id, kind: row.kind, status: row.current_status, objectVersion: row.object_version,
    projectId: row.project_id || null, orderId: row.order_id || null, parentId: row.parent_id || null,
    ownerPartyId: row.owner_party_id || null, buyerPartyId: row.buyer_party_id || data.buyer_party_id || null,
    merchantPartyId: row.merchant_party_id || data.merchant_party_id || null,
    producerPartyId: data.producer_party_id || null, assigneeAccountId: data.assignee_account_id || null,
    stage: data.stage || null, revision: data.revision || null, fileId: data.file_id || null, previewFileId: data.preview_file_id || null,
    current: data.current || null, accepted: data.accepted || null, changeRequests: data.change_requests ?? null,
    byteSize: data.byte_size || null, contentSha256: data.content_sha256 || null,
    jobId: data.job_id || null, operation: data.operation || null, providerCode: data.provider_code || null,
  };
}
async function snapshot() {
  const rows = [];
  for (const table of ['production_records', 'trade_records', 'supply_records', 'license_records']) rows.push(...(await db.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
  const byId = new Map(rows.map(row => [row.id, row]));
  const recoveryJob = recoveryTask ? await recoveryJobs.get(recoveryTask.jobId) : null;
  return { testOnly: true, syntheticOnly: true, pid: process.pid, schema, apiUrl, controlUrl,
    organizationId: organization.party_id, merchantPartyId: organization.party_id, producerPartyId: organization.party_id, ruleId,
    accounts: Object.fromEntries(Object.entries(people).map(([name, person]) => [name, { phone: person.phone, accountId: person.accountId,
      personalPartyId: person.personalPartyId, actingPartyId: ['seller', 'producerMember'].includes(name) ? organization.party_id : person.personalPartyId }])),
    records: Object.fromEntries(Object.entries(records).map(([name, record]) => [name, summary(byId.get(record.id) || record)])),
    assets: Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, { id: asset.id, ownerPartyId: asset.owner_party_id,
      purpose: asset.purpose, byteSize: asset.byte_size, contentSha256: asset.content_sha256 }])),
    allRecords: rows.map(summary), scenarios, creation,
    media: Object.fromEntries(Object.entries(media).map(([name, item]) => [name, { path: item.path, byteSize: item.bytes.length,
      contentSha256: crypto.createHash('sha256').update(item.bytes).digest('hex'), label: item.label }])),
    recovery, recoveryTask: recoveryTask ? { ...recoveryTask, publicProviderEnabled: recoveryApiEnabled, ...recoveryTransport,
      job: { id: recoveryJob.id, status: recoveryJob.status, attempts: recoveryJob.attempts, lastError: recoveryJob.last_error } } : null,
    controls: { storageAvailable, reviewerEnabled: reviewerGrant.enabled, nextResponseLoss: responseLoss,
      paymentQueries: Object.fromEntries(paymentQueries), refundQueries: Object.fromEntries(refundQueries) },
    limitations: ['合成价格、首尾款、时长、修改次数和条款仅本次隔离样本，不是商业默认值。',
      '小视频由本机ffmpeg编码，画面明确ISOLATED TEST / SYNTHETIC ONLY，没有真人或供应商生成内容。',
      '公开数字人供应商保持真实默认NOT_ENABLED；拒绝请求不会创建假generation或job。仅单独恢复样本使用可信合成provider和真实持久任务，不代表真实供应商启用。',
      '合成手工审核不表示真实实名、签署、版权或素材质量已验收。',
      'response-loss只在本次真实HTTP写入成功后丢一次回复；业务权限与数据库状态不改写。'],
    verification: { passed: checks.length, checks },
  };
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
  mediaDir = await fs.mkdtemp(path.resolve(__dirname, '../.local/pr16-ui-media-')); await fs.chmod(mediaDir, 0o700);
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
  assert(process.argv.includes('--test-only'), 'Explicit --test-only is required.');
  const env = JSON.parse(await fs.readFile(envFile, 'utf8'));
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.DB_CLIENT, 'mysql'); assert.equal(env.MYSQL_HOST, '127.0.0.1');
  assert.equal(String(env.MYSQL_PORT), '33316'); assert.equal(env.MYSQL_USER, 'jx_local'); assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  try { await fs.access(statePath); throw Object.assign(new Error('PR16 state already exists'), { code: 'PR16_STATE_EXISTS' }); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise');
  const { openDatabase } = fromBackend('./src/infrastructure/database');
  const { migrate } = fromBackend('./src/infrastructure/database/migrator');
  const { createAccountApi } = fromBackend('./src/http/account-api');
  const { createTradeProviders } = fromBackend('./src/modules/trade/providers');
  const { createReadinessRepository } = fromBackend('./src/modules/providers/readiness');
  grantMaintainer = fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant;
  const { AlipaySdk } = fromBackend('alipay-sdk');
  phase = 'isolated database';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); schemaCreated = true;
  db = await openDatabase({ ...env, MYSQL_DATABASE: schema }); await migrate(db);
  phase = 'synthetic playable files'; await makeMedia();
  const sms = { async call(operation, input) {
    if (operation !== 'send' || !Object.values(phones).includes(input.phone)) throw Object.assign(new Error('Synthetic phones only'), { code: 'SMS_NOT_READY', status: 503 });
    sent.set(input.phone, input.code); return { accepted: true, provider_request_id: 'synthetic-pr16-local-only' };
  }};
  const storageFactory = () => ({ async put({ key, body, isPrivate }) {
    if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); assert.equal(isPrivate, true); assert(Buffer.isBuffer(body));
    puts++; files.set(key, Buffer.from(body)); return { key, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
  }, async getBuffer(key) { if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); const bytes = files.get(key); return bytes && Buffer.from(bytes); } });
  const origins = [5199, 5200, 5201, 5202, 5203, 5204, 5205, 8769, 8770, 8771, 8772, 8773, 8774, 8775].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  const defaultProductionProvider = fromBackend('./src/modules/production/provider').createProductionProvider(db, { NODE_ENV: 'test' });
  const upstreamRequests = new Map(); let recoveryProjectId;
  const recoveryProvider = {
    async descriptor() { return { provider_code: 'synthetic.pr16.recovery', environment: 'SANDBOX', config_revision: 'synthetic.pr16.recovery.v1' }; },
    async assertReady() {},
    async readiness() { return { current_status: 'SERVICE_READY', reason_code: null, ...await this.descriptor() }; },
    async submit(input) {
      assert.equal(input.project_id, recoveryProjectId); assert.equal(input.operation, 'CREATE_LONG_LIVED');
      assert(!upstreamRequests.has(input.request_key)); recoveryTransport.submits++;
      // The synthetic upstream accepts the durable key before its reply is lost.
      upstreamRequests.set(input.request_key, { projectId: input.project_id, operation: input.operation });
      throw new Error('SYNTHETIC_ACCEPTED_BUT_RESPONSE_UNKNOWN');
    },
    async query(input) {
      assert.equal(input.project_id, recoveryProjectId); assert(upstreamRequests.has(input.request_key)); recoveryTransport.queries++;
      if (recoveryQueryResult === 'TIMEOUT') throw new Error('SYNTHETIC_RECONCILIATION_AMBIGUOUS');
      return { request_key: input.request_key, status: 'SUCCEEDED', asset_type: 'LONG_LIVED_AVATAR', asset_ref: 'synthetic.pr16.asset.' + input.request_key };
    },
  };
  const apiProductionProvider = {};
  for (const method of ['descriptor', 'assertReady', 'readiness', 'submit', 'query']) apiProductionProvider[method] = (...args) => {
    const current = recoveryApiEnabled ? recoveryProvider : defaultProductionProvider;
    return current[method](...args);
  };
  const app = createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'), sms, supplyStorageFactory: storageFactory,
    supplyEnv: { NODE_ENV: 'test' }, governanceEnvironment: 'SANDBOX',
    tradeProvidersFactory: () => ({ get(code) { assert(providers); return providers.get(code); } }),
    productionProviderFactory: () => apiProductionProvider,
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 }, allowedOrigins: origins,
  });
  const operations = { assignment: /^\/api\/v1\/production\/projects\/[0-9a-f-]{36}\/assignment$/,
    version: /^\/api\/v1\/production\/projects\/[0-9a-f-]{36}\/versions$/,
    feedback: /^\/api\/v1\/production\/versions\/[0-9a-f-]{36}\/feedback$/,
    review: /^\/api\/v1\/production\/records\/[0-9a-f-]{36}\/reviews$/,
    file: /^\/api\/v1\/production\/projects\/[0-9a-f-]{36}\/files$/,
  };
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr16-synthetic-transports-generation-disabled');
    const selected = responseLoss;
    if (selected && req.method === 'POST' && operations[selected.operation].test(new URL(req.url, apiUrl).pathname)) {
      const end = res.end.bind(res); let intercepted = false;
      res.end = function (...args) {
        if (!intercepted && res.statusCode === 200 && responseLoss === selected) {
          intercepted = true; responseLoss = null;
          recovery.push({ operation: selected.operation, mode: selected.mode, route: new URL(req.url, apiUrl).pathname,
            operationKey: req.headers['idempotency-key'], committed: true });
          if (selected.mode === 'DROP') { req.socket.destroy(); return res; }
          const body = JSON.stringify({ meta: { request_id: req.requestId, actor: null, acting_party: null },
            error: { code: 'SERVICE_UNAVAILABLE', message: '隔离测试：原操作已执行但本次回复丢失，请核对原请求', retryable: false, details: [] } });
          res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.removeHeader('Content-Length'); return end(body);
        }
        return end(...args);
      };
    }
    app(req, res);
  });
  await listen(apiServer, 3282);
  phase = 'normal synthetic SMS login and organization membership';
  for (const [name, phone] of Object.entries(phones)) {
    const challenge = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const session = await call('POST', '/auth/sessions', { body: { phone, challenge_id: challenge.challenge_id, code: sent.get(phone) } });
    const person = { phone, accountId: session.account.id, token: session.access_token };
    const parties = await call('GET', '/me/parties', { person }); person.personalPartyId = parties.items.find(row => row.party.kind === 'PERSON')?.party.id;
    assert(person.personalPartyId); people[name] = person;
  }
  const { seller, buyer, reviewer, producerMember, outsider } = people;
  organization = await call('POST', '/organizations', { person: seller, body: { display_name: '晴川制作工作室（PR16隔离测试）' } });
  const invitation = await call('POST', `/parties/${organization.party_id}/invitations`, { person: seller, party: organization.party_id,
    body: { invitee_account_id: producerMember.accountId, expires_at: new Date(Date.now() + 86400000).toISOString() } });
  await call('POST', `/parties/${organization.party_id}/invitations/${invitation.invitation_id}/responses`, { person: producerMember,
    party: organization.party_id, version: invitation.object_version, body: { decision: 'ACCEPT' } });
  for (const action of ['TRADE_REVIEW', 'TRADE_REFUND', 'PRODUCTION_REVIEW', 'LICENSE_REVIEW', 'SUPPLY_REVIEW_PROFILE', 'SUPPLY_REVIEW_RIGHTS', 'SUPPLY_REVIEW_CONTENT', 'SUPPLY_REVIEW_CONSENT']) {
    const grant = await grantMaintainer(db, { account_id: reviewer.accountId, action, enabled: true, expires_at: null,
      expected_version: 0, authority_ref: 'synthetic:pr16-ui', reason: '仅本次随机隔离数据库的独立审核人，无正式授权' });
    if (action === 'PRODUCTION_REVIEW') reviewerGrant = { version: grant.object_version, enabled: true };
  }
  checks.push('Five normal SMS/account logins; actual organization OWNER and invitation-accepted producer MEMBER; reviewer has independent scoped grants; outsider is a separate account');

  phase = 'synthetic Alipay transport through existing trade provider';
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tradeEnv = { NODE_ENV: 'test', TRADE_ALIPAY_ENABLED: 'true', TRADE_ALIPAY_APP_ID: 'synthetic.pr16.app',
    TRADE_ALIPAY_MERCHANT_ID: 'synthetic.pr16.merchant', TRADE_ALIPAY_MERCHANT_PARTY_ID: organization.party_id,
    TRADE_ALIPAY_PRIVATE_KEY: rsa.privateKey, TRADE_ALIPAY_PUBLIC_KEY: rsa.publicKey,
    TRADE_ALIPAY_NOTIFY_URL: 'https://example.invalid/pr16-not-called', TRADE_ALIPAY_CONFIG_REVISION: 'synthetic.pr16' };
  const alipay = new AlipaySdk({ appId: tradeEnv.TRADE_ALIPAY_APP_ID, privateKey: rsa.privateKey, alipayPublicKey: rsa.publicKey,
    signType: 'RSA2', keyType: 'PKCS8', gateway: 'https://example.invalid/never-called' });
  const yuan = amount => `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
  alipay.exec = async (method, input, options) => {
    assert.equal(options.validateSign, true); const biz = input.bizContent;
    const [[row]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='PAYMENT'", [biz.outTradeNo]); assert(row);
    const data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json;
    if (method === 'alipay.trade.query') {
      const result = paymentQueries.get(row.id) || 'PENDING'; if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
      return { code: '10000', outTradeNo: row.id, tradeNo: `synthetic.pr16.${row.id}`, totalAmount: yuan(data.amount_minor),
        tradeStatus: result === 'SUCCEEDED' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY' };
    }
    const [[refund]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='REFUND'", [biz.outRequestNo]); assert(refund);
    const r = typeof refund.data_json === 'string' ? JSON.parse(refund.data_json) : refund.data_json;
    if (method === 'alipay.trade.refund') return { code: '10000', outTradeNo: row.id, tradeNo: r.transaction_id };
    assert.equal(method, 'alipay.trade.fastpay.refund.query'); const result = refundQueries.get(refund.id) || 'PENDING';
    if (result === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    return { code: '10000', outTradeNo: row.id, tradeNo: r.transaction_id, outRequestNo: refund.id, refundAmount: yuan(r.amount_minor),
      refundStatus: result === 'SUCCEEDED' ? 'REFUND_SUCCESS' : 'REFUND_PROCESSING' };
  };
  const readiness = createReadinessRepository(db, { authorizeChange: async actor => actor === 'synthetic.pr16.fixture',
    verifyEvidence: async input => input.evidence_ref === 'synthetic.pr16.local-transport' });
  providers = createTradeProviders(db, tradeEnv, { alipay });
  await readiness.record({ provider_kind: 'PaymentProvider', provider_code: 'alipay', capability_code: 'order_payment', environment: 'SANDBOX',
    current_status: 'SANDBOX_VERIFIED', config_revision: providers.configuration('ALIPAY').config_revision, expected_version: 0,
    evidence_ref: 'synthetic.pr16.local-transport', reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr16.fixture' });

  // Seed functions use the same routes and permissions as the UI. Only governance
  // fixture rule/grant/readiness maintenance is done in trusted server composition.
  const { createRuleContent } = fromBackend('./src/modules/governance/content');
  ruleId = crypto.randomUUID(); const rule = createRuleContent({ id: ruleId, rule_key: 'production.pr16.synthetic', version: '1', terms: { explicit: '仅PR16隔离合成规则，不是正式商业默认。' } });
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',
    [ruleId, 'production.pr16.synthetic', '1', JSON.stringify(rule), '2020-01-01 00:00:00', seller.accountId, 'EFFECTIVE']);
  const uploadAsset = (person, party, purpose, text) => call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, { person, party, body: Buffer.from(text) });
  const supplyReview = (route, row, body = {}) => call('POST', `/supply/${route}/${row.id}/reviews`, { person: reviewer, version: row.object_version,
    body: { decision: 'APPROVED', reason: '仅合成资料的独立核验，不证明真人身份或权利', ...body } });
  const tradeReview = row => call('POST', `/trade/records/${row.id}/reviews`, { person: reviewer, version: row.object_version,
    body: { decision: 'APPROVED', reason: '独立核对合成交易条件' } });
  async function createProfile(person, party, proof, name) {
    return supplyReview('profiles', await call('POST', '/supply/profiles', { person, party, body: { display_name: name,
      description: '仅本地隔离供给样本，不是真实作者身份。', evidence_asset_ids: [proof.id], previous_profile_id: null } }));
  }
  async function createWork(person, party, proof, content, title, source = null, licenseProject = null) {
    let row = await call('POST', '/supply/work-versions', { person, party, body: { work_id: null, previous_version_id: null, title,
      kind: source ? 'PROJECT_ADAPTATION' : 'ORIGINAL', source_version_id: source?.id || null, project_id: licenseProject?.id || null,
      content_asset_id: content.id, evidence_ids: [proof.id], credits: [{ party_id: party, role: 'RIGHTS_HOLDER', evidence_asset_ids: [proof.id] }] } });
    row = await call('POST', `/supply/work-versions/${row.id}/actions`, { person, party, version: row.object_version, body: { action: 'SUBMIT', reason: null } });
    for (const channel of ['RIGHTS', 'CONTENT']) row = await supplyReview('work-versions', row, { channel }); return row;
  }
  async function makeSpec(title, lineKind, amount) {
    return tradeReview(await call('POST', '/trade/specifications', { person: seller, party: organization.party_id, body: {
      previous_spec_id: null, title, provider_party_id: organization.party_id, line_kind: lineKind, unit_minor: amount, currency: 'CNY',
      specification: { version: 'synthetic.v1', service_tier: '合成测试档位（不是默认商品）', sample_seconds: 20, final_seconds: 90,
        revision_limit: 3, deliverables: ['合成剧本文字', '合成预览视频', '合成最终文件'], terms: '金额、时长、修改次数只用于本次隔离样本；不涉及正式生成服务。' } } }));
  }
  async function quoteOrder(licensed = false) {
    const lines = [{ line_id: 'film', spec_id: records.productionSpec.id, quantity: 1 }];
    if (licensed) lines.push({ line_id: 'license', spec_id: records.licenseSpec.id, quantity: 1 });
    const quote = await tradeReview(await call('POST', '/trade/quotes', { person: seller, party: organization.party_id, body: {
      buyer_party_id: buyer.personalPartyId, lines, installments: [
        { key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{ line_id: 'film', amount_minor: 4000 }, ...(licensed ? [{ line_id: 'license', amount_minor: 25000 }] : [])], apple_product_id: null },
        { key: 'last', trigger: 'FINAL_ACCEPTED', allocations: [{ line_id: 'film', amount_minor: 6000 }], apple_product_id: null } ],
      channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: ruleId, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      payment_window_minutes: 10080, license_reservation_id: licensed ? records.licenseReservation.id : null } }));
    return call('POST', `/trade/quotes/${quote.id}/acceptance`, { person: buyer, party: buyer.personalPartyId, version: quote.object_version,
      body: { quote_sha256: quote.content_sha256 } });
  }
  async function pay(order, installment = 'first', expected = 200) {
    const result = await request('POST', '/trade/payments', { person: buyer, party: buyer.personalPartyId,
      body: { order_id: order.id, installment_key: installment }, status: expected });
    if (expected !== 200) return result;
    let payment = result.body.data; paymentQueries.set(payment.id, 'SUCCEEDED');
    payment = await call('POST', `/trade/payments/${payment.id}/reconciliation`, { person: buyer, party: buyer.personalPartyId, body: { transaction_id: null } });
    return payment;
  }
  const productionReview = row => call('POST', `/production/records/${row.id}/reviews`, { person: reviewer, version: row.object_version, body: {
    decision: 'APPROVED', reason: '仅合成开工/版本材料独立人工核验；不声称真实签署或素材质量验收',
    verification: row.kind === 'PROJECT' ? { contract_sha256: row.data.contract_sha256, identity_verified: true, signatures_verified: true, rights_verified: true } : checklist(row.data.stage) } });
  const uploadFile = (project, bytes, mediaType, key) => call('POST', `/production/projects/${project.id}/files?media_type=${encodeURIComponent(mediaType)}`, {
    person: producerMember, party: organization.party_id, body: bytes, key });
  async function deliver(project, stage, approve = true) {
    const file = await uploadFile(project, stage === 'SCRIPT' ? Buffer.concat([media.script.bytes, Buffer.from('\n版本 ' + crypto.randomUUID())]) : media[stage === 'FINAL' ? 'final' : 'preview'].bytes,
      stage === 'SCRIPT' ? 'text/plain' : 'video/mp4');
    const preview = stage === 'FINAL' ? await uploadFile(project, media.preview.bytes, 'video/mp4') : file;
    const current = await read(project.id); let version = await call('POST', `/production/projects/${project.id}/versions`, { person: producerMember,
      party: organization.party_id, version: current.object_version, body: { stage, file_id: file.id, preview_file_id: preview.id, note: '合成制作交付版本，仅PR16隔离验收' } });
    if (approve) version = await productionReview(version); return version;
  }
  async function feedback(version, decision = 'ACCEPT', status = 200, key) {
    const current = await read(version.id); return request('POST', `/production/versions/${version.id}/feedback`, { person: buyer,
      party: buyer.personalPartyId, version: current.object_version, key, body: { decision, note: decision === 'ACCEPT' ? '合成客户逐项核对当前版本' : '合成客户要求修改当前版本',
        checklist: decision === 'ACCEPT' ? checklist(current.data.stage) : null }, status });
  }
  async function projectSet(name, { paid = true, reviewed = true, licensed = false, consent = records.consent } = {}) {
    const order = licensed ? records.licensedOrder : await quoteOrder(); records[name + 'Order'] = order;
    if (paid && !licensed) records[name + 'Payment'] = await pay(order);
    let project = await call('POST', '/production/projects', { person: seller, party: organization.party_id, body: {
      order_id: order.id, line_id: 'film', script_version_id: licensed ? records.adaptedWork.id : records.originalWork.id,
      license_project_id: licensed ? records.licenseProject.id : null, assignee_account_id: producerMember.accountId,
      purpose: 'PRIVATE', territory: 'CN', consent_ids: [consent.id], evidence_asset_id: assets.organizationProof.id } });
    if (reviewed) project = await productionReview(project); records[name + 'Project'] = project;
    scenarios[name] = { orderId: order.id, projectId: project.id, producerPartyId: organization.party_id, buyerPartyId: buyer.personalPartyId,
      assigneeAccountId: producerMember.accountId, consentId: consent.id, licensed };
    return project;
  }

  phase = 'actual approved work, personal consent and licensing';
  assets.organizationProof = await uploadAsset(seller, organization.party_id, 'RIGHTS_EVIDENCE', 'PR16合成机构版权、签署及开工核验材料；不是真实权利证明。');
  assets.buyerProof = await uploadAsset(buyer, buyer.personalPartyId, 'RIGHTS_EVIDENCE', 'PR16合成买方身份、签署及许可依据；仅隔离测试。');
  assets.originalContent = await uploadAsset(seller, organization.party_id, 'WORK_CONTENT', '《窗前短笺》合成原作。仅本地隔离制作测试。');
  assets.adaptedContent = await uploadAsset(buyer, buyer.personalPartyId, 'WORK_CONTENT', '《窗前短笺》合成私人项目改稿。本稿引用已取得许可的原作；仅隔离测试。');
  assets.avatarMaterial = await uploadAsset(seller, organization.party_id, 'AVATAR_MATERIAL', 'Synthetic avatar material only; no actual face or voice and no generated avatar.');
  assets.consentEvidence = await uploadAsset(seller, seller.personalPartyId, 'CONSENT_EVIDENCE', '合成本人同意说明；只测试该个人账号亲自提交与撤回，不证明真实实名。');
  records.organizationProfile = await createProfile(seller, organization.party_id, assets.organizationProof, '晴川合成制作方');
  records.buyerProfile = await createProfile(buyer, buyer.personalPartyId, assets.buyerProof, '合成私人项目作者');
  records.originalWork = await createWork(seller, organization.party_id, assets.organizationProof, assets.originalContent, '窗前短笺 · 合成原作');
  records.avatar = await call('POST', '/supply/avatars', { person: seller, party: organization.party_id,
    body: { display_name: 'PR16合成形象资料（未创建长期数字人）', material_asset_ids: [assets.avatarMaterial.id] } });
  async function makeConsent() {
    return supplyReview('consents', await call('POST', '/supply/consents', { person: seller, party: seller.personalPartyId, body: { consent: {
      avatar_id: records.avatar.id, subject_party_id: seller.personalPartyId, features: ['FACE'], purposes: ['PRIVATE', 'AI_TRAIN'], territories: ['CN'],
      valid_from: new Date(Date.now() - 86400000).toISOString(), valid_until: new Date(Date.now() + 365 * 86400000).toISOString(),
      terms: '仅本次隔离个人账号合成同意；未真实实名、训练或创建长期数字人。', evidence_asset_ids: [assets.consentEvidence.id] } } }));
  }
  records.consent = await makeConsent(); records.withdrawalConsent = await makeConsent();
  records.productionSpec = await makeSpec('私人制作 · PR16合成明确规格', 'PRODUCTION', 10000);
  records.licenseSpec = await makeSpec('窗前短笺 · PR16合成许可费', 'LICENSE', 25000);
  const now = Date.now(), licenseTerms = { exclusive: false, rights: ['ADAPT', 'PRODUCE'], purposes: ['PRIVATE'], territories: ['CN'], languages: ['zh'],
    valid_from: new Date(now - 86400000).toISOString(), development_until: new Date(now + 365 * 86400000).toISOString(),
    valid_until: new Date(now + 730 * 86400000).toISOString(), project_limit: 2, episode_limit: 2,
    terms_text: '合成私人许可仅改稿与制作；不含发行或AI训练；金额、期限和次数只用于隔离样本。' };
  const licenseReview = (row, verification) => call('POST', `/licensing/records/${row.id}/reviews`, { person: reviewer, version: row.object_version,
    body: { decision: 'APPROVED', reason: '仅独立核验合成许可材料', ...(verification ? { verification } : {}) } });
  records.licenseProduct = await licenseReview(await call('POST', '/licensing/products', { person: seller, party: organization.party_id, body: {
    work_version_id: records.originalWork.id, previous_product_id: null, title: '窗前短笺 · PR16合成许可', preview_text: '仅隔离试读：窗前留下未寄出的短笺。',
    terms: licenseTerms, price: { currency: 'CNY', amount_minor: 25000 }, payment_due_minor: 25000, reservation_minutes: 10080, rule_id: ruleId } }));
  records.licenseReservation = await call('POST', '/licensing/reservations', { person: buyer, party: buyer.personalPartyId, body: { product_id: records.licenseProduct.id } });
  records.licensedOrder = await quoteOrder(true); records.licenseFirstPayment = await pay(records.licensedOrder);
  records.licenseEvidence = await call('POST', '/licensing/evidence', { person: buyer, party: buyer.personalPartyId, body: {
    reservation_id: records.licenseReservation.id, contract_sha256: records.licenseReservation.data.contract.content_sha256,
    seller_signature_asset_id: assets.organizationProof.id, buyer_signature_asset_id: assets.buyerProof.id, identity_asset_id: assets.buyerProof.id,
    payment_asset_id: assets.buyerProof.id, external_reference: 'synthetic.pr16.manual-licensing' } });
  records.licenseEvidence = await licenseReview(records.licenseEvidence, { signed_contract_sha256: records.licenseReservation.data.contract.content_sha256,
    identity_verified: true, seller_signature_verified: true, buyer_signature_verified: true, currency: 'CNY', received_minor: 25000,
    payee_party_id: organization.party_id, receipt_ref: 'synthetic.pr16.receipt.' + records.licenseReservation.id });
  records.licenseGrant = await call('POST', `/licensing/reservations/${records.licenseReservation.id}/activation`, { person: reviewer,
    version: records.licenseReservation.object_version, body: { evidence_id: records.licenseEvidence.id, reason: '合成许可独立核验；付款和签署事实分别处理' } });
  records.licenseProject = await call('POST', '/licensing/projects', { person: buyer, party: buyer.personalPartyId,
    body: { project: { title: 'PR16合成私人制作项目', purpose: 'PRIVATE', territory: 'CN', language: 'zh', episodes: 1 } } });
  records.licenseBinding = await call('POST', `/licensing/grants/${records.licenseGrant.id}/bindings`, { person: buyer, party: buyer.personalPartyId,
    version: records.licenseGrant.object_version, body: { project_id: records.licenseProject.id } });
  records.adaptedWork = await createWork(buyer, buyer.personalPartyId, assets.buyerProof, assets.adaptedContent, '窗前短笺 · 已许可项目改稿', records.originalWork, records.licenseProject);
  checks.push('Actual supply profile/original work dual review; seller PERSON submits personal consent for organization avatar; real license reservation/fee receipt/manual evidence/grant/project binding and buyer adaptation with PRODUCE rights');

  phase = 'separate web/app production states through real routes';
  await projectSet('webReview', { reviewed: false });
  const scriptPending = await projectSet('webScriptPending'); records.webScriptPendingVersion = await deliver(scriptPending, 'SCRIPT', false);
  const script = await projectSet('webScript'); records.webScriptVersion = await deliver(script, 'SCRIPT');
  const appScript = await projectSet('appScript'); records.appScriptVersion = await deliver(appScript, 'SCRIPT');
  const sample = await projectSet('webSample'); records.webSampleScript = await deliver(sample, 'SCRIPT'); await feedback(records.webSampleScript);
  records.webSampleVersion = await deliver(sample, 'SAMPLE', false);
  const sampleApproved = await projectSet('appSample'); records.appSampleScript = await deliver(sampleApproved, 'SCRIPT'); await feedback(records.appSampleScript);
  records.appSampleVersion = await deliver(sampleApproved, 'SAMPLE');
  const history = await projectSet('webHistory'); records.webHistoryScript = await deliver(history, 'SCRIPT'); await feedback(records.webHistoryScript);
  records.webHistoryOldSample = await deliver(history, 'SAMPLE');
  records.webHistoryAcceptedFeedback = (await feedback(records.webHistoryOldSample)).body.data;
  records.webHistoryFeedback = (await feedback(records.webHistoryOldSample, 'REQUEST_CHANGES')).body.data;
  records.webHistoryNewSample = await deliver(history, 'SAMPLE');
  assert.equal((await read(history.id)).data.accepted.SAMPLE, undefined);
  assert.equal((await feedback(records.webHistoryOldSample, 'ACCEPT', 409)).body.error.code, 'CURRENT_APPROVED_VERSION_REQUIRED');
  async function finalSet(name, options = {}) {
    const project = await projectSet(name, options);
    for (const stage of ['SCRIPT', 'SAMPLE', 'ROUGH_CUT']) { const v = await deliver(project, stage); records[name + stage] = v; await feedback(v); }
    const final = await deliver(project, 'FINAL'); records[name + 'Final'] = final;
    return { project, final, order: records[name + 'Order'] };
  }
  const finalPending = await finalSet('webFinal'); records.webFinalVersion = finalPending.final;
  assert.equal((await pay(finalPending.order, 'last', 409)).body.error.code, 'PAYMENT_MILESTONE_NOT_MET');
  await request('GET', `/production/versions/${finalPending.final.id}/content?variant=final`, { person: buyer, party: buyer.personalPartyId, status: 409 });
  const delivered = await finalSet('appDownload', { licensed: true });
  await feedback(delivered.final); records.appDownloadLastPayment = await pay(delivered.order, 'last');
  const download = await request('GET', `/production/versions/${delivered.final.id}/content?variant=final`, { person: buyer, party: buyer.personalPartyId });
  assert(download.body.equals(media.final.bytes)); assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert((await request('GET', `/production/versions/${delivered.final.id}/content?variant=preview`, { person: buyer, party: buyer.personalPartyId })).body.equals(media.preview.bytes));
  assert.notEqual(delivered.final.data.file_id, delivered.final.data.preview_file_id);
  const refundCase = await finalSet('appRefund'); await feedback(refundCase.final); records.appRefundLastPayment = await pay(refundCase.order, 'last');
  let refund = await call('POST', '/trade/refunds', { person: buyer, party: buyer.personalPartyId, body: {
    payment_id: records.appRefundPayment.id, allocations: [{ line_id: 'film', amount_minor: 1 }], reason: '合成一分钱退款，用于验证历史验收保留且后续内容阻止' } });
  refund = await tradeReview(refund); refund = await call('POST', `/trade/refunds/${refund.id}/execution`, { person: reviewer, body: {} });
  refundQueries.set(refund.id, 'SUCCEEDED'); records.appRefundRefund = await call('POST', `/trade/refunds/${refund.id}/reconciliation`, {
    person: buyer, party: buyer.personalPartyId, body: {} });
  assert.equal((await request('GET', `/production/versions/${refundCase.final.id}/content?variant=final`, { person: buyer, party: buyer.personalPartyId, status: 409 })).body.error.code, 'PRODUCTION_ORDER_BLOCKED');
  assert.equal((await read(refundCase.project.id)).data.accepted.FINAL, refundCase.final.id);
  const withdrawnCase = await finalSet('appWithdrawn', { consent: records.withdrawalConsent });
  await feedback(withdrawnCase.final); records.appWithdrawnLastPayment = await pay(withdrawnCase.order, 'last');
  records.withdrawalConsent = await call('POST', `/supply/consents/${records.withdrawalConsent.id}/withdrawals`, { person: seller,
    version: records.withdrawalConsent.object_version, body: { reason: '合成本人撤回，立即停止后续受控内容' } });
  assert.equal((await request('GET', `/production/versions/${withdrawnCase.final.id}/content?variant=final`, { person: buyer, party: buyer.personalPartyId, status: 409 })).body.error.code, 'PRODUCTION_CONSENT_NOT_AVAILABLE');
  const unpaid = await projectSet('webUnpaid', { paid: false });
  assert.equal((await request('POST', `/production/projects/${unpaid.id}/files?media_type=text%2Fplain`, { person: producerMember,
    party: organization.party_id, body: media.script.bytes, status: 409 })).body.error.code, 'PRODUCTION_PAYMENT_REQUIRED');
  records.webCreateOrder = await quoteOrder(); records.webCreatePayment = await pay(records.webCreateOrder);
  creation = { orderId: records.webCreateOrder.id, lineId: 'film', scriptVersionId: records.originalWork.id, licenseProjectId: null,
    assigneeAccountId: producerMember.accountId, purpose: 'PRIVATE', territory: 'CN', consentIds: [records.consent.id],
    evidenceAssetId: assets.organizationProof.id, producerPartyId: organization.party_id, merchantPartyId: organization.party_id };
  checks.push('Separate web pending project/SCRIPT review/SCRIPT buyer-confirmation/SAMPLE review and App approved SAMPLE; preserved old feedback after new sample invalidates acceptance; approved FINAL preview available but tail payment/final download remain blocked until buyer accepts');
  checks.push('Licensed App final accepted + actual remaining payment yields exact private final bytes; preview/final files and hashes differ; verified refund and personal consent withdrawal immediately block content while historical acceptance remains');
  checks.push('Agreed first payment absent blocks real file upload; untouched paid order with approved original script/consent/evidence is available for browser project creation');

  phase = 'actual blocked generation and original durable recovery';
  const recoveryProject = await projectSet('recovery'); recoveryProjectId = recoveryProject.id;
  recoveryJobs = fromBackend('./src/infrastructure/jobs/repository').createJobRepository(db);
  recoveryWorker = fromBackend('./src/worker/runner').createWorker({ repository: recoveryJobs,
    handlers: fromBackend('./src/modules/production/handlers').createProductionHandlers(db, { provider: recoveryProvider }),
    owner: 'synthetic.pr16.recovery-worker' });
  // This switch belongs to trusted composition and is never exposed as an API or
  // fixture-control setting. All public projects return to the real disabled provider.
  recoveryApiEnabled = true;
  try {
    records.recoveryGeneration = await call('POST', `/production/projects/${recoveryProject.id}/generation`, { person: producerMember,
      party: organization.party_id, version: (await read(recoveryProject.id)).object_version,
      body: { operation: 'CREATE_LONG_LIVED', avatar_id: records.avatar.id, asset_id: null, consent_id: records.consent.id } });
  } finally { recoveryApiEnabled = false; }
  recoveryTask = { projectId: recoveryProject.id, generationId: records.recoveryGeneration.id,
    jobId: records.recoveryGeneration.data.job_id, originalRequestKey: records.recoveryGeneration.data.job_id,
    providerCode: 'synthetic.pr16.recovery', syntheticOnly: true };
  async function tickRecovery() {
    const target = await recoveryJobs.get(recoveryTask.jobId); assert(['PENDING', 'RETRY'].includes(target.status));
    // One genuine consent-withdrawal outbox may precede the recovery task. Drain
    // that actual task as well; never edit a job status or lease to obtain the sample.
    for (let i = 0; i < 5; i++) {
      await recoveryWorker.tick(); const job = await recoveryJobs.get(recoveryTask.jobId);
      if (!['PENDING', 'RETRY', 'RUNNING'].includes(job.status)) return job;
    }
    throw new Error('RECOVERY_JOB_DID_NOT_RUN');
  }
  const firstBlocked = await tickRecovery(); assert.equal(firstBlocked.status, 'BLOCKED');
  assert.equal(firstBlocked.last_error, 'GENERATION_OUTCOME_UNKNOWN'); assert.equal(recoveryTransport.submits, 1); assert.equal(recoveryTransport.queries, 0);
  const retryKey = crypto.randomUUID(), retryBody = { reason_ref: 'synthetic.pr16.original-request-verification' };
  await request('POST', `/production/generations/${records.recoveryGeneration.id}/retry`, { person: producerMember, body: retryBody, status: 403 });
  records.recoveryGeneration = await call('POST', `/production/generations/${records.recoveryGeneration.id}/retry`, { person: reviewer, body: retryBody, key: retryKey });
  assert.equal(records.recoveryGeneration.data.job_id, firstBlocked.id);
  const secondBlocked = await tickRecovery(); assert.equal(secondBlocked.status, 'BLOCKED'); assert.equal(secondBlocked.id, firstBlocked.id);
  assert.equal(recoveryTransport.submits, 1); assert.equal(recoveryTransport.queries, 1);
  // Idempotent retry replay cannot reopen the blocked task or resubmit upstream.
  await call('POST', `/production/generations/${records.recoveryGeneration.id}/retry`, { person: reviewer, body: retryBody, key: retryKey });
  assert.equal((await recoveryJobs.get(firstBlocked.id)).status, 'BLOCKED');
  const actualJob = await call('GET', `/production/generations/${records.recoveryGeneration.id}/job`, { person: reviewer });
  assert.equal(actualJob.current_status, 'BLOCKED'); assert.equal(actualJob.job_id, firstBlocked.id);
  assert.equal((await call('GET', `/production/projects/${recoveryProject.id}/generation-readiness`, { person: producerMember, party: organization.party_id })).current_status, 'NOT_ENABLED');
  checks.push('Dedicated synthetic CREATE_LONG_LIVED request enqueues an actual durable job; real worker accepts upstream key then loses reply and persists BLOCKED; non-reviewer retry is 403; reviewer retry preserves job/key, queries once without resubmit, remains genuinely ambiguous/BLOCKED; retry replay does not reopen; public provider restored to NOT_ENABLED');

  phase = 'actual permission, independent review, concurrency and provider refusal';
  await request('GET', `/production/records/${script.id}`, { person: outsider, party: outsider.personalPartyId, status: 404 });
  await request('POST', `/production/projects/${script.id}/files?media_type=text%2Fplain`, { person: buyer, party: buyer.personalPartyId, body: media.script.bytes, status: 403 });
  const selfGrant = await grantMaintainer(db, { account_id: seller.accountId, action: 'PRODUCTION_REVIEW', enabled: true, expires_at: null,
    expected_version: 0, authority_ref: 'synthetic:pr16-self-review-check', reason: '仅测试即使有后台授权，项目成员仍不得自审；随后立即撤销' });
  assert.equal((await request('POST', `/production/records/${records.webReviewProject.id}/reviews`, { person: seller,
    version: records.webReviewProject.object_version, body: { decision: 'APPROVED', reason: '自审拒绝验证', verification: {
      contract_sha256: records.webReviewProject.data.contract_sha256, identity_verified: true, signatures_verified: true, rights_verified: true } }, status: 403 })).body.error.code, 'SELF_REVIEW_FORBIDDEN');
  await grantMaintainer(db, { account_id: seller.accountId, action: 'PRODUCTION_REVIEW', enabled: false, expires_at: null,
    expected_version: selfGrant.object_version, authority_ref: 'synthetic:pr16-self-review-check', reason: '撤销本次临时自审边界测试授权，商家恢复普通OWNER' });
  const duplicateInput = { order_id: records.webScriptOrder.id, line_id: 'film', script_version_id: records.originalWork.id,
    license_project_id: null, assignee_account_id: producerMember.accountId, purpose: 'PRIVATE', territory: 'CN', consent_ids: [records.consent.id], evidence_asset_id: assets.organizationProof.id };
  assert.equal((await request('POST', '/production/projects', { person: seller, party: organization.party_id, body: duplicateInput, status: 409 })).body.error.code, 'PRODUCTION_ALREADY_EXISTS');
  const race = await projectSet('race'); records.raceScript = await deliver(race, 'SCRIPT');
  const raceBody = { decision: 'ACCEPT', note: '合成并发决定', checklist: checklist('SCRIPT') }, version = records.raceScript.object_version;
  const raceResponses = await Promise.all([200, 412].map(async () => {
    const r = await fetch(apiUrl + `/api/v1/production/versions/${records.raceScript.id}/feedback`, { method: 'POST', headers: {
      Authorization: `Bearer ${buyer.token}`, 'X-Acting-Party': buyer.personalPartyId, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `"${version}"`,
    }, body: JSON.stringify(raceBody) }); await r.arrayBuffer(); return r.status;
  }));
  assert.deepEqual(raceResponses.sort(), [200, 412]);
  const generationReadiness = await call('GET', `/production/projects/${script.id}/generation-readiness`, { person: producerMember, party: organization.party_id });
  assert.equal(generationReadiness.current_status, 'NOT_ENABLED');
  const [[jobsBefore]] = await db.execute('SELECT COUNT(*) n FROM platform_jobs');
  const [[generationsBefore]] = await db.execute("SELECT COUNT(*) n FROM production_records WHERE kind='GENERATION'");
  await request('POST', `/production/projects/${script.id}/generation`, { person: producerMember, party: organization.party_id,
    version: (await read(script.id)).object_version, body: { operation: 'CREATE_LONG_LIVED', avatar_id: records.avatar.id, asset_id: null, consent_id: records.consent.id }, status: 503 });
  const [[jobsAfter]] = await db.execute('SELECT COUNT(*) n FROM platform_jobs'); const [[generationsAfter]] = await db.execute("SELECT COUNT(*) n FROM production_records WHERE kind='GENERATION'");
  assert.equal(Number(jobsBefore.n), Number(jobsAfter.n)); assert.equal(Number(generationsBefore.n), Number(generationsAfter.n));
  checks.push('Cross-party read is 404, buyer cannot upload; temporary scoped seller grant still cannot self-review and is revoked; duplicate order line rejected; simultaneous buyer decisions return one 200 and one 412; real NOT_ENABLED generation returns 503 with no generation/job increase');

  phase = 'private controls and original HTTP request recovery';
  async function assign(projectId, assignee) {
    const project = await read(projectId);
    return call('POST', `/production/projects/${projectId}/assignment`, { person: seller, party: organization.party_id, version: project.object_version,
      body: { assignee_account_id: people[assignee].accountId, reason: '仅合成fixture通过真实OWNER路由改派负责人' } });
  }
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) { res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return; }
    try {
      const url = new URL(req.url, controlUrl), get = name => url.searchParams.get(name); let out;
      if (req.method === 'GET' && url.pathname === '/code') {
        assert(Object.values(phones).includes(get('phone'))); const code = sent.get(get('phone')); res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return;
      } else if (req.method === 'GET' && url.pathname === '/state') out = await snapshot();
      else if (req.method === 'POST' && url.pathname === '/storage') {
        assert(['true', 'false'].includes(get('enabled'))); storageAvailable = get('enabled') === 'true'; out = { enabled: storageAvailable };
      } else if (req.method === 'POST' && url.pathname === '/reviewer-permission') {
        assert(get('action') === 'PRODUCTION_REVIEW'); assert(['true', 'false'].includes(get('enabled'))); const enabled = get('enabled') === 'true';
        if (enabled !== reviewerGrant.enabled) {
          const grant = await grantMaintainer(db, { account_id: reviewer.accountId, action: 'PRODUCTION_REVIEW', enabled, expires_at: null,
            expected_version: reviewerGrant.version, authority_ref: 'synthetic:pr16-control', reason: '仅本次独立审核人的原授权撤销或恢复' });
          reviewerGrant = { version: grant.object_version, enabled };
        }
        out = { action: 'PRODUCTION_REVIEW', enabled };
      } else if (req.method === 'POST' && url.pathname === '/assignment') {
        assert(['seller', 'producerMember'].includes(get('assignee'))); const row = await assign(get('project_id'), get('assignee')); out = summary(row);
      } else if (req.method === 'POST' && url.pathname === '/response-loss') {
        if (get('operation') === 'NONE') responseLoss = null;
        else { assert(Object.hasOwn(operations, get('operation'))); assert(['DROP', '503'].includes(get('mode'))); responseLoss = { operation: get('operation'), mode: get('mode') }; }
        out = { nextResponseLoss: responseLoss };
      } else if (req.method === 'POST' && url.pathname === '/payment-query') {
        assert(['PENDING', 'SUCCEEDED', 'TIMEOUT'].includes(get('result'))); const [[row]] = await db.execute("SELECT id FROM trade_records WHERE id=? AND kind='PAYMENT'", [get('payment_id')]);
        assert(row); paymentQueries.set(row.id, get('result')); out = { paymentId: row.id, result: get('result') };
      } else if (req.method === 'POST' && url.pathname === '/recovery-worker') {
        assert(['TIMEOUT', 'SUCCEEDED'].includes(get('result'))); recoveryQueryResult = get('result');
        const job = await tickRecovery(); out = { generationId: recoveryTask.generationId, jobId: job.id, status: job.status,
          submits: recoveryTransport.submits, queries: recoveryTransport.queries, publicProviderEnabled: recoveryApiEnabled };
      } else { res.writeHead(404); res.end('{"error":"NOT_FOUND"}'); return; }
      res.end(JSON.stringify(out));
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, 3283);
  const control = async route => { const r = await fetch(controlUrl + route, { method: 'POST', headers: { Authorization: `Bearer ${controlToken}` } });
    assert.equal(r.status, 200); return r.json(); };
  assert.equal((await fetch(controlUrl + '/state')).status, 403);
  assert.equal((await fetch(controlUrl + '/state', { headers: { Authorization: `Bearer ${controlToken}`, Origin: origins[0] } })).status, 403);
  await control('/reviewer-permission?action=PRODUCTION_REVIEW&enabled=false');
  assert.equal((await request('GET', `/production/records/${script.id}`, { person: reviewer, status: 403 })).body.error.code, 'PRODUCTION_REVIEW_FORBIDDEN');
  await control('/reviewer-permission?action=PRODUCTION_REVIEW&enabled=true'); await call('GET', `/production/records/${script.id}`, { person: reviewer });
  await control(`/assignment?project_id=${script.id}&assignee=seller`);
  assert.equal((await request('GET', `/production/records/${script.id}`, { person: producerMember, party: organization.party_id, status: 403 })).body.error.code, 'PRODUCTION_PARTY_FORBIDDEN');
  await control(`/assignment?project_id=${script.id}&assignee=producerMember`); await call('GET', `/production/records/${script.id}`, { person: producerMember, party: organization.party_id });
  await control('/storage?enabled=false'); await request('GET', `/production/versions/${delivered.final.id}/content?variant=preview`, { person: buyer, party: buyer.personalPartyId, status: 503 });
  await control('/storage?enabled=true'); assert((await request('GET', `/production/versions/${delivered.final.id}/content?variant=preview`, { person: buyer, party: buyer.personalPartyId })).body.equals(media.preview.bytes));
  // Commit a real assignment, lose the reply, then replay exact key/body/version.
  const before = await read(script.id), op = crypto.randomUUID(), assignmentBody = { assignee_account_id: producerMember.accountId, reason: '合成回复丢失后核对同一请求' };
  await control('/response-loss?operation=assignment&mode=503');
  await request('POST', `/production/projects/${script.id}/assignment`, { person: seller, party: organization.party_id, version: before.object_version, body: assignmentBody, key: op, status: 503 });
  const after = await read(script.id); assert.equal(after.object_version, before.object_version + 1);
  const replay = await call('POST', `/production/projects/${script.id}/assignment`, { person: seller, party: organization.party_id, version: before.object_version, body: assignmentBody, key: op });
  assert.equal(replay.id, script.id); assert.equal(replay.object_version, after.object_version);
  recovery.at(-1).recordId = replay.id;
  // Also reproduce an actual lost network reply after commit; no response envelope.
  const dropBefore = await read(script.id), dropOp = crypto.randomUUID(); await control('/response-loss?operation=assignment&mode=DROP');
  let dropped = false;
  try { await request('POST', `/production/projects/${script.id}/assignment`, { person: seller, party: organization.party_id, version: dropBefore.object_version,
    body: assignmentBody, key: dropOp }); } catch (e) { if (e instanceof TypeError) dropped = true; else throw e; }
  assert(dropped); const dropReplay = await call('POST', `/production/projects/${script.id}/assignment`, { person: seller, party: organization.party_id,
    version: dropBefore.object_version, body: assignmentBody, key: dropOp }); assert.equal(dropReplay.object_version, dropBefore.object_version + 1); recovery.at(-1).recordId = dropReplay.id;
  const preflight = await request('OPTIONS', '/production/projects', { status: 204, headers: { Origin: 'http://127.0.0.1:5204', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5204');
  await request('OPTIONS', '/production/projects', { status: 403, headers: { Origin: 'https://example.invalid' } });
  checks.push('Private controls deny anonymous and every Origin; PRODUCTION_REVIEW revoke/restore returns genuine 403 then permits read; real OWNER reassignment removes old MEMBER access and restores; private storage failure returns 503 and exact bytes recover');
  checks.push('Real committed assignment returns injected 503 or loses socket once; exact original key/body/If-Match replay returns same current project without second mutation; actual loopback CORS permits configured UI origin and rejects foreign preflight');

  phase = 'private runtime state';
  const state = await snapshot(); state.controlToken = controlToken;
  const handle = await fs.open(statePath, 'wx', 0o600); stateOwned = true;
  try { await handle.writeFile(JSON.stringify(state, null, 2)); } finally { await handle.close(); }
  assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  console.log(`Isolated PR #16 API ready: ${apiUrl}; control: ${controlUrl}; ${checks.length} targeted check groups passed. Private state: ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  Promise.resolve(startupPromise).catch(() => {}).then(cleanup).then(() => process.exit(0), () => {
    console.error(`PR #16 cleanup failed; inspect local schema ${schema}.`); process.exit(1);
  });
});
startupPromise = main();
startupPromise.catch(async e => {
  console.error(`PR #16 test launcher failed during ${phase}: ${e.code || e.name}${e.name === 'AssertionError' ? ' ' + e.message : ''}`);
  await cleanup().catch(() => console.error(`PR #16 cleanup failed; inspect local schema ${schema}.`)); process.exit(1);
});
