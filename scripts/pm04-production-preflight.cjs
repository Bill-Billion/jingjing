'use strict';
// Backend-only preparation check for the existing production browser fixture.
// No App/Web process; retain a credential-free receipt, then use the launcher's
// private IPC cleanup to close only this child and its disposable database.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const statePath = path.join(root, '.local/pr16-ui-runtime.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/pm04-production-preflight.cjs');
  assert(process.env.JX_MYSQL_TEST_ENV_FILE, 'ISOLATED_TEST_ENV_REQUIRED');
  try { await fs.access(statePath); throw Error('EXISTING_PR16_STATE_REFUSED'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fs.mkdir(path.join(root, '.local'), { recursive: true });
  const out = await fs.mkdtemp(path.join(root, '.local/pm04-production-preflight-'));
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const sourceFiles = {};
  for (const file of ['scripts/pr16-ui-test-server.cjs', 'scripts/support/synthetic-identity-provider.cjs', 'scripts/pm04-production-preflight.cjs']) {
    sourceFiles[file] = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  }
  const log = await fs.open(path.join(out, 'api.log'), 'wx', 0o600);
  let child, result, ended, failure, receipt, interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  try {
    child = fork(path.join(root, 'scripts/pr16-ui-test-server.cjs'), ['--test-only'], {
      cwd: root, env: process.env, stdio: ['ignore', log.fd, log.fd, 'ipc'], windowsHide: true,
    });
    result = new Promise(resolve => {
      child.once('error', e => { ended = { code: 1, reason: e.code }; resolve(ended); });
      child.once('exit', (code, signal) => { ended = { code, signal }; resolve(ended); });
    });
    const deadline = Date.now() + 180000;
    let state;
    while (Date.now() < deadline) {
      if (interrupted) throw Error('PREPARATION_INTERRUPTED');
      if (ended) throw Error('PREPARATION_EXITED_BEFORE_READY');
      try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
      if (state?.pid === child.pid) break;
      await sleep(200);
    }
    assert(state && state.pid === child.pid, 'PREPARATION_TIMEOUT');
    assert.equal(state.testOnly, true); assert.equal(state.syntheticOnly, true);
    assert.equal(state.apiUrl, 'http://127.0.0.1:3282');
    const health = await fetch(state.apiUrl + '/health', { signal: AbortSignal.timeout(3000) });
    assert.equal(health.status, 200); assert.equal((await health.json()).data.current_status, 'UP');
    const proof = state.identityPreparation;
    for (const role of ['seller', 'buyer']) {
      assert.equal(proof[role].status, 'VERIFIED');
      assert.equal(proof[role].accountId, state.accounts[role].accountId);
      assert.equal(proof[role].personalPartyId, state.accounts[role].personalPartyId);
    }
    assert.equal(proof.avatar.actingPartyId, state.organizationId);
    assert.equal(proof.avatar.id, state.records.avatar.id);
    assert.equal(proof.avatar.unverifiedBeforeStatus, 409);
    assert.equal(proof.avatar.afterStatus, 200);
    assert.equal(proof.avatar.createdCount, 1);
    assert.equal(proof.avatar.replaySameId, true);
    assert.equal(proof.unverifiedOwner.httpStatus, 409);
    assert.equal(proof.unverifiedOwner.code, 'VERIFIED_ADULT_REQUIRED');
    assert.equal(proof.unverifiedOwner.createdCount, 0);
    receipt = {
      status: 'PASS', source, source_files_sha256: sourceFiles, checked_at: new Date().toISOString(),
      synthetic_only: true, frontend_tested: false, identity_preparation: proof,
      roles: Object.fromEntries(Object.entries(state.accounts).map(([role, actor]) => [role,
        { accountId: actor.accountId, personalPartyId: actor.personalPartyId, actingPartyId: actor.actingPartyId }])),
      records: state.records, creation: state.creation, scenarios: state.scenarios,
      verification: state.verification, media: Object.fromEntries(Object.entries(state.media).map(([name, media]) => [name,
        { byteSize: media.byteSize, contentSha256: media.contentSha256, label: media.label }])),
      limits: 'Backend HTTP preparation only. IDs belong to this disposable run; rerun the browser launcher for new local records. No real identity/payment or front-end acceptance.',
    };
  } catch (e) { failure = e; }
  finally {
    if (child && !ended) {
      child.send({ type: 'JX_TEST_SHUTDOWN' });
      let timer;
      const graceful = await Promise.race([result.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 30000); })]);
      clearTimeout(timer);
      if (!graceful) { child.kill(); await result; failure ||= Error('PREPARATION_CLEANUP_TIMEOUT'); }
    }
    if (ended?.code !== 0) failure ||= Error('PREPARATION_CHILD_FAILED');
    await log.close();
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
  }
  if (failure) {
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'FAIL', source, error: failure.message, child: ended }, null, 2) + '\n');
    console.error(JSON.stringify({ status: 'FAIL', error: failure.message, evidence_directory: path.relative(root, out) }));
    process.exitCode = 1;
    return;
  }
  try { await fs.access(statePath); throw Error('PRIVATE_STATE_NOT_CLEANED'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  receipt.cleanup = { exit_code: ended.code, private_state_removed: true, database_retained: false };
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', check_groups: receipt.verification.passed, frontend_tested: false,
    cleanup_exit_code: ended.code, evidence_directory: path.relative(root, out) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
