'use strict';

// Local UI integration only: real PR11/PR12 handlers, an isolated MySQL schema,
// synthetic SMS and no payment, signing, identity or digital-human bindings.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const backend = path.resolve(process.env.PR12_UI_BACKEND_ROOT ||
  path.join(__dirname, '../晶晶日上工程交接包/01_源码/backend_server'));
const statePath = path.resolve(process.env.PR12_UI_STATE_FILE || '.local/pr12-ui-runtime.json');
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const controlToken = crypto.randomBytes(32).toString('hex');
let mysql, db, connection, apiServer, controlServer, cleanupPromise, startupPromise;
let schemaCreated = false;

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    for (const server of [apiServer, controlServer]) {
      if (server?.listening) {
        try {
          const closed = new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
          server.closeAllConnections();
          await closed;
        } catch (e) { failures.push(e); }
      }
    }
    try { if (db) await db.close(); } catch (e) { failures.push(e); }
    if (connection) {
      try {
        if (schemaCreated) await connection.query('DROP DATABASE ' + mysql.escapeId(schema));
      } catch (e) { failures.push(e); }
      try { await connection.end(); } catch (e) { failures.push(e); }
    }
    try {
      const saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
      if (saved.controlToken === controlToken) await fs.unlink(statePath);
    } catch (e) { if (e.code !== 'ENOENT') failures.push(e); }
    if (failures.length) throw new AggregateError(failures, 'LOCAL_TEST_CLEANUP_FAILED');
  })();
  return cleanupPromise;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

