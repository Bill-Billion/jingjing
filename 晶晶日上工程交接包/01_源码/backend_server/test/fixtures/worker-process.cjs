'use strict';
// Test-only executable: never loaded by the production worker or app.
const fs = require('node:fs');
const { openDatabase } = require('../../src/infrastructure/database');
const { createJobRepository } = require('../../src/infrastructure/jobs/repository');
const { createWorker } = require('../../src/worker/runner');
(async () => {
  const env = JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  const database = process.argv[2], mode = process.argv[3];
  if (env.NODE_ENV !== 'test' || env.MYSQL_HOST !== '127.0.0.1' || env.MYSQL_PORT !== '33316' || !/^jx_test_\d+_[a-f0-9]{12}$/.test(database)) throw new Error('UNSAFE_FIXTURE');
  const db = await openDatabase({ ...env, MYSQL_DATABASE: database });
  const repository = createJobRepository(db);
  if (mode === 'crash') {
    const job = await repository.claim('crashed-process', 300);
    if (!job) throw new Error('NO_FIXTURE_JOB');
    await repository.saveProviderTask(job, 'synthetic-provider-task-42');
    console.log(JSON.stringify({ id: job.id }));
    process.exit(17); // Deliberately abandon a committed lease without cleanup/ack.
  }
  if (mode !== 'recover') throw new Error('UNKNOWN_FIXTURE_MODE');
  try {
    const worker = createWorker({ repository, handlers: new Map([['fixture.restart', {
      execute: async () => { throw new Error('MUST_NOT_RESUBMIT'); },
      recover: async (job) => {
        if (job.provider_task_id !== 'synthetic-provider-task-42') throw new Error('LOST_PROVIDER_ID');
        return { status: 'SUCCEEDED', result_ref: 'test-only:recovered-42' };
      },
    }]]) });
    await worker.tick(); console.log(JSON.stringify({ recovered: true }));
  } finally { await db.close(); }
})().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
