'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createWorker } = require('../src/worker/runner');
const { spec, backoffMs } = require('../src/infrastructure/jobs/repository');

test('worker CLI fails visibly while domain adapters are not enabled', () => {
  const child = spawnSync(process.execPath, ['src/worker/main.js'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 1); assert.match(child.stderr, /WORKER_NOT_READY/);
  assert.equal(child.stdout, '');
});
test('worker intent requires explicit retry budget and bounded references', () => {
  const input = { task_type: 'production.render', business_key: 'party:order:v1', payload_ref: 'private:payload:1', max_attempts: 3 };
  assert.equal(spec(input).provider, null);
  for (const bad of [{ max_attempts: undefined }, { max_attempts: 0 }, { max_attempts: 1001 }, { business_key: ' ' }, { payload_ref: 'x'.repeat(513) }]) assert.throws(() => spec({ ...input, ...bad }));
  assert.equal(backoffMs(1), 1000); assert.equal(backoffMs(2), 2000); assert.equal(backoffMs(1000), 300000);
});
test('stopping during claim never starts the newly acquired handler', async () => {
  let release, executions = 0;
  const repository = { dispatchOne: async () => null, claim: () => new Promise((resolve) => { release = resolve; }) };
  const worker = createWorker({ repository, handlers: new Map([['fixture', { execute: () => executions++ }]]) });
  const pending = worker.tick(); await new Promise(setImmediate);
  worker.stop(); release({ id: 'synthetic', task_type: 'fixture' });
  await pending; assert.equal(executions, 0); assert.equal(await worker.tick(), false);
});
test('API and historical scheduler do not bootstrap timers or visual recovery', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
  const scheduler = fs.readFileSync(path.resolve(__dirname, '../jobs/scheduler.js'), 'utf8');
  assert.doesNotMatch(app, /require\(['"]\.\/jobs\/scheduler|\.resumeUnfinished\(/);
  assert.doesNotMatch(scheduler, /setInterval\(|setTimeout\(|\nstart\(\)/);
});
