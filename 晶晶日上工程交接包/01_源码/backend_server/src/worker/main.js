'use strict';
const { openDatabase } = require('../infrastructure/database');
const { status } = require('../infrastructure/database/migrator');
const { createJobRepository } = require('../infrastructure/jobs/repository');
const { createWorker } = require('./runner');
const handlers = require('./handlers');

async function main() {
  // Fail visibly until a real domain handler exists; an idle empty process is not readiness evidence.
  if (handlers.size === 0) throw Object.assign(new Error('No enabled domain handlers'), { code: 'WORKER_NOT_READY' });
  const db = await openDatabase();
  let worker, deadline;
  const stop = () => {
    worker?.stop();
    if (!deadline) deadline = setTimeout(() => process.exit(1), 30000).unref();
  };
  try {
    const schema = await status(db);
    if (schema.migrations.some((m) => m.status !== 'APPLIED')) throw Object.assign(new Error('Migrations required'), { code: 'WORKER_SCHEMA_NOT_READY' });
    worker = createWorker({ repository: createJobRepository(db), handlers, log: (record) => console.log(JSON.stringify(record)) });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    await worker.run();
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    if (deadline) clearTimeout(deadline);
    await db.close();
  }
}
if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ event: 'worker_start_or_run_failed', code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'WORKER_FAILED' }));
  process.exitCode = 1;
});
module.exports = { main };