async function main() {
  assert(process.argv.includes('--test-only'), 'Pass --test-only for isolated UI integration.');
  assert(process.env.JX_MYSQL_TEST_ENV_FILE, 'A local test database configuration is required.');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.DB_CLIENT, 'mysql');
  assert.equal(env.MYSQL_HOST, '127.0.0.1');
  assert.equal(String(env.MYSQL_PORT), '33316');
  assert.equal(env.MYSQL_USER, 'jx_local');
  assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  const apiPort = Number(process.env.PR12_UI_API_PORT || 3222);
  const controlPort = Number(process.env.PR12_UI_CONTROL_PORT || 3223);
  for (const port of [apiPort, controlPort]) assert(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.notEqual(apiPort, controlPort);

  const fromBackend = createRequire(path.join(backend, 'package.json'));
  mysql = fromBackend('mysql2/promise');
  const { openDatabase } = fromBackend('./src/infrastructure/database');
  const { migrate } = fromBackend('./src/infrastructure/database/migrator');
  const { createAccountApi } = fromBackend('./src/http/account-api');
  const { createReadinessRepository } = fromBackend('./src/modules/providers/readiness');
  const { createGovernanceService } = fromBackend('./src/modules/governance/service');
  const { maintainOperatorGrant } = fromBackend('./src/modules/governance/operator-access');
  connection = await mysql.createConnection({ host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT), user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  schemaCreated = true;
  db = await openDatabase({ ...env, MYSQL_DATABASE: schema });
  await migrate(db);

  const readiness = createReadinessRepository(db, {
    authorizeChange: async () => true, verifyEvidence: async () => true,
  });
  await readiness.record({ provider_kind: 'SmsProvider', provider_code: 'pr12-ui-synthetic',
    capability_code: 'login_sms', environment: 'SANDBOX', current_status: 'SANDBOX_VERIFIED',
    config_revision: 'synthetic-v1', expected_version: 0, evidence_ref: 'local-ui-test-only',
  }, { actor_ref: 'synthetic-test' });
  const sent = new Map();
  const phones = ['13900009001', '13900009002'];
  const sms = { async call(operation, input) {
    if (operation !== 'send' || !phones.includes(input.phone)) {
      throw Object.assign(new Error('Only seeded synthetic phones are available'), { code: 'SMS_NOT_READY', status: 503 });
    }
    sent.set(input.phone, input.code);
    return { accepted: true, provider_request_id: 'synthetic-local-only' };
  }};
  const secret = crypto.randomBytes(32).toString('base64');
  const app = createAccountApi({ db, secret, sms, governanceEnvironment: 'SANDBOX',
    authSettings: { resendMs: 1000, phoneSendsPerHour: 1000,
      ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 },
    allowedOrigins: [5199, 5200, 8769, 8770].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]),
    // Deliberately omit governanceBindings: all four business actions stay NOT_ENABLED.
  });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr12-synthetic-sms');
    app(req, res);
  });
  await listen(apiServer, apiPort);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  async function call(route, { method = 'GET', body, token, party, version, status = 200 } = {}) {
    const response = await fetch(apiUrl + '/api/v1' + route, { method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(party ? { 'X-Acting-Party': party } : {}),
        ...(version === undefined ? {} : { 'If-Match': `"${version}"` }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, status, `Fixture request failed: ${method} ${route}`);
    const result = await response.json();
    return status === 200 ? result.data : result.error;
  }
  async function seed(phone) {
    const challenge = await call('/auth/sms-challenges', { method: 'POST', body: { phone, purpose: 'LOGIN' } });
    const session = await call('/auth/sessions', { method: 'POST', body: {
      phone, challenge_id: challenge.challenge_id, code: sent.get(phone),
    }});
    const parties = await call('/me/parties', { token: session.access_token });
    const personal = parties.items.find(row => row.party.kind === 'PERSON');
    assert(personal, 'A real login must create a personal identity.');
    return { phone, accountId: session.account.id, personalPartyId: personal.party.id, token: session.access_token };
  }
  const owner = await seed(phones[0]);
  const recipient = await seed(phones[1]);
  const organization = await call('/organizations', { method: 'POST', token: owner.token,
    body: { display_name: '青禾制作（隔离测试）' } });
  // This fixture transition has no public approval route; it affects only this random test schema.
  await db.execute("UPDATE parties SET current_status='ACTIVE',object_version=object_version+1 WHERE id=?", [organization.party_id]);
  const invitation = await call(`/parties/${organization.party_id}/invitations`, {
    method: 'POST', token: owner.token, party: organization.party_id,
    body: { invitee_account_id: recipient.accountId, expires_at: new Date(Date.now() + 86400000).toISOString() },
  });
  await call(`/parties/${organization.party_id}/invitations/${invitation.invitation_id}/responses`, {
    method: 'POST', token: recipient.token, party: organization.party_id,
    version: invitation.object_version, body: { decision: 'ACCEPT' },
  });

  const grants = ['CREATE_RULE', 'RULE_IN_REVIEW', 'RULE_APPROVED', 'RULE_EFFECTIVE', 'CREATE_SOURCE', 'REVIEW_SOURCE', 'SEAL'];
  for (const action of grants) await maintainOperatorGrant(db, {
    account_id: owner.accountId, action, enabled: true, expires_at: null,
    expected_version: 0, authority_ref: 'synthetic:pr12-ui', reason: '仅随机隔离库的界面联调样本，不授权真实运营人员',
  });
  const governance = createGovernanceService({ db, secret, environment: 'SANDBOX' });
  const execute = (command, input) => governance.execute(owner.token, { command, input });
  const snapshots = [];
  for (const label of ['甲', '乙']) {
    let rule = await execute('create_rule', { rule_key: `synthetic:${crypto.randomUUID()}`,
      version: `测试版本-${label}`, effective_at: '2020-01-01T00:00:00.000Z', operation_key: crypto.randomUUID(),
      terms: { 说明: `历史规则${label}，仅作本地界面测试，不是商业默认条款。`,
        层级: { 展示值: { 零值: 0, 开关: false, 待定: null }, 列表: ['中文第一行\n中文第二行', { 项目: '嵌套文本' }] },
        HTML原文: '<b>应显示为文本</b><script>window.__pr12UnsafeExecuted=true</script>',
      },
    });
    for (const target_status of ['IN_REVIEW', 'APPROVED', 'EFFECTIVE']) {
      rule = await execute('transition_rule', { rule_id: rule.content.id, target_status,
        expected_version: rule.object_version, operation_key: crypto.randomUUID() });
    }
    const source = await execute('create_source', { operation_key: crypto.randomUUID(), content: {
      business_ref: `synthetic:${crypto.randomUUID()}`, revision: 'v1',
      party_ids: [owner.personalPartyId, organization.party_id], rule_ids: [rule.content.id],
      reader_account_ids: [owner.accountId], commitments: {
        标题: `历史约定${label}`, 说明: '仅隔离测试；没有价格、付费、真实签署或许可生效。',
        展示测试: { 数值: 0, 布尔: false, 未确定: null }, 补充: ['保留中文', { 原样文本: '<em>不是HTML</em>' }],
      },
    }});
    await execute('transition_source', { source_ref: source.source_ref, target_status: 'REVIEWED',
      expected_version: source.object_version, review_ref: 'synthetic:pr12-ui-review', operation_key: crypto.randomUUID() });
    const snapshot = await execute('seal', { source_ref: source.source_ref, operation_key: crypto.randomUUID() });
    assert.equal(snapshot.signing_method, 'NOT_SIGNED');
    snapshots.push({ id: snapshot.id, ruleId: rule.content.id, contractVersionId: snapshot.contract_version_id,
      partyIds: snapshot.party_ids });
  }
  // The seeding service uses explicit maintenance grants; leave no privileged grant enabled afterwards.
  for (const action of grants) await maintainOperatorGrant(db, {
    account_id: owner.accountId, action, enabled: false, expires_at: null,
    expected_version: 1, authority_ref: 'synthetic:pr12-ui', reason: '隔离测试样本已建好，撤回临时治理操作授权',
  });

  // Check real handlers before publishing a ready state file. No mocked content responses.
  const actions = ['START_PAYMENT', 'START_IDENTITY_CHECK', 'START_SIGNING', 'START_DIGITAL_HUMAN'];
  for (const snapshot of snapshots) {
    for (const party of snapshot.partyIds) {
      const data = await call(`/contract-snapshots/${snapshot.id}/content`, { token: owner.token, party });
      assert.equal(data.id, snapshot.id); assert.equal(data.signing_method, 'NOT_SIGNED');
    }
    const rule = await call(`/rule-versions/${snapshot.ruleId}/content?snapshot_id=${snapshot.id}`, {
      token: owner.token, party: owner.personalPartyId,
    });
    assert.equal(rule.id, snapshot.ruleId);
    for (const action of actions) {
      const result = await call(`/contract-snapshots/${snapshot.id}/business-readiness?action=${action}`, {
        token: owner.token, party: owner.personalPartyId,
      });
      assert.deepEqual(result, { action, environment: 'SANDBOX', current_status: 'NOT_ENABLED', reason_code: 'PROVIDER_NOT_IMPLEMENTED' });
    }
    const denied = await call(`/contract-snapshots/${snapshot.id}/content`, {
      token: recipient.token, party: organization.party_id, status: 404,
    });
    assert.equal(denied.code, 'SNAPSHOT_NOT_FOUND');
  }

  // Test-only control: separate loopback port, no CORS, private random bearer key.
  // Reader changes are limited to restoring/removing this seed owner's original grants.
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin || req.headers.authorization !== `Bearer ${controlToken}`) {
      res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return;
    }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/code') {
        const phone = url.searchParams.get('phone');
        assert(phones.includes(phone));
        const code = sent.get(phone);
        res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return;
      }
      if (req.method === 'POST' && url.pathname === '/reader') {
        const snapshotId = url.searchParams.get('snapshot_id');
        const enabled = url.searchParams.get('enabled');
        assert(snapshots.some(snapshot => snapshot.id === snapshotId));
        assert(['true', 'false'].includes(enabled));
        if (enabled === 'true') await db.execute('INSERT INTO governance_snapshot_readers(snapshot_id,account_id) VALUES (?,?) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id)', [snapshotId, owner.accountId]);
        else await db.execute('DELETE FROM governance_snapshot_readers WHERE snapshot_id=? AND account_id=?', [snapshotId, owner.accountId]);
        res.end(JSON.stringify({ snapshot_id: snapshotId, account_id: owner.accountId, enabled: enabled === 'true' })); return;
      }
      res.writeHead(404); res.end('{"error":"NOT_FOUND"}');
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, controlPort);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify({ testOnly: true, pid: process.pid, schema, apiUrl,
    controlUrl: `http://127.0.0.1:${controlPort}`, controlToken,
    owner: { phone: owner.phone, accountId: owner.accountId, personalPartyId: owner.personalPartyId },
    recipient: { phone: recipient.phone, accountId: recipient.accountId, personalPartyId: recipient.personalPartyId },
    organizationId: organization.party_id, snapshots,
  }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(`Isolated PR #12 API: ${apiUrl}. Synthetic SMS only. Private test state: ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  // Let in-flight creation settle before cleanup so an interrupt cannot leave a
  // schema whose CREATE completed just after schemaCreated was inspected.
  Promise.resolve(startupPromise).catch(() => {}).then(cleanup).then(() => process.exit(0), () => {
    console.error(`PR #12 test cleanup failed; inspect local test schema ${schema}.`); process.exit(1);
  });
});
startupPromise = main();
startupPromise.catch(async e => {
  console.error(`PR #12 test launcher failed: ${e.code || e.name}`);
  await cleanup().catch(() => { console.error(`PR #12 test cleanup failed; inspect local test schema ${schema}.`); });
  process.exit(1);
});
