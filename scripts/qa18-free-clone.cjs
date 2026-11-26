'use strict';
// Explicit new bounded original full-service clone for E2E06 authority checks.
// Never starts the offline database, renews old sessions, or rewrites business dates.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const be = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
const load = p => require(path.join(be, p));
load('scripts/test-network-guard.cjs');
const { protectPrivateState } = require('./test-fixtures/private-state.cjs');
const { canonicalDump } = require('./qa18-batch-backup.cjs');
const hash = b => createHash('sha256').update(b).digest('hex');
const read = async p => JSON.parse(await fsp.readFile(p, 'utf8'));
const dumpArgs = ['--single-transaction', '--skip-lock-tables', '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', '--skip-comments', '--skip-add-drop-table', '--skip-extended-insert', '--order-by-primary'];
async function privateWrite(file, bytes) {
  await fsp.writeFile(file, '', { flag: 'wx' });
  await protectPrivateState(file);
  await fsp.writeFile(file, bytes);
}
function inside(p, parent) {
  assert(p.startsWith(parent + path.sep), 'EXPECTED_SEPARATE_LOCAL_PATH');
  assert.equal(fs.realpathSync(p).toLowerCase(), p.toLowerCase(), 'NO_LINKED_INPUT');
}
async function fingerprint(db) {
  const [tables] = await db.execute('SHOW TABLES');
  const result = {};
  for (const row of tables) {
    const name = Object.values(row)[0];
    assert(/^[a-z0-9_]+$/.test(name));
    const [rows] = await db.execute('SELECT * FROM `' + name + '`');
    result[name] = { rows: rows.length, sha256: hash(JSON.stringify(rows.map(x => JSON.stringify(x)).sort())) };
  }
  return result;
}
async function main() {
  const [offlineName, sourceArg, outputArg] = process.argv.slice(2);
  assert.equal(process.argv.length, 5);
  assert(/^jx_test_qa18_restore_[a-f0-9]{24}$/.test(offlineName));
  const offline = path.join(root, '.local/qa18-backups', offlineName);
  const sourceDir = path.resolve(sourceArg), out = path.resolve(outputArg);
  inside(offline, path.join(root, '.local/qa18-backups'));
  inside(sourceDir, path.join(root, '.local/qa18'));
  assert(out.startsWith(path.join(root, '.local/qa18') + path.sep));
  assert(!fs.existsSync(out), 'NEW_DIRECTORY_REQUIRED');
  const marker = await read(path.join(offline, 'OFFLINE_ONLY.json'));
  assert(marker.result === 'PASS' && marker.offline_only && !marker.started && !marker.old_credentials_activated);
  assert(marker.all_dumped_data_and_schema_semantics_identical && marker.all_asset_bytes_identical);
  assert.equal(marker.database, offlineName);
  assert(!fs.existsSync(path.join(offline, 'RESTORE_INCOMPLETE')));
  const descriptor = await read(path.join(offline, 'STATE.private.json'));
  const previous = await read(path.join(sourceDir, 'access.json'));
  // The original secret was not retained. A new clone-only session key is private; original sessions remain revoked.
  const secrets = { database: marker.source_database, secret: randomBytes(32).toString('base64') };
  assert(descriptor.synthetic_only && descriptor.mode === 'QA18' && previous.synthetic_only);
  assert.equal(marker.source_database,'jx_test_qa18_points_60898647dc3b28d20c84');
  assert.equal(descriptor.database, marker.source_database);
  assert.equal(previous.database, marker.source_database);
  assert.equal(secrets.database, marker.source_database);
  assert(Date.parse(previous.expires_at) < Date.now(), 'THIS_TOOL_REQUIRES_EXPIRED_SOURCE');
  assert.equal(previous.expires_at, descriptor.expires_at);
  const env = await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for (const [k, v] of Object.entries({ NODE_ENV: 'test', DB_CLIENT: 'mysql', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '33316', MYSQL_USER: 'jx_local', MYSQL_DATABASE: 'jx_dev' })) assert.equal(env[k], v);
  for (const exe of [process.env.JX_MYSQLDUMP_EXE, process.env.JX_MYSQL_EXE]) assert(exe && path.isAbsolute(exe) && fs.statSync(exe).isFile());
  await fsp.mkdir(out);
  inside(out, path.join(root, '.local/qa18'));
  const database = 'jx_test_qa18_free_' + randomBytes(10).toString('hex');
  const started = Date.now(), expires = new Date(started + 4 * 3600000).toISOString();
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const status = { synthetic_only: true, status: 'PREPARING_NEW_CLONE', database, source, pid: process.pid, started_at: new Date(started).toISOString(), expires_at: expires, source_database: marker.source_database, offline_database: offlineName, backup: marker.backup, real_time: true };
  const saveStatus = () => fsp.writeFile(path.join(out, 'STATUS.json'), JSON.stringify(status, null, 2));
  const mysql = load('node_modules/mysql2/promise');
  const connect = name => mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: name });
  let original, restored, control, cloneReader, db, server, timer, stopWatch, stopping = false;
  async function cli(exe, args, input) {
    const cfg = path.join(out, 'client-' + randomUUID() + '.cnf');
    assert(typeof env.MYSQL_PASSWORD === 'string' && !/[\r\n\0]/.test(env.MYSQL_PASSWORD));
    const value = '"' + env.MYSQL_PASSWORD.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    await privateWrite(cfg, '[client]\nhost=127.0.0.1\nport=33316\nuser=jx_local\npassword=' + value + '\n');
    let fd;
    try {
      if (input !== undefined) { await privateWrite(cfg + '.sql', input); fd = fs.openSync(cfg + '.sql', 'r'); }
      return await new Promise((resolve, reject) => {
        const child = spawn(exe, ['--defaults-extra-file=' + path.basename(cfg), ...args], { cwd: out, windowsHide: true, stdio: [fd ?? 'ignore', 'pipe', 'pipe'] });
        let size = 0, stderr = ''; const chunks = [];
        const t = setTimeout(() => { child.kill(); reject(Error('MYSQL_TIMEOUT')); }, 120000);
        child.stdout.on('data', b => { size += b.length; if (size > 512 * 1024 * 1024) child.kill(); else chunks.push(b); });
        child.stderr.on('data', b => { if (stderr.length < 4096) stderr += b.toString(); });
        child.on('error', e => { clearTimeout(t); reject(Error('MYSQL_SPAWN_' + e.code)); });
        child.on('close', code => { clearTimeout(t); if (code || size > 512 * 1024 * 1024) reject(Error('MYSQL_COMMAND_' + (/ERROR (\d{4})/.exec(stderr)?.[1] || code || 'LIMIT'))); else resolve(Buffer.concat(chunks).toString('utf8')); });
      });
    } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(cfg + '.sql')) fs.unlinkSync(cfg + '.sql'); fs.unlinkSync(cfg); }
  }
  async function stop() {
    if (stopping) return; stopping = true;
    clearTimeout(timer); clearInterval(stopWatch);
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await db?.close();
    for (const c of [original, restored, control, cloneReader]) await c?.end();
    status.status = 'STOPPED'; status.stopped_at = new Date().toISOString(); await saveStatus();
  }
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await saveStatus();
    original = await connect(marker.source_database); restored = await connect(offlineName); control = await connect('jx_dev');
    const sourceBefore = await fingerprint(original), offlineBefore = await fingerprint(restored);
    assert.equal(Object.keys(offlineBefore).length, marker.table_count);
    const sql = await cli(process.env.JX_MYSQLDUMP_EXE, [...dumpArgs, offlineName]);
    assert.equal(hash(Buffer.from(canonicalDump(sql))), marker.canonical_sql_sha256, 'OFFLINE_SNAPSHOT_DRIFT');
    await control.query('CREATE DATABASE ' + mysql.escapeId(database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    await cli(process.env.JX_MYSQL_EXE, ['--binary-mode', '--default-character-set=utf8mb4', database], sql);
    cloneReader = await connect(database);
    db = await load('src/infrastructure/database').openDatabase({ ...env, MYSQL_DATABASE: database });
    const copiedDump = await cli(process.env.JX_MYSQLDUMP_EXE, [...dumpArgs, database]);
    assert.equal(canonicalDump(copiedDump), canonicalDump(sql), 'NEW_CLONE_SCHEMA_OR_DATA_DIFFERENT');
    // Compare with identical read semantics: runtime DB deliberately returns DATE
    // columns as strings; mysql2 defaults return Date objects. SQL also stays exact.
    assert.deepEqual(await fingerprint(cloneReader), offlineBefore);
    const migrations = await load('src/infrastructure/database/migrator').status(db);
    assert.equal(migrations.migrations.length, 225);
    assert(migrations.migrations.every(x => x.status === 'APPLIED'));
    const seed = new Map();
    for (const item of descriptor.files) {
      assert.equal(item.name, hash(item.object_key));
      const bytes = await fsp.readFile(path.join(offline, 'files', item.name));
      assert.equal(bytes.length, Number(item.byte_size)); assert.equal(hash(bytes), item.content_sha256);
      seed.set(item.object_key, bytes);
    }
    assert.equal(seed.size, marker.asset_count);
    const disk = await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(out, 'private-storage'), { seed });
    const auth = load('src/modules/auth/repository').createAuthRepository(db, { secret: secrets.secret });
    const accounts = {}, sessionUntil = started + 4 * 3600000;
    // New local synthetic credentials only. Original account status, roles, expiry and business rows remain intact.
    await db.withTransaction(async tx => {
      await tx.execute('UPDATE auth_sessions SET revoked=1');
      for (const [role, u] of Object.entries(descriptor.accounts)) {
        assert.equal(previous.accounts[role].account_id, u.account_id);
        assert.equal(previous.accounts[role].party_id, u.party_id);
        const [[account]] = await tx.execute('SELECT current_status FROM identity_accounts WHERE id=?', [u.account_id]);
        assert.equal(account.current_status, 'ACTIVE');
        const token = randomBytes(32).toString('base64url');
        await tx.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms,authenticated_ms) VALUES (?,?,?,?)', [auth.secure.digest('token', token), u.account_id, sessionUntil, started]);
        accounts[role] = { ...previous.accounts[role], bearer_token: token };
      }
    });
    for (const [role, u] of Object.entries(accounts)) {
      assert.equal((await auth.resolve(u.bearer_token)).id, u.account_id);
      await assert.rejects(auth.resolve(previous.accounts[role].bearer_token), { status: 401 });
    }
    const principal = async req => ({ subject_ref: (await auth.resolve((req.headers.authorization || '').replace(/^Bearer /, ''))).subject_ref });
    const sim = await load('src/testing/multi-merchant-payment-simulator').createMultiMerchantSimulator(db, { ...env, MYSQL_DATABASE: database, JX_PAYMENT_SIMULATOR_ENABLED: 'true' }, { merchant_party_ids: Object.values(accounts).map(x => x.party_id), resolvePrincipal: principal });
    const after = await fingerprint(cloneReader);
    for (const [name, entry] of Object.entries(offlineBefore)) if (name !== 'auth_sessions') assert.deepEqual(after[name], entry, 'NON_SESSION_ROWS_CHANGED_' + name);
    assert.deepEqual(await fingerprint(original), sourceBefore, 'ORIGINAL_MODIFIED');
    assert.deepEqual(await fingerprint(restored), offlineBefore, 'OFFLINE_RESTORE_MODIFIED');
    const api = load('src/http/account-api').createAccountApi({ db, secret: secrets.secret, supplyStorageFactory: disk.storageFactory, tradeProvidersFactory: () => sim, tradeEnv: { CUSTOMIZATION_MERCHANT_PARTY_ID: accounts.producer.party_id }, allowedOrigins: ['http://127.0.0.1:5500', 'http://127.0.0.1:5173'] });
    async function staticBuild(req, res, surface) {
      const folder = path.join(root, '晶晶日上工程交接包/01_源码', surface === 'app' ? 'frontend_jingjingshangri_app/build/web' : 'frontend_ops_workspace/dist');
      const name = decodeURIComponent(new URL(req.url, 'http://local').pathname.slice(('/__' + surface + '/').length)) || 'index.html';
      let file = path.resolve(folder, name); assert(file.startsWith(folder + path.sep));
      let bytes; try { bytes = await fsp.readFile(file); } catch (e) { if (e.code !== 'ENOENT' || path.extname(name)) throw e; file = path.join(folder, 'index.html'); bytes = await fsp.readFile(file); }
      const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(bytes);
    }
    server = http.createServer(async (req, res) => {
      const reply = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
      if (Date.now() >= sessionUntil) return reply(410, { error: { code: 'QA_ENVIRONMENT_EXPIRED' } });
      try {
        if (req.url.startsWith('/__app/')) return await staticBuild(req, res, 'app');
        if (req.url.startsWith('/__web/')) return await staticBuild(req, res, 'web');
        if (req.url === '/api/v1/testing/payments/outcome') {
          assert.equal(req.method, 'POST'); await principal(req);
          let text = ''; for await (const bytes of req) { text += bytes; assert(Buffer.byteLength(text) <= 8192); }
          const body = JSON.parse(text); load('src/modules/party/policy').shape(body, ['record_id', 'state']);
          return reply(200, { simulation: true, real_money: false, data: await sim.choose(req, { ...body, party_id: req.headers['x-acting-party'] }) });
        }
        return api(req, res);
      } catch (e) { reply(e.status || 400, { error: { code: e.code || 'QA_REQUEST_FAILED', message: e.message } }); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
    await privateWrite(path.join(out, 'access.json'), JSON.stringify({ synthetic_only: true, database, source_database: marker.source_database, base_url: base, expires_at: expires, accounts }, null, 2));
    await privateWrite(path.join(out, 'STATE.private.json'), JSON.stringify({ mode: 'QA18', synthetic_only: true, database, secret: secrets.secret, expires_at: expires, accounts }, null, 2));
    await privateWrite(path.join(out, 'prepared.json'), JSON.stringify({ ...descriptor.prepared, environment: database, original_environment: descriptor.database }, null, 2));
    const oldResponse = await fetch(base + '/me/parties', { headers: { Authorization: 'Bearer ' + previous.accounts.buyer.bearer_token } });
    assert.equal(oldResponse.status, 401);
    const current = await fetch(base + '/redemption/grants/70aee25c-cbe2-4809-92b3-164a75e9dcfa', { headers: { Authorization: 'Bearer ' + accounts.buyer.bearer_token, 'X-Acting-Party': accounts.buyer.party_id } });
    assert.equal(current.status, 200);const grant=(await current.json()).data;assert.equal(grant.id,'70aee25c-cbe2-4809-92b3-164a75e9dcfa');assert.equal(grant.current_status,'USED');assert.equal(grant.data.used_order_id,'13f50e81-af87-48ac-a65f-5a2b8ed191bb');
    const proof = { result: 'PASS', source, database, source_database: marker.source_database, offline_database: offlineName, backup: marker.backup, grant_id: '70aee25c-cbe2-4809-92b3-164a75e9dcfa', source_order_id: '114da9f7-5401-4394-b678-a02bbc04744a', used_order_id: '13f50e81-af87-48ac-a65f-5a2b8ed191bb', started_at: status.started_at, expires_at: expires, table_count: marker.table_count, private_files: marker.asset_count, canonical_import_identical: true, copied_snapshot: offlineBefore, source_original_unchanged: sourceBefore, all_non_session_tables_unchanged: true, original_service_not_started: true, offline_service_not_started: true, old_credentials_rejected_http: oldResponse.status, new_buyer_grant_http: current.status, new_fixture_sessions: Object.keys(accounts), new_session_expiry: expires, no_original_session_extended: true, business_dates_changed: false, production_login_tested: false, clone_only_secret_generated: true, original_secret_not_retained: true, migrations: migrations.migrations.map(x => ({ version: x.version, checksum: x.checksum, status: x.status })), limitations: 'New clone/environment at current code, not original expired live service or a final regression batch. Synthetic fixture session issuance is not production SMS login. No original/offline DB writes, real payment, production deployment, or public access.' };
    await fsp.writeFile(path.join(out, 'CLONE_PROOF.json'), JSON.stringify(proof, null, 2));
    status.status = 'RUNNING'; status.base_url = base; await saveStatus();
    timer = setTimeout(stop, Math.max(1, sessionUntil - Date.now()));
    stopWatch = setInterval(() => { if (fs.existsSync(path.join(out, 'STOP'))) stop().catch(e => { console.error(e.code || e.name); process.exitCode = 1; }); }, 1000);
    console.log(JSON.stringify({ status: status.status, database, base_url: base, expires_at: expires, grant_id: proof.grant_id, tables: proof.table_count, files: proof.private_files, old_token_status: oldResponse.status, new_grant_status: current.status }));
  } catch (e) { status.failure = e.code || e.message; await stop(); throw e; }
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { fingerprint };
