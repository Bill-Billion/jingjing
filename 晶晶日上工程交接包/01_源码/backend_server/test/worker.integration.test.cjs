'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { openDatabase } = require('../src/infrastructure/database');
const { migrate } = require('../src/infrastructure/database/migrator');
const { createJobRepository } = require('../src/infrastructure/jobs/repository');
const { createWorker } = require('../src/worker/runner');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Real MySQL durable jobs, outbox and independent worker', { skip: !process.env.JX_MYSQL_TEST_ENV_FILE }, async (t) => {
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.DB_CLIENT, 'mysql');
  assert.equal(env.MYSQL_HOST, '127.0.0.1'); assert.equal(env.MYSQL_PORT, '33316');
  assert.equal(env.MYSQL_USER, 'jx_local'); assert.equal(env.MYSQL_DATABASE, 'jx_dev');
  const control = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD });
  const created = new Set(), pools = [];
  async function fixture() {
    const name = `jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;
    assert.match(name, /^jx_test_\d+_[a-f0-9]{12}$/);
    await control.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`); created.add(name);
    const db = await openDatabase({ ...env, MYSQL_DATABASE: name }); pools.push(db);
    await migrate(db);
    return { db, repo: createJobRepository(db) };
  }
  const intent = (key, extra = {}) => ({ task_type: 'fixture.local', business_key: key, payload_ref: `test-only:payload:${key}`, max_attempts: 3, ...extra });
  const expire = (db, id) => db.execute('UPDATE platform_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?', [id]);
  const due = (db, id) => db.execute('UPDATE platform_jobs SET next_run_at=TIMESTAMPADD(SECOND,-1,CURRENT_TIMESTAMP(6)) WHERE id=?', [id]);
  try {
    await t.test('same business intent is idempotent; conflicting intent is rejected, case remains distinct', async () => {
      const { repo } = await fixture();
      const rows = await Promise.all(Array.from({ length: 6 }, () => repo.enqueue(intent('party:Order:1'))));
      assert.equal(new Set(rows.map((row) => row.id)).size, 1);
      await assert.rejects(repo.enqueue(intent('party:Order:1', { payload_ref: 'changed' })), { code: 'JOB_IDEMPOTENCY_CONFLICT' });
      assert.notEqual((await repo.enqueue(intent('party:order:1'))).id, rows[0].id);
    });
    await t.test('business transaction and outbox both roll back; publish requires explicit transaction', async () => {
      const { db, repo } = await fixture();
      await assert.rejects(db.withTransaction(async (tx) => {
        await tx.execute('INSERT INTO platform_schema_metadata (schema_key,schema_value) VALUES (?,?)', ['business-fixture', 'pending']);
        await repo.publish(tx, 'event-rollback', intent('rollback'));
        throw new Error('intentional rollback');
      }), /intentional rollback/);
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM platform_outbox'); assert.equal(Number(count.n), 0);
      const [rows] = await db.execute('SELECT * FROM platform_schema_metadata WHERE schema_key=?', ['business-fixture']); assert.equal(rows.length, 0);
      await assert.rejects(repo.publish(null, 'bad', intent('bad')), { code: 'OUTBOX_REQUIRES_TRANSACTION' });
    });
    await t.test('parallel outbox dispatch atomically creates one durable job per event, repeat is a no-op', async () => {
      const { db, repo } = await fixture();
      for (let n = 0; n < 8; n++) await db.withTransaction((tx) => repo.publish(tx, `event-${n}`, intent(`outbox-${n}`)));
      await db.withTransaction((tx) => repo.publish(tx, 'event-0', intent('outbox-0')));
      await assert.rejects(db.withTransaction((tx) => repo.publish(tx, 'event-0', intent('different'))), { code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
      await Promise.all(Array.from({ length: 12 }, () => repo.dispatchOne()));
      // SKIP LOCKED provides progress, not strict FIFO/fairness; drain any temporarily skipped rows.
      while (await repo.dispatchOne()) {}
      const [[counts]] = await db.execute("SELECT COUNT(*) AS n FROM platform_outbox o JOIN platform_jobs j ON o.job_id=j.id WHERE o.status='DISPATCHED'");
      assert.equal(Number(counts.n), 8); assert.equal(await repo.dispatchOne(), null);
      const [[jobs]] = await db.execute('SELECT COUNT(*) AS n FROM platform_jobs'); assert.equal(Number(jobs.n), 8);
    });
    await t.test('conflicting outbox intent is visibly blocked and does not replace the original job', async () => {
      const { db, repo } = await fixture();
      const job = await repo.enqueue(intent('conflict'));
      await db.withTransaction((tx) => repo.publish(tx, 'conflict-event', intent('conflict', { payload_ref: 'other' })));
      assert.equal((await repo.dispatchOne()).status, 'BLOCKED');
      assert.equal((await repo.get(job.id)).payload_ref, 'test-only:payload:conflict');
    });
    await t.test('failure between job insertion and outbox acknowledgement rolls both back and can be replayed', async () => {
      const { db, repo } = await fixture();
      await db.withTransaction((tx) => repo.publish(tx, 'interrupted-dispatch', intent('atomic')));
      const interrupted = createJobRepository({ withTransaction: (work) => db.withTransaction((tx) => work({
        execute: (sql, params) => {
          if (sql.startsWith('UPDATE platform_outbox')) throw new Error('injected dispatch interruption');
          return tx.execute(sql, params);
        },
      })) });
      await assert.rejects(interrupted.dispatchOne(), /injected dispatch interruption/);
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM platform_jobs'); assert.equal(Number(count.n), 0);
      const [[event]] = await db.execute('SELECT status FROM platform_outbox'); assert.equal(event.status, 'PENDING');
      assert.equal((await repo.dispatchOne()).status, 'DISPATCHED'); assert.equal(await repo.dispatchOne(), null);
    });
    await t.test('concurrent workers claim one job once while its lease is valid', async () => {
      const { repo } = await fixture(); const job = await repo.enqueue(intent('single'));
      const claims = await Promise.all(Array.from({ length: 12 }, (_, n) => repo.claim(`worker-${n}`, 10000)));
      const claimed = claims.filter(Boolean); assert.equal(claimed.length, 1); assert.equal(claimed[0].id, job.id); assert.equal(claimed[0].attempts, 1);
    });
    await t.test('expired lease takeover fences old acknowledgement, heartbeat and provider-task updates', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('fence', { provider: 'synthetic-only' }));
      const old = await repo.claim('reused-owner', 10000); await expire(db, job.id);
      await assert.rejects(repo.heartbeat(old, 10000), { code: 'LEASE_LOST' });
      const current = await repo.claim('reused-owner', 10000);
      assert.notEqual(current.lease_token, old.lease_token); assert.equal(current.attempts, 2);
      await assert.rejects(repo.finish(old, { status: 'SUCCEEDED', result_ref: 'stale' }), { code: 'LEASE_LOST' });
      await assert.rejects(repo.saveProviderTask(old, 'stale-task'), { code: 'LEASE_LOST' });
      await repo.saveProviderTask(current, 'current-task');
      await repo.finish(current, { status: 'SUCCEEDED', result_ref: 'test-only:current-result' });
      assert.equal((await repo.get(job.id)).result_ref, 'test-only:current-result');
    });
    await t.test('retry is delayed, capped and manually resumed without erasing attempt history', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('retry', { max_attempts: 2 }));
      await repo.finish(await repo.claim('retry-worker', 10000), { status: 'RETRY', error_code: 'TEMPORARY_FAILURE' });
      assert.equal(await repo.claim('too-soon', 10000), null);
      const [[timing]] = await db.execute('SELECT TIMESTAMPDIFF(MICROSECOND,updated_at,next_run_at) AS us FROM platform_jobs WHERE id=?', [job.id]); assert.ok(Number(timing.us) >= 999000);
      await due(db, job.id);
      await repo.finish(await repo.claim('retry-worker', 10000), { status: 'RETRY', error_code: 'TEMPORARY_FAILURE' });
      assert.equal((await repo.get(job.id)).status, 'FAILED');
      await assert.rejects(repo.manualRetry(job.id, { actor_ref: '', reason_ref: 'review', additional_attempts: 1 }));
      await repo.manualRetry(job.id, { actor_ref: 'test-only:operator', reason_ref: 'test-only:inspected', additional_attempts: 1 });
      const retried = await repo.claim('manual-retry', 10000); assert.equal(retried.attempts, 3);
      const [[audit]] = await db.execute('SELECT * FROM platform_job_retries WHERE job_id=?', [job.id]);
      assert.equal(audit.attempts_before, 2); assert.equal(audit.previous_error, 'TEMPORARY_FAILURE');
      await repo.finish(retried, { status: 'SUCCEEDED', result_ref: 'test-only:retry-result' });
      await assert.rejects(repo.manualRetry(job.id, { actor_ref: 'op', reason_ref: 'why', additional_attempts: 1 }), { code: 'JOB_NOT_RETRYABLE' });
    });
    await t.test('crashed job at its attempt limit becomes failed instead of disappearing or retrying forever', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('exhausted', { max_attempts: 1 }));
      await repo.claim('dead', 10000); await expire(db, job.id);
      assert.equal(await repo.claim('new', 10000), null); assert.equal((await repo.get(job.id)).status, 'FAILED');
    });
    await t.test('worker renews a long-running handler lease; other worker cannot take it over', async () => {
      const { repo } = await fixture(); const job = await repo.enqueue(intent('long'));
      let started; const ready = new Promise((resolve) => { started = resolve; });
      let release; const finish = new Promise((resolve) => { release = resolve; });
      const worker = createWorker({ repository: repo, leaseMs: 900, handlers: new Map([['fixture.local', { execute: async () => { started(); await finish; return { status: 'SUCCEEDED', result_ref: 'test-only:long' }; } }]]) });
      const running = worker.tick(); await ready;
      try { await sleep(1300); assert.equal(await repo.claim('competitor', 10000), null); }
      finally { release(); await running; }
      assert.equal((await repo.get(job.id)).status, 'SUCCEEDED');
    });
    await t.test('missing handlers and ambiguous handler errors block without fake success or immediate replay', async () => {
      const { repo } = await fixture(); const first = await repo.enqueue(intent('missing'));
      await createWorker({ repository: repo, handlers: new Map() }).tick();
      assert.equal((await repo.get(first.id)).last_error, 'HANDLER_NOT_ENABLED');
      const second = await repo.enqueue(intent('unknown'));
      await createWorker({ repository: repo, handlers: new Map([['fixture.local', { execute: async () => { throw new Error('sensitive provider response'); } }]]) }).tick();
      const row = await repo.get(second.id); assert.equal(row.status, 'BLOCKED'); assert.equal(row.last_error, 'HANDLER_OUTCOME_UNKNOWN'); assert.equal(row.result_ref, null);
    });
    await t.test('active worker aborts after lease takeover and cannot overwrite its successor result', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('active-fence'));
      let started; const ready = new Promise((resolve) => { started = resolve; });
      const worker = createWorker({ repository: repo, leaseMs: 600, handlers: new Map([['fixture.local', {
        execute: async (_row, { signal }) => {
          started(); await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
          return { status: 'SUCCEEDED', result_ref: 'stale-handler' };
        },
      }]]) });
      const running = worker.tick(); await ready; await expire(db, job.id);
      const successor = await repo.claim('successor', 10000); assert.ok(successor);
      await repo.finish(successor, { status: 'SUCCEEDED', result_ref: 'test-only:successor' });
      await running; assert.equal((await repo.get(job.id)).result_ref, 'test-only:successor');
    });
    await t.test('provider retry without a recovery adapter becomes blocked instead of executing again', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('no-recovery', { provider: 'synthetic-only' }));
      const first = await repo.claim('first', 10000); await repo.finish(first, { status: 'RETRY', error_code: 'PROVIDER_PENDING' }); await due(db, job.id);
      let executed = false;
      await createWorker({ repository: repo, handlers: new Map([['fixture.local', { execute: async () => { executed = true; } }]]) }).tick();
      assert.equal(executed, false); assert.equal((await repo.get(job.id)).last_error, 'PROVIDER_RECOVERY_UNAVAILABLE');
    });
    await t.test('unknown provider submission is reconciled by stable key, never blindly resubmitted', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('unknown-provider', { provider: 'synthetic-only' }));
      await repo.claim('crashed-before-id-saved', 10000); await expire(db, job.id);
      let executed = 0, recovered = 0;
      await createWorker({ repository: repo, handlers: new Map([['fixture.local', {
        execute: async () => { executed++; },
        recover: async (row, context) => { recovered++; assert.equal(context.idempotency_key, job.id); assert.equal(row.provider_task_id, null); return { status: 'BLOCKED', error_code: 'PROVIDER_QUERY_REQUIRED' }; },
      }]]) }).tick();
      assert.equal(executed, 0); assert.equal(recovered, 1); assert.equal((await repo.get(job.id)).status, 'BLOCKED');
    });
    await t.test('separate process crash preserves provider task ID and a new process recovers it', async () => {
      const { db, repo } = await fixture(); const job = await repo.enqueue(intent('restart', { task_type: 'fixture.restart', provider: 'synthetic-only' }));
      const run = (mode) => spawnSync(process.execPath, ['test/fixtures/worker-process.cjs', db.database, mode], { cwd: path.resolve(__dirname, '..'), env: process.env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      const crashed = run('crash'); assert.equal(crashed.status, 17, crashed.stderr);
      assert.equal((await repo.get(job.id)).provider_task_id, 'synthetic-provider-task-42');
      await sleep(350);
      const recovered = run('recover'); assert.equal(recovered.status, 0, recovered.stderr);
      const row = await repo.get(job.id); assert.equal(row.status, 'SUCCEEDED'); assert.equal(row.attempts, 2); assert.equal(row.result_ref, 'test-only:recovered-42');
    });
    await t.test('graceful stop signals a handler, leaves durable recovery and does not claim the next task', async () => {
      const { repo } = await fixture(); const job = await repo.enqueue(intent('stop'));
      let started; const ready = new Promise((resolve) => { started = resolve; });
      const worker = createWorker({ repository: repo, handlers: new Map([['fixture.local', { execute: async (_job, { signal }) => {
        started(); await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        return { status: 'SUCCEEDED', result_ref: 'must-not-save' };
      } }]]) });
      const running = worker.run(); await ready; worker.stop(); await running;
      const row = await repo.get(job.id); assert.equal(row.status, 'RUNNING'); assert.equal(row.result_ref, null); assert.equal(await worker.tick(), false);
    });
  } finally {
    for (const db of pools) await db.close();
    for (const name of created) { assert.match(name, /^jx_test_\d+_[a-f0-9]{12}$/); await control.query(`DROP DATABASE \`${name}\``); }
    await control.end();
  }
});
