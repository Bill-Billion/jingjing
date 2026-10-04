'use strict';

// Local isolated PR20 fixture: normal SMS identities, real OWNER/independent
// permissions, business comments/notifications and three queued original-worker
// reports. Verified sandbox receipts and manual payout evidence create real
// isolated journal sources; explicit synthetic terms are never defaults.
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
// PR21 final candidate can run independently without replacing PR20 review data.
const statePath = path.resolve(process.env.PR20_UI_STATE_FILE || path.resolve(__dirname, '../.local/pr20-ui-runtime.json'));
const apiPort = Number(process.env.PR20_UI_API_PORT || 3362), controlPort = Number(process.env.PR20_UI_CONTROL_PORT || 3363);
for (const port of [apiPort, controlPort]) assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid isolated UI port');
assert.notEqual(apiPort, controlPort);
const apiUrl = `http://127.0.0.1:${apiPort}`, controlUrl = `http://127.0.0.1:${controlPort}`;
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`, controlToken = crypto.randomBytes(32).toString('hex');
const phones = { payer: '13900009801', recipient: '13900009802', independentReviewer: '13900009803', outsider: '13900009804', member: '13900009805', channelRegistrar: '13900009806', customer: '13900009807' };
const people = {}, records = {}, assets = {}, media = {}, creation = {}, scenarios = {}, checks = [], recovery = [];
const sent = new Map(), files = new Map(), paymentQueries = new Map(), refundQueries = new Map(), grants = new Map();
let db, mysql, connection, providers, grantMaintainer, apiServer, controlServer, mediaDir, startupPromise, cleanupPromise;
let stateSave = Promise.resolve(), closing = false;
let phase = 'configuration', stateOwned = false, schemaCreated = false, payerOrganizationId, ruleId;
let storageAvailable = true, evidenceIntact = true, responseLoss = null, membershipEnabled = true, workerEnabled = false, workerTimer, workerBusy = false, jobs, reportHandler;
const workerHistory = [];
const key = () => crypto.randomUUID(), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const now = Date.now(), validFrom = new Date(now - 86400000).toISOString(), validUntil = new Date(now + 90 * 86400000).toISOString();
const targetScope = purpose => ({ purpose, territory: 'CN', language: 'zh', valid_until: new Date(now + 30 * 86400000).toISOString() });
const operations = {
  comment: /^\/api\/v1\/operations\/objects\/(TRADE|PRODUCTION|PROJECTS)\/[0-9a-f-]{36}\/comments$/,
  commentAction: /^\/api\/v1\/operations\/comments\/[0-9a-f-]{36}\/actions$/,
  markRead: /^\/api\/v1\/operations\/notifications\/[0-9]+\/read$/,
  report: /^\/api\/v1\/operations\/reports$/,
  reportRetry: /^\/api\/v1\/operations\/reports\/[0-9a-f-]{36}\/retries$/,
};
function listen(server, port) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); }); }
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    closing = true; workerEnabled = false; clearInterval(workerTimer);
    while (workerBusy) await new Promise(resolve => setTimeout(resolve, 10));
    await stateSave.catch(() => {});
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
    if (failures.length) throw new AggregateError(failures, 'PR20_LOCAL_CLEANUP_FAILED');
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
  for (const table of ['finance_records','project_records','production_records','trade_records','supply_records']) rows.push(...(await db.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
  const [comments] = await db.execute('SELECT * FROM ops_comments ORDER BY id');
  const [reports] = await db.execute('SELECT r.*,j.status job_status,j.attempts,j.last_error FROM ops_reports r JOIN platform_jobs j ON j.id=r.job_id ORDER BY r.id');
  const all = new Map(rows.map(r => [r.id,r]));
  for (const r of comments) all.set(r.id,{...r,kind:'COMMENT'});
  for (const r of reports) { const result = r.result_json && (typeof r.result_json==='string'?JSON.parse(r.result_json):r.result_json); all.set(r.id,{...r,kind:'REPORT',current_status:result?'SUCCEEDED':r.job_status,content_sha256:r.result_sha256,reportResult:result}); }
  const describe = row => ({...summary(row),domain:row.domain||null,recordId:row.record_id||null,authorAccountId:row.author_account_id||null,partyId:row.party_id||null,replyTo:row.reply_to||null,
    body:row.kind==='COMMENT'&&row.current_status==='VISIBLE'?row.body:null,jobId:row.job_id||null,attempts:row.attempts??null,errorCode:row.last_error||null,
    reportRequest:row.request_json?(typeof row.request_json==='string'?JSON.parse(row.request_json):row.request_json):null,rowCount:row.reportResult?.row_count??null,totals:row.reportResult?.totals||null,sources:row.reportResult?.sources||null});
  return {testOnly:true,syntheticOnly:true,pid:process.pid,schema,apiUrl,controlUrl,payerOrganizationId,ruleId,
    accounts:Object.fromEntries(Object.entries(people).map(([name,p])=>[name,{phone:p.phone,accountId:p.accountId,personalPartyId:p.personalPartyId,actingPartyId:p.actingPartyId}])),
    records:Object.fromEntries(Object.entries(records).map(([name,r])=>[name,describe(all.get(r.id)||r)])),allRecords:rows.map(summary),
    assets:Object.fromEntries(Object.entries(assets).map(([name,a])=>[name,{id:a.id,ownerPartyId:a.owner_party_id,purpose:a.purpose,byteSize:a.byte_size,contentSha256:a.content_sha256}])),
    media:Object.fromEntries(Object.entries(media).map(([name,m])=>[name,{path:m.path,byteSize:m.bytes.length,contentSha256:sha(m.bytes),label:m.label}])),creation,scenarios,recovery,
    controls:{storageAvailable,evidenceIntact,membershipEnabled,workerEnabled,nextResponseLoss:responseLoss,grants:Object.fromEntries([...grants].map(([k,v])=>[k,v.enabled]))},workerHistory,
    verification:{passed:checks.length,checks},limitations:[
      '所有账号、材料、付款、脸声本人同意和金额仅合成隔离测试；不证明真人身份、真实到账、真实商业默认或正式业务启用。',
      '仅外部SMS/私有存储/支付传输替身；业务路由、权限、账本、任务队列、租约和报表生成使用原后端。',
      '报表默认worker关闭保持PENDING；开启或单次运行只领取本随机库真实任务，BLOCKED由真实执行时权限检查产生。',
      'content_sha256是报告JSON快照hash，CSV下载字节hash另算，不能相互冒称。',
      '控制面拒绝全部Origin，只维护本隔离合成账号授权/membership并保留审计；客户端不能自批或修改生产。',
      '留言撤回/隐藏对外body=null，原文字只留原后端受控存储；未知回复保留原key/body/version重放。']};
}
async function saveState() {
  if (closing) return;
  const run = async () => {
    if (closing) return;
    const saved = { ...(await snapshot()), controlToken };
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(saved, null, 2), { flag: stateOwned ? 'w' : 'wx', mode: 0o600 });
    stateOwned = true; await fs.chmod(statePath, 0o600);
  };
  const pending = stateSave.then(run); stateSave = pending.catch(() => {}); return pending;
}
async function grant(name, action, enabled) {
  const k = `${name}:${action}`, prior = grants.get(k); if (prior?.enabled === enabled) return prior;
  const result = await grantMaintainer(db, { account_id: people[name].accountId, action, enabled, expires_at: null, expected_version: prior?.object_version || 0,
    authority_ref: 'synthetic:pr20-fixture', reason: '仅本次随机隔离库的合成审核授权，不是正式业务许可' }); grants.set(k, result); return result;
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
  mediaDir = await fs.mkdtemp(path.resolve(__dirname, '../.local/pr20-ui-media-')); await fs.chmod(mediaDir, 0o700);
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
  try { await fs.access(statePath); throw Object.assign(new Error('Existing local instance state'), { code: 'PR20_STATE_EXISTS' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise'); grantMaintainer = fromBackend('./src/modules/governance/operator-access').maintainOperatorGrant;
  phase = 'isolated schema migration';
  connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); schemaCreated = true;
  db = await fromBackend('./src/infrastructure/database').openDatabase({ ...env, MYSQL_DATABASE: schema });
  await fromBackend('./src/infrastructure/database/migrator').migrate(db);
  await makeMedia();
  const origins = [5211, 5212, 8779, 8780].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  const storageFactory = () => ({ async put({ key, body, isPrivate }) {
    if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); assert.equal(isPrivate, true); assert(Buffer.isBuffer(body));
    files.set(key, Buffer.from(body)); return { key, size: body.length, sha256: sha(body) };
  }, async getBuffer(key) { if (!storageAvailable) throw new Error('SYNTHETIC_STORAGE_UNAVAILABLE'); const b = files.get(key); return b && (evidenceIntact ? Buffer.from(b) : Buffer.concat([b, Buffer.from('synthetic-corruption')])); } });
  const app = fromBackend('./src/http/account-api').createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'),
    sms: { async call(operation, input) { assert.equal(operation, 'send'); assert(Object.values(phones).includes(input.phone)); sent.set(input.phone, input.code); return { accepted: true, provider_request_id: 'synthetic-pr20-local-only' }; } },
    supplyStorageFactory: storageFactory, supplyEnv: { NODE_ENV: 'test' }, governanceEnvironment: 'SANDBOX',
    tradeProvidersFactory: () => ({ get(code) { assert(providers); return providers.get(code); } }),
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000, ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 }, allowedOrigins: origins });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr20-synthetic-transports');
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
  await listen(apiServer, apiPort);
  phase = 'normal SMS identities and OWNER/MEMBER membership';
  for (const [name, phone] of Object.entries(phones)) {
    const c = await call('POST', '/auth/sms-challenges', { body: { phone, purpose: 'LOGIN' } });
    const s = await call('POST', '/auth/sessions', { body: { phone, challenge_id: c.challenge_id, code: sent.get(phone) } });
    const p = { phone, accountId: s.account.id, token: s.access_token };
    p.personalPartyId = (await call('GET', '/me/parties', { person: p })).items.find(r => r.party.kind === 'PERSON').party.id;
    p.actingPartyId = p.personalPartyId; people[name] = p;
  }
  const { payer, recipient, independentReviewer, channelRegistrar, outsider, member } = people;
  payerOrganizationId = (await call('POST', '/organizations', { person: payer, body: { display_name: '清风合成项目发起机构（PR20隔离）' } })).party_id;
  payer.actingPartyId = member.actingPartyId = payerOrganizationId;
  const invitation = await call('POST', `/parties/${payerOrganizationId}/invitations`, { person: payer, party: payerOrganizationId, body: { invitee_account_id: member.accountId, expires_at: new Date(now + 86400000).toISOString() } });
  await call('POST', `/parties/${payerOrganizationId}/invitations/${invitation.invitation_id}/responses`, { person: member, party: payerOrganizationId, version: invitation.object_version, body: { decision: 'ACCEPT' } });
  for (const action of ['OPERATIONS_AUDIT', 'OPERATIONS_REPORT', 'COMMENT_MODERATE', 'FINANCE_REVIEW', 'PROJECT_REVIEW', 'TRADE_REVIEW', 'TRADE_REFUND', 'PRODUCTION_REVIEW', 'SUPPLY_REVIEW_PROFILE', 'SUPPLY_REVIEW_RIGHTS', 'SUPPLY_REVIEW_CONTENT', 'SUPPLY_REVIEW_CONSENT']) await grant('independentReviewer', action, true);
  await grant('channelRegistrar', 'PROJECT_REVIEW', true);
  checks.push('Seven normal SMS/account identities; payer organization OWNER and invitation-accepted MEMBER; independent independentReviewer and channel registrar grants with actual audit history');

  phase = 'sandbox payment provider transport';
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tradeEnv = { NODE_ENV: 'test', TRADE_ALIPAY_ENABLED: 'true', TRADE_ALIPAY_APP_ID: 'synthetic.pr20.app', TRADE_ALIPAY_MERCHANT_ID: 'synthetic.pr20.merchant',
    TRADE_ALIPAY_MERCHANT_PARTY_ID: recipient.personalPartyId, TRADE_ALIPAY_PRIVATE_KEY: rsa.privateKey, TRADE_ALIPAY_PUBLIC_KEY: rsa.publicKey,
    TRADE_ALIPAY_NOTIFY_URL: 'https://example.invalid/pr20-never-called', TRADE_ALIPAY_CONFIG_REVISION: 'synthetic.pr20' };
  const alipay = new (fromBackend('alipay-sdk').AlipaySdk)({ appId: tradeEnv.TRADE_ALIPAY_APP_ID, privateKey: rsa.privateKey, alipayPublicKey: rsa.publicKey, signType: 'RSA2', keyType: 'PKCS8', gateway: 'https://example.invalid/never-called' });
  const yuan = n => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  alipay.exec = async (method, input, options) => {
    assert.equal(options.validateSign, true); const b = input.bizContent;
    const [[p]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='PAYMENT'", [b.outTradeNo]); assert(p);
    const d = typeof p.data_json === 'string' ? JSON.parse(p.data_json) : p.data_json;
    if (method === 'alipay.trade.query') { const q = paymentQueries.get(p.id) || 'PENDING'; if (q === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT'); return { code: '10000', outTradeNo: p.id, tradeNo: `synthetic.pr20.${p.id}`, totalAmount: yuan(d.amount_minor), tradeStatus: q === 'SUCCEEDED' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY' }; }
    const [[r]] = await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='REFUND'", [b.outRequestNo]); assert(r);
    const rd = typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json;
    if (method === 'alipay.trade.refund') return { code: '10000', outTradeNo: p.id, tradeNo: rd.transaction_id };
    assert.equal(method, 'alipay.trade.fastpay.refund.query'); const q = refundQueries.get(r.id) || 'PENDING'; if (q === 'TIMEOUT') throw new Error('SYNTHETIC_QUERY_TIMEOUT');
    return { code: '10000', outTradeNo: p.id, tradeNo: rd.transaction_id, outRequestNo: r.id, refundAmount: yuan(rd.amount_minor), refundStatus: q === 'SUCCEEDED' ? 'REFUND_SUCCESS' : 'REFUND_PROCESSING' };
  };
  providers = fromBackend('./src/modules/trade/providers').createTradeProviders(db, tradeEnv, { alipay });
  const readiness = fromBackend('./src/modules/providers/readiness').createReadinessRepository(db, { authorizeChange: async a => a === 'synthetic.pr20.fixture', verifyEvidence: async i => i.evidence_ref === 'synthetic.pr20.local-transport' });
  await readiness.record({ provider_kind: 'PaymentProvider', provider_code: 'alipay', capability_code: 'order_payment', environment: 'SANDBOX', current_status: 'SANDBOX_VERIFIED',
    config_revision: providers.configuration('ALIPAY').config_revision, expected_version: 0, evidence_ref: 'synthetic.pr20.local-transport', reason_code: 'SYNTHETIC_TEST_ONLY' }, { actor_ref: 'synthetic.pr20.fixture' });
  ruleId = key(); const rule = fromBackend('./src/modules/governance/content').createRuleContent({ id: ruleId, rule_key: 'projects.pr20.synthetic', version: '1', terms: { explicit: '仅PR20合成测试规则；金额、渠道和同意不是真实商业默认。' } });
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)', [ruleId, 'projects.pr20.synthetic', '1', JSON.stringify(rule), '2020-01-01 00:00:00', payer.accountId, 'EFFECTIVE']);
  const upload = (p, purpose, text) => call('POST', `/supply/assets?purpose=${purpose}&media_type=text%2Fplain`, { person: p, party: p.actingPartyId, body: Buffer.from(text) });
  const sr = (route, row, extra = {}) => call('POST', `/supply/${route}/${row.id}/reviews`, { person: independentReviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '独立核对合成材料，不证明真人身份或真实权利', ...extra } });
  const tr = row => call('POST', `/trade/records/${row.id}/reviews`, { person: independentReviewer, version: row.object_version, body: { decision: 'APPROVED', reason: '合成交易明确条件的独立审核' } });
  const productionRead = r => call('GET', `/production/records/${r.id || r}`, { person: payer, party: payerOrganizationId });
  const checklist = stage => stage === 'SCRIPT' ? { script_reviewed: true } : { script_reviewed: true, specification_reviewed: true, audio_reviewed: true, branding_reviewed: true };
  const pr = r => call('POST', `/production/records/${r.id}/reviews`, { person: independentReviewer, version: r.object_version, body: { decision: 'APPROVED', reason: '合成制作合同与版本的独立核对', verification: r.kind === 'PROJECT' ? { contract_sha256: r.data.contract_sha256, identity_verified: true, signatures_verified: true, rights_verified: true } : checklist(r.data.stage) } });
  phase = 'real supply and self consent';
  assets.producerProof = await upload(recipient, 'RIGHTS_EVIDENCE', '仅PR20合成演员、原作与制作依据，没有真实人脸声纹或商业授权。');
  assets.sponsorProof = await upload(payer, 'RIGHTS_EVIDENCE', '仅PR20合成项目6层权利、送审材料与外部凭据；不是实际出版授权。');
  assets.channelProof = await upload(channelRegistrar, 'RIGHTS_EVIDENCE', '仅PR20合成渠道登记依据；没有启用外部发行渠道。');
  assets.originalContent = await upload(recipient, 'WORK_CONTENT', '《清风短笺》合成原创文字；只供本地隔离测试。');
  assets.avatarMaterial = await upload(recipient, 'AVATAR_MATERIAL', 'Synthetic actor placeholder, no real face or voice.');
  assets.consentEvidence = await upload(recipient, 'CONSENT_EVIDENCE', '合成个人账号本人主动提交的测试同意；不证明实名。');
  records.producerProfile = await sr('profiles', await call('POST', '/supply/profiles', { person: recipient, party: recipient.personalPartyId, body: { display_name: '清风合成演员与原制作方', description: '仅隔离测试供给身份', evidence_asset_ids: [assets.producerProof.id], previous_profile_id: null } }));
  let work = await call('POST', '/supply/work-versions', { person: recipient, party: recipient.personalPartyId, body: { work_id: null, previous_version_id: null, title: '清风短笺 · 合成原创', kind: 'ORIGINAL', source_version_id: null, project_id: null, content_asset_id: assets.originalContent.id, evidence_ids: [assets.producerProof.id], credits: [{ party_id: recipient.personalPartyId, role: 'RIGHTS_HOLDER', evidence_asset_ids: [assets.producerProof.id] }] } });
  work = await call('POST', `/supply/work-versions/${work.id}/actions`, { person: recipient, party: recipient.personalPartyId, version: work.object_version, body: { action: 'SUBMIT', reason: null } });
  for (const channel of ['RIGHTS', 'CONTENT']) work = await sr('work-versions', work, { channel }); records.originalWork = work;
  records.avatar = await call('POST', '/supply/avatars', { person: recipient, party: recipient.personalPartyId, body: { display_name: 'PR20合成人物资料（无真人）', material_asset_ids: [assets.avatarMaterial.id] } });
  async function consent(name, purposes) { return records[name] = await sr('consents', await call('POST', '/supply/consents', { person: recipient, party: recipient.personalPartyId, body: { consent: { avatar_id: records.avatar.id, subject_party_id: recipient.personalPartyId, features: ['FACE', 'VOICE'], purposes, territories: ['CN'], valid_from: validFrom, valid_until: validUntil, terms: '本人合成测试同意；范围明确，不是真人授权或正式商业默认。', evidence_asset_ids: [assets.consentEvidence.id] } } })); }
  for (const side of ['web', 'app']) { await consent(side + 'PrivateConsent', ['PRIVATE']); await consent(side + 'PublicConsent', ['PUBLIC_SHARE', 'RELEASE']); }
  async function spec(name, kind, amount) { return records[name] = await tr(await call('POST', '/trade/specifications', { person: recipient, party: recipient.personalPartyId, body: { previous_spec_id: null, title: name + ' · PR20合成明确条件', provider_party_id: recipient.personalPartyId, line_kind: kind, unit_minor: amount, currency: 'CNY', specification: { version: 'synthetic.v1', service_tier: '仅合成测试档位', sample_seconds: 20, final_seconds: 90, revision_limit: 2, deliverables: ['合成文字', '可播放合成预览', '不同字节的合成最终文件'], terms: '所有金额、时长、条件只用于隔离样本，不作默认商品。' } } })); }
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
      const v = await pr(await call('POST', `/production/projects/${p.id}/versions`, { person: recipient, party: recipient.personalPartyId, version: p.object_version, body: { stage, file_id: f.id, preview_file_id: preview.id, note: '仅PR20可播放合成材料；没有真实生产生成' } }));
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

  phase = 'separate real project comment targets and finance entries';
  for (const side of ['web','app']) {
    const p = await call('POST','/projects/projects',{person:payer,party:payerOrganizationId,body:{title:side+' · PR20合成留言项目',scope:targetScope('PUBLIC_SHARE')}});
    records[side+'CommentProject']=p;
    const r = await call('POST',`/projects/projects/${p.id}/roles`,{person:payer,party:payerOrganizationId,version:p.object_version,body:{title:'合成零费邀请，仅留言测试',capacity:1,pricing:'FIXED',amount_minor:0,terms:'仅本隔离测试明确零费，不是商业默认'}});
    records[side+'CommentRole']=r;
    records[side+'CommentCandidate']=await call('POST',`/projects/roles/${r.id}/invitations`,{person:payer,party:payerOrganizationId,version:r.object_version,body:{invitee_party_id:recipient.personalPartyId}});
    let g = await call('POST','/finance/agreements',{person:recipient,party:recipient.personalPartyId,body:{source_type:'ORDER',source_id:records[side+'ProductionOrder'].id,previous_agreement_id:null,environment:'SANDBOX',rule_id:ruleId,
      rules:{version:'synthetic.pr20.v1',settlement_at:validFrom,release_condition:'RECEIVED',terms:'仅合成制作10000分；明确70%制作方/30%买方合作份额，不是商业默认。',lines:[{line_id:'film',shares:[{party_id:recipient.personalPartyId,bps:7000,role:'SUPPLIER'},{party_id:payerOrganizationId,bps:3000,role:'PARTICIPANT'}],deductions:[]}]},evidence_asset_id:assets.producerProof.id}});
    const fv={decision:'APPROVED',reason:'独立核对合成账款与凭据，不证明实际银行出款',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true}};
    g=await call('POST',`/finance/records/${g.id}/reviews`,{person:independentReviewer,version:g.object_version,body:fv});records[side+'Agreement']=g;
    const confirm=async row=>{for(const person of [payer,recipient]) await call('POST',`/finance/records/${row.id}/confirmations`,{person,party:person.actingPartyId,version:row.object_version,body:{content_sha256:row.content_sha256,decision:'APPROVED',reason:'本人核对准确原始合成约定hash'}});};
    await confirm(g);
    let s=await call('POST',`/finance/agreements/${g.id}/settlements`,{person:recipient,party:recipient.personalPartyId,version:g.object_version,body:{period_reference:'synthetic.pr20.'+side,note:'合成结算按已核验SANDBOX收款生成'}});
    s=await call('POST',`/finance/records/${s.id}/reviews`,{person:independentReviewer,version:s.object_version,body:fv});await confirm(s);records[side+'Settlement']=s;
    let po=await call('POST',`/finance/agreements/${g.id}/payouts`,{person:payer,party:payerOrganizationId,version:g.object_version,body:{recipient_party_id:payerOrganizationId,amount_minor:1000,destination_asset_id:assets.sponsorProof.id,note:'明确合成合作款1000分；不是实际银行账户或自动出款'}});
    po=await call('POST',`/finance/records/${po.id}/reviews`,{person:independentReviewer,version:po.object_version,body:fv});
    let pe=await call('POST',`/finance/payouts/${po.id}/evidence`,{person:recipient,party:recipient.personalPartyId,version:po.object_version,body:{outcome:'PAID',amount_minor:1000,external_reference:'synthetic.pr20.bank.'+side,occurred_at:new Date(now-1000).toISOString(),evidence_asset_id:assets.producerProof.id,note:'合成手工凭据，独立审核后记账，不是真实付款或自动转账'}});
    pe=await call('POST',`/finance/records/${pe.id}/reviews`,{person:independentReviewer,version:pe.object_version,body:fv});records[side+'PayoutEvidence']=pe;records[side+'Payout']=po;
    scenarios[side]={tradeOrderId:records[side+'ProductionOrder'].id,productionProjectId:records[side+'ProductionProject'].id,productionVersionId:records[side+'SCRIPTVersion'].id,projectId:p.id,agreementId:g.id,financeEvidenceId:assets.producerProof.id};
  }
  let refund=await call('POST','/trade/refunds',{person:payer,party:payerOrganizationId,body:{payment_id:records.webFirstPayment.id,allocations:[{line_id:'film',amount_minor:100}],reason:'明确合成100分部分退款，仅原支付实际流程'}});
  refund=await tr(refund);refund=await call('POST',`/trade/refunds/${refund.id}/execution`,{person:independentReviewer,version:refund.object_version,body:{}});refundQueries.set(refund.id,'SUCCEEDED');
  records.webRefund=await call('POST',`/trade/refunds/${refund.id}/reconciliation`,{person:payer,party:payerOrganizationId,body:{}});assert.equal(records.webRefund.current_status,'SUCCEEDED');
  checks.push('Separate App/Web PROJECTS.PROJECT and actual invitation make sponsor/participant readable; real reviewed ORDER agreements and both exact-hash confirmations generate ACCRUAL entries;1000 manual payout evidence is independently approved and journaled;100 verified sandbox refund remains distinct from receipts');

  const ops=(route)=>'/operations'+route;
  const target=(domain,id)=>`/objects/${domain}/${id}/comments`;
  const add=(domain,id,body,person=payer,reply=null,operationKey)=>call('POST',ops(target(domain,id)),{person,party:person===independentReviewer?undefined:person.actingPartyId,body:{body,reply_to:reply},operationKey});
  const list=(domain,id,person=payer,party=person===independentReviewer?undefined:person.actingPartyId)=>call('GET',ops(target(domain,id)),{person,party});
  const action=(comment,act,person=payer,status=200,operationKey,version=comment.object_version)=>request('POST',ops(`/comments/${comment.id}/actions`),{person,party:person===independentReviewer?undefined:person.actingPartyId,version,operationKey,status,body:{action:act,reason:'明确合成留言处理，原文与历史保留在原后端'}});
  phase='real supported comments and independent moderation';
  for (const side of ['web','app']) {
    const o=records[side+'ProductionOrder'],p=records[side+'ProductionProject'],v=records[side+'SCRIPTVersion'],j=records[side+'CommentProject'];
    records[side+'VisibleComment']=await add('TRADE',o.id,'=SUM(1,2)\n仅合成纯文本留言 <script>不执行</script>，不是富文本或真实商业交流。');
    records[side+'ReplyComment']=await add('TRADE',o.id,'合成原制作方对同一订单的实际回复',recipient,records[side+'VisibleComment'].id);
    records[side+'WithdrawReadyComment']=await add('TRADE',o.id,'本人可撤回的未消费合成留言');
    records[side+'HideReadyComment']=await add('TRADE',o.id,'独立运营可隐藏的未消费合成留言',recipient);
    records[side+'ProductionComment']=await add('PRODUCTION',p.id,'合成制作项目留言');
    records[side+'VersionComment']=await add('PRODUCTION',v.id,'合成制作SCRIPT版本留言',recipient);
    records[side+'ProjectComment']=await add('PROJECTS',j.id,'合成项目发起方留言');
    records[side+'ProjectReplyComment']=await add('PROJECTS',j.id,'实际邀请参与方回复',recipient,records[side+'ProjectComment'].id);
    for (const [domain,id] of [['TRADE',o.id],['PRODUCTION',p.id],['PRODUCTION',v.id],['PROJECTS',j.id]]) {assert((await list(domain,id,recipient)).items.length);await request('GET',ops(target(domain,id)),{person:outsider,party:outsider.personalPartyId,status:404});}
  }
  const vo=records.webProductionOrder,ao=records.appProductionOrder,dupKey=key(),dupBody={body:'同一请求并发仅一次合成留言',reply_to:null};
  const duplicates=await Promise.all([1,2,3].map(()=>call('POST',ops(target('TRADE',vo.id)),{person:payer,party:payerOrganizationId,body:dupBody,operationKey:dupKey})));
  assert.equal(new Set(duplicates.map(c=>c.id)).size,1);records.verificationDuplicateComment=duplicates[0];
  await request('POST',ops(target('TRADE',vo.id)),{person:payer,party:payerOrganizationId,operationKey:dupKey,body:{...dupBody,body:'更改原编号内容'},status:409});
  await request('POST',ops(target('TRADE',ao.id)),{person:payer,party:payerOrganizationId,body:{body:'跨订单回复禁止',reply_to:records.webVisibleComment.id},status:409});
  const withdrawn=await add('TRADE',vo.id,'实际撤回前的合成文字');await action(withdrawn,'WITHDRAW',recipient,403);await action(withdrawn,'WITHDRAW',payer,412,undefined,withdrawn.object_version+1);
  records.verificationWithdrawnComment=(await action(withdrawn,'WITHDRAW')).body.data;assert.equal(records.verificationWithdrawnComment.body,null);
  const hidden=await add('TRADE',vo.id,'实际隐藏前的合成文字',recipient);records.verificationHiddenComment=(await action(hidden,'HIDE',independentReviewer)).body.data;assert.equal(records.verificationHiddenComment.body,null);
  const self=await add('TRADE',vo.id,'合成运营本人文字，不允许自己隐藏',independentReviewer);await action(self,'HIDE',independentReviewer,403);records.verificationOperatorComment=self;
  await request('GET',ops(target('TRADE',vo.id)),{person:member,party:payerOrganizationId,status:403});
  const [[storedHidden]]=await db.execute('SELECT body FROM ops_comments WHERE id=?',[hidden.id]);assert.equal(storedHidden.body,hidden.body);
  for(const id of [withdrawn.id,hidden.id]) assert.equal((await list('TRADE',vo.id)).items.find(c=>c.id===id).body,null);
  await request('GET',ops('/audit'),{person:payer,party:payerOrganizationId,status:403});assert((await call('GET',ops('/audit'),{person:independentReviewer})).items.some(x=>x.event_code==='COMMENT_HIDE'));
  for(const [domain,id] of [['TRADE',vo.id],['PRODUCTION',records.webProductionProject.id],['PROJECTS',records.webCommentProject.id]]) assert((await call('GET',ops(`/objects/${domain}/${id}/audit`),{person:independentReviewer})).items.length);
  checks.push('All four actual comment target kinds are readable by sponsor/participant and404 outsider; duplicate concurrent comment is one record, changed same-key and cross-object reply409; only author withdraws, stale version412; hidden/withdrawn public body=null; independent COMMENT_MODERATE hides and self moderation403; audit requires independent permission without acting party');

  phase='real reports queued and generated by original worker';
  jobs=fromBackend('./src/infrastructure/jobs/repository').createJobRepository(db);reportHandler=fromBackend('./src/modules/operations/reports').createOperationsHandlers(db).get('OPERATIONS_REPORT');
  async function runWorker() {
    if(workerBusy) return {busy:true,processed:0};workerBusy=true;let processed=0;
    try {for(let n=0;n<100;n++){const job=await jobs.claim('synthetic.pr20.local-worker',60000);if(!job)break;assert.equal(job.task_type,'OPERATIONS_REPORT');const result=await reportHandler.execute(job);await jobs.finish(job,result);workerHistory.push({jobId:job.id,reportId:job.payload_ref,status:result.status,errorCode:result.error_code||null,attempts:job.attempts});processed++;}return {processed};}
    finally {try {if(stateOwned) await saveState();} finally {workerBusy=false;}}
  }
  const period={environment:'SANDBOX',period_start:new Date(now-86400000).toISOString(),period_end:new Date(now+86400000).toISOString()};
  const context=side=>side==='web'?{person:independentReviewer}:{person:payer,party:payerOrganizationId};
  const reportRequest=(name,kind,ctx,body=period,operationKey)=>call('POST',ops('/reports'),{...ctx,operationKey,body:{kind,...body}}).then(r=>(records[name]=r));
  const reportRead=(r,ctx)=>call('GET',ops(`/reports/${r.id}`),ctx);
  for(const side of ['web','app']) for(const kind of ['CASH','SETTLEMENT','WORKLOAD']) {const name=side+kind[0]+kind.slice(1).toLowerCase()+'Report',r=await reportRequest(name,kind,context(side));assert.equal(r.current_status,'PENDING');await request('GET',ops(`/reports/${r.id}/content`),{...context(side),status:409});}
  assert.equal((await runWorker()).processed,6);
  for(const side of ['web','app']) for(const kind of ['CASH','SETTLEMENT','WORKLOAD']) {
    const name=side+kind[0]+kind.slice(1).toLowerCase()+'Report',r=await reportRead(records[name],context(side));records[name]=r;assert.equal(r.current_status,'SUCCEEDED');assert(r.result.row_count>0);
    const csv=await request('GET',ops(`/reports/${r.id}/content`),context(side)),bytes=csv.body;assert(Buffer.isBuffer(bytes));assert(bytes.subarray(0,3).equals(Buffer.from([239,187,191])));assert.equal(csv.headers.get('cache-control'),'no-store');assert.equal(csv.headers.get('x-content-type-options'),'nosniff');
    const text=bytes.toString('utf8');assert(text.includes('\r\n'));assert(!text.replaceAll('\r\n','').includes('\n'));assert(text.includes('"environment","SANDBOX"'));assert(text.includes('"row_count",'+r.result.row_count));assert.notEqual(sha(bytes),r.content_sha256);
    if(kind==='CASH'){assert.equal(r.result.totals.RECEIPT,20000);assert.equal(r.result.totals.REFUND,100);}
    if(kind==='SETTLEMENT') assert.equal(r.result.totals.PAYOUT,-2000);
    if(kind==='WORKLOAD'){assert.equal(r.result.row_count,2);assert.equal(r.result.totals.ACCEPTED,2);}
    scenarios[side][kind.toLowerCase()+'ReportId']=r.id;
  }
  const {csvCell}=fromBackend('./src/modules/operations/policy');for(const text of ['=SUM(1,2)','+CMD','-1','@A','\t=1','\rtest','  =2']) assert(csvCell(text).startsWith('"\''));assert.equal(csvCell(-100),'-100');assert.equal(csvCell('a"b'),'"a""b"');
  await request('GET',ops(`/reports/${records.webCashReport.id}`),{person:payer,party:payerOrganizationId,status:404});await request('GET',ops(`/reports/${records.appCashReport.id}/content`),{person:outsider,party:outsider.personalPartyId,status:404});
  await request('POST',ops('/reports'),{person:member,party:payerOrganizationId,body:{kind:'CASH',...period},status:403});await request('POST',ops('/reports'),{person:independentReviewer,body:{kind:'CASH',...period,period_end:period.period_start},status:400});
  const productionEmpty=await reportRequest('verificationProductionReport','CASH',{person:independentReviewer},{...period,environment:'PRODUCTION'});await runWorker();const emptyReport=await reportRead(productionEmpty,{person:independentReviewer});assert.equal(emptyReport.result.row_count,0);records.verificationProductionReport=emptyReport;
  checks.push('Three CASH/SETTLEMENT/WORKLOAD reports per side really enqueue; original leased worker generates immutable snapshots with receipt20000/refund100,actual settlement/payout and two ACCEPTED paid productions; CSV real BOM/CRLF metadata/row count/no-store/nosniff with distinct CSV vs JSON hash; original formula safety escapes text while numeric negative amount stays numeric; requester-only/OWNER/bounds checked and PRODUCTION report excludes SANDBOX money');

  const blocked=[];for(const name of ['webBlockedReport','verificationRetryReport']) blocked.push(await reportRequest(name,'WORKLOAD',{person:independentReviewer}));
  await grant('independentReviewer','OPERATIONS_REPORT',false);await runWorker();await grant('independentReviewer','OPERATIONS_REPORT',true);
  for(const r of blocked){const current=await reportRead(r,{person:independentReviewer});assert.equal(current.current_status,'BLOCKED');assert.equal(current.error_code,'OPERATIONS_FORBIDDEN');assert.equal(current.result,null);}
  const appBlocked=await reportRequest('appBlockedReport','WORKLOAD',{person:payer,party:payerOrganizationId});await membership('payer',false);await runWorker();await membership('payer',true);const appBlockedRead=await reportRead(appBlocked,{person:payer,party:payerOrganizationId});assert.equal(appBlockedRead.current_status,'BLOCKED');assert.equal(appBlockedRead.error_code,'PARTY_ACTION_FORBIDDEN');assert.equal(appBlockedRead.result,null);
  const retry=records.verificationRetryReport,retryKey=key(),retryBody={reason:'恢复隔离合成授权后真实重试，不伪造成功'};
  const rr=await call('POST',ops(`/reports/${retry.id}/retries`),{person:independentReviewer,body:retryBody,operationKey:retryKey});assert.equal(rr.current_status,'RETRY');
  await call('POST',ops(`/reports/${retry.id}/retries`),{person:independentReviewer,body:retryBody,operationKey:retryKey});await runWorker();records.verificationRetryReport=await reportRead(retry,{person:independentReviewer});assert.equal(records.verificationRetryReport.current_status,'SUCCEEDED');
  const [[retryJob]]=await db.execute('SELECT job_id FROM ops_reports WHERE id=?',[retry.id]);const [[retryCount]]=await db.execute('SELECT COUNT(*) n FROM platform_job_retries WHERE job_id=?',[retryJob.job_id]);assert.equal(Number(retryCount.n),1);
  checks.push('Actual Web queued reports execute while OPERATIONS_REPORT revoked, and App OWNER report executes while actual membership revoked; both become BLOCKED with null result; restoration allows real retry, original key replay creates one manual-retry audit and original leased worker generates same report; untouched App/Web BLOCKED records retained for UI');

  phase='private controls and actual source revocation';
  async function membership(name,enabled) {
    assert(['payer','recipient','member'].includes(name));const p=people[name],party=p.actingPartyId;
    await db.withTransaction(async tx=>{const [[m]]=await tx.execute('SELECT * FROM party_memberships WHERE account_id=? AND party_id=? FOR UPDATE',[p.accountId,party]);assert(m);const state=enabled?'ACTIVE':'REVOKED';if(m.current_status===state)return;
      await tx.execute('UPDATE party_memberships SET current_status=?,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?',[state,m.id]);
      await tx.execute('INSERT INTO party_audit_events(id,party_id,actor_account_id,event_code,object_id,object_version,request_id) VALUES (?,?,?,?,?,?,?)',[key(),party,independentReviewer.accountId,enabled?'PR20_FIXTURE_MEMBERSHIP_RESTORED':'PR20_FIXTURE_MEMBERSHIP_REVOKED',m.id,m.object_version+1,key()]);});membershipEnabled=enabled;
  }
  controlServer=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.headers.origin||req.headers.authorization!==`Bearer ${controlToken}`){res.writeHead(403);res.end('{"error":"TEST_CONTROL_FORBIDDEN"}');return;}
    try {const u=new URL(req.url,controlUrl),get=k=>u.searchParams.get(k);let out;
      if(req.method==='GET'&&u.pathname==='/code'){assert(Object.values(phones).includes(get('phone')));const code=sent.get(get('phone'));res.writeHead(code?200:404);res.end(JSON.stringify({code:code||null}));return;}
      else if(req.method==='GET'&&u.pathname==='/state')out=await snapshot();
      else if(req.method==='POST'&&['/storage','/evidence'].includes(u.pathname)){assert(['true','false'].includes(get('enabled')));if(u.pathname==='/storage')storageAvailable=get('enabled')==='true';else evidenceIntact=get('enabled')==='true';out={storageAvailable,evidenceIntact};}
      else if(req.method==='POST'&&u.pathname==='/reviewer-permission'){assert(['OPERATIONS_REPORT','OPERATIONS_AUDIT','COMMENT_MODERATE','TRADE_REVIEW','TRADE_REFUND','PRODUCTION_REVIEW','PROJECT_REVIEW','FINANCE_REVIEW'].includes(get('action')));assert(['true','false'].includes(get('enabled')));const g=await grant('independentReviewer',get('action'),get('enabled')==='true');out={action:g.action,enabled:g.enabled};}
      else if(req.method==='POST'&&u.pathname==='/party-permission'){assert(['true','false'].includes(get('enabled')));await membership(get('account'),get('enabled')==='true');out={account:get('account'),enabled:get('enabled')==='true'};}
      else if(req.method==='POST'&&u.pathname==='/response-loss'){if(get('operation')==='NONE')responseLoss=null;else{assert(Object.hasOwn(operations,get('operation')));assert.equal(get('mode'),'503');responseLoss={operation:get('operation'),mode:'503'};}out={nextResponseLoss:responseLoss};}
      else if(req.method==='POST'&&u.pathname==='/worker'){assert(['true','false'].includes(get('enabled')));workerEnabled=get('enabled')==='true';out={workerEnabled};}
      else if(req.method==='POST'&&u.pathname==='/worker-run')out=await runWorker();
      else if(req.method==='POST'&&['/payment-query','/refund-query'].includes(u.pathname)){assert(['PENDING','SUCCEEDED','TIMEOUT'].includes(get('result')));const kind=u.pathname==='/payment-query'?'PAYMENT':'REFUND',id=get(kind==='PAYMENT'?'payment_id':'refund_id');const [[r]]=await db.execute('SELECT id FROM trade_records WHERE id=? AND kind=?',[id,kind]);assert(r);(kind==='PAYMENT'?paymentQueries:refundQueries).set(id,get('result'));out={id,result:get('result')};}
      else{res.writeHead(404);res.end('{"error":"NOT_FOUND"}');return;}
      if(stateOwned&&req.method==='POST')await saveState();res.end(JSON.stringify(out));
    }catch{res.writeHead(400);res.end('{"error":"INVALID_TEST_CONTROL"}');}
  });await listen(controlServer,controlPort);
  workerTimer=setInterval(()=>{if(workerEnabled&&!workerBusy)runWorker().catch(()=>{workerEnabled=false;});},400);workerTimer.unref();
  const control=async route=>{const r=await fetch(controlUrl+route,{method:'POST',headers:{Authorization:`Bearer ${controlToken}`}});assert.equal(r.status,200);return r.json();};
  assert.equal((await fetch(controlUrl+'/state')).status,403);assert.equal((await fetch(controlUrl+'/state',{headers:{Authorization:`Bearer ${controlToken}`,Origin:origins[0]}})).status,403);
  await control('/reviewer-permission?action=PRODUCTION_REVIEW&enabled=false');await request('GET',ops(`/reports/${records.webWorkloadReport.id}/content`),{person:independentReviewer,status:403});
  assert.equal((await reportRead(records.webCashReport,{person:independentReviewer})).current_status,'SUCCEEDED');await control('/reviewer-permission?action=PRODUCTION_REVIEW&enabled=true');assert((await request('GET',ops(`/reports/${records.webWorkloadReport.id}/content`),{person:independentReviewer})).body.length);
  await control('/party-permission?account=payer&enabled=false');await request('GET',ops(target('TRADE',vo.id)),{person:payer,party:payerOrganizationId,status:403});await request('GET',ops('/notifications'),{person:payer,party:payerOrganizationId,status:403});await request('GET',ops(`/reports/${records.appCashReport.id}/content`),{person:payer,party:payerOrganizationId,status:403});await control('/party-permission?account=payer&enabled=true');
  const proofRoute=`/finance/records/${records.webAgreement.id}/evidence/${assets.producerProof.id}`;
  await request('GET',proofRoute,{person:outsider,party:outsider.personalPartyId,status:404});const proof=await request('GET',proofRoute,{person:recipient,party:recipient.personalPartyId});assert.equal(proof.body.length,assets.producerProof.byte_size);assert.equal(sha(proof.body),assets.producerProof.content_sha256);
  await control('/evidence?enabled=false');await request('GET',proofRoute,{person:recipient,party:recipient.personalPartyId,status:503});await control('/evidence?enabled=true');await control('/storage?enabled=false');await request('GET',proofRoute,{person:recipient,party:recipient.personalPartyId,status:503});await control('/storage?enabled=true');assert((await request('GET',proofRoute,{person:recipient,party:recipient.personalPartyId})).body.equals(proof.body));
  checks.push('Anonymous/any-Origin control denied; actual underlying PRODUCTION_REVIEW revocation rejects whole generated WORKLOAD content while CASH remains readable; source grant restoration recovers original snapshot; actual OWNER membership revoke blocks old-token comments/inbox/report content, restore succeeds; private proof exact bytes/hash/404 outsider, corruption503/storage503 and restoration verified');

  // Force the real MySQL binary-protocol zero-fraction case for every browser run.
  await db.execute("UPDATE ops_events SET created_at=DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s')");
  phase='account and party notification read state and unknown reply recovery';
  const notifications=await call('GET',ops('/notifications?limit=100'),{person:payer,party:payerOrganizationId});assert(notifications.items.length);const event=notifications.items.find(n=>n.record_id===vo.id);assert(event);
  assert.equal((await call('GET',ops('/notifications?limit=100'),{person:outsider,party:outsider.personalPartyId})).items.length,0);
  const lossKey=key(),lostBody={body:'原写入完成后丢回复，必须保留原编号与正文',reply_to:null};await control('/response-loss?operation=comment&mode=503');await request('POST',ops(target('TRADE',vo.id)),{person:payer,party:payerOrganizationId,operationKey:lossKey,body:lostBody,status:503});
  const recovered=await call('POST',ops(target('TRADE',vo.id)),{person:payer,party:payerOrganizationId,operationKey:lossKey,body:lostBody});records.verificationResponseLossComment=recovered;recovery.at(-1).recordId=recovered.id;
  const lostAction=await add('TRADE',vo.id,'实际撤回成功后丢回复的合成文字'),actionKey=key();await control('/response-loss?operation=commentAction&mode=503');await action(lostAction,'WITHDRAW',payer,503,actionKey);const actionReplay=(await action(lostAction,'WITHDRAW',payer,200,actionKey)).body.data;assert.equal(actionReplay.object_version,lostAction.object_version+1);assert.equal(actionReplay.body,null);records.verificationResponseLossAction=actionReplay;recovery.at(-1).recordId=actionReplay.id;
  const [[onlyOne]]=await db.execute('SELECT COUNT(*) n FROM ops_comments WHERE author_account_id=? AND record_id=? AND body=?',[payer.accountId,vo.id,lostBody.body]);assert.equal(Number(onlyOne.n),1);
  const readKey=key();await control('/response-loss?operation=markRead&mode=503');await request('POST',ops(`/notifications/${event.id}/read`),{person:payer,party:payerOrganizationId,body:{},operationKey:readKey,status:503});await call('POST',ops(`/notifications/${event.id}/read`),{person:payer,party:payerOrganizationId,body:{},operationKey:readKey});
  const [reads]=await db.execute('SELECT * FROM ops_reads WHERE event_id=?',[event.id]);assert.equal(reads.length,1);assert.equal(reads[0].account_id,payer.accountId);assert.equal(reads[0].party_id,payerOrganizationId);
  const recipientEvent=(await call('GET',ops('/notifications?limit=100'),{person:recipient,party:recipient.personalPartyId})).items.find(n=>n.id===event.id);assert(recipientEvent);assert.equal(recipientEvent.read,false);
  const lostReportKey=key();await control('/response-loss?operation=report&mode=503');await request('POST',ops('/reports'),{person:payer,party:payerOrganizationId,body:{kind:'CASH',...period},operationKey:lostReportKey,status:503});const recoveredReport=await reportRequest('verificationResponseLossReport','CASH',{person:payer,party:payerOrganizationId},period,lostReportKey);assert.equal(recoveredReport.current_status,'PENDING');await runWorker();records.verificationResponseLossReport=await reportRead(recoveredReport,{person:payer,party:payerOrganizationId});
  const workerProbe=await reportRequest('verificationWorkerSwitchReport','CASH',{person:payer,party:payerOrganizationId});await control('/worker?enabled=true');let generatedProbe;for(let n=0;n<30;n++){await new Promise(resolve=>setTimeout(resolve,100));generatedProbe=await reportRead(workerProbe,{person:payer,party:payerOrganizationId});if(generatedProbe.current_status==='SUCCEEDED')break;}assert.equal(generatedProbe.current_status,'SUCCEEDED');records.verificationWorkerSwitchReport=generatedProbe;await control('/worker?enabled=false');
  for(const side of ['web','app']) {records[side+'PendingReport']=await reportRequest(side+'PendingReport','CASH',context(side));scenarios[side].reportActor=side==='web'?'independentReviewer':'payer';scenarios[side].reportPartyId=side==='web'?null:payerOrganizationId;scenarios[side].pendingReportId=records[side+'PendingReport'].id;scenarios[side].blockedReportId=records[side+'BlockedReport'].id;}
  await control('/worker?enabled=false');await new Promise(resolve=>setTimeout(resolve,300));for(const side of ['web','app']) assert.equal((await reportRead(records[side+'PendingReport'],context(side))).current_status,'PENDING');
  for(const port of [5211,5212,8779,8780]){const origin=`http://127.0.0.1:${port}`,r=await request('OPTIONS',ops('/reports'),{status:204,headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});assert.equal(r.headers.get('access-control-allow-origin'),origin);}await request('OPTIONS',ops('/reports'),{status:403,headers:{Origin:'https://example.invalid'}});
  checks.push('Notifications derive real business events; read row is exact account+party, same event remains unread for other party; outsider feed empty; comment/action/markRead/report each really commit then one503 reply, original-key replay yields one real comment/read/report job; original worker enable control generates a queued report, disabling leaves fresh independent App/Web PENDING and CORS allows only explicit loopback UI ports');
  creation.common={report:{kind:'CASH',...period},reportKinds:['CASH','SETTLEMENT','WORKLOAD'],comment:{body:'仅合成纯文本留言，不是真实商业交流',reply_to:null},commentTargets:['TRADE.ORDER','PRODUCTION.PROJECT','PRODUCTION.VERSION','PROJECTS.PROJECT'],payerPartyId:payerOrganizationId,recipientPartyId:recipient.personalPartyId,operatorAccountId:independentReviewer.accountId,proofRoute,reportJsonHashMeaning:'IMMUTABLE_REPORT_JSON_NOT_CSV_BYTES'};
  phase='private runtime state';await saveState();assert.equal((await fs.stat(statePath)).mode&0o777,0o600);const safe=JSON.stringify(await snapshot());assert.equal(safe.includes(controlToken),false);for(const p of Object.values(people))assert.equal(safe.includes(p.token),false);
  console.log(`Isolated PR20 API ready: ${apiUrl}; control ${controlUrl}; PID ${process.pid}; schema ${schema}; ${checks.length} actual check groups; private runtime ${statePath}`);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{Promise.resolve(startupPromise).catch(()=>{}).then(cleanup).then(()=>process.exit(0),()=>{console.error(`PR20 cleanup failed for own schema ${schema}`);process.exit(1);});});
startupPromise=main();startupPromise.catch(async e=>{console.error(`PR20 launcher failed during ${phase}: ${e.code||e.name}${e.name==='AssertionError'?' '+e.message:''}`);await cleanup().catch(()=>console.error(`PR20 cleanup failed for own schema ${schema}`));process.exit(1);});
