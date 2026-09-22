'use strict';
// Only creates a disposable Docker instance on a GitHub-hosted Linux runner.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, '.local/ci-mysql');
const stateFile = path.join(runtime, 'state.json');
const image = 'mysql:8.4.11';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180000, windowsHide: true });
  if (result.status !== 0 && !allowFailure) fail('CI_DOCKER_COMMAND_FAILED');
  return result;
}
async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Linux' || !/^\d+$/.test(process.env.GITHUB_RUN_ID || '') || !/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT || '')) fail('CI_RUNNER_REQUIRED');
  const name = `jx-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  if (process.argv[2] === 'stop') {
    if (!fs.existsSync(stateFile)) { console.log('No database was started by this job.'); return; }
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.name !== name) fail('CI_CONTAINER_OWNERSHIP_MISMATCH');
    const inspect = docker(['inspect', '--format', '{{json .Config.Labels}}', name], true);
    if (inspect.status === 0) {
      const labels = JSON.parse(inspect.stdout);
      if (labels['jx.purpose'] !== 'isolated-ci-tests' || labels['jx.owner'] !== name) fail('CI_CONTAINER_OWNERSHIP_MISMATCH');
      docker(['rm', '--force', name]);
    } else if (!/No such (object|container)/i.test(inspect.stderr || '')) fail('CI_CONTAINER_INSPECT_FAILED');
    // Exact generated files only; never recursively delete a computed directory.
    for (const file of ['container.env', 'test-env.json', 'state.json']) {
      const target = path.join(runtime, file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    console.log('Disposable database removed.'); return;
  }
  if (process.argv[2] !== 'start') fail('CI_COMMAND_INVALID');
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  if (fs.existsSync(stateFile)) fail('CI_DATABASE_ALREADY_INITIALIZED');
  const rootPassword = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex');
  fs.writeFileSync(path.join(runtime, 'container.env'), `MYSQL_ROOT_PASSWORD=${rootPassword}\nMYSQL_ROOT_HOST=%\n`, { mode: 0o600 });
  // Record the reserved name before Docker so the always() cleanup also handles partial startup.
  fs.writeFileSync(stateFile, JSON.stringify({ name, image }), { mode: 0o600 });
  console.log('Starting isolated MySQL on 127.0.0.1:33316.');
  docker(['run', '--detach', '--rm', '--name', name,
    '--label', 'jx.purpose=isolated-ci-tests', '--label', `jx.owner=${name}`,
    '--publish', '127.0.0.1:33316:33316', '--env-file', path.join(runtime, 'container.env'),
    image, '--port=33316', '--mysqlx=0', '--skip-log-bin', '--innodb-buffer-pool-size=134217728']);
  const mysql = require(path.join(root, '晶晶日上工程交接包/01_源码/backend_server/node_modules/mysql2/promise'));
  let connection;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      connection = await mysql.createConnection({ host: '127.0.0.1', port: 33316, user: 'root', password: rootPassword, connectTimeout: 1000 });
      break;
    } catch { await sleep(500); }
  }
  if (!connection) fail('CI_DATABASE_START_TIMEOUT');
  try {
    const [[server]] = await connection.query('SELECT VERSION() AS version, @@port AS port');
    if (!/^8\./.test(server.version) || server.port !== 33316) fail('CI_DATABASE_MISMATCH');
    await connection.query('CREATE DATABASE jx_dev CHARACTER SET utf8mb4');
    // Password is generated hex, never accepted from the caller or printed.
    await connection.query(`CREATE USER 'jx_local'@'%' IDENTIFIED BY '${password}'`);
    await connection.query("GRANT ALL PRIVILEGES ON jx_dev.* TO 'jx_local'@'%'");
    await connection.query("GRANT ALL PRIVILEGES ON `jx_test_%`.* TO 'jx_local'@'%'");
    const env = { NODE_ENV: 'test', DB_CLIENT: 'mysql', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '33316', MYSQL_USER: 'jx_local', MYSQL_PASSWORD: password, MYSQL_DATABASE: 'jx_dev' };
    fs.writeFileSync(path.join(runtime, 'test-env.json'), JSON.stringify(env), { mode: 0o600 });
    console.log(JSON.stringify({ status: 'TEST_DATABASE_READY', version: server.version, port: server.port }));
  } finally { await connection.end(); }
}
main().catch((error) => { console.error(error.code || 'CI_DATABASE_SETUP_FAILED'); process.exitCode = 1; });
