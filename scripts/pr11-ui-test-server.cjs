'use strict';
require('../晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs');

// Local browser tests only. This launcher never participates in the production API.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const backend = path.resolve(__dirname, '../晶晶日上工程交接包/01_源码/backend_server');
const fromBackend = createRequire(path.join(backend, 'package.json'));
const mysql = fromBackend('mysql2/promise');
const { openDatabase } = fromBackend('./src/infrastructure/database');
const { migrate } = fromBackend('./src/infrastructure/database/migrator');
const { createAccountApi } = fromBackend('./src/http/account-api');
const { createReadinessRepository } = fromBackend('./src/modules/providers/readiness');
const { createSmsProvider } = fromBackend('./src/modules/providers/sms');
const { EventEmitter } = require('node:events');

const statePath = path.resolve(process.env.PR11_UI_STATE_FILE || '.local/pr11-ui-runtime.json');
const schema = `jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
const controlToken = crypto.randomBytes(32).toString('hex');
let db, connection, apiServer, controlServer;
let closing = false;
let schemaCreated = false;

async function cleanup() {
  if (closing) return;
  closing = true;
  for (const server of [apiServer, controlServer]) {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
  if (db) await db.close();
  if (connection) {
    if (schemaCreated) await connection.query('DROP DATABASE ' + mysql.escapeId(schema));
    await connection.end();
  }
  try {
    const saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
    if (saved.controlToken === controlToken) await fs.unlink(statePath);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
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
  assert(process.argv.includes('--test-only'), 'Pass --test-only for an isolated browser test.');
  assert(process.env.JX_MYSQL_TEST_ENV_FILE, 'A local test database configuration is required.');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.DB_CLIENT, 'mysql');
  assert.equal(env.MYSQL_HOST, '127.0.0.1');
  assert.equal(String(env.MYSQL_PORT), '33316');
  assert.equal(env.MYSQL_USER, 'jx_local');
  assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  connection = await mysql.createConnection({ host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT), user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE });
  await connection.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  schemaCreated = true;
  db = await openDatabase({ ...env, MYSQL_DATABASE: schema });
  await migrate(db);

  // Exercise the actual SMS adapter/signing/response parser; only HTTPS I/O is synthetic.
  // No real credentials are loaded, and the process cannot open external TCP connections.
  const sent = new Map();
  let smsEnabled = true, dispatches = 0;
  const smsConfig = { NODE_ENV: 'test', SMS_ENABLED: 'true', VOLC_ACCESS_KEY_ID: 'fake-id',
    VOLC_SECRET_ACCESS_KEY: 'fake-secret', SMS_ACCOUNT: 'fake-account', SMS_SIGN_NAME: '隔离测试',
    SMS_LOGIN_TEMPLATE_ID: 'fake-template', SMS_CONFIG_REVISION: 'browser-synthetic-v1' };
  const provider = createSmsProvider(db, smsConfig, { request(options, callback) {
    assert.equal(options.hostname, 'sms.volcengineapi.com');
    dispatches++;
    const req = new EventEmitter(); req.destroy = () => {}; req.setTimeout = () => {};
    req.end = body => {
      const value = JSON.parse(body);
      sent.set(value.PhoneNumbers, JSON.parse(value.TemplateParam).code);
      queueMicrotask(() => {
        const res = new EventEmitter(); res.statusCode = 200; res.complete = true; res.destroy = () => {};
        callback(res);
        res.emit('data', Buffer.from(JSON.stringify({ ResponseMetadata: { RequestId: 'browser-synthetic-request' }, Result: { MessageID: ['browser-synthetic-message'] } })));
        res.emit('end');
      });
    };
    return req;
  } });
  const readiness = createReadinessRepository(db, {
    authorizeChange: async () => true, verifyEvidence: async () => true,
  });
  await readiness.record({ ...provider.identity, current_status: 'SANDBOX_VERIFIED',
    config_revision: smsConfig.SMS_CONFIG_REVISION, expected_version: 0,
    evidence_ref: 'local-browser-synthetic-only' }, { actor_ref: 'synthetic-test' });
  const sms = { async call(operation, input, context) {
    if (!smsEnabled) throw Object.assign(new Error('Test SMS unavailable'), { code: 'SMS_NOT_READY', status: 503 });
    return provider.call(operation, input, context);
  }};
  const app = createAccountApi({ db, secret: crypto.randomBytes(32).toString('base64'), sms,
    authSettings: { ipSendsPerHour: 1000, totalSendsPerHour: 1000, ipLoginsPerMinute: 1000 },
    allowedOrigins: [5199, 5200, 8769].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]),
  });
  apiServer = http.createServer((req, res) => {
    res.setHeader('X-Test-Environment', 'isolated-pr11-synthetic-sms');
    app(req, res);
  });
  await listen(apiServer, Number(process.env.PR11_UI_API_PORT || 3220));
  const apiUrl = `http://127.0.0.1:${apiServer.address().port}`;
  const call = async (route, body, token) => {
    const response = await fetch(apiUrl + '/api/v1' + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, `Fixture creation failed at ${route}`);
    return (await response.json()).data;
  };
  async function seed(phone) {
    const challenge = await call('/auth/sms-challenges', { phone, purpose: 'LOGIN' });
    const session = await call('/auth/sessions', { phone, challenge_id: challenge.challenge_id, code: sent.get(phone) });
    return { phone, accountId: session.account.id, token: session.access_token };
  }
  const owner = await seed('13900009001');
  const recipient = await seed('13900009002');
  const organization = await call('/organizations', { display_name: '青禾制作（隔离测试）' }, owner.token);
  assert(organization.party_id);
  await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?", [organization.party_id]);

  // Test control is on a separate loopback port, has no CORS, and requires a private random key.
  controlServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.authorization !== `Bearer ${controlToken}`) {
      res.writeHead(403); res.end('{"error":"TEST_CONTROL_FORBIDDEN"}'); return;
    }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/shutdown') {
        res.end('{"stopping":true}'); setImmediate(() => cleanup().then(() => process.exit(0), () => process.exit(1))); return;
      }
      if (req.method === 'GET' && url.pathname === '/metrics') {
        res.end(JSON.stringify({ dispatches, syntheticOnly: true })); return;
      }
      if (req.method === 'GET' && url.pathname === '/code') {
        const code = sent.get(url.searchParams.get('phone'));
        res.writeHead(code ? 200 : 404); res.end(JSON.stringify({ code: code || null })); return;
      }
      if (req.method === 'POST' && url.pathname === '/sms') {
        smsEnabled = url.searchParams.get('enabled') === 'true';
        res.end(JSON.stringify({ enabled: smsEnabled })); return;
      }
      if (req.method === 'POST' && url.pathname === '/activate-test-organization') {
        const id = url.searchParams.get('id');
        assert.match(id || '', /^[a-f0-9-]{36}$/);
        await db.execute("UPDATE parties SET current_status='ACTIVE', object_version=object_version+1 WHERE id=? AND kind='ORGANIZATION'", [id]);
        res.end('{"activated_test_fixture":true}'); return;
      }
      res.writeHead(404); res.end('{"error":"NOT_FOUND"}');
    } catch { res.writeHead(400); res.end('{"error":"INVALID_TEST_CONTROL"}'); }
  });
  await listen(controlServer, Number(process.env.PR11_UI_CONTROL_PORT || 3221));
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify({ testOnly: true, apiUrl,
    controlUrl: `http://127.0.0.1:${controlServer.address().port}`, controlToken,
    owner: { phone: owner.phone, accountId: owner.accountId },
    recipient: { phone: recipient.phone, accountId: recipient.accountId },
    organizationId: organization.party_id,
  }, null, 2), { mode: 0o600 });
  await fs.chmod(statePath, 0o600);
  console.log(`Isolated PR #11 API: ${apiUrl}. Synthetic SMS only. Private test state: ${statePath}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  cleanup().then(() => process.exit(0), () => process.exit(1));
});
main().catch(async e => {
  console.error(`PR #11 test launcher failed: ${e.code || e.name}`);
  await cleanup().catch(() => {});
  process.exit(1);
});
