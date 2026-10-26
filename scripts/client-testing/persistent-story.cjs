// Only a retained, synthetic story database on the existing local test MySQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
const namePattern = /^jx_test_story_[0-9]+_[a-f0-9]{12}$/;
function assertEnv(env, database) {
  assert(env.NODE_ENV === 'test' && env.DB_CLIENT === 'mysql');
  assert(env.MYSQL_HOST === '127.0.0.1' && env.MYSQL_PORT === '33316' && env.MYSQL_USER === 'jx_local');
  assert(namePattern.test(database) && env.MYSQL_DATABASE === database);
}
function validateManifest(m, name) {
  assert(m.format === 1 && m.synthetic_only === true && m.database === name);
  assertEnv(m.database_env, name);
  assert(typeof m.environment_id === 'string' && /^[a-f0-9-]{36}$/.test(m.environment_id));
  assert(typeof m.secret === 'string' && m.secret.length >= 40);
  assert(m.access.synthetic_only === true && m.access.accounts.buyer);
  assert(Array.isArray(m.rules) && m.rules.length > 0);
  assert(m.rules.every(r => ['GET', 'POST', 'PATCH'].includes(r.method) && r.pattern.startsWith('^') && r.pattern.endsWith('$')));
}
async function retain({ env, database, secret, access, tradeEnv, rules, db }) {
  const selected = { NODE_ENV: 'test', DB_CLIENT: 'mysql', MYSQL_HOST: env.MYSQL_HOST, MYSQL_PORT: env.MYSQL_PORT, MYSQL_USER: env.MYSQL_USER, MYSQL_PASSWORD: env.MYSQL_PASSWORD, MYSQL_DATABASE: database };
  assertEnv(selected, database);
  const parent = path.join(root, '.local/client-persistent'); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  assert(fs.realpathSync(parent) === parent);
  const dir = path.join(parent, database); fs.mkdirSync(dir, { mode: 0o700 });
  const environmentId = crypto.randomUUID();
  await db.execute('CREATE TABLE client_test_environment (id VARCHAR(36) PRIMARY KEY, synthetic_only TINYINT NOT NULL) ENGINE=InnoDB');
  await db.execute('INSERT INTO client_test_environment(id,synthetic_only) VALUES (?,1)', [environmentId]);
  const manifest = { format: 1, synthetic_only: true, database, environment_id: environmentId, database_env: selected, secret, access, tradeEnv, rules: rules.map(([method, re]) => ({ method, pattern: re.source })), created_at: new Date().toISOString() };
  validateManifest(manifest, database);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return dir;
}
async function start(name, { hours = 72, port = 0 } = {}) {
  assert(namePattern.test(name)); assert(Number.isInteger(hours) && hours >= 1 && hours <= 72);
  assert(Number.isInteger(port) && port >= 0 && port <= 65535);
  const parent = path.join(root, '.local/client-persistent'), dir = path.join(parent, name);
  assert(fs.realpathSync(parent) === parent && fs.realpathSync(dir) === dir);
  const manifestFile = path.join(dir, 'manifest.json'); assert(!fs.lstatSync(manifestFile).isSymbolicLink());
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); validateManifest(m, name);
  assert(!fs.existsSync(path.join(dir, 'stop')), 'Remove the completed stop request explicitly before restarting.');
  const lock = path.join(dir, 'runtime.lock'), fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid));
  const expires = Date.now() + hours * 3600000;
  let db, server, timer, watcher, stopping;
  const stop = () => stopping || (stopping = (async () => {
    clearTimeout(timer); clearInterval(watcher);
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.close();
    fs.rmSync(path.join(dir, 'access.json'), { force: true });
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ status: 'STOPPED', persistent: true, synthetic_only: true, database: name, database_retained: true, database_removed: false, credentials_removed: true }, null, 2));
    fs.closeSync(fd); fs.unlinkSync(lock);
  })());
  try {
    require(path.join(backend, 'scripts/test-network-guard.cjs'));
    const { openDatabase } = require(path.join(backend, 'src/infrastructure/database'));
    const { createAccountApi } = require(path.join(backend, 'src/http/account-api'));
    const { createAuthRepository } = require(path.join(backend, 'src/modules/auth/repository'));
    db = await openDatabase(m.database_env);
    const [markers] = await db.execute('SELECT id, synthetic_only FROM client_test_environment');
    assert(markers.length === 1 && markers[0].id === m.environment_id && markers[0].synthetic_only === 1);
    const auth = createAuthRepository(db, { secret: m.secret }), accounts = {};
    await db.withTransaction(async tx => {
      for (const [role, a] of Object.entries(m.access.accounts)) {
        const token = crypto.randomBytes(32).toString('base64url');
        // Only the initialized test accounts; auth issuance is never exposed on this server.
        await tx.execute('DELETE FROM auth_sessions WHERE account_id=?', [a.account_id]);
        await tx.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,?)', [auth.secure.digest('token', token), a.account_id, expires]);
        accounts[role] = { account_id: a.account_id, party_id: a.party_id, bearer_token: token };
      }
    });
    const app = createAccountApi({ db, secret: m.secret, tradeEnv: m.tradeEnv, allowedOrigins: ['http://127.0.0.1:3490'] });
    const rules = m.rules.map(r => ({ method: r.method, re: new RegExp(r.pattern) }));
    server = http.createServer((req, res) => {
      const pathname = req.url.split('?')[0];
      if (rules.some(r => (req.method === r.method || req.method === 'OPTIONS') && r.re.test(pathname))) return app(req, res);
      res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { code: 'LOCAL_FIXTURE_ROUTE_DISABLED' } }));
    });
    server.listen(port, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const access = { ...m.access, persistent: true, base_url: `http://127.0.0.1:${server.address().port}/api/v1`, accounts };
    fs.writeFileSync(path.join(dir, 'access.json'), JSON.stringify(access, null, 2), { mode: 0o600 });
    const status = { status: 'RUNNING', persistent: true, synthetic_only: true, database: name, environment_id: m.environment_id, host: '127.0.0.1', port: server.address().port, expires_in_minutes: hours * 60, expires_at: new Date(expires).toISOString() };
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status, null, 2));
    timer = setTimeout(() => stop().catch(() => { process.exitCode = 1; }), expires - Date.now());
    watcher = setInterval(() => { if (fs.existsSync(path.join(dir, 'stop'))) stop().catch(() => { process.exitCode = 1; }); }, 500);
    return { stop, access, status, dir };
  } catch (error) { await stop(); throw error; }
}
module.exports = { retain, start, validateManifest, assertEnv };
if (require.main === module) start(process.argv[2]).then(r => {
  console.log(JSON.stringify({ status: r.status.status, local_only: true, persistent: true, access_file: path.relative(root, path.join(r.dir, 'access.json')), expires_at: r.status.expires_at }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => r.stop().catch(() => { process.exitCode = 1; }));
}).catch(() => { console.error('Persistent test startup failed; private configuration not printed. Check marker, local test DB, stop request and runtime lock.'); process.exitCode = 1; });
